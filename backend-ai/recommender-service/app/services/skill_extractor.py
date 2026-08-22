"""Dictionary-driven, deterministic skill extraction with typo recovery."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import TypedDict

from rapidfuzz import fuzz

from app.config import FUZZY_MATCH_THRESHOLD, SKILL_DICTIONARY_PATH
from app.services.normalizer import normalize_text, tokenize


class SkillMatch(TypedDict):
    """JSON-ready evidence for one extracted canonical skill."""

    matched_phrase: str
    canonical_skill: str
    match_method: str
    confidence: float


@dataclass(frozen=True, slots=True)
class _Alias:
    canonical_skill: str
    phrase: str
    tokens: tuple[str, ...]
    exact_canonical: bool


@dataclass(frozen=True, slots=True)
class _Candidate:
    start: int
    end: int
    alias: _Alias
    confidence: float
    match_method: str

    @property
    def token_count(self) -> int:
        return self.end - self.start


def _validate_threshold(value: int | float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise TypeError("fuzzy_threshold must be a number from 0 to 100")
    threshold = float(value)
    if not 0 <= threshold <= 100:
        raise ValueError("fuzzy_threshold must be between 0 and 100")
    return threshold


def _load_aliases(dictionary_path: Path) -> tuple[_Alias, ...]:
    try:
        raw_dictionary = json.loads(dictionary_path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise FileNotFoundError(f"Skill dictionary not found: {dictionary_path}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"Skill dictionary is not valid JSON: {dictionary_path}") from exc

    if not isinstance(raw_dictionary, dict) or not raw_dictionary:
        raise ValueError("Skill dictionary must be a non-empty JSON object")

    aliases: list[_Alias] = []
    phrase_owners: dict[str, str] = {}

    for raw_canonical, raw_synonyms in raw_dictionary.items():
        if not isinstance(raw_canonical, str) or not raw_canonical.strip():
            raise ValueError("Every canonical skill must be a non-empty string")
        if not isinstance(raw_synonyms, list) or not all(
            isinstance(item, str) and item.strip() for item in raw_synonyms
        ):
            raise ValueError(
                f"Synonyms for {raw_canonical!r} must be a list of non-empty strings"
            )

        canonical_skill = raw_canonical.strip()
        canonical_phrase = normalize_text(canonical_skill)
        if not canonical_phrase:
            raise ValueError(
                f"Canonical skill {raw_canonical!r} must contain letters or numbers"
            )
        # Adding the human-readable canonical key automatically keeps future JSON
        # entries useful even if their synonym list omits that spelling.
        source_phrases = [canonical_phrase, *raw_synonyms]
        phrases_for_skill: dict[str, bool] = {}
        for source_phrase in source_phrases:
            phrase = normalize_text(source_phrase)
            if not phrase:
                continue
            is_canonical = phrase == canonical_phrase
            phrases_for_skill[phrase] = phrases_for_skill.get(phrase, False) or is_canonical

        for phrase, is_canonical in phrases_for_skill.items():
            existing_owner = phrase_owners.get(phrase)
            if existing_owner is not None and existing_owner != canonical_skill:
                raise ValueError(
                    f"Skill phrase {phrase!r} is assigned to both "
                    f"{existing_owner!r} and {canonical_skill!r}"
                )
            phrase_owners[phrase] = canonical_skill
            aliases.append(
                _Alias(
                    canonical_skill=canonical_skill,
                    phrase=phrase,
                    tokens=tuple(phrase.split()),
                    exact_canonical=is_canonical,
                )
            )

    return tuple(aliases)


class SkillExtractor:
    """Extract canonical skills using a replaceable JSON dictionary.

    A new skill or synonym only requires editing the dictionary file and
    restarting the service; no Python conditionals need to be added.
    """

    def __init__(
        self,
        dictionary_path: str | Path = SKILL_DICTIONARY_PATH,
        fuzzy_threshold: int | float = FUZZY_MATCH_THRESHOLD,
    ) -> None:
        self.dictionary_path = Path(dictionary_path)
        self.fuzzy_threshold = _validate_threshold(fuzzy_threshold)
        self._aliases = _load_aliases(self.dictionary_path)

    @staticmethod
    def _overlaps(candidate: _Candidate, occupied: set[int]) -> bool:
        return any(index in occupied for index in range(candidate.start, candidate.end))

    @staticmethod
    def _record(candidate: _Candidate, tokens: tuple[str, ...]) -> SkillMatch:
        return {
            "matched_phrase": " ".join(tokens[candidate.start : candidate.end]),
            "canonical_skill": candidate.alias.canonical_skill,
            "match_method": candidate.match_method,
            "confidence": round(candidate.confidence, 2),
        }

    def _exact_candidates(self, tokens: tuple[str, ...]) -> list[_Candidate]:
        candidates: list[_Candidate] = []
        for alias in self._aliases:
            width = len(alias.tokens)
            if width > len(tokens):
                continue
            for start in range(len(tokens) - width + 1):
                end = start + width
                if tokens[start:end] == alias.tokens:
                    candidates.append(
                        _Candidate(
                            start=start,
                            end=end,
                            alias=alias,
                            confidence=100.0,
                            match_method=(
                                "exact" if alias.exact_canonical else "synonym"
                            ),
                        )
                    )
        # Longest phrases claim overlapping tokens before shorter phrases.  This
        # is what prevents "machine sewing" from also producing "tailoring" via
        # the embedded single-word synonym "sewing".
        return sorted(
            candidates,
            key=lambda item: (
                -item.token_count,
                item.start,
                item.alias.canonical_skill,
                item.alias.phrase,
            ),
        )

    def _fuzzy_candidates(
        self,
        tokens: tuple[str, ...],
        excluded_canonicals: set[str],
    ) -> list[_Candidate]:
        candidates: list[_Candidate] = []
        for alias in self._aliases:
            if alias.canonical_skill in excluded_canonicals:
                continue
            width = len(alias.tokens)
            if width > len(tokens):
                continue
            for start in range(len(tokens) - width + 1):
                end = start + width
                candidate_phrase = " ".join(tokens[start:end])
                candidate_tokens = tokens[start:end]
                if not self._is_plausible_typo(candidate_tokens, alias.tokens):
                    continue
                confidence = float(
                    fuzz.ratio(candidate_phrase, alias.phrase, processor=None)
                )
                if confidence >= self.fuzzy_threshold and confidence < 100:
                    candidates.append(
                        _Candidate(
                            start=start,
                            end=end,
                            alias=alias,
                            confidence=confidence,
                            match_method="fuzzy",
                        )
                    )
        # Fuzzy multi-word phrases are evaluated before single words, then the
        # strongest evidence wins among candidates of equal size.
        return sorted(
            candidates,
            key=lambda item: (
                -item.token_count,
                -item.confidence,
                item.start,
                item.alias.canonical_skill,
                item.alias.phrase,
            ),
        )

    def _is_plausible_typo(
        self,
        candidate_tokens: tuple[str, ...],
        alias_tokens: tuple[str, ...],
    ) -> bool:
        """Reject high-scoring near-neighbours that are weak typo evidence.

        Whole-phrase edit similarity alone makes unrelated real words such as
        ``banking``/``baking`` and ``good work``/``wood work`` look deceptively
        strong.  A one-word typo must retain its first three characters.  Each
        word in a multi-word typo must retain its first character and meet the
        configured threshold on its own.  The required ``uniform stiching``
        example satisfies these checks, while the common false positives do not.
        """

        if len(candidate_tokens) != len(alias_tokens) or not candidate_tokens:
            return False

        if len(alias_tokens) == 1:
            candidate_token = candidate_tokens[0]
            alias_token = alias_tokens[0]
            prefix_width = min(3, len(candidate_token), len(alias_token))
            return (
                prefix_width > 0
                and candidate_token[:prefix_width] == alias_token[:prefix_width]
            )

        for candidate_token, alias_token in zip(candidate_tokens, alias_tokens):
            if not candidate_token or not alias_token:
                return False
            prefix_width = min(3, len(candidate_token), len(alias_token))
            if candidate_token[:prefix_width] != alias_token[:prefix_width]:
                return False
            token_confidence = float(
                fuzz.ratio(candidate_token, alias_token, processor=None)
            )
            if token_confidence < self.fuzzy_threshold:
                return False
        return True

    def extract(self, text: str) -> list[SkillMatch]:
        """Extract deduplicated canonical skills and their matching evidence."""

        if not isinstance(text, str):
            raise TypeError("text must be a string")
        tokens = tokenize(text)
        if not tokens:
            return []

        selected: list[_Candidate] = []
        occupied: set[int] = set()
        seen_canonicals: set[str] = set()

        for candidate in self._exact_candidates(tokens):
            canonical = candidate.alias.canonical_skill
            if canonical in seen_canonicals or self._overlaps(candidate, occupied):
                continue
            selected.append(candidate)
            seen_canonicals.add(canonical)
            occupied.update(range(candidate.start, candidate.end))

        for candidate in self._fuzzy_candidates(tokens, seen_canonicals):
            canonical = candidate.alias.canonical_skill
            if canonical in seen_canonicals or self._overlaps(candidate, occupied):
                continue
            selected.append(candidate)
            seen_canonicals.add(canonical)
            occupied.update(range(candidate.start, candidate.end))

        # Evidence is presented in reading order even though phrase selection is
        # performed longest-first.
        selected.sort(key=lambda item: (item.start, item.end, item.alias.canonical_skill))
        return [self._record(candidate, tokens) for candidate in selected]


_DEFAULT_EXTRACTOR: SkillExtractor | None = None


def extract_skills(text: str) -> list[SkillMatch]:
    """Extract skills with the service's default dictionary and configuration."""

    global _DEFAULT_EXTRACTOR
    if _DEFAULT_EXTRACTOR is None:
        _DEFAULT_EXTRACTOR = SkillExtractor()
    return _DEFAULT_EXTRACTOR.extract(text)


def canonical_skills(text: str) -> list[str]:
    """Convenience helper returning only canonical tags, in reading order."""

    return [match["canonical_skill"] for match in extract_skills(text)]


def canonical_skill_names() -> list[str]:
    """Return the sorted canonical registry used by extraction and scoring."""

    global _DEFAULT_EXTRACTOR
    if _DEFAULT_EXTRACTOR is None:
        _DEFAULT_EXTRACTOR = SkillExtractor()
    return sorted({alias.canonical_skill for alias in _DEFAULT_EXTRACTOR._aliases})
