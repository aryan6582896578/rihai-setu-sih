import sys
import os
sys.path.insert(0, os.path.abspath("."))

from backend.app.api.v1.overcrowding import (
    health_check,
    get_statewide_summary,
    list_prisons,
    get_prison_details,
    get_prison_forecast,
    run_what_if_simulator
)
from backend.app.schemas.overcrowding import WhatIfRequest
from backend.app.main import root

def run_tests():
    print("======================================================================")
    print("RUNNING DIRECT FASTAPI ENDPOINT UNIT TESTS")
    print("======================================================================")

    # 1. Root Endpoint
    res_root = root()
    assert res_root["status"] == "operational", "Root failed"
    print(" [1/6] Root Endpoint (GET /) -> Operational")

    # 2. Health Check
    res_health = health_check()
    assert res_health["status"] == "healthy", "Health check failed"
    print(" [2/6] Health Check (GET /api/v1/overcrowding/health) -> Healthy")

    # 3. Statewide Summary
    res_summary = get_statewide_summary()
    assert res_summary["total_prisons"] > 0
    assert res_summary["statewide_occupancy_rate"] > 0
    print(f" [3/6] Statewide Summary (GET /api/v1/overcrowding/state-summary) -> Total Prisons: {res_summary['total_prisons']} | Occupancy: {res_summary['statewide_occupancy_rate']}%")

    # 4. List Prisons
    res_prisons = list_prisons()
    assert len(res_prisons) > 0
    first_prison_id = res_prisons[0]["prison_id"]
    print(f" [4/6] List Prisons (GET /api/v1/overcrowding/prisons) -> Loaded {len(res_prisons)} facilities ({first_prison_id})")

    # 5. Single Prison & Forecast
    res_detail = get_prison_details(prison_id=first_prison_id)
    assert "prison_name" in res_detail
    
    res_forecast = get_prison_forecast(prison_id=first_prison_id)
    assert "90d" in res_forecast["forecasts"]
    f90 = res_forecast["forecasts"]["90d"]
    print(f" [5/6] Prison Forecast (GET /api/v1/overcrowding/forecast/{first_prison_id}) -> 90d Projected Pop: {f90['projected_population']} ({f90['projected_occupancy_rate']}%)")

    # 6. What-If Simulator
    req = WhatIfRequest(prison_id=first_prison_id, releases_simulated=50, horizon_days=90)
    res_sim = run_what_if_simulator(req)
    assert res_sim["simulated_90d_outcome"]["occupancy_reduced_pct"] > 0
    print(f" [6/6] What-If Simulator (POST /api/v1/overcrowding/simulator/what-if) -> Reduced Occupancy by {res_sim['simulated_90d_outcome']['occupancy_reduced_pct']}%")

    print("======================================================================")
    print(" ALL 6 FASTAPI ENDPOINTS TESTED & PASSED WITH 100% SUCCESS!")
    print("======================================================================")

if __name__ == "__main__":
    run_tests()
