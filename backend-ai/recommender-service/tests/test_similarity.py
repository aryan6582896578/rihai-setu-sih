"""Tests for canonical-skill cosine similarity."""

from app.services.similarity import canonical_skill_cosine


def test_cosine_is_one_for_identical_skill_sets() -> None:
    assert canonical_skill_cosine(
        ["baking", "food_preparation"],
        ["baking", "food_preparation"],
    ) == 1.0


def test_cosine_uses_canonical_separator_normalization() -> None:
    assert canonical_skill_cosine(
        ["food_preparation"], ["Food-Preparation"]
    ) == 1.0


def test_cosine_is_zero_without_shared_skills() -> None:
    assert canonical_skill_cosine(["baking"], ["carpentry"]) == 0.0


def test_empty_job_skill_vector_has_full_not_applicable_similarity() -> None:
    assert canonical_skill_cosine([], []) == 1.0
