from fastapi import APIRouter
from typing import Dict, Any

from backend.app.services.rehab_service import rehab_service

router = APIRouter(prefix="/rehabilitation", tags=["Rehabilitation & Skill Passports"])


@router.get("/summary", summary="Skill Passport Ecosystem Summary")
def get_rehab_summary() -> Dict[str, Any]:
    """
    Aggregated rehabilitation insights from the 600 skill passports:
    certification status split, top vocational trades, target job domains,
    per-prison certified counts and consent rate.
    """
    return rehab_service.get_summary()
