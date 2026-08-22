"""Skill extraction endpoints."""

from fastapi import APIRouter

from app.schemas import (
    SkillExtractionRequest,
    SkillExtractionResponse,
    SkillCatalogResponse,
    SkillMatch,
)
from app.services.normalizer import normalize_text
from app.services.skill_extractor import canonical_skill_names, extract_skills


router = APIRouter(prefix="/api/v1/skills", tags=["skills"])


@router.get("/catalog", response_model=SkillCatalogResponse)
def get_skill_catalog() -> SkillCatalogResponse:
    """Return canonical tags for controlled UI fields and backend validation."""

    skills = canonical_skill_names()
    return SkillCatalogResponse(count=len(skills), canonical_skills=skills)


@router.post("/extract", response_model=SkillExtractionResponse)
def extract_standard_skills(
    request: SkillExtractionRequest,
) -> SkillExtractionResponse:
    """Map phrases and spelling variants in free text to canonical skill tags."""

    matches = [SkillMatch.model_validate(match) for match in extract_skills(request.text)]
    return SkillExtractionResponse(
        normalized_text=normalize_text(request.text),
        matches=matches,
    )
