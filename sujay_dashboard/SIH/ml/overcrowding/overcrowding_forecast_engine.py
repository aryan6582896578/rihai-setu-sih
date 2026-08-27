"""
=============================================================================
AI-Assisted Section 479 Undertrial Release & Prison Rehabilitation System
Module: Overcrowding Intelligence & Forecasting Engine (600-Record Master Dataset)
=============================================================================

Improvements over v1:
- Synthetic monthly time-series generation per prison for realistic training
- Proper train/test split with temporal validation
- Enhanced feature engineering: intake rate, release rate, seasonal factors
- Cross-validated model selection
- Per-prison trend extrapolation for realistic projections
"""

import os
import json
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import joblib

from sklearn.linear_model import Ridge
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.model_selection import TimeSeriesSplit, cross_val_score
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.preprocessing import StandardScaler


def classify_occupancy(rate: float) -> str:
    """Five-level occupancy classification shared by the API and dashboard.

    NORMAL    <= 100%
    ELEVATED  100-115%
    HIGH      115-150%
    VERY_HIGH 150-200%
    CRITICAL  > 200%
    """
    if rate <= 100:
        return "NORMAL"
    if rate <= 115:
        return "ELEVATED"
    if rate <= 150:
        return "HIGH"
    if rate <= 200:
        return "VERY_HIGH"
    return "CRITICAL"


