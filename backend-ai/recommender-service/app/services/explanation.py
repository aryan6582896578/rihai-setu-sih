"""Human-readable explanations for deterministic recommendation results.

The explanation deliberately uses only fields that participate in scoring.  This
keeps the service explainable and prevents sensitive, out-of-scope attributes
from influencing the recommendation.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Sequence

from app.schemas import CandidateProfile, Job
from app.services.geography import district_key


def _comparison_key(value: object) -> str:
    """Return a forgiving key for comparisons without changing displayed data."""

    text = unicodedata.normalize("NFKC", str(value or "")).casefold()
    text = re.sub(r"[_\-]+", " ", text)
    text = re.sub(r"[^\w\s]", " ", text, flags=re.UNICODE)
    return " ".join(text.split())


def _unique(values: Sequence[str]) -> list[str]:
    seen: set[str] = set()
    unique_values: list[str] = []
    for value in values:
        display_value = " ".join(str(value).split())
        key = _comparison_key(display_value)
        if key and key not in seen:
            seen.add(key)
            unique_values.append(display_value)
    return unique_values


def _partition(
    requested: Sequence[str], offered: Sequence[str]
) -> tuple[list[str], list[str]]:
    offered_keys = {_comparison_key(value) for value in offered}
    matched: list[str] = []
    missing: list[str] = []
    for value in _unique(requested):
        (matched if _comparison_key(value) in offered_keys else missing).append(value)
    return matched, missing


def _human_join(values: Sequence[str]) -> str:
    values = [str(value) for value in values]
    if not values:
        return ""
    if len(values) == 1:
        return values[0]
    if len(values) == 2:
        return f"{values[0]} and {values[1]}"
    return f"{', '.join(values[:-1])}, and {values[-1]}"


def _months(value: int) -> str:
    return f"{value} month" if value == 1 else f"{value} months"


def generate_explanation(
    candidate: CandidateProfile,
    job: Job,
    matched_required_skills: Sequence[str] | None = None,
    missing_required_skills: Sequence[str] | None = None,
    matched_preferred_skills: Sequence[str] | None = None,
    missing_certificates: Sequence[str] | None = None,
    cosine_similarity: float | None = None,
    ineligibility_reasons: Sequence[str] = (),
) -> str:
    """Build an explanation from the actual match outcome.

    Match lists are accepted from the scorer so the JSON details and prose can
    never drift apart.  They are optional to keep this function useful on its
    own; when omitted, they are derived from the two API models.
    """

    derived_required_match, derived_required_missing = _partition(
        job.required_skills, candidate.verified_skills
    )
    derived_preferred_match, derived_preferred_missing = _partition(
        job.preferred_skills, candidate.verified_skills
    )
    _, derived_missing_certificates = _partition(
        job.required_certificates, candidate.certificates
    )

    matched_required = list(
        derived_required_match
        if matched_required_skills is None
        else matched_required_skills
    )
    missing_required = list(
        derived_required_missing
        if missing_required_skills is None
        else missing_required_skills
    )
    matched_preferred = list(
        derived_preferred_match
        if matched_preferred_skills is None
        else matched_preferred_skills
    )
    missing_preferred = derived_preferred_missing
    missing_certs = list(
        derived_missing_certificates
        if missing_certificates is None
        else missing_certificates
    )

    required = _unique(job.required_skills)
    preferred = _unique(job.preferred_skills)
    required_certificates = _unique(job.required_certificates)
    clauses: list[str] = []

    if cosine_similarity is not None:
        clauses.append(
            "canonical skill cosine similarity is "
            f"{round(float(cosine_similarity) * 100, 1)}%"
        )

    if not required:
        clauses.append("the job has no required skills")
    elif not missing_required:
        clauses.append("the candidate matches all required skills")
    elif matched_required:
        clauses.append(
            f"the candidate matches {len(matched_required)} of {len(required)} "
            f"required skills and is missing {_human_join(missing_required)}"
        )
    else:
        clauses.append(
            "the candidate is missing all required skills: "
            f"{_human_join(missing_required)}"
        )

    if not preferred:
        clauses.append("the job has no additional preferred skills")
    elif not missing_preferred:
        clauses.append("matches all preferred skills")
    elif matched_preferred:
        clauses.append(
            f"matches {len(matched_preferred)} of {len(preferred)} preferred skills"
        )
    else:
        clauses.append("does not match the preferred skills")

    if not required_certificates:
        clauses.append("no certificate is required")
    elif not missing_certs:
        clauses.append("has all required certificates")
    else:
        label = "certificate" if len(missing_certs) == 1 else "certificates"
        clauses.append(
            f"is missing the required {label}: {_human_join(missing_certs)}"
        )

    required_experience = max(int(job.minimum_experience_months), 0)
    candidate_experience = max(int(candidate.experience_months), 0)
    if required_experience == 0:
        clauses.append("no prior experience is required")
    elif candidate_experience >= required_experience:
        clauses.append(
            f"meets the experience requirement with {_months(candidate_experience)}"
        )
    else:
        clauses.append(
            f"has {_months(candidate_experience)} of the required "
            f"{_months(required_experience)} of experience"
        )

    district = " ".join(str(job.district or "").split())
    preferred_district_keys = {
        district_key(value) for value in candidate.preferred_districts
    }
    if not district:
        clauses.append(
            "does not receive district preference points because the job "
            "district is not specified"
        )
    elif district_key(district) in preferred_district_keys:
        clauses.append(f"prefers work in {district}")
    else:
        clauses.append(f"does not list {district} as a preferred district")

    category = " ".join(str(job.job_category or "").split())
    preferred_category_keys = {
        _comparison_key(value) for value in candidate.preferred_job_categories
    }
    if not category:
        clauses.append(
            "does not receive category preference points because the job "
            "category is not specified"
        )
    elif _comparison_key(category) in preferred_category_keys:
        clauses.append(f"prefers {category} work")
    else:
        clauses.append(f"does not list {category} as a preferred job category")

    detail = "; ".join(clauses) + "."
    reasons = [str(reason).strip().rstrip(".") for reason in ineligibility_reasons]
    reasons = [reason for reason in reasons if reason]
    if reasons:
        reason_text = ". ".join(reasons) + "."
        return f"Not eligible for recommendation: {reason_text} Suitability details: {detail}"
    return f"Recommended because {detail}"


# A descriptive alias for callers that prefer a verb-oriented name.
build_explanation = generate_explanation
