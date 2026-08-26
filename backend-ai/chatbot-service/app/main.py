"""FastAPI entry point for the scoped local RAG chatbot."""

from fastapi import FastAPI

from app.routers.chat import router as chat_router
from app.schemas import HealthResponse


app = FastAPI(
    title="RIHAI SETU Scoped RAG Chatbot",
    summary="Document-grounded local support chatbot with safety routing.",
    version="1.1.0",
)


@app.get("/health", response_model=HealthResponse, tags=["health"])
def health() -> HealthResponse:
    return HealthResponse()


app.include_router(chat_router)
