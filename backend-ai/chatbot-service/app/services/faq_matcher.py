"""Deterministic matching against an approved FAQ catalog."""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
import re
import unicodedata

from app.services.ollama import ask_ollama, ollama_enabled


_DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "faqs.json"
_TOKEN_RE = re.compile(r"[^\w\s]", flags=re.UNICODE)
_STOP_WORDS = frozenset(
    {
        "a", "an", "and", "are", "can", "do", "for", "how", "i", "is",
        "me", "my", "of", "on", "or", "the", "to", "what", "why", "with",
        "you", "your",
    }
)
_SYNONYMS = {
    "application": "apply",
    "apply": "apply",
    "career": "job",
    "employment": "job",
    "occupation": "job",
    "opening": "job",
    "vacancy": "job",
    "recommend": "recommendation",
    "recommended": "recommendation",
    "recommendations": "recommendation",
    "score": "score",
    "marks": "score",
    "certificate": "certificate",
    "certificates": "certificate",
    "training": "training",
    "course": "training",
    "courses": "training",
}
_ESCALATION_TERMS = frozenset(
    {
        "bail", "case", "court", "crime", "doctor", "emergency", "lawyer",
        "legal", "medical", "offence", "police", "self harm", "suicide",
    }
)
_FALLBACK = (
    "I do not have a verified answer for that question. Please contact your "
    "assigned NGO caseworker or authorized portal administrator."
)
_ESCALATION = (
    "I cannot provide legal, medical or emergency guidance. Please contact your "
    "authorized NGO caseworker, relevant emergency service, legal aid provider "
    "or portal administrator."
)


@dataclass(frozen=True, slots=True)
class FAQ:
    category: str
    question: str
    answer: str
    tokens: frozenset[str]


def _tokens(value: str) -> frozenset[str]:
    normalized = unicodedata.normalize("NFKC", value).casefold()
    normalized = _TOKEN_RE.sub(" ", normalized)
    values = []
    for token in normalized.split():
        if token in _STOP_WORDS:
            continue
        values.append(_SYNONYMS.get(token, token))
    return frozenset(values)


def _normalized_phrase(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold()
    return " ".join(_TOKEN_RE.sub(" ", normalized).split())


def _load_faqs() -> tuple[FAQ, ...]:
    raw = json.loads(_DATA_PATH.read_text(encoding="utf-8"))
    if not isinstance(raw, list) or not raw:
        raise ValueError("FAQ catalog must be a non-empty JSON list")
    faqs: list[FAQ] = []
    for item in raw:
        if not isinstance(item, dict):
            raise ValueError("Each FAQ must be an object")
        category = str(item.get("category") or "").strip()
        question = str(item.get("question") or "").strip()
        answer = str(item.get("answer") or "").strip()
        if not category or not question or not answer:
            raise ValueError("Each FAQ requires category, question and answer")
        faqs.append(FAQ(category, question, answer, _tokens(question)))
    return tuple(faqs)


FAQS = _load_faqs()


def all_faqs() -> tuple[FAQ, ...]:
    return FAQS


def _score(query: frozenset[str], faq: FAQ) -> float:
    if not query or not faq.tokens:
        return 0.0
    overlap = len(query & faq.tokens)
    if overlap == 0:
        return 0.0
    return round((2 * overlap) / (len(query) + len(faq.tokens)), 6)


def _suggestions(limit: int = 3) -> list[FAQ]:
    return list(FAQS[:limit])


def answer_question(
    message: str,
) -> tuple[str, FAQ | None, float, str, bool, list[FAQ]]:
    """Return an approved answer, a match record and safe fallback metadata."""

    query = _tokens(message)
    normalized_message = _normalized_phrase(message)
    if any(
        (" " in term and term in normalized_message)
        or (" " not in term and term in query)
        for term in _ESCALATION_TERMS
    ):
        return _ESCALATION, None, 0.0, "safety", True, _suggestions()

    ranked = sorted(
        ((faq, _score(query, faq)) for faq in FAQS),
        key=lambda item: (-item[1], item[0].question),
    )
    best, confidence = ranked[0]
    suggestions = [faq for faq, _ in ranked[:3]]
    # Ollama is the preferred responder for all ordinary questions when enabled.
    # The FAQ catalog remains a dependable offline fallback if the local model
    # is stopped or fails to answer.
    generated = ask_ollama(message) if ollama_enabled() else None
    if generated:
        return generated, None, confidence, "ollama", False, suggestions

    if confidence < 0.34:
        return _FALLBACK, None, confidence, "fallback", True, suggestions
    return best.answer, best, confidence, "faq", False, suggestions
