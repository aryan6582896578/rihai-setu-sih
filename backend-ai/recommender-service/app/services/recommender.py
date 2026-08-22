"""Ranking operations built on the deterministic scoring service."""

from __future__ import annotations

from collections.abc import Sequence

from app.schemas import CandidateProfile, Job, RecommendationResult
from app.services.scoring import score_candidate_for_job


def _limit(results: list[RecommendationResult], top_k: int | None) -> list[RecommendationResult]:
    if top_k is None:
        return results
    return results[: max(int(top_k), 0)]


def rank_jobs(
    candidate: CandidateProfile,
    jobs: Sequence[Job],
    top_k: int | None = 5,
    minimum_score: float = 0.0,
    include_ineligible: bool = False,
) -> list[RecommendationResult]:
    """Rank jobs by descending score, then ascending ``job_id``."""

    threshold = float(minimum_score)
    results = [score_candidate_for_job(candidate, job) for job in jobs]
    results = [
        result
        for result in results
        if result.score >= threshold
        and (include_ineligible or result.eligible_for_recommendation)
    ]
    results.sort(key=lambda result: (-float(result.score), str(result.job_id)))
    return _limit(results, top_k)


def rank_candidates(
    job: Job,
    candidates: Sequence[CandidateProfile],
    top_k: int | None = 5,
    minimum_score: float = 0.0,
) -> list[RecommendationResult]:
    """Rank eligible candidates by score, then ascending ``candidate_id``.

    Consent is a hard policy boundary for candidate ranking, so this operation
    intentionally has no option that can return a person without consent.
    """

    threshold = float(minimum_score)
    results = [score_candidate_for_job(candidate, job) for candidate in candidates]
    results = [
        result
        for result in results
        if result.score >= threshold
        and result.eligible_for_recommendation
    ]
    results.sort(key=lambda result: (-float(result.score), str(result.candidate_id)))
    return _limit(results, top_k)
