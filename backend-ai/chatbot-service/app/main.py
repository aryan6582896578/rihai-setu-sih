"""FastAPI entry point for the approved-answer FAQ chatbot."""

from fastapi import FastAPI

from app.routers.chat import router as chat_router
from app.schemas import HealthResponse


app = FastAPI(
    title="RIHAI SETU FAQ Chatbot",
    summary="Approved-answer support chatbot without external LLM calls.",
    version="1.0.0",
)


@app.get("/health", response_model=HealthResponse, tags=["health"])
def health() -> HealthResponse:
    return HealthResponse()


app.include_router(chat_router)
