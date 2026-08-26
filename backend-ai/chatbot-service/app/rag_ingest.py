"""Build the local RAG text index from approved PDFs and Markdown documents."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re

from pypdf import PdfReader

from app.services.rag import (
    DATA_DIR,
    INDEX_PATH,
    INDEX_VERSION,
    MANIFEST_PATH,
)


DOCUMENT_DIR = DATA_DIR / "documents"
_WHITESPACE_RE = re.compile(r"\s+")


def _clean_text(value: str) -> str:
    return _WHITESPACE_RE.sub(" ", value).strip()


def _split_text(value: str, size: int = 1400, overlap: int = 180) -> list[str]:
    value = _clean_text(value)
    if not value:
        return []
    chunks: list[str] = []
    start = 0
    while start < len(value):
        end = min(start + size, len(value))
        if end < len(value):
            boundary = value.rfind(". ", start + size // 2, end)
            if boundary > start:
                end = boundary + 1
        chunk = value[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(value):
            break
        start = max(end - overlap, start + 1)
        next_boundary = value.find(" ", start, min(start + 60, len(value)))
        if next_boundary != -1:
            start = next_boundary + 1
    return chunks


def _document_chunks(document: dict[str, str]) -> list[dict[str, object]]:
    path = DOCUMENT_DIR / document["filename"]
    if not path.exists():
        raise FileNotFoundError(f"Knowledge document is missing: {path}")

    base = {
        "source_id": document["source_id"],
        "title": document["title"],
        "issuer": document["issuer"],
        "url": document["url"],
        "category": document["category"],
    }
    chunks: list[dict[str, object]] = []
    if path.suffix.casefold() == ".pdf":
        reader = PdfReader(path)
        for page_number, page in enumerate(reader.pages, start=1):
            for text in _split_text(page.extract_text() or ""):
                chunks.append({**base, "page": page_number, "text": text})
    else:
        for text in _split_text(path.read_text(encoding="utf-8")):
            chunks.append({**base, "page": None, "text": text})
    return chunks


def build_index() -> dict[str, object]:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    chunks: list[dict[str, object]] = []
    checksums: dict[str, str] = {}
    for document in manifest:
        path = DOCUMENT_DIR / document["filename"]
        checksums[document["source_id"]] = hashlib.sha256(path.read_bytes()).hexdigest()
        chunks.extend(_document_chunks(document))

    payload: dict[str, object] = {
        "version": INDEX_VERSION,
        "document_count": len(manifest),
        "checksums": checksums,
        "chunks": chunks,
    }
    INDEX_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    return {"documents": len(manifest), "chunks": len(chunks), "path": str(INDEX_PATH)}


if __name__ == "__main__":
    print(json.dumps(build_index(), indent=2))
