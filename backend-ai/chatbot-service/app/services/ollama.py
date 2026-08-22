"""Optional local Ollama fallback for non-sensitive, unmatched questions."""

from __future__ import annotations

import os

import httpx


def ollama_enabled() -> bool:
    return os.getenv("CHATBOT_ENABLE_OLLAMA", "false").strip().casefold() in {
        "1",
        "true",
        "yes",
    }


def ask_ollama(message: str) -> str | None:
    """Return a concise local-model response, or ``None`` when unavailable."""

    if not ollama_enabled():
        return None
    base_url = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
    model = os.getenv("OLLAMA_MODEL", "llama3.2:latest")
    payload = {
        "model": model,
        "stream": False,
        "options": {"temperature": 0.2},
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are the RIHAI SETU support assistant. Answer in simple, "
                    "respectful language in no more than two short paragraphs. "
                    "You may explain general employment, training or portal concepts, "
                    "but never invent RIHAI SETU policies, jobs, services or facts. "
                    "Do not provide legal, medical, emergency, criminal-case or mental "
                    "health advice. If verified information is needed, direct the user "
                    "to their NGO caseworker or authorized portal administrator."
                ),
            },
            {"role": "user", "content": message},
        ],
    }
    try:
        with httpx.Client(timeout=20.0) as client:
            response = client.post(f"{base_url}/api/chat", json=payload)
            response.raise_for_status()
        content = response.json().get("message", {}).get("content", "")
        answer = str(content).strip()
        return answer or None
    except (httpx.HTTPError, ValueError, TypeError):
        return None
