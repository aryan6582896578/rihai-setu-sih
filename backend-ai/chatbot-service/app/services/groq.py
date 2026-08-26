"""Fast hosted Groq generation for retrieved public knowledge passages."""

from __future__ import annotations

import os

import httpx

from app.services.grounding import (
    SYSTEM_PROMPT,
    clean_grounded_answer,
    grounded_user_message,
)
from app.services.rag import RetrievedChunk


def groq_enabled() -> bool:
    return bool(os.getenv("GROQ_API_KEY", "").strip())


def ask_groq_grounded(
    message: str,
    contexts: list[RetrievedChunk],
) -> str | None:
    """Return a Groq answer grounded in retrieved context, or ``None``."""

    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key or not contexts:
        return None

    model = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant").strip()
    base_url = os.getenv(
        "GROQ_BASE_URL",
        "https://api.groq.com/openai/v1",
    ).rstrip("/")
    payload = {
        "model": model,
        "temperature": 0.2,
        "max_completion_tokens": 220,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": grounded_user_message(message, contexts),
            },
        ],
    }
    try:
        timeout = float(os.getenv("GROQ_TIMEOUT_SECONDS", "30"))
        with httpx.Client(timeout=timeout) as client:
            response = client.post(
                f"{base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        return clean_grounded_answer(content)
    except (httpx.HTTPError, KeyError, IndexError, ValueError, TypeError):
        return None
