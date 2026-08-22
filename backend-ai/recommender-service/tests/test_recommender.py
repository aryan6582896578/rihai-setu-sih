"""Tests for filtering and deterministic recommendation ranking."""

from __future__ import annotations

from app.schemas import CandidateProfile, Job
from app.services.recommender import rank_candidates, rank_jobs


def make_candidate(candidate_id: str = "PRI-0001", **changes: object) -> CandidateProfile:
    data: dict[str, object] = {
        "candidate_id": candidate_id,
        "verified_skills": ["tailoring"],
        "certificates": [],
        "experience_months": 6,
        "preferred_job_categories": ["garment"],
        "preferred_districts": ["Pune"],
        "consent": True,
    }
    data.update(changes)
    return CandidateProfile(**data)


def make_job(job_id: str = "JOB-0001", **changes: object) -> Job:
    data: dict[str, object] = {
        "job_id": job_id,
        "title": "Tailoring Assistant",
        "description": "Tailoring work",
        "required_skills": ["tailoring"],
        "preferred_skills": [],
        "required_certificates": [],
        "minimum_experience_months": 0,
        "job_category": "garment",
        "district": "Pune",
        "status": "active",
    }
    data.update(changes)
    return Job(**data)


def test_rank_jobs_uses_job_id_as_deterministic_tie_breaker() -> None:
    candidate = make_candidate()
    jobs = [make_job("JOB-0002"), make_job("JOB-0001")]

    first = rank_jobs(candidate, jobs, top_k=10)
    second = rank_jobs(candidate, list(reversed(jobs)), top_k=10)

    assert [result.job_id for result in first] == ["JOB-0001", "JOB-0002"]
    assert [result.job_id for result in second] == ["JOB-0001", "JOB-0002"]


def test_rank_jobs_sorts_by_score_before_id() -> None:
    candidate = make_candidate()
    low = make_job("JOB-0001", required_skills=["welding"])
    high = make_job("JOB-9999")

    results = rank_jobs(candidate, [low, high], top_k=10)
    assert [result.job_id for result in results] == ["JOB-9999", "JOB-0001"]
    assert results[0].score > results[1].score


def test_rank_jobs_applies_top_k_after_sorting() -> None:
    jobs = [make_job(f"JOB-{number:04d}") for number in range(5, 0, -1)]
    results = rank_jobs(make_candidate(), jobs, top_k=2)
    assert [result.job_id for result in results] == ["JOB-0001", "JOB-0002"]


def test_rank_jobs_applies_minimum_score_filter() -> None:
    jobs = [
        make_job("JOB-GOOD"),
        make_job(
            "JOB-LOW",
            required_skills=["welding"],
            district="Mumbai",
            job_category="metalwork",
        ),
    ]
    results = rank_jobs(make_candidate(), jobs, top_k=10, minimum_score=90)
    assert [result.job_id for result in results] == ["JOB-GOOD"]


def test_rank_jobs_excludes_inactive_jobs_by_default() -> None:
    jobs = [make_job("JOB-ACTIVE"), make_job("JOB-CLOSED", status="closed")]
    results = rank_jobs(make_candidate(), jobs, top_k=10)
    assert [result.job_id for result in results] == ["JOB-ACTIVE"]


def test_rank_jobs_can_include_ineligible_results_explicitly() -> None:
    jobs = [make_job("JOB-ACTIVE"), make_job("JOB-CLOSED", status="closed")]
    results = rank_jobs(
        make_candidate(), jobs, top_k=10, include_ineligible=True
    )
    assert [result.job_id for result in results] == ["JOB-ACTIVE", "JOB-CLOSED"]
    assert results[1].eligible_for_recommendation is False


def test_rank_candidates_uses_candidate_id_as_tie_breaker() -> None:
    candidates = [make_candidate("PRI-0002"), make_candidate("PRI-0001")]
    results = rank_candidates(make_job(), candidates, top_k=10)
    assert [result.candidate_id for result in results] == ["PRI-0001", "PRI-0002"]


def test_rank_candidates_orders_by_score_and_applies_top_k() -> None:
    candidates = [
        make_candidate("PRI-LOW", verified_skills=[]),
        make_candidate("PRI-HIGH"),
        make_candidate("PRI-MID", preferred_districts=[]),
    ]
    results = rank_candidates(make_job(), candidates, top_k=2)
    assert [result.candidate_id for result in results] == ["PRI-HIGH", "PRI-MID"]


def test_rank_candidates_excludes_no_consent_even_if_match_is_high() -> None:
    candidates = [
        make_candidate("PRI-CONSENTED", verified_skills=[]),
        make_candidate("PRI-NO-CONSENT", consent=False),
    ]
    results = rank_candidates(make_job(), candidates, top_k=10)
    assert [result.candidate_id for result in results] == ["PRI-CONSENTED"]


def test_rank_candidates_applies_minimum_score() -> None:
    candidates = [
        make_candidate("PRI-HIGH"),
        make_candidate(
            "PRI-LOW",
            verified_skills=[],
            preferred_districts=[],
            preferred_job_categories=[],
        ),
    ]
    results = rank_candidates(
        make_job(), candidates, top_k=10, minimum_score=90
    )
    assert [result.candidate_id for result in results] == ["PRI-HIGH"]


def test_zero_top_k_returns_no_results() -> None:
    assert rank_jobs(make_candidate(), [make_job()], top_k=0) == []
    assert rank_candidates(make_job(), [make_candidate()], top_k=0) == []
