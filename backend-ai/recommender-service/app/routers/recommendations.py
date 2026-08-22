"""Scoring and deterministic ranking endpoints."""

from fastapi import APIRouter

from app.schemas import (
    RankCandidatesRequest,
    RankCandidatesResponse,
    RankJobsRequest,
    RankJobsResponse,
    RecommendationResult,
    ScoreRequest,
)
from app.services.recommender import (
    rank_candidates,
    rank_jobs,
    score_candidate_for_job,
)


router = APIRouter(prefix="/api/v1/recommendations", tags=["recommendations"])


@router.post("/score", response_model=RecommendationResult)
def score_match(request: ScoreRequest) -> RecommendationResult:
    """Return one detailed, explainable candidate-to-job score."""

    return score_candidate_for_job(request.candidate, request.job)


@router.post("/rank-jobs", response_model=RankJobsResponse)
def rank_jobs_for_candidate(request: RankJobsRequest) -> RankJobsResponse:
    """Rank active jobs for one consenting candidate."""

    recommendations = rank_jobs(
        candidate=request.candidate,
        jobs=request.jobs,
        top_k=request.top_k,
        minimum_score=request.minimum_score,
        include_ineligible=request.include_ineligible,
    )
    return RankJobsResponse(
        candidate_id=request.candidate.candidate_id,
        recommendations=recommendations,
    )


@router.post("/rank-candidates", response_model=RankCandidatesResponse)
def rank_candidates_for_job(
    request: RankCandidatesRequest,
) -> RankCandidatesResponse:
    """Rank consenting candidates for one active job."""

    recommendations = rank_candidates(
        job=request.job,
        candidates=request.candidates,
        top_k=request.top_k,
        minimum_score=request.minimum_score,
    )
    return RankCandidatesResponse(
        job_id=request.job.job_id,
        recommendations=recommendations,
    )
