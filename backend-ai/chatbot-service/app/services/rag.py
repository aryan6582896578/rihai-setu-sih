"""Local retrieval for the approved RIHAI SETU knowledge base."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
import json
import math
from pathlib import Path
import re
import unicodedata


DATA_DIR = Path(__file__).resolve().parents[1] / "data"
MANIFEST_PATH = DATA_DIR / "documents.json"
INDEX_PATH = DATA_DIR / "rag_index.json"
INDEX_VERSION = 1

_WORD_RE = re.compile(r"[^a-z0-9]+")
_STOP_WORDS = frozenset(
    {
        "a", "about", "an", "and", "are", "as", "at", "be", "by", "can",
        "do", "for", "from", "how", "i", "in", "is", "it", "me", "my",
        "of", "on", "or", "that", "the", "this", "to", "was", "what",
        "when", "where", "which", "who", "why", "will", "with", "you",
        "your",
    }
)

_SCOPE_TERMS = frozenset(
    {
        "application", "apply", "candidate", "career", "caseworker",
        "certificate", "certification", "cv", "dlsa", "employer",
        "employment", "faq", "interview", "job", "jobs", "legal aid",
        "ngo", "nalsa", "occupation", "pmkvy", "portal", "post release",
        "prison", "prisoner", "recommendation", "rehabilitation", "resume",
        "rihai", "setu", "skill", "skills", "training", "undertrial",
        "undertrial review", "bnss", "479", "release", "prison release",
        "vacancy", "vocational", "work", "workplace",
    }
)


def tokenize(value: str) -> list[str]:
    normalized = unicodedata.normalize("NFKC", value).casefold()
    return [
        token
        for token in _WORD_RE.sub(" ", normalized).split()
        if len(token) > 1 and token not in _STOP_WORDS
    ]


def question_is_in_scope(message: str) -> bool:
    """Allow only RIHAI SETU, undertrial-review and support-service topics."""

    normalized = " ".join(tokenize(message))
    tokens = set(normalized.split())
    return any(
        (" " in term and term in normalized)
        or (" " not in term and term in tokens)
        for term in _SCOPE_TERMS
    )


@dataclass(frozen=True, slots=True)
class RetrievedChunk:
    source_id: str
    title: str
    issuer: str
    url: str
    page: int | None
    text: str
    score: float


class RAGIndex:
    """A small local BM25 index loaded from the generated JSON artifact."""

    def __init__(self, chunks: list[dict[str, object]]) -> None:
        self.chunks = chunks
        self.token_lists = [tokenize(str(chunk["text"])) for chunk in chunks]
        self.lengths = [len(tokens) for tokens in self.token_lists]
        self.average_length = (
            sum(self.lengths) / len(self.lengths) if self.lengths else 0.0
        )
        self.document_frequency: Counter[str] = Counter()
        for tokens in self.token_lists:
            self.document_frequency.update(set(tokens))

    @classmethod
    def load(cls) -> "RAGIndex | None":
        if not INDEX_PATH.exists():
            return None
        raw = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
        if raw.get("version") != INDEX_VERSION:
            return None
        chunks = raw.get("chunks")
        if not isinstance(chunks, list) or not chunks:
            return None
        return cls(chunks)

    def retrieve(self, query: str, limit: int = 4) -> list[RetrievedChunk]:
        query_terms = list(dict.fromkeys(tokenize(query)))
        if not query_terms or not self.chunks:
            return []

        total = len(self.chunks)
        k1 = 1.5
        b = 0.75
        ranked: list[tuple[float, int]] = []
        for index, tokens in enumerate(self.token_lists):
            counts = Counter(tokens)
            score = 0.0
            length = self.lengths[index]
            for term in query_terms:
                frequency = counts.get(term, 0)
                if frequency == 0:
                    continue
                document_frequency = self.document_frequency.get(term, 0)
                inverse_frequency = math.log(
                    1 + (total - document_frequency + 0.5)
                    / (document_frequency + 0.5)
                )
                denominator = frequency + k1 * (
                    1 - b + b * length / max(self.average_length, 1.0)
                )
                score += inverse_frequency * frequency * (k1 + 1) / denominator
            if score > 0:
                ranked.append((score, index))

        ranked.sort(key=lambda item: (-item[0], item[1]))
        results: list[RetrievedChunk] = []
        for score, index in ranked[:limit]:
            chunk = self.chunks[index]
            results.append(
                RetrievedChunk(
                    source_id=str(chunk["source_id"]),
                    title=str(chunk["title"]),
                    issuer=str(chunk["issuer"]),
                    url=str(chunk.get("url") or ""),
                    page=(int(chunk["page"]) if chunk.get("page") else None),
                    text=str(chunk["text"]),
                    score=round(score, 4),
                )
            )
        return results


_INDEX: RAGIndex | None = None


def get_index() -> RAGIndex | None:
    global _INDEX
    if _INDEX is None:
        _INDEX = RAGIndex.load()
    return _INDEX


def reload_index() -> RAGIndex | None:
    global _INDEX
    _INDEX = RAGIndex.load()
    return _INDEX


def retrieve_context(message: str, limit: int = 3) -> list[RetrievedChunk]:
    index = get_index()
    return index.retrieve(message, limit) if index else []


def knowledge_status() -> dict[str, object]:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    index = get_index()
    return {
        "ready": index is not None,
        "document_count": len(manifest),
        "chunk_count": len(index.chunks) if index else 0,
    }
