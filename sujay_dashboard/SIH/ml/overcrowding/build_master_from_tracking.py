"""
Builds datasets/undertrials_master_600.csv from datasets/undertrial_tracking_600.csv
so the existing PrisonOvercrowdingForecaster can consume it unchanged.

Assumptions (stated for demo transparency):
- undertrial share of prison population fixed at 76% (NCRB national average); remainder convicts.
- release barriers derived from bail_status / bond-surety fields of the tracking dataset.
"""
import pandas as pd

SRC = "datasets/undertrial_tracking_600.csv"
DST = "datasets/undertrials_master_600.csv"

UT_SHARE = 0.76

df = pd.read_csv(SRC)
df.columns = [c.strip() for c in df.columns]

def map_eligibility(v):
    v = str(v).strip()
    if v.lower() == "eligible":
        return "Eligible"
    if v.lower().startswith("approaching"):
        return "Approaching"
    return v

def derive_barrier(row):
    elig = str(row["eligibility_result"]).lower()
    if elig not in ("eligible", "approaching"):
        return ""
    bail = str(row.get("bail_status", "")).strip()
    released = pd.notna(row.get("actual_release_date")) and str(row["actual_release_date"]).strip() != ""
    if released or bail.startswith("Released"):
        return ""
    if bail == "Bail Granted":
        return "Surety pending"
    return "Court hearing pending"

prison_cols = {
    "prison_id": "first",
    "prison_name": "first",
    "prison_state": "first",
    "prison_district": "first",
    "prison_capacity": "first",
    "prison_occupancy": "first",
    "occupancy_rate_pct": "first",
}
agg = df.groupby("prison_id").agg(prison_cols)

out = pd.DataFrame(index=agg.index)
for col, how in prison_cols.items():
    out[col] = agg[col]

out["total_prison_population"] = out["prison_occupancy"]
out["occupancy_rate"] = out["occupancy_rate_pct"].round(2)
out["overcrowding_level"] = out["occupancy_rate"].apply(
    lambda r: "Severe" if r > 115 else ("Moderate" if r > 100 else "Normal")
)
out["available_beds"] = (out["prison_capacity"] - out["total_prison_population"]).clip(lower=0).astype(int)
out["overcrowding_gap"] = (out["total_prison_population"] - out["prison_capacity"]).clip(lower=0).astype(int)
out["undertrial_population"] = (out["total_prison_population"] * UT_SHARE).round().astype(int)
out["convict_population"] = out["total_prison_population"] - out["undertrial_population"]

df["eligibility_result"] = df["sec479_eligibility"].apply(map_eligibility)
df["release_barrier"] = df.apply(derive_barrier, axis=1)

barrier_map = df.groupby("prison_id")["release_barrier"].apply(lambda s: s.value_counts().idxmax())
elig_map = df.groupby("prison_id")["eligibility_result"].apply(lambda s: s.value_counts().idxmax())

out = out.drop(columns=["prison_id"]).reset_index()
out["eligibility_result"] = out["prison_id"].map(elig_map)
out["release_barrier"] = out["prison_id"].map(barrier_map)

keep = [
    "prisoner_id", "case_cnr", "prison_id", "prison_name", "prison_state", "prison_district",
    "prison_capacity", "total_prison_population", "occupancy_rate", "overcrowding_level",
    "available_beds", "overcrowding_gap", "undertrial_population", "convict_population",
    "eligibility_result", "release_barrier",
]
per_prison = out.set_index("prison_id")
for col in ["prison_capacity", "total_prison_population", "occupancy_rate", "overcrowding_level",
            "available_beds", "overcrowding_gap", "undertrial_population", "convict_population"]:
    df[col] = df["prison_id"].map(per_prison[col])

merged = df
merged[keep].to_csv(DST, index=False)
print(f"Wrote {len(merged)} rows -> {DST}")
print(merged.groupby("prison_id").size())
