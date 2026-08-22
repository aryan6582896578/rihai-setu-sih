"""End-to-end recommendations from candidate and job Excel workbooks."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import json
from pathlib import Path
import sys
from typing import Any

from app.adapters.job_catalog import (
    JobCatalogMappingError,
    load_job_catalog_workbook,
)
from app.adapters.skill_passport import (
    SkillPassportMappingError,
    load_skill_passport_workbook,
)
from app.schemas import RecommendationResult
from app.services.recommender import rank_jobs


@dataclass(slots=True)
class CandidateRecommendations:
    candidate_id: str
    recommendations: list[RecommendationResult]

    def payload(self) -> dict[str, Any]:
        return {
            "candidate_id": self.candidate_id,
            "recommendations": [
                recommendation.model_dump(mode="json")
                for recommendation in self.recommendations
            ],
        }


@dataclass(slots=True)
class WorkbookRecommendationRun:
    candidate_summary: dict[str, Any]
    job_summary: dict[str, Any]
    results: list[CandidateRecommendations]

    def payload(self) -> dict[str, Any]:
        return {
            "summary": {
                "candidates": self.candidate_summary,
                "jobs": self.job_summary,
                "candidates_with_recommendations": sum(
                    bool(result.recommendations) for result in self.results
                ),
            },
            "results": [result.payload() for result in self.results],
        }


def recommend_from_workbooks(
    candidate_workbook: str | Path,
    job_workbook: str | Path,
    *,
    top_k: int = 5,
    minimum_score: float = 0.0,
) -> WorkbookRecommendationRun:
    """Load both workbooks and rank active jobs for every consenting profile."""

    if top_k < 1:
        raise ValueError("top_k must be at least 1")
    if not 0 <= minimum_score <= 100:
        raise ValueError("minimum_score must be between 0 and 100")
    candidates = load_skill_passport_workbook(candidate_workbook)
    jobs = load_job_catalog_workbook(job_workbook)
    results = [
        CandidateRecommendations(
            candidate_id=candidate.candidate_id,
            recommendations=rank_jobs(
                candidate,
                jobs.jobs,
                top_k=top_k,
                minimum_score=minimum_score,
            ),
        )
        for candidate in candidates.candidates
    ]
    return WorkbookRecommendationRun(
        candidate_summary=candidates.summary(),
        job_summary=jobs.summary(),
        results=results,
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Rank synthetic jobs for every privacy-safe candidate."
    )
    parser.add_argument("candidate_workbook", type=Path)
    parser.add_argument("job_workbook", type=Path)
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--minimum-score", type=float, default=0.0)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)
    try:
        run = recommend_from_workbooks(
            args.candidate_workbook,
            args.job_workbook,
            top_k=args.top_k,
            minimum_score=args.minimum_score,
        )
    except (
        JobCatalogMappingError,
        SkillPassportMappingError,
        ValueError,
    ) as exc:
        print(f"Recommendation run failed: {exc}", file=sys.stderr)
        return 2
    payload = run.payload()
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        report = {
            **payload["summary"],
            "output": str(args.output.resolve()),
        }
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        print(json.dumps(payload, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
