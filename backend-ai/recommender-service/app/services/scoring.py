"""Deterministic, explainable candidate-to-job scoring."""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Sequence
from typing import Final

from app.schemas import CandidateProfile, Job, RecommendationResult
from app.services.explanation import generate_explanation
from app.services.geography import district_key
from app.services.similarity import canonical_skill_cosine


COMPONENT_MAX_POINTS: Final[dict[str, float]] = {
    "required_skills": 35.0,
    "preferred_skills": 15.0,
    "skill_similarity": 20.0,
    "certificates": 5.0,
    "experience": 5.0,
    "district": 10.0,
    "category": 10.0,
}


def _comparison_key(value: object) -> str:
    """Normalize labels for matching while preserving originals for responses."""

    text = unicodedata.normalize("NFKC", str(value or "")).casefold()
    # Canonical skill tags often use underscores while human input uses spaces.
    text = re.sub(r"[_\-]+", " ", text)
    text = re.sub(r"[^\w\s]", " ", text, flags=re.UNICODE)
    return " ".join(text.split())


def _unique(values: Sequence[str]) -> list[str]:
    """Deduplicate semantically equivalent values, retaining input order."""

    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        display_value = " ".join(str(value).split())
        key = _comparison_key(display_value)
        if key and key not in seen:
            seen.add(key)
            result.append(display_value)
    return result


def _partition_matches(
    requested: Sequence[str], offered: Sequence[str]
) -> tuple[list[str], list[str]]:
    """Return requested values partitioned into matched and missing lists."""

    offered_keys = {_comparison_key(value) for value in offered}
    matched: list[str] = []
    missing: list[str] = []
    for value in _unique(requested):
        destination = matched if _comparison_key(value) in offered_keys else missing
        destination.append(value)
    return matched, missing


def _proportional_points(matched: int, total: int, maximum: float) -> float:
    if total == 0:
        return maximum
    ratio = min(max(matched / total, 0.0), 1.0)
    return maximum * ratio


def _rounded(value: float, maximum: float) -> float:
    return round(min(max(float(value), 0.0), maximum), 2)


def _status_value(job: Job) -> str:
    status = job.status
    return _comparison_key(getattr(status, "value", status))


def score_candidate_for_job(
    candidate: CandidateProfile, job: Job
) -> RecommendationResult:
    """Score one candidate against one job on the documented 100-point scale.

    Eligibility and suitability are intentionally separate: an ineligible result
    still carries its deterministic score so an explicitly requested audit view
    can explain how it would otherwise have matched.
    """

    matched_required, missing_required = _partition_matches(
        job.required_skills, candidate.verified_skills
    )
    matched_preferred, _ = _partition_matches(
        job.preferred_skills, candidate.verified_skills
    )
    matched_certificates, missing_certificates = _partition_matches(
        job.required_certificates, candidate.certificates
    )

    required_skills = _unique(job.required_skills)
    preferred_skills = _unique(job.preferred_skills)
    required_certificates = _unique(job.required_certificates)
    cosine_similarity = canonical_skill_cosine(
        candidate.verified_skills,
        [*required_skills, *preferred_skills],
    )

    required_raw = _proportional_points(
        len(matched_required),
        len(required_skills),
        COMPONENT_MAX_POINTS["required_skills"],
    )
    preferred_raw = _proportional_points(
        len(matched_preferred),
        len(preferred_skills),
        COMPONENT_MAX_POINTS["preferred_skills"],
    )
    certificate_raw = _proportional_points(
        len(matched_certificates),
        len(required_certificates),
        COMPONENT_MAX_POINTS["certificates"],
    )
    similarity_raw = (
        cosine_similarity * COMPONENT_MAX_POINTS["skill_similarity"]
    )

    # Keep validated month values as integers.  Comparing before division avoids
    # converting an arbitrarily large JSON integer to float and guarantees that
    # even extreme valid inputs still produce a bounded score.
    experience_required = max(job.minimum_experience_months, 0)
    experience_available = max(candidate.experience_months, 0)
    if experience_required == 0:
        experience_raw = COMPONENT_MAX_POINTS["experience"]
    elif experience_available >= experience_required:
        experience_raw = COMPONENT_MAX_POINTS["experience"]
    else:
        experience_raw = (
            experience_available / experience_required
        ) * COMPONENT_MAX_POINTS["experience"]

    preferred_districts = {
        district_key(value) for value in candidate.preferred_districts
    }
    district_raw = (
        COMPONENT_MAX_POINTS["district"]
        if district_key(job.district) in preferred_districts
        else 0.0
    )
    preferred_categories = {
        _comparison_key(value) for value in candidate.preferred_job_categories
    }
    category_raw = (
        COMPONENT_MAX_POINTS["category"]
        if _comparison_key(job.job_category) in preferred_categories
        else 0.0
    )

    raw_components = {
        "required_skills": required_raw,
        "preferred_skills": preferred_raw,
        "skill_similarity": similarity_raw,
        "certificates": certificate_raw,
        "experience": experience_raw,
        "district": district_raw,
        "category": category_raw,
    }
    component_scores = {
        name: _rounded(points, COMPONENT_MAX_POINTS[name])
        for name, points in raw_components.items()
    }
    # Sum the displayed components so the total is directly auditable from the
    # response even where two independently rounded fractions meet.
    score = round(min(max(sum(component_scores.values()), 0.0), 100.0), 2)

    ineligibility_reasons: list[str] = []
    if not candidate.consent:
        ineligibility_reasons.append("Candidate consent was not provided")
    status = _status_value(job)
    if status != "active":
        display_status = getattr(job.status, "value", job.status)
        ineligibility_reasons.append(
            f"Job status '{display_status}' is not active"
        )

    explanation = generate_explanation(
        candidate,
        job,
        matched_required_skills=matched_required,
        missing_required_skills=missing_required,
        matched_preferred_skills=matched_preferred,
        missing_certificates=missing_certificates,
        cosine_similarity=cosine_similarity,
        ineligibility_reasons=ineligibility_reasons,
    )

    return RecommendationResult(
        candidate_id=candidate.candidate_id,
        job_id=job.job_id,
        eligible_for_recommendation=not ineligibility_reasons,
        score=score,
        cosine_similarity=cosine_similarity,
        component_scores=component_scores,
        matched_required_skills=matched_required,
        missing_required_skills=missing_required,
        matched_preferred_skills=matched_preferred,
        missing_certificates=missing_certificates,
        explanation=explanation,
        ineligibility_reasons=ineligibility_reasons,
    )


def calculate_match_score(
    candidate: CandidateProfile, job: Job
) -> RecommendationResult:
    """Backward-friendly public name for :func:`score_candidate_for_job`."""

    return score_candidate_for_job(candidate, job)


# A concise alias is convenient for adapters and interactive use.
calculate_score = calculate_match_score