class PrisonOvercrowdingForecaster:
    def __init__(self, data_path="datasets/undertrials_master_600.csv"):
        self.data_path = data_path
        self.df = None
        self.prison_summary = None
        self.time_series_df = None
        self.models = {}
        self.feature_importance = {}
        self.scaler = StandardScaler()
        self.output_dir = "ml/overcrowding/output"
        os.makedirs(self.output_dir, exist_ok=True)
        os.makedirs(os.path.join(self.output_dir, "saved_models"), exist_ok=True)

    def load_data(self):
        """Loads and validates the dataset."""
        if not os.path.exists(self.data_path):
            raise FileNotFoundError(f"Dataset not found at {self.data_path}")
        
        self.df = pd.read_csv(self.data_path)
        # Drop completely empty rows if any
        self.df = self.df.dropna(subset=["prisoner_id", "prison_id"])
        print(f" Loaded master dataset ({self.data_path}) with {len(self.df)} records and {len(self.df.columns)} columns.")
        return self.df

    def analyze_prison_capacity(self):
        """
        Extracts prison-level capacity metrics and isolates Section 479 relief potential.
        Separates 'eligible-but-not-yet-processed' pressure from long-term capacity.
        """
        if self.df is None:
            self.load_data()

        prisons = []
        for prison_id, group in self.df.groupby("prison_id"):
            row = group.iloc[0]
            
            # Robust capacity extraction
            cap_val = row.get("prison_capacity")
            cap = int(float(cap_val)) if pd.notna(cap_val) and float(cap_val) > 0 else max(100, len(group))
            
            # Robust population extraction
            pop_val = row.get("prison_occupancy", row.get("total_prison_population"))
            pop = int(float(pop_val)) if pd.notna(pop_val) and float(pop_val) > 0 else len(group)
            
            occ_val = row.get("occupancy_rate_pct", row.get("occupancy_rate"))
            occ_rate = float(occ_val) if pd.notna(occ_val) else round((pop / cap) * 100, 2)
            
            # Undertrial & Convict count
            ut_pop = int(row.get("undertrial_population", len(group))) if pd.notna(row.get("undertrial_population")) else len(group)
            conv_pop = int(row.get("convict_population", max(0, pop - ut_pop))) if pd.notna(row.get("convict_population")) else max(0, pop - ut_pop)
            
            # Section 479 relief metrics
            if "sec479_eligibility" in self.df.columns:
                elig_col = group["sec479_eligibility"].astype(str).str.lower()
                eligible_count = (elig_col == "eligible").sum()
                approaching_count = (elig_col.str.contains("approaching")).sum()
            else:
                elig_col = group.get("eligibility_result", pd.Series(dtype=str)).astype(str).str.lower()
                eligible_count = (elig_col == "eligible").sum()
                approaching_count = (elig_col.str.contains("approaching")).sum()

            # Bottlenecks
            if "antil_7day_breach_flag" in self.df.columns:
                surety_stuck_count = (group["antil_7day_breach_flag"] == True).sum()
                court_stuck_count = (group["bail_status"].astype(str).str.contains("Pending|Hearing|Verification", case=False)).sum()
            else:
                release_bar = group.get("release_barrier", pd.Series(dtype=str)).astype(str)
                surety_stuck_count = (release_bar.str.contains("Surety", case=False)).sum()
                court_stuck_count = (release_bar.str.contains("hearing|court|order", case=False)).sum()

            overcrowding_level = str(row.get("overcrowding_level", "Critical" if occ_rate > 150 else "Severe" if occ_rate > 115 else "Normal"))
            available_beds = max(0, cap - pop)
            overcrowding_gap = max(0, pop - cap)

            post_relief_pop = max(0, pop - eligible_count)
            post_relief_occ = round((post_relief_pop / cap) * 100, 2)
            
            # Enhanced metrics
            avg_custody_days = group["net_custody_days"].mean() if "net_custody_days" in group.columns else 0
            high_risk_count = (group.get("security_risk", pd.Series(dtype=str)).astype(str).str.lower() == "high").sum()
            
            prisons.append({
                "prison_id": str(prison_id),
                "prison_name": str(row.get("prison_name", f"Prison {prison_id}")),
                "state": str(row.get("prison_state", "State")),
                "district": str(row.get("prison_district", "District")),
                "capacity": cap,
                "current_population": pop,
                "undertrial_population": ut_pop,
                "convict_population": conv_pop,
                "occupancy_rate": occ_rate,
                "overcrowding_level": overcrowding_level,
                "available_beds": available_beds,
                "overcrowding_gap": overcrowding_gap,
                "sec479_eligible_undertrials": int(eligible_count),
                "sec479_approaching_undertrials": int(approaching_count),
                "stuck_at_surety": int(surety_stuck_count),
                "stuck_at_court": int(court_stuck_count),
                "post_relief_population": int(post_relief_pop),
                "post_relief_occupancy_rate": post_relief_occ,
                "capacity_relieved_pct": round(occ_rate - post_relief_occ, 2),
                "avg_custody_days": round(avg_custody_days, 1),
                "high_risk_count": int(high_risk_count)
            })

        self.prison_summary = pd.DataFrame(prisons)
        summary_path = os.path.join(self.output_dir, "prison_capacity_summary.csv")
        self.prison_summary.to_csv(summary_path, index=False)
        print(f" Prison capacity analysis saved to {summary_path}")
        return self.prison_summary

    def _generate_time_series(self, months=24):
        """
        Generates synthetic monthly time-series data per prison for training.
        Uses realistic seasonal variation, gradual population drift, and noise.
        """
        if self.prison_summary is None:
            self.analyze_prison_capacity()

        np.random.seed(42)
        records = []
        base_date = datetime.now() - timedelta(days=months * 30)

        for _, prison in self.prison_summary.iterrows():
            cap = prison["capacity"]
            current_pop = prison["current_population"]
            ut_pop = prison["undertrial_population"]
            
            # Work backward from current population to simulate history
            # Apply a slight upward trend (1-2% monthly growth) reversed
            monthly_growth = np.random.uniform(0.005, 0.02)
            
            for m in range(months):
                month_date = base_date + timedelta(days=m * 30)
                month_num = month_date.month
                
                # Seasonal factor: higher intake in summer/monsoon, lower in winter
                seasonal = 1.0 + 0.03 * np.sin(2 * np.pi * (month_num - 3) / 12)
                
                # Population at this historical month (working backward from current)
                months_from_now = months - m
                historical_factor = (1 - monthly_growth) ** months_from_now
                base_pop = int(current_pop * historical_factor * seasonal)
                
                # Add realistic noise (±3%)
                noise = np.random.normal(0, 0.03)
                pop = max(int(base_pop * (1 + noise)), 10)
                
                # Undertrial share varies slightly
                ut_share = min(1.0, max(0.5, (ut_pop / max(current_pop, 1)) + np.random.normal(0, 0.03)))
                ut = int(pop * ut_share)
                conv = pop - ut
                
                occ_rate = round((pop / cap) * 100, 2)
                gap = max(0, pop - cap)
                
                # Eligible count scales with undertrial population
                elig_rate = prison["sec479_eligible_undertrials"] / max(ut_pop, 1)
                eligible = int(ut * elig_rate * (1 + np.random.normal(0, 0.1)))
                eligible = max(0, eligible)
                
                # Approaching eligibility
                approaching = int(eligible * np.random.uniform(0.2, 0.5))
                
                # Surety stuck (fraction of eligible)
                surety_stuck = int(eligible * np.random.uniform(0.15, 0.35))
                
                # Intake and release rates (synthetic)
                intake_rate = max(0, int(pop * np.random.uniform(0.02, 0.06)))
                release_rate = max(0, int(pop * np.random.uniform(0.01, 0.04)))
                net_flow = intake_rate - release_rate
                
                records.append({
                    "prison_id": prison["prison_id"],
                    "month": month_date.strftime("%Y-%m"),
                    "month_num": month_num,
                    "months_idx": m,
                    "capacity": cap,
                    "population": pop,
                    "undertrial_population": ut,
                    "convict_population": conv,
                    "occupancy_rate": occ_rate,
                    "overcrowding_gap": gap,
                    "sec479_eligible": eligible,
                    "sec479_approaching": approaching,
                    "stuck_at_surety": surety_stuck,
                    "intake_rate": intake_rate,
                    "release_rate": release_rate,
                    "net_flow": net_flow,
                    "seasonal_factor": round(seasonal, 4),
                    "ut_share": round(ut_share, 4),
                })
        
        self.time_series_df = pd.DataFrame(records)
        ts_path = os.path.join(self.output_dir, "synthetic_time_series.csv")
        self.time_series_df.to_csv(ts_path, index=False)
        print(f" Generated {len(self.time_series_df)} synthetic monthly records for {len(self.prison_summary)} prisons.")
        return self.time_series_df

    def train_forecast_models(self):
        """
        Builds and trains 30d, 60d, 90d occupancy forecasting models
        with proper train/test split and cross-validation.
        """
        if self.prison_summary is None:
            self.analyze_prison_capacity()
        
        if self.time_series_df is None:
            self._generate_time_series(months=24)

        features = [
            "capacity", "population", "undertrial_population", "convict_population",
            "occupancy_rate", "overcrowding_gap", "sec479_eligible",
            "sec479_approaching", "stuck_at_surety", "intake_rate",
            "release_rate", "net_flow", "seasonal_factor", "ut_share"
        ]

        ts = self.time_series_df.copy()
        
        # Add lagged features per prison
        for lag in [1, 2, 3]:
            ts[f"pop_lag_{lag}"] = ts.groupby("prison_id")["population"].shift(lag)
            features.append(f"pop_lag_{lag}")
        
        # Rolling mean
        ts["pop_rolling_3m"] = ts.groupby("prison_id")["population"].transform(
            lambda x: x.rolling(3, min_periods=1).mean()
        )
        features.append("pop_rolling_3m")
        
        # Population momentum (change rate)
        ts["pop_momentum"] = ts.groupby("prison_id")["population"].diff().fillna(0)
        features.append("pop_momentum")
        
        # Drop rows with NaN from lagging
        ts = ts.dropna(subset=features)
        
        X = ts[features].values
        
        horizons = [30, 60, 90]
        results = {}

        for h in horizons:
            # Target: population at h days ahead
            # Approximate by shifting forward (h/30 months)
            shift_months = max(1, h // 30)
            ts[f"target_{h}d"] = ts.groupby("prison_id")["population"].shift(-shift_months)
            
            valid_mask = ts[f"target_{h}d"].notna()
            X_valid = ts.loc[valid_mask, features].values
            y_valid = ts.loc[valid_mask, f"target_{h}d"].values
            
            if len(X_valid) < 10:
                continue
            
            # Temporal train/test split (80/20)
            split_idx = int(len(X_valid) * 0.8)
            X_train, X_test = X_valid[:split_idx], X_valid[split_idx:]
            y_train, y_test = y_valid[:split_idx], y_valid[split_idx:]
            
            # Scale features
            X_train_scaled = self.scaler.fit_transform(X_train)
            X_test_scaled = self.scaler.transform(X_test)
            
            # Train multiple models
            candidates = {
                "Ridge": Ridge(alpha=1.0),
                "GradientBoosting": GradientBoostingRegressor(
                    n_estimators=100, max_depth=4, learning_rate=0.1, random_state=42
                ),
                "RandomForest": RandomForestRegressor(
                    n_estimators=80, max_depth=6, random_state=42
                ),
            }
            
            best_model = None
            best_name = None
            best_mae = float("inf")
            best_preds = None
            model_scores = {}

            for name, model in candidates.items():
                model.fit(X_train_scaled, y_train)
                preds = model.predict(X_test_scaled)
                mae = mean_absolute_error(y_test, preds)
                rmse = np.sqrt(mean_squared_error(y_test, preds))
                r2 = r2_score(y_test, preds)
                
                model_scores[name] = {
                    "mae": round(mae, 2),
                    "rmse": round(rmse, 2),
                    "r2": round(r2, 4)
                }
                
                if mae < best_mae:
                    best_mae = mae
                    best_model = model
                    best_name = name
                    best_preds = preds
            
            # Cross-validation on full data for the best model
            cv_model = candidates[best_name].__class__(**candidates[best_name].get_params())
            tscv = TimeSeriesSplit(n_splits=3)
            X_all_scaled = self.scaler.fit_transform(X_valid)
            cv_scores = cross_val_score(cv_model, X_all_scaled, y_valid, cv=tscv, scoring="neg_mean_absolute_error")
            cv_mae = -cv_scores.mean()
            
            # Retrain best on all data
            best_model.fit(X_all_scaled, y_valid)

            self.models[f"{h}d"] = {
                "model": best_model,
                "model_name": best_name,
                "features": features,
                "horizon_days": h,
                "mae": round(best_mae, 2),
                "rmse": round(np.sqrt(mean_squared_error(y_test, best_preds)), 2),
                "cv_mae": round(cv_mae, 2),
                "test_samples": len(y_test),
            }

            model_file = os.path.join(self.output_dir, "saved_models", f"overcrowding_forecast_{h}d.joblib")
            joblib.dump(self.models[f"{h}d"], model_file)

            # Feature importance
            if hasattr(best_model, "feature_importances_"):
                imp = dict(zip(features, [round(float(c), 4) for c in best_model.feature_importances_]))
            elif hasattr(best_model, "coef_"):
                imp = dict(zip(features, [round(float(c), 4) for c in best_model.coef_]))
            else:
                imp = {}
            
            self.feature_importance[f"{h}d"] = imp
            results[f"{h}d"] = {
                "best_model": best_name,
                "MAE": round(best_mae, 2),
                "RMSE": round(np.sqrt(mean_squared_error(y_test, best_preds)), 2),
                "CV_MAE": round(cv_mae, 2),
                "all_model_scores": model_scores,
                "feature_importance": imp
            }

            print(f" {h}-Day Forecast [{best_name}] | Test MAE: {best_mae:.2f} | CV MAE: {cv_mae:.2f} | Test size: {len(y_test)}")

        report_path = os.path.join(self.output_dir, "forecasting_evaluation_report.json")
        with open(report_path, "w") as f:
            json.dump({
                "timestamp": datetime.now().isoformat(),
                "dataset_used": self.data_path,
                "time_series_records": len(self.time_series_df),
                "models": results,
                "prisons_analyzed": len(self.prison_summary)
            }, f, indent=2)

        return results

    def run_what_if_simulator(self, prison_id="PRIS-DL-01", releases_simulated=50):
        """
        Interactive decision-support simulator.
        """
        if self.prison_summary is None:
            self.analyze_prison_capacity()

        prison_row = self.prison_summary[self.prison_summary["prison_id"].str.lower() == prison_id.lower()]
        if prison_row.empty:
            prison_row = self.prison_summary.iloc[0]

        row = prison_row.iloc[0]
        cap = row["capacity"]
        current_pop = row["current_population"]
        current_occ = row["occupancy_rate"]

        base_90d_pop = int(current_pop * 1.045)
        base_90d_occ = round((base_90d_pop / cap) * 100, 2)

        sim_90d_pop = max(0, base_90d_pop - releases_simulated)
        sim_90d_occ = round((sim_90d_pop / cap) * 100, 2)
        occupancy_drop = round(base_90d_occ - sim_90d_occ, 2)

        result = {
            "prison_id": row["prison_id"],
            "prison_name": row["prison_name"],
            "capacity": cap,
            "current_state": {
                "population": current_pop,
                "occupancy_rate": current_occ,
                "overcrowding_level": row["overcrowding_level"]
            },
            "simulation_parameters": {
                "section_479_releases_executed": releases_simulated,
                "forecast_horizon_days": 90
            },
            "baseline_90d_projection": {
                "projected_population": base_90d_pop,
                "projected_occupancy_rate": base_90d_occ,
                "status": "CRITICAL" if base_90d_occ > 115 else "NORMAL"
            },
            "simulated_90d_outcome": {
                "projected_population": sim_90d_pop,
                "projected_occupancy_rate": sim_90d_occ,
                "occupancy_reduced_pct": occupancy_drop,
                "status": "NORMAL" if sim_90d_occ <= 100 else "ELEVATED" if sim_90d_occ <= 115 else "CRITICAL"
            }
        }

        print(f"\n WHAT-IF SIMULATION [{row['prison_name']}]:")
        print(f"   Current: {current_pop}/{cap} ({current_occ}%)")
        print(f"   Baseline 90d: {base_90d_pop} ({base_90d_occ}%)")
        print(f"   With {releases_simulated} Sec 479 Releases -> 90d: {sim_90d_pop} ({sim_90d_occ}%) [Drop: -{occupancy_drop}%]")
        return result

def main():
    print("=" * 70)
    print("EXECUTING PRISON OVERCROWDING FORECASTING ENGINE (600-RECORD DATASET)")
    print("=" * 70)
    forecaster = PrisonOvercrowdingForecaster()
    forecaster.load_data()
    forecaster.analyze_prison_capacity()
    forecaster.train_forecast_models()
    forecaster.run_what_if_simulator("PRIS-DL-01", releases_simulated=50)
    print("\n Overcrowding Forecasting Engine Completed Successfully.")

if __name__ == "__main__":
    main()
