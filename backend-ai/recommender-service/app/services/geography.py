"""Small, explicit geography vocabulary used for preference matching."""

from __future__ import annotations

from app.services.normalizer import normalize_text


_DISTRICT_ALIASES = {
    "mumbai": "mumbai",
    "mumbai city": "mumbai",
    "mumbai suburban": "mumbai",
    "bhiwandi": "thane",
    "navi mumbai": "navi mumbai",
    "nashik": "nashik",
    "palghar": "palghar",
    "pune": "pune",
    "raigad": "raigad",
    "thane": "thane",
}


def district_key(value: object) -> str:
    """Return a stable district key without changing the displayed label.

    Mumbai City/Suburban match a broad Mumbai preference, while Bhiwandi is
    matched at its parent-district level (Thane). Unknown labels remain usable
    through ordinary normalized comparison and can be added to this registry.
    """

    normalized = normalize_text(str(value or ""))
    return _DISTRICT_ALIASES.get(normalized, normalized)
