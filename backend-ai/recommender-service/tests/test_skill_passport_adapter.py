"""Tests for the synthetic skill-passport workbook adapter."""

from __future__ import annotations

from datetime import date

from openpyxl import Workbook
import pytest

from app.adapters.skill_passport import (
    REQUIRED_COLUMNS,
    SkillPassportMappingError,
    load_skill_passport_workbook,
    map_skill_passport_row,
)


def passport_row(**changes: object) -> dict[str, object]:
    row: dict[str, object] = {
        "passport_id": "SKL-2026-001",
        "primary_trade_vocational": "Garment Tailoring",
        "course_completion_status": "Certified",
        "specific_machinery_skills": (
            "Single Needle Lockstitch|Pattern Cutting"
        ),
        "target_job_domain": "Garment & Textile Manufacturing",
        "preferred_work_districts": "Mumbai City|Thane",
        "consent_to_share_profile": True,
        # These real workbook columns are deliberately ignored by the mapper.
        "prisoner_id": "UTP-MH-2026-001",
        "candidate_alias_or_name": "Synthetic Alias",
        "gender": "Synthetic Value",
        "conduct_grade": "A",
        "pwa_accumulated_savings_inr": 4850,
        "soft_skills_completed": "Anger Management Module",
    }
    row.update(changes)
    return row


def test_certified_row_maps_to_privacy_safe_candidate() -> None:
    candidate, issues = map_skill_passport_row(passport_row())

    assert candidate.candidate_id == "SKL-2026-001"
    assert candidate.verified_skills == [
        "tailoring",
        "machine_sewing",
        "fabric_cutting",
    ]
    assert candidate.certificates == []
    assert candidate.experience_months == 0
    assert candidate.preferred_job_categories == [
        "garment_textile_manufacturing"
    ]
    assert candidate.preferred_districts == ["Mumbai", "Thane"]
    assert candidate.consent is True
    assert {issue.code for issue in issues} == {
        "canonical_certificates_missing",
        "experience_months_missing",
    }

    dumped = candidate.model_dump()
    for prohibited in (
        "prisoner_id",
        "candidate_alias_or_name",
        "gender",
        "conduct_grade",
        "pwa_accumulated_savings_inr",
        "soft_skills_completed",
    ):
        assert prohibited not in dumped


def test_in_training_skills_are_not_marked_verified() -> None:
    candidate, issues = map_skill_passport_row(
        passport_row(
            course_completion_status="In_Training",
            canonical_certificates="Premature Certificate",
        )
    )

    assert candidate.verified_skills == []
    assert candidate.certificates == []
    assert "training_not_certified" in {issue.code for issue in issues}


def test_unknown_training_status_is_rejected() -> None:
    with pytest.raises(SkillPassportMappingError, match="Certified"):
        map_skill_passport_row(
            passport_row(course_completion_status="Completed Maybe")
        )


def test_false_consent_is_preserved_for_ranking_exclusion() -> None:
    candidate, _ = map_skill_passport_row(
        passport_row(consent_to_share_profile=False)
    )
    assert candidate.consent is False


@pytest.mark.parametrize("invalid_consent", [1, 0, "true", "yes", None])
def test_consent_must_be_an_excel_boolean(invalid_consent: object) -> None:
    with pytest.raises(SkillPassportMappingError, match="true/false"):
        map_skill_passport_row(
            passport_row(consent_to_share_profile=invalid_consent)
        )


def test_optional_future_employment_fields_are_mapped() -> None:
    candidate, issues = map_skill_passport_row(
        passport_row(
            canonical_certificates="Tailoring Level 3|Workplace Safety",
            experience_months=8,
            available_from="2026-09-01",
        )
    )

    assert candidate.certificates == ["Tailoring Level 3", "Workplace Safety"]
    assert candidate.experience_months == 8
    assert candidate.available_from == date(2026, 9, 1)
    assert "canonical_certificates_missing" not in {
        issue.code for issue in issues
    }
    assert "experience_months_missing" not in {issue.code for issue in issues}


@pytest.mark.parametrize("invalid_experience", [-1, 2.5, "several"])
def test_invalid_optional_experience_is_rejected(
    invalid_experience: object,
) -> None:
    with pytest.raises(SkillPassportMappingError, match="non-negative integer"):
        map_skill_passport_row(
            passport_row(experience_months=invalid_experience)
        )


def test_missing_required_dataset_column_is_rejected() -> None:
    row = passport_row()
    del row["passport_id"]

    with pytest.raises(SkillPassportMappingError, match="passport_id"):
        map_skill_passport_row(row)


def test_workbook_loader_maps_rows_and_reports_summary(tmp_path) -> None:
    workbook_path = tmp_path / "skill-passports.xlsx"
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Candidates"
    headers = sorted(REQUIRED_COLUMNS)
    sheet.append(headers)
    first = passport_row()
    second = passport_row(
        passport_id="SKL-2026-002",
        primary_trade_vocational="Domestic Electrician",
        specific_machinery_skills="Single Phase Wiring|MCB Installation",
        target_job_domain="Electrical & Maintenance",
        preferred_work_districts="Pune",
        consent_to_share_profile=False,
    )
    sheet.append([first.get(header) for header in headers])
    sheet.append([second.get(header) for header in headers])
    workbook.save(workbook_path)

    result = load_skill_passport_workbook(
        workbook_path, sheet_name="Candidates"
    )

    assert result.source_rows == 2
    assert [candidate.candidate_id for candidate in result.candidates] == [
        "SKL-2026-001",
        "SKL-2026-002",
    ]
    assert result.candidates[1].verified_skills == [
        "basic_wiring",
        "circuit_breaker_installation",
    ]
    assert result.summary()["consenting_candidates"] == 1
    assert result.summary()["candidates_with_verified_skills"] == 2


def test_workbook_loader_rejects_duplicate_passport_ids(tmp_path) -> None:
    workbook_path = tmp_path / "duplicates.xlsx"
    workbook = Workbook()
    sheet = workbook.active
    headers = sorted(REQUIRED_COLUMNS)
    sheet.append(headers)
    row = passport_row()
    sheet.append([row.get(header) for header in headers])
    sheet.append([row.get(header) for header in headers])
    workbook.save(workbook_path)

    with pytest.raises(SkillPassportMappingError, match="duplicate passport_id"):
        load_skill_passport_workbook(workbook_path)


@pytest.mark.parametrize(
    "trade",
    [
        "Garment Tailoring",
        "Bakery & Confectionery",
        "Data Entry & Office Automation",
        "Carpentry",
        "Domestic Electrician",
        "Warehouse Packaging",
        "Apparel Stitching & Embroidery",
        "Leather Goods Fabrication",
        "Bakery Assistant",
        "Handloom Weaving & Textiles",
        "Screen Printing",
        "Organic Farming & Horticulture",
        "CNC Machine Operator",
        "Tailoring Assistant",
        "Wood Furniture Making",
    ],
)
def test_every_dataset_primary_trade_has_a_canonical_mapping(trade: str) -> None:
    candidate, issues = map_skill_passport_row(
        passport_row(primary_trade_vocational=trade)
    )

    assert candidate.verified_skills
    assert not any(
        issue.code == "unmapped_skill_phrase" and trade in issue.message
        for issue in issues
    )
