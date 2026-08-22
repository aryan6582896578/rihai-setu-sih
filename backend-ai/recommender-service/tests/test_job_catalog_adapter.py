"""Tests for the synthetic job-catalog adapter and shared vocabulary."""

from __future__ import annotations

from openpyxl import Workbook
import pytest

from app.adapters.job_catalog import (
    JobCatalogMappingError,
    canonicalize_skill_label,
    load_job_catalog_workbook,
    map_job_catalog_row,
)


def job_row(**changes: object) -> dict[str, object]:
    row: dict[str, object] = {
        "job_id": "JOB-0001",
        "title": "Sewing Machine Operator",
        "description": "Operate an industrial sewing machine.",
        "required_skills": (
            "industrial_sewing_machine_operation|garment_stitching"
        ),
        "preferred_skills": "threading_machine|garment_quality_check",
        "required_certificates": "NSQF Level 3 Garment Manufacturing",
        "minimum_experience_months": 1,
        "job_category": "Garment & Textile Manufacturing",
        "district": "Thane",
        "status": "active",
    }
    row.update(changes)
    return row


def test_job_row_maps_aliases_to_shared_canonical_skills() -> None:
    job = map_job_catalog_row(job_row())

    assert job.required_skills == ["machine_sewing", "tailoring"]
    assert job.preferred_skills == ["machine_threading", "quality_check"]
    assert job.job_category == "garment_textile_manufacturing"


def test_unknown_job_skill_is_rejected_instead_of_silently_mismatching() -> None:
    with pytest.raises(JobCatalogMappingError, match="no canonical vocabulary"):
        map_job_catalog_row(job_row(required_skills="quantum_basket_weaving"))


def test_job_loader_validates_rows_and_rejects_duplicate_ids(tmp_path) -> None:
    workbook_path = tmp_path / "jobs.xlsx"
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Jobs"
    headers = list(job_row())
    sheet.append(headers)
    first = job_row()
    second = job_row()
    sheet.append([first[header] for header in headers])
    sheet.append([second[header] for header in headers])
    workbook.save(workbook_path)

    with pytest.raises(JobCatalogMappingError, match="duplicate job_id"):
        load_job_catalog_workbook(workbook_path)


@pytest.mark.parametrize(
    "source_skill",
    [
        "bakery_equipment_operation", "baking", "barcode_scanning",
        "carpentry", "cnc_machine_operation", "computer_operation",
        "customer_service", "data_entry", "design_basics",
        "document_management", "electrical_maintenance",
        "electrical_wiring", "embroidery_machine_operation",
        "fabric_handling", "fabric_quality_check", "food_hygiene",
        "food_packaging", "food_preparation", "furniture_assembly",
        "garment_finishing", "garment_quality_check", "garment_stitching",
        "hand_embroidery", "handloom_weaving", "horticulture",
        "industrial_sewing_machine_operation", "ink_mixing",
        "inventory_handling", "kitchen_hygiene", "labeling",
        "leather_craft", "leather_finishing", "leather_stitching",
        "loom_setup", "measuring_tools", "ms_office", "organic_farming",
        "packaging", "plant_care", "precision_measurement",
        "produce_sorting", "quality_check", "safety_practices",
        "screen_printing", "signage_production", "threading_machine",
        "tool_handling", "warehouse_packing", "wood_cutting",
        "wood_finishing", "yarn_handling",
    ],
)
def test_every_job_workbook_skill_has_one_canonical_mapping(
    source_skill: str,
) -> None:
    assert canonicalize_skill_label(source_skill)
