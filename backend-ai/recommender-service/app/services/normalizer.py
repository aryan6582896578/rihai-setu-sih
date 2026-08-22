"""Small deterministic text-normalization helpers used by NLP services."""

from __future__ import annotations

import re
import unicodedata


_PUNCTUATION = re.compile(r"[^\w\s]|_", flags=re.UNICODE)
_WHITESPACE = re.compile(r"\s+")


def normalize_text(text: str | None) -> str:
    """Return a lowercase, punctuation-free, single-spaced representation.

    Punctuation is replaced with a space rather than deleted so that values such
    as ``food-preparation`` do not accidentally become ``foodpreparation``.
    Underscores receive the same treatment, which lets canonical API tags such as
    ``food_preparation`` be compared with their human-readable form.
    """

    if text is None:
        return ""
    if not isinstance(text, str):
        raise TypeError("text must be a string or None")

    normalized = unicodedata.normalize("NFKC", text).casefold()
    normalized = _PUNCTUATION.sub(" ", normalized)
    return _WHITESPACE.sub(" ", normalized).strip()


def tokenize(text: str | None) -> tuple[str, ...]:
    """Normalize *text* and split it into immutable word tokens."""

    normalized = normalize_text(text)
    return tuple(normalized.split()) if normalized else ()
