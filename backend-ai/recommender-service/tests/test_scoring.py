"""Unit tests for the documented 100-point scoring algorithm."""

from __future__ import annotations

import pytest

from app.schemas import CandidateProfile, Job
from app.services.scoring import calculate_match_score, score_candidate_for_job


def make_candidate(**changes: object) -> CandidateProfile:
    data: dict[str, object] = {
        "candidate_id": "PRI-0009",
        "verified_skills": ["baking", "food_preparation", "kitchen_hygiene"],
        "certificates": ["Food Safety"],
        "experience_months": 12,
        "preferred_job_categories": ["bakery"],
        "preferred_districts": ["Thane"],
        "consent": True,
    }
    data.update(changes)
    return CandidateProfile(**data)


def make_job(**changes: object) -> Job:
    data: dict[str, object] = {
        "job_id": "JOB-0007",
        "title": "Bakery Assistant",
        "description": "Assist with bread preparation and kitchen hygiene.",
        "required_skills": ["baking", "food preparation"],
        "preferred_skills": ["kitchen hygiene"],
        "required_certificates": ["food safety"],
        "minimum_experience_months": 6,
        "job_category": "Bakery",
        "district": "thane",
        "status": "active",
    }
    data.update(changes)
    return Job(**data)


def test_full_match_scores_100_and_lists_actual_matches() -> None:
    result = score_candidate_for_job(make_candidate(), make_job())

    assert result.eligible_for_recommendation is True
    assert result.score == 100.0
    assert result.component_scores.required_skills == 35.0
    assert result.component_scores.preferred_skills == 15.0
    assert result.component_scores.skill_similarity == 20.0
    assert result.component_scores.certificates == 5.0
    assert result.component_scores.experience == 5.0
    assert result.component_scores.district == 10.0
    assert result.component_scores.category == 10.0
    assert result.matched_required_skills == ["baking", "food preparation"]
    assert result.missing_required_skills == []
    assert result.matched_preferred_skills == ["kitchen hygiene"]
    assert result.missing_certificates == []
    assert "all required skills" in result.explanation


def test_partial_required_skill_match_is_proportional() -> None:
    candidate = make_candidate(verified_skills=["baking", "kitchen_hygiene"])
    result = calculate_match_score(candidate, make_job())

    assert result.component_scores.required_skills == 17.5
    assert result.component_scores.skill_similarity == 16.33
    assert result.cosine_similarity == pytest.approx(0.816497)
    assert result.score == 78.83
    assert result.matched_required_skills == ["baking"]
    assert result.missing_required_skills == ["food preparation"]
    assert "1 of 2 required skills" in result.explanation


def test_missing_certificate_scores_zero_for_certificate_component() -> None:
    result = score_candidate_for_job(
        make_candidate(certificates=[]),
        make_job(required_certificates=["Food Safety"]),
    )

    assert result.component_scores.certificates == 0.0
    assert result.score == 95.0
    assert result.missing_certificates == ["Food Safety"]
    assert "Food Safety" in result.explanation


def test_certificate_matching_is_case_insensitive() -> None:
    result = score_candidate_for_job(
        make_candidate(certificates=["FOOD SAFETY"]),
        make_job(required_certificates=["food safety"]),
    )
    assert result.component_scores.certificates == 5.0
    assert result.missing_certificates == []


def test_insufficient_experience_is_scored_proportionally() -> None:
    result = score_candidate_for_job(
        make_candidate(experience_months=3),
        make_job(minimum_experience_months=6),
    )

    assert result.component_scores.experience == 2.5
    assert result.score == 97.5
    assert "3 months" in result.explanation
    assert "required 6 months" in result.explanation


def test_district_mismatch_scores_zero_for_district() -> None:
    result = score_candidate_for_job(
        make_candidate(preferred_districts=["Mumbai"]), make_job(district="Thane")
    )
    assert result.component_scores.district == 0.0
    assert result.score == 90.0
    assert "does not list Thane" in result.explanation


