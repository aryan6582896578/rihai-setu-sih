from typing import List, Dict, Optional, Any
from pydantic import BaseModel, Field

class PrisonCapacitySummary(BaseModel):
    prison_id: str
    prison_name: str
    capacity: int
    current_population: int
    undertrial_population: int
    convict_population: int
    occupancy_rate: float
    overcrowding_level: str
    available_beds: int
    overcrowding_gap: int
    sec479_eligible_undertrials: int
    sec479_approaching_undertrials: int
    stuck_at_surety: int
    stuck_at_court: int
    post_relief_population: int
    post_relief_occupancy_rate: float
    capacity_relieved_pct: float

class StatewideOverview(BaseModel):
    total_prisons: int
    total_sanctioned_capacity: int
    total_current_population: int
    statewide_occupancy_rate: float
    critical_prisons_count: int
    total_sec479_eligible_undertrials: int
    total_stuck_at_surety: int
    potential_statewide_relief_pct: float

class ForecastHorizonDetail(BaseModel):
    horizon_days: int
    projected_population: int
    projected_occupancy_rate: float
    status: str
    model_used: str

class PrisonForecastResponse(BaseModel):
    prison_id: str
    prison_name: str
    capacity: int
    current_population: int
    current_occupancy_rate: float
    forecasts: Dict[str, ForecastHorizonDetail]
    feature_importance: Dict[str, float]
    generated_at: str

class WhatIfRequest(BaseModel):
    prison_id: str = Field(default="PUN-01", description="Prison identifier (e.g. PUN-01)")
    releases_simulated: int = Field(default=50, ge=0, description="Number of Section 479 eligible undertrial releases to simulate")
    horizon_days: int = Field(default=90, description="Forecast horizon in days (30, 60, or 90)")

class WhatIfResponse(BaseModel):
    prison_id: str
    prison_name: str
    capacity: int
    current_state: Dict[str, Any]
    simulation_parameters: Dict[str, Any]
    baseline_90d_projection: Dict[str, Any]
    simulated_90d_outcome: Dict[str, Any]
