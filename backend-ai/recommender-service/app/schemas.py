"""Stable API models for candidates, jobs, and recommendation results.

The recommendation engine deliberately accepts these models rather than rows from
a CSV file or records from a particular database.  A future adapter can translate
the final dataset into these models without changing the matching logic.
"""

from __future__ import annotations

from datetime import date
from enum import Enum
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


_WHITESPACE_RE = re.compile(r"\s+")


def _clean_text(value: str) -> str:
    """Trim a string and collapse repeated internal whitespace."""

    return _WHITESPACE_RE.sub(" ", value).strip()


def _clean_string_list(values: list[str]) -> list[str]:
    """Clean, de-duplicate, and remove blank strings while preserving order."""

    cleaned: list[str] = []
    seen: set[str] = set()
    for value in values:
        item = _clean_text(value)
        key = item.casefold()
        if item and key not in seen:
            seen.add(key)
            cleaned.append(item)
    return cleaned


class APIModel(BaseModel):
    """Base model that rejects fields outside the documented API contract."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class CandidateProfile(APIModel):
    """Employment-only candidate data used by the recommender."""

    candidate_id: str = Field(min_length=1)
    verified_skills: list[str] = Field(
        default_factory=list,
        description=(
            "Verified canonical skill tags, normally produced by the skill "
            "extractor or a trusted future adapter."
        ),
    )
    certificates: list[str] = Field(default_factory=list)
    experience_months: int = Field(default=0, ge=0)
    preferred_job_categories: list[str] = Field(default_factory=list)
    preferred_districts: list[str] = Field(default_factory=list)
    available_from: date | None = None
    # Consent must be an explicit JSON boolean.  Values such as 1 or "yes" must
    # never be coerced into permission to include a person in recommendations.
    consent: bool = Field(default=False, strict=True)

    @field_validator("candidate_id")
    @classmethod
    def clean_candidate_id(cls, value: str) -> str:
        value = _clean_text(value)
        if not value:
            raise ValueError("candidate_id must not be blank")
        return value

    @field_validator(
        "verified_skills",
        "certificates",
        "preferred_job_categories",
        "preferred_districts",
    )
    @classmethod
    def clean_candidate_lists(cls, value: list[str]) -> list[str]:
        return _clean_string_list(value)


class JobStatus(str, Enum):
    ACTIVE = "active"
    CLOSED = "closed"
    PAUSED = "paused"


class Job(APIModel):
    """A job vacancy expressed independently of any storage schema."""

    job_id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    description: str = Field(
        default="",
        description="Human-readable context; it is not mined during scoring.",
    )
    required_skills: list[str] = Field(
        default_factory=list,
        description="Canonical skill tags required by the job.",
    )
    preferred_skills: list[str] = Field(
        default_factory=list,
        description="Canonical skill tags preferred by the job.",
    )
    required_certificates: list[str] = Field(default_factory=list)
    minimum_experience_months: int = Field(default=0, ge=0)
    job_category: str = ""
    district: str = ""
    status: JobStatus = JobStatus.ACTIVE

    @field_validator("job_id", "title")
    @classmethod
    def clean_required_job_text(cls, value: str) -> str:
        value = _clean_text(value)
        if not value:
            raise ValueError("value must not be blank")
        return value

    @field_validator("description", "job_category", "district")
    @classmethod
    def clean_optional_job_text(cls, value: str) -> str:
        return _clean_text(value)

    @field_validator("required_skills", "preferred_skills", "required_certificates")
    @classmethod
    def clean_job_lists(cls, value: list[str]) -> list[str]:
        return _clean_string_list(value)


class SkillExtractionRequest(APIModel):
    text: str = Field(min_length=1)

    @field_validator("text")
    @classmethod
    def reject_blank_text(cls, value: str) -> str:
        if not _clean_text(value):
            raise ValueError("text must contain at least one visible character")
        return value


class SkillMatch(APIModel):
    matched_phrase: str
    canonical_skill: str
    match_method: Literal["exact", "synonym", "fuzzy"]
    confidence: float = Field(ge=0, le=100)


class SkillExtractionResponse(APIModel):
    normalized_text: str
    matches: list[SkillMatch]


class SkillCatalogResponse(APIModel):
    count: int = Field(ge=0)
    canonical_skills: list[str]


class ComponentScores(APIModel):
    required_skills: float = Field(ge=0, le=35)
    preferred_skills: float = Field(ge=0, le=15)
    skill_similarity: float = Field(ge=0, le=20)
    certificates: float = Field(ge=0, le=5)
    experience: float = Field(ge=0, le=5)
    district: float = Field(ge=0, le=10)
    category: float = Field(ge=0, le=10)


class RecommendationResult(APIModel):
    candidate_id: str
    job_id: str
    eligible_for_recommendation: bool
    score: float = Field(ge=0, le=100)
    cosine_similarity: float = Field(
        ge=0,
        le=1,
        description="Cosine similarity between canonical candidate and job skills.",
    )
    component_scores: ComponentScores
    matched_required_skills: list[str] = Field(default_factory=list)
    missing_required_skills: list[str] = Field(default_factory=list)
    matched_preferred_skills: list[str] = Field(default_factory=list)
    missing_certificates: list[str] = Field(default_factory=list)
    explanation: str
    ineligibility_reasons: list[str] = Field(default_factory=list)


class ScoreRequest(APIModel):
    candidate: CandidateProfile
    job: Job


class RankJobsRequest(APIModel):
    candidate: CandidateProfile
    jobs: list[Job] = Field(default_factory=list)
    top_k: int = Field(default=5, ge=1)
    minimum_score: float = Field(default=0, ge=0, le=100)
    include_ineligible: bool = Field(default=False, strict=True)


class RankCandidatesRequest(APIModel):
    job: Job
    candidates: list[CandidateProfile] = Field(default_factory=list)
    top_k: int = Field(default=5, ge=1)
    minimum_score: float = Field(default=0, ge=0, le=100)


class RankJobsResponse(APIModel):
    candidate_id: str
    recommendations: list[RecommendationResult]


class RankCandidatesResponse(APIModel):
    job_id: str
    recommendations: list[RecommendationResult]


class HealthResponse(APIModel):
    status: Literal["ok"] = "ok"
    service: str
    version: str
