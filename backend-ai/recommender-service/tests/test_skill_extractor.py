from __future__ import annotations

import json

import pytest

from app.config import DEFAULT_FUZZY_MATCH_THRESHOLD, FUZZY_MATCH_THRESHOLD
from app.services.normalizer import normalize_text
from app.services.skill_extractor import SkillExtractor, extract_skills


def _by_canonical(matches: list[dict[str, object]]) -> dict[str, dict[str, object]]:
    return {str(match["canonical_skill"]): match for match in matches}


def test_default_fuzzy_threshold_is_85() -> None:
    assert DEFAULT_FUZZY_MATCH_THRESHOLD == 85
    assert 0 <= FUZZY_MATCH_THRESHOLD <= 100


def test_normalizer_lowercases_spacing_and_punctuation() -> None:
    assert (
        normalize_text("  FOOD_preparation,\tand bread-making!!!  ")
        == "food preparation and bread making"
    )


def test_exact_canonical_skill_extraction_has_full_confidence() -> None:
    matches = extract_skills("The trainee learned tailoring and baking.")
    indexed = _by_canonical(matches)

    assert set(indexed) == {"tailoring", "baking"}
    assert indexed["tailoring"] == {
        "matched_phrase": "tailoring",
        "canonical_skill": "tailoring",
        "match_method": "exact",
        "confidence": 100.0,
    }


def test_synonym_maps_to_canonical_skill() -> None:
    assert extract_skills("Completed cloth cutting training.") == [
        {
            "matched_phrase": "cloth cutting",
            "canonical_skill": "fabric_cutting",
            "match_method": "synonym",
            "confidence": 100.0,
        }
    ]


def test_exact_multiword_phrase_wins_over_embedded_single_word() -> None:
    matches = extract_skills("Experienced in machine sewing.")

    assert [match["canonical_skill"] for match in matches] == ["machine_sewing"]
    assert matches[0]["matched_phrase"] == "machine sewing"


def test_rapidfuzz_recovers_typo_and_preserves_reading_order() -> None:
    matches = extract_skills(
        "The candidate completed uniform stiching and cloth cutting training."
    )

    assert [match["canonical_skill"] for match in matches] == [
        "tailoring",
        "fabric_cutting",
    ]
    assert matches[0]["matched_phrase"] == "uniform stiching"
    assert matches[0]["match_method"] == "fuzzy"
    assert 85 <= matches[0]["confidence"] < 100


def test_fuzzy_matching_rejects_unrelated_real_word_neighbours() -> None:
    text = (
        "Banking, good work, good hygiene, product parking, and bread marking."
    )
    assert extract_skills(text) == []


def test_fuzzy_matching_still_handles_a_single_word_internal_typo() -> None:
    matches = extract_skills("stiching")

    assert [match["canonical_skill"] for match in matches] == ["tailoring"]
    assert matches[0]["match_method"] == "fuzzy"


def test_duplicate_canonical_skills_are_removed() -> None:
    matches = extract_skills("Baking, bakery, and bread making are practiced daily.")

    assert [match["canonical_skill"] for match in matches] == ["baking"]
    assert matches[0]["matched_phrase"] == "bread making"


def test_threshold_is_configurable() -> None:
    permissive = SkillExtractor(fuzzy_threshold=85)
    strict = SkillExtractor(fuzzy_threshold=100)

    assert "tailoring" in {
        match["canonical_skill"] for match in permissive.extract("uniform stiching")
    }
    assert strict.extract("uniform stiching") == []


@pytest.mark.parametrize("threshold", [-1, 101])
def test_invalid_threshold_is_rejected(threshold: int) -> None:
    with pytest.raises(ValueError, match="between 0 and 100"):
        SkillExtractor(fuzzy_threshold=threshold)


def test_dictionary_can_expand_without_python_changes(tmp_path) -> None:
    dictionary_path = tmp_path / "skills.json"
    dictionary_path.write_text(
        json.dumps({"solar_installation": ["solar panel fitting"]}),
        encoding="utf-8",
    )
    extractor = SkillExtractor(dictionary_path=dictionary_path)

    assert extractor.extract("Trained in solar panel fitting") == [
        {
            "matched_phrase": "solar panel fitting",
            "canonical_skill": "solar_installation",
            "match_method": "synonym",
            "confidence": 100.0,
        }
    ]


def test_blank_text_returns_no_skills() -> None:
    assert extract_skills(" \t\n... ") == []
