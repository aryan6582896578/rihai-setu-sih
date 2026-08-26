from typing import Dict, Any, List
import pandas as pd


class RehabService:
    def __init__(
        self,
        passports_path="datasets/skill_passports_600.csv",
        tracking_path="datasets/undertrial_tracking_600.csv",
    ):
        self.passports_path = passports_path
        self.tracking_path = tracking_path

    def get_summary(self) -> Dict[str, Any]:
        df = pd.read_csv(self.passports_path)
        track = pd.read_csv(self.tracking_path)
        prison_map = dict(zip(track["prisoner_id"], track["prison_id"]))

        status_counts = (
            df["course_completion_status"].value_counts().rename_axis("status").reset_index(name="count")
        )
        trades = (
            df["primary_trade_vocational"].value_counts().head(6).rename_axis("name").reset_index(name="count")
        )
        domains = (
            df["target_job_domain"].value_counts().head(5).rename_axis("name").reset_index(name="count")
        )

        df["prison_id"] = df["prisoner_id"].map(prison_map).fillna("UNKNOWN")
        per_prison = (
            df.groupby(["prison_id", "course_completion_status"])
            .size()
            .unstack(fill_value=0)
            .reset_index()
        )
        for col in ["Certified", "In_Training", "Assessment_Pending"]:
            if col not in per_prison.columns:
                per_prison[col] = 0
        prison_rows = [
            {
                "prison_id": r.prison_id,
                "total": int(r.Certified + r.In_Training + r.Assessment_Pending),
                "certified": int(r.Certified),
                "in_training": int(r.In_Training),
                "assessment_pending": int(r.Assessment_Pending),
            }
            for r in per_prison.itertuples()
        ]

        consent_rate = round(float((df["consent_to_share_profile"] == True).mean() * 100), 1)

        return {
            "total_passports": int(len(df)),
            "status_counts": {r.status: int(r.count) for r in status_counts.itertuples()},
            "top_trades": trades.to_dict(orient="records"),
            "top_job_domains": domains.to_dict(orient="records"),
            "per_prison": prison_rows,
            "consent_rate": consent_rate,
            "avg_expected_wage": int(round(df["expected_minimum_wage_inr"].mean(), -1)),
        }


rehab_service = RehabService()
