"""End-to-end tests for the public FastAPI contract."""

from fastapi.testclient import TestClient
import pytest

from app.main import app


client = TestClient(app)


def candidate_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "candidate_id": "PRI-0009",
        "verified_skills": ["baking", "food_preparation", "kitchen_hygiene"],
        "certificates": ["Food Safety"],
        "experience_months": 10,
        "preferred_job_categories": ["bakery", "food service"],
        "preferred_districts": ["Thane", "Mumbai"],
        "available_from": "2026-06-17",
        "consent": True,
    }
    payload.update(overrides)
    return payload


def job_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "job_id": "JOB-0007",
        "title": "Bakery Assistant",
        "description": "Assist with bread preparation, baking and kitchen hygiene.",
        "required_skills": ["baking", "food_preparation"],
        "preferred_skills": ["kitchen_hygiene"],
        "required_certificates": ["Food Safety"],
        "minimum_experience_months": 6,
        "job_category": "bakery",
        "district": "Thane",
        "status": "active",
    }
    payload.update(overrides)
    return payload


def test_health_endpoint() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_extract_skills_endpoint_returns_explainable_matches() -> None:
    response = client.post(
        "/api/v1/skills/extract",
        json={"text": "Completed uniform stiching and cloth cutting training."},
    )

    assert response.status_code == 200
    body = response.json()
    matches = {match["canonical_skill"]: match for match in body["matches"]}
    assert set(matches) == {"tailoring", "fabric_cutting"}
    assert matches["tailoring"]["match_method"] == "fuzzy"
    assert 85 <= matches["tailoring"]["confidence"] <= 100


def test_skill_catalog_endpoint_exposes_controlled_vocabulary() -> None:
    response = client.get("/api/v1/skills/catalog")

    assert response.status_code == 200
    body = response.json()
    assert body["count"] == len(body["canonical_skills"])
    assert "baking" in body["canonical_skills"]
    assert "machine_sewing" in body["canonical_skills"]


def test_score_endpoint_returns_full_detailed_match() -> None:
    response = client.post(
        "/api/v1/recommendations/score",
        json={"candidate": candidate_payload(), "job": job_payload()},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["candidate_id"] == "PRI-0009"
    assert body["job_id"] == "JOB-0007"
    assert body["eligible_for_recommendation"] is True
    assert body["score"] == 100.0
    assert body["component_scores"] == {
        "required_skills": 35.0,
        "preferred_skills": 15.0,
        "skill_similarity": 20.0,
        "certificates": 5.0,
        "experience": 5.0,
        "district": 10.0,
        "category": 10.0,
    }
    assert body["cosine_similarity"] == 1.0
    assert body["missing_required_skills"] == []
    assert body["missing_certificates"] == []
    assert body["ineligibility_reasons"] == []
    assert body["explanation"]


def test_rank_jobs_excludes_closed_jobs_by_default() -> None:
    active = job_payload(job_id="JOB-A")
    closed = job_payload(job_id="JOB-Z", status="closed")
    response = client.post(
        "/api/v1/recommendations/rank-jobs",
        json={
            "candidate": candidate_payload(),
            "jobs": [closed, active],
            "top_k": 5,
            "minimum_score": 0,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["candidate_id"] == "PRI-0009"
    assert [item["job_id"] for item in body["recommendations"]] == ["JOB-A"]


def test_rank_candidates_excludes_candidate_without_consent() -> None:
    consenting = candidate_payload(candidate_id="PRI-A")
    no_consent = candidate_payload(candidate_id="PRI-Z", consent=False)
    response = client.post(
        "/api/v1/recommendations/rank-candidates",
        json={
            "job": job_payload(),
            "candidates": [no_consent, consenting],
            "top_k": 5,
            "minimum_score": 0,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["job_id"] == "JOB-0007"
    assert [item["candidate_id"] for item in body["recommendations"]] == ["PRI-A"]


def test_invalid_request_validation() -> None:
    invalid_candidate = candidate_payload(experience_months=-1)
    response = client.post(
        "/api/v1/recommendations/score",
        json={"candidate": invalid_candidate, "job": job_payload()},
    )

    assert response.status_code == 422


@pytest.mark.parametrize(
    "prohibited_field",
    [
        "offence",
        "sentence",
        "case",
        "bail",
        "caste",
        "religion",
        "gender",
        "recidivism",
    ],
)
def test_legal_or_sensitive_candidate_fields_are_rejected(
    prohibited_field: str,
) -> None:
    invalid_candidate = candidate_payload(
        **{prohibited_field: "not permitted"},
    )
    response = client.post(
        "/api/v1/recommendations/score",
        json={"candidate": invalid_candidate, "job": job_payload()},
    )

    assert response.status_code == 422
    assert prohibited_field in response.text


def test_sensitive_fields_are_also_rejected_on_jobs() -> None:
    invalid_job = job_payload(caste="not permitted")
    response = client.post(
        "/api/v1/recommendations/score",
        json={"candidate": candidate_payload(), "job": invalid_job},
    )

    assert response.status_code == 422
    assert "caste" in response.text


@pytest.mark.parametrize("invalid_consent", [1, "yes"])
def test_consent_requires_an_explicit_json_boolean(invalid_consent: object) -> None:
    response = client.post(
        "/api/v1/recommendations/score",
        json={
            "candidate": candidate_payload(consent=invalid_consent),
            "job": job_payload(),
        },
    )

    assert response.status_code == 422


def test_include_ineligible_requires_an_explicit_json_boolean() -> None:
    response = client.post(
        "/api/v1/recommendations/rank-jobs",
        json={
            "candidate": candidate_payload(),
            "jobs": [job_payload()],
            "include_ineligible": 1,
        },
    )

    assert response.status_code == 422


def test_rank_jobs_include_ineligible_still_marks_closed_job_invalid() -> None:
    response = client.post(
        "/api/v1/recommendations/rank-jobs",
        json={
            "candidate": candidate_payload(),
            "jobs": [job_payload(status="closed")],
            "include_ineligible": True,
        },
    )

    assert response.status_code == 200
    recommendation = response.json()["recommendations"][0]
    assert recommendation["eligible_for_recommendation"] is False
    assert "closed" in recommendation["explanation"].lower()


def test_rank_jobs_excludes_everything_when_candidate_did_not_consent() -> None:
    response = client.post(
        "/api/v1/recommendations/rank-jobs",
        json={
            "candidate": candidate_payload(consent=False),
            "jobs": [job_payload()],
        },
    )

    assert response.status_code == 200
    assert response.json()["recommendations"] == []


def test_rank_candidates_excludes_everything_for_paused_job() -> None:
    response = client.post(
        "/api/v1/recommendations/rank-candidates",
        json={
            "job": job_payload(status="paused"),
            "candidates": [candidate_payload()],
        },
    )

    assert response.status_code == 200
    assert response.json()["recommendations"] == []


def test_invalid_job_status_is_rejected() -> None:
    response = client.post(
        "/api/v1/recommendations/score",
        json={"candidate": candidate_payload(), "job": job_payload(status="archived")},
    )

    assert response.status_code == 422
