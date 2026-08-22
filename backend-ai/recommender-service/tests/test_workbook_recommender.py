"""End-to-end test from synthetic Excel rows to ranked recommendations."""

from openpyxl import Workbook

from app.adapters.job_catalog import REQUIRED_COLUMNS as JOB_COLUMNS
from app.adapters.skill_passport import REQUIRED_COLUMNS as CANDIDATE_COLUMNS
from app.workbook_recommender import recommend_from_workbooks


def _write_workbook(path, sheet_name: str, headers: list[str], row: dict) -> None:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = sheet_name
    sheet.append(headers)
    sheet.append([row.get(header) for header in headers])
    workbook.save(path)


def test_workbooks_produce_a_canonical_cosine_ranked_match(tmp_path) -> None:
    candidate_path = tmp_path / "candidates.xlsx"
    job_path = tmp_path / "jobs.xlsx"
    candidate_headers = sorted(CANDIDATE_COLUMNS)
    _write_workbook(
        candidate_path,
        "Candidates",
        candidate_headers,
        {
            "passport_id": "SKL-001",
            "primary_trade_vocational": "Bakery & Confectionery",
            "course_completion_status": "Certified",
            "specific_machinery_skills": "Rotary Deck Oven",
            "target_job_domain": "Food Processing & Bakery",
            "preferred_work_districts": "Thane",
            "consent_to_share_profile": True,
        },
    )
    job_headers = sorted(JOB_COLUMNS)
    _write_workbook(
        job_path,
        "Jobs",
        job_headers,
        {
            "job_id": "JOB-001",
            "title": "Bakery Assistant",
            "description": "Prepare baked products and operate an oven.",
            "required_skills": "baking|bakery_equipment_operation",
            "preferred_skills": "food_preparation|food_hygiene",
            "required_certificates": None,
            "minimum_experience_months": 0,
            "job_category": "Food Processing & Bakery",
            "district": "Thane",
            "status": "active",
        },
    )

    run = recommend_from_workbooks(candidate_path, job_path, top_k=1)

    assert run.job_summary["mapped_jobs"] == 1
    result = run.results[0].recommendations[0]
    assert result.job_id == "JOB-001"
    assert result.cosine_similarity > 0
    assert result.matched_required_skills == [
        "baking",
        "bakery_equipment_operation",
    ]