@pytest.mark.parametrize(
    ("candidate_district", "job_district"),
    [("Mumbai", "Mumbai City"), ("Mumbai", "Mumbai Suburban"), ("Thane", "Bhiwandi")],
)
def test_district_aliases_match_at_the_agreed_district_level(
    candidate_district: str, job_district: str
) -> None:
    result = score_candidate_for_job(
        make_candidate(preferred_districts=[candidate_district]),
        make_job(district=job_district),
    )

    assert result.component_scores.district == 10.0


def test_category_mismatch_scores_zero_for_category() -> None:
    result = score_candidate_for_job(
        make_candidate(preferred_job_categories=["carpentry"]),
        make_job(job_category="bakery"),
    )
    assert result.component_scores.category == 0.0
    assert result.score == 90.0
    assert "does not list bakery" in result.explanation


def test_blank_district_and_category_explain_that_no_preference_points_apply() -> None:
    result = score_candidate_for_job(
        make_candidate(), make_job(district="", job_category="")
    )

    assert result.component_scores.district == 0.0
    assert result.component_scores.category == 0.0
    assert "district is not specified" in result.explanation
    assert "category is not specified" in result.explanation


def test_empty_requirements_receive_full_component_points() -> None:
    result = score_candidate_for_job(
        make_candidate(verified_skills=[], certificates=[], experience_months=0),
        make_job(
            required_skills=[],
            preferred_skills=[],
            required_certificates=[],
            minimum_experience_months=0,
        ),
    )
    assert result.component_scores.required_skills == 35.0
    assert result.component_scores.preferred_skills == 15.0
    assert result.component_scores.skill_similarity == 20.0
    assert result.component_scores.certificates == 5.0
    assert result.component_scores.experience == 5.0


def test_candidate_without_consent_is_ineligible_with_reason() -> None:
    result = score_candidate_for_job(make_candidate(consent=False), make_job())

    assert result.eligible_for_recommendation is False
    assert result.ineligibility_reasons
    assert "consent" in result.ineligibility_reasons[0].lower()
    assert result.explanation.startswith("Not eligible for recommendation")


@pytest.mark.parametrize("status", ["closed", "paused"])
def test_non_active_job_is_ineligible_with_reason(status: str) -> None:
    result = score_candidate_for_job(make_candidate(), make_job(status=status))

    assert result.eligible_for_recommendation is False
    assert any(status in reason.lower() for reason in result.ineligibility_reasons)
    assert status in result.explanation.lower()


def test_multiple_ineligibility_reasons_are_all_returned() -> None:
    result = score_candidate_for_job(
        make_candidate(consent=False), make_job(status="closed")
    )
    assert len(result.ineligibility_reasons) == 2


def test_score_and_components_always_stay_within_bounds() -> None:
    results = [
        score_candidate_for_job(make_candidate(), make_job()),
        score_candidate_for_job(
            make_candidate(
                verified_skills=[],
                certificates=[],
                experience_months=0,
                preferred_job_categories=[],
                preferred_districts=[],
            ),
            make_job(),
        ),
    ]

    for result in results:
        assert 0.0 <= result.score <= 100.0
        components = result.component_scores.model_dump()
        assert all(value >= 0.0 for value in components.values())
        assert sum(components.values()) <= 100.0
        assert result.score == round(sum(components.values()), 2)


def test_extremely_large_experience_values_still_produce_bounded_scores() -> None:
    huge = 10**400

    full = score_candidate_for_job(
        make_candidate(experience_months=huge),
        make_job(minimum_experience_months=huge - 1),
    )
    partial = score_candidate_for_job(
        make_candidate(experience_months=huge),
        make_job(minimum_experience_months=huge * 2),
    )

    assert full.component_scores.experience == 5.0
    assert partial.component_scores.experience == 2.5
    assert 0.0 <= full.score <= 100.0
    assert 0.0 <= partial.score <= 100.0


def test_skill_comparison_accepts_spaces_hyphens_and_underscores() -> None:
    result = score_candidate_for_job(
        make_candidate(verified_skills=["food_preparation"]),
        make_job(
            required_skills=["Food-Preparation"],
            preferred_skills=[],
            required_certificates=[],
        ),
    )
    assert result.matched_required_skills == ["Food-Preparation"]
    assert result.component_scores.required_skills == 35.0
