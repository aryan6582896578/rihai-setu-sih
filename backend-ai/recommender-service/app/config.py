"""Configuration values for the recommendation service.

Only lightweight, standard-library configuration lives here.  In particular, the
skill extractor's fuzzy threshold can be changed at deployment time without
editing the extraction code.
"""

from __future__ import annotations

import os
from pathlib import Path


DEFAULT_FUZZY_MATCH_THRESHOLD = 85
"""The typo-match confidence required when no environment override is set."""

SKILL_DICTIONARY_PATH = Path(__file__).resolve().parent / "data" / "skill_dictionary.json"
"""Default path to the JSON-backed canonical skill dictionary."""


def _read_fuzzy_match_threshold() -> int:
    # The namespaced variable is the documented deployment setting.  Supporting
    # the shorter name as a fallback also makes local/test configuration simple.
    raw_value = os.getenv(
        "RECOMMENDER_FUZZY_MATCH_THRESHOLD",
        os.getenv("FUZZY_MATCH_THRESHOLD", str(DEFAULT_FUZZY_MATCH_THRESHOLD)),
    )
    try:
        threshold = int(raw_value)
    except ValueError as exc:
        raise RuntimeError(
            "RECOMMENDER_FUZZY_MATCH_THRESHOLD must be an integer from 0 to 100"
        ) from exc

    if not 0 <= threshold <= 100:
        raise RuntimeError(
            "RECOMMENDER_FUZZY_MATCH_THRESHOLD must be between 0 and 100"
        )
    return threshold


FUZZY_MATCH_THRESHOLD = _read_fuzzy_match_threshold()
"""Active fuzzy threshold, configurable through the environment."""
