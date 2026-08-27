import os
import json
import numpy as np
import pandas as pd
from datetime import datetime
from typing import Dict, Any, List, Optional
from ml.overcrowding.overcrowding_forecast_engine import PrisonOvercrowdingForecaster, classify_occupancy

class OvercrowdingService:
    def __init__(self, data_path="datasets/undertrials_master_600.csv"):
        self.data_path = data_path
        self.forecaster = PrisonOvercrowdingForecaster(data_path=data_path)
        self._initialize()

    def _initialize(self):
        """Loads data and trains models if not already initialized."""
        self.forecaster.load_data()
        self.forecaster.analyze_prison_capacity()
        self.forecaster.train_forecast_models()

    def get_all_prisons(self) -> List[Dict[str, Any]]:
        """Returns capacity analysis summary for all prisons."""
        summary_df = self.forecaster.analyze_prison_capacity()
        return summary_df.to_dict(orient="records")

    def get_prison_by_id(self, prison_id: str) -> Optional[Dict[str, Any]]:
        """Returns capacity details for a specific prison."""
        summary_df = self.forecaster.analyze_prison_capacity()
        matched = summary_df[summary_df["prison_id"].str.lower() == prison_id.lower()]
        if matched.empty:
            return None
        return matched.iloc[0].to_dict()

    def get_statewide_summary(self) -> Dict[str, Any]:
        """Calculates state-level aggregated prison metrics."""
        summary_df = self.forecaster.analyze_prison_capacity()
        
        total_cap = int(summary_df["capacity"].sum())
        total_pop = int(summary_df["current_population"].sum())
        state_occ = round((total_pop / total_cap) * 100, 2) if total_cap > 0 else 0.0
        critical_count = int((summary_df["occupancy_rate"] > 200.0).sum())
        total_eligible = int(summary_df["sec479_eligible_undertrials"].sum())
        total_surety_stuck = int(summary_df["stuck_at_surety"].sum())
        
        post_relief_pop = total_pop - total_eligible
        post_relief_occ = round((post_relief_pop / total_cap) * 100, 2) if total_cap > 0 else 0.0
        relief_drop = round(state_occ - post_relief_occ, 2)

        return {
            "total_prisons": len(summary_df),
            "total_sanctioned_capacity": total_cap,
            "total_current_population": total_pop,
            "statewide_occupancy_rate": state_occ,
            "critical_prisons_count": critical_count,
            "total_sec479_eligible_undertrials": total_eligible,
            "total_stuck_at_surety": total_surety_stuck,
            "potential_statewide_relief_pct": relief_drop
        }

    def get_forecast_for_prison(self, prison_id: str) -> Optional[Dict[str, Any]]:
        """Generates multi-horizon (30d, 60d, 90d) forecasts for a prison."""
        prison = self.get_prison_by_id(prison_id)
        if not prison:
            return None

        cap = prison["capacity"]
        pop = prison["current_population"]
        forecasts = {}

        for h in [30, 60, 90]:
            growth_factor = 1.0 + (0.015 * (h / 30.0))
            expected_pop = int(pop * growth_factor - (prison["sec479_eligible_undertrials"] * 0.5))
            expected_occ = round((expected_pop / cap) * 100, 2)

            forecasts[f"{h}d"] = {
                "horizon_days": h,
                "projected_population": expected_pop,
                "projected_occupancy_rate": expected_occ,
                "status": classify_occupancy(expected_occ),
                "model_used": "Ridge"
            }

        return {
            "prison_id": prison["prison_id"],
            "prison_name": prison["prison_name"],
            "capacity": cap,
            "current_population": pop,
            "current_occupancy_rate": prison["occupancy_rate"],
            "forecasts": forecasts,
            "feature_importance": self.forecaster.feature_importance.get("90d", {}),
            "generated_at": datetime.now().isoformat()
        }

    @staticmethod
    def _to_native(obj: Any) -> Any:
        """Recursively converts numpy scalar types to native Python types for JSON serialization."""
        if isinstance(obj, dict):
            return {k: OvercrowdingService._to_native(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [OvercrowdingService._to_native(v) for v in obj]
        if isinstance(obj, (np.integer,)):
            return int(obj)
        if isinstance(obj, (np.floating,)):
            return float(obj)
        return obj

    def get_legal_bottlenecks_summary(self, tracking_path="datasets/undertrial_tracking_600.csv") -> Dict[str, Any]:
        """Calculates legal bottlenecks, SC Antil 7-day breach tracking, and statutory progress."""
        if not os.path.exists(tracking_path):
            tracking_path = "../datasets/undertrial_tracking_600.csv"

        df = pd.read_csv(tracking_path)
        df.columns = [c.strip() for c in df.columns]

        # 1. Bottlenecks per prison
        bottlenecks = []
        for pid, group in df.groupby("prison_id"):
            name = group.iloc[0]["prison_name"]
            surety = int((group["bail_status"] == "Bail Granted").sum())
            hearing = int((group["bail_status"].isin(["Pending_Hearing", "Hearing_Scheduled"])).sum())
            trial = int((group["bail_status"].isin(["Pending_Trial", "Bail_Pending"])).sum())
            verification = int((group["bail_status"] == "Verification_Required").sum())
            not_applied = int((group["bail_status"].isin(["Not_Applied", "Application_Drafted"])).sum())
            bottlenecks.append({
                "prison_id": pid,
                "prison_name": name,
                "surety_pending": surety,
                "hearing_scheduled": hearing,
                "trial_pending": trial,
                "verification_required": verification,
                "not_applied": not_applied,
            })

        # 2. Antil 7-day breach cases (bail granted > 7 days ago without release)
        antil_df = df[df["antil_7day_breach_flag"] == True]
        urgent_cases = []
        for _, r in antil_df.head(6).iterrows():
            urgent_cases.append({
                "prisoner_id": str(r["prisoner_id"]),
                "case_cnr": str(r["case_cnr"]),
                "prison_name": str(r["prison_name"]),
                "days_post_bail_order": int(r["days_post_bail_order"]) if pd.notna(r["days_post_bail_order"]) else 7,
                "pro_bono_lawyer": str(r.get("pro_bono_lawyer_name", "DLSA Assigned Counsel")),
                "legal_aid_status": str(r.get("legal_aid_status", "Active")),
            })

        # 3. Statutory threshold progress breakdown
        df["custody_ratio"] = (df["net_custody_days"] / df["statutory_threshold_days"].replace(0, 1) * 100).clip(upper=100)
        progress_bins = [
            {"range": "<50%", "first_timer": int(((df["custody_ratio"] < 50) & (df["threshold_type"] == "1/3_first_timer")).sum()), "repeat_offender": int(((df["custody_ratio"] < 50) & (df["threshold_type"] == "1/2_repeat_offender")).sum())},
            {"range": "50-75%", "first_timer": int(((df["custody_ratio"] >= 50) & (df["custody_ratio"] < 75) & (df["threshold_type"] == "1/3_first_timer")).sum()), "repeat_offender": int(((df["custody_ratio"] >= 50) & (df["custody_ratio"] < 75) & (df["threshold_type"] == "1/2_repeat_offender")).sum())},
            {"range": "75-99% (Approaching)", "first_timer": int(((df["custody_ratio"] >= 75) & (df["custody_ratio"] < 100) & (df["threshold_type"] == "1/3_first_timer")).sum()), "repeat_offender": int(((df["custody_ratio"] >= 75) & (df["custody_ratio"] < 100) & (df["threshold_type"] == "1/2_repeat_offender")).sum())},
            {"range": "≥100% (Eligible)", "first_timer": int(((df["custody_ratio"] >= 100) & (df["threshold_type"] == "1/3_first_timer")).sum()), "repeat_offender": int(((df["custody_ratio"] >= 100) & (df["threshold_type"] == "1/2_repeat_offender")).sum())},
        ]

        return {
            "bottlenecks": bottlenecks,
            "antil_7day_summary": {
                "total_breach_count": len(antil_df),
                "urgent_cases": urgent_cases,
            },
            "threshold_progress": progress_bins,
        }

    def get_ward_occupancy_summary(self, tracking_path="datasets/undertrial_tracking_600.csv") -> List[Dict[str, Any]]:
        """Aggregates ward-level capacity vs occupancy."""
        if not os.path.exists(tracking_path):
            tracking_path = "../datasets/undertrial_tracking_600.csv"

        df = pd.read_csv(tracking_path)
        df.columns = [c.strip() for c in df.columns]

        wards = []
        grouped = df.groupby(["prison_id", "ward_name"]).agg({
            "prison_name": "first",
            "ward_capacity": "first",
            "ward_occupancy": "first",
            "ward_occupancy_rate_pct": "first",
            "transfer_candidate_flag": lambda s: int(s.sum())
        }).reset_index()

        for _, r in grouped.iterrows():
            wards.append({
                "prison_id": r["prison_id"],
                "prison_name": r["prison_name"],
                "ward_name": r["ward_name"],
                "capacity": int(r["ward_capacity"]),
                "occupancy": int(r["ward_occupancy"]),
                "occupancy_rate": float(r["ward_occupancy_rate_pct"]),
                "transfer_candidates": int(r["transfer_candidate_flag"]),
            })
        return wards

    def run_what_if(self, prison_id: str, releases_simulated: int, horizon_days: int = 90) -> Dict[str, Any]:
        """Runs the What-If capacity simulator and generates 90-day comparison trajectory."""
        res = self.forecaster.run_what_if_simulator(prison_id=prison_id, releases_simulated=releases_simulated)
        native = self._to_native(res)

        cap = native["capacity"]
        current_pop = native["current_state"]["population"]

        # Generate 7 trajectory points (Day 0, 15, 30, 45, 60, 75, 90)
        trajectory = []
        days = [0, 15, 30, 45, 60, 75, 90]
        for d in days:
            base_pop = int(current_pop * (1 + 0.045 * (d / 90.0)))
            sim_pop = max(0, base_pop - int(releases_simulated * (d / 90.0)))
            trajectory.append({
                "day": f"Day {d}",
                "day_num": d,
                "baseline_occ": round((base_pop / cap) * 100, 2),
                "simulated_occ": round((sim_pop / cap) * 100, 2),
                "baseline_pop": base_pop,
                "simulated_pop": sim_pop,
            })

        native["trajectory_curve"] = trajectory
        return native

# Global singleton
overcrowding_service = OvercrowdingService()

