"""FastAPI application entry point."""

from fastapi import FastAPI

from app import __version__
from app.routers import health, recommendations, skills


app = FastAPI(
    title="RIHAI SETU Employment Recommender",
    summary="Deterministic, explainable employment matching for Phase 1.",
    description=(
        "Extracts canonical skill tags, scores candidate-to-job matches, and "
        "provides deterministic rankings without model training or live data."
    ),
    version=__version__,
)

app.include_router(health.router)
app.include_router(skills.router)
app.include_router(recommendations.router)
