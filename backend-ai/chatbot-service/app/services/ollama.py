"""Local Ollama generation constrained by retrieved approved context."""

from __future__ import annotations

import os

import httpx

from app.services.grounding import (
    SYSTEM_PROMPT,
    clean_grounded_answer,
    grounded_user_message,
)
from app.services.rag import RetrievedChunk


def ollama_enabled() -> bool:
    return os.getenv("CHATBOT_ENABLE_OLLAMA", "false").strip().casefold() in {
        "1",
        "true",
        "yes",
    }


def ask_ollama_grounded(
    message: str,
    contexts: list[RetrievedChunk],
) -> str | None:
    """Answer from retrieved context only, or return ``None`` when insufficient."""

    if not ollama_enabled() or not contexts:
        return None
    base_url = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
    model = os.getenv("OLLAMA_MODEL", "llama3.2:latest")
    payload = {
        "model": model,
        "stream": False,
        "options": {"temperature": 0.2, "num_predict": 220},
        "messages": [
            {
                "role": "system",
                "content": SYSTEM_PROMPT,
            },
            {
                "role": "user",
                "content": grounded_user_message(message, contexts),
            },
        ],
    }
    try:
        timeout = float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "90"))
        with httpx.Client(timeout=timeout) as client:
            response = client.post(f"{base_url}/api/chat", json=payload)
            response.raise_for_status()
        content = response.json().get("message", {}).get("content", "")
        return clean_grounded_answer(content)
    except (httpx.HTTPError, ValueError, TypeError):
        return None


def ask_ollama(message: str) -> str | None:
    """Backward-compatible name; ungrounded generation is intentionally disabled."""

    del message
    return None
