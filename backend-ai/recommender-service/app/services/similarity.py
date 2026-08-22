"""Deterministic cosine similarity over canonical binary skill vectors."""

from __future__ import annotations

from collections.abc import Sequence
from math import sqrt
import re
import unicodedata


def _skill_key(value: object) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).casefold()
    text = re.sub(r"[_\-]+", " ", text)
    text = re.sub(r"[^\w\s]", " ", text, flags=re.UNICODE)
    return " ".join(text.split())


def canonical_skill_cosine(
    candidate_skills: Sequence[str], job_skills: Sequence[str]
) -> float:
    """Return cosine similarity in ``[0, 1]`` for canonical skill sets.

    Each unique canonical skill is a binary vector dimension. An empty job
    vector represents no skill requirement and therefore receives similarity
    ``1``; a non-empty job vector cannot match an empty candidate vector.
    """

    candidate = {_skill_key(value) for value in candidate_skills}
    job = {_skill_key(value) for value in job_skills}
    candidate.discard("")
    job.discard("")

    if not job:
        return 1.0
    if not candidate:
        return 0.0

    dot_product = len(candidate & job)
    magnitude = sqrt(len(candidate) * len(job))
    return round(dot_product / magnitude, 6)
