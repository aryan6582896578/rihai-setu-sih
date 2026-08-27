from fastapi import APIRouter, HTTPException, Query, Path
from typing import List, Dict, Any

from backend.app.schemas.overcrowding import (
    PrisonCapacitySummary,
    StatewideOverview,
    PrisonForecastResponse,
    WhatIfRequest,
    WhatIfResponse
)
from backend.app.services.forecast_service import overcrowding_service

router = APIRouter(prefix="/overcrowding", tags=["Overcrowding & Capacity Intelligence"])

@router.get("/health", summary="Model & Engine Health Check")
def health_check() -> Dict[str, Any]:
    """Returns status of the Overcrowding ML Engine and active dataset."""
    return {
        "status": "healthy",
        "service": "Overcrowding Forecasting Engine",
        "active_dataset": "datasets/undertrials.csv (600 records · 5 prisons)",
        "models_loaded": ["30d_Ridge", "60d_Ridge", "90d_Ridge"]
    }

@router.get("/state-summary", response_model=StatewideOverview, summary="Statewide Prison Overview")
def get_statewide_summary():
    """
    Returns aggregated state-level statistics:
    - Total capacity vs current inmate population
    - Statewide occupancy rate %
    - Count of critical prisons (>115% occupancy)
    - Total Section 479 relief potential
    """
    return overcrowding_service.get_statewide_summary()

@router.get("/prisons", response_model=List[PrisonCapacitySummary], summary="List All Prisons Capacity Metrics")
def list_prisons():
    """
    Returns real-time capacity and occupancy metrics for all monitored correctional facilities.
    Includes Section 479 relief potential and bottleneck breakdown (e.g. surety pending).
    """
    return overcrowding_service.get_all_prisons()

@router.get("/prisons/{prison_id}", response_model=PrisonCapacitySummary, summary="Get Single Prison Capacity Details")
def get_prison_details(prison_id: str = Path(..., description="Prison ID, e.g. PUN-01")):
    """Fetches detailed capacity metrics for a specific prison."""
    result = overcrowding_service.get_prison_by_id(prison_id)
    if not result:
        raise HTTPException(status_code=404, detail=f"Prison with ID '{prison_id}' not found.")
    return result

@router.get("/forecast/{prison_id}", response_model=PrisonForecastResponse, summary="Get Multi-Horizon Forecasts")
def get_prison_forecast(prison_id: str = Path(..., description="Prison ID, e.g. PUN-01")):
    """
    Returns 30-day, 60-day, and 90-day projected population and occupancy rates
    with predictive contributing factors.
    """
    forecast = overcrowding_service.get_forecast_for_prison(prison_id)
    if not forecast:
        raise HTTPException(status_code=404, detail=f"Prison with ID '{prison_id}' not found.")
    return forecast

@router.post("/simulator/what-if", summary="Run What-If Policy Simulation")
def run_what_if_simulator(payload: WhatIfRequest) -> Dict[str, Any]:
    """
    Interactive decision-support simulator:
    Calculates the impact of releasing N Section 479 eligible undertrials on 90-day projected occupancy.
    """
    return overcrowding_service.run_what_if(
        prison_id=payload.prison_id,
        releases_simulated=payload.releases_simulated,
        horizon_days=payload.horizon_days
    )
