"""Service health endpoint."""

from fastapi import APIRouter

from app import __version__
from app.schemas import HealthResponse


router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    """Return a lightweight liveness response for callers and deployments."""

    return HealthResponse(
        status="ok",
        service="rihai-setu-employment-recommender",
        version=__version__,
    )
