import { ApplicationStage } from "@rihai/shared-types";
import type { EligibilityBadge } from "@rihai/shared-types";

export const STAGE_LABELS: Record<ApplicationStage, string> = {
  [ApplicationStage.Flagged]: "Flagged",
  [ApplicationStage.Drafted]: "Drafted",
  [ApplicationStage.Filed]: "Filed",
  [ApplicationStage.HearingScheduled]: "Hearing Scheduled",
  [ApplicationStage.OrderPassed]: "Order Passed",
  [ApplicationStage.Released]: "Released",
};

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export const ELIGIBILITY_BADGE: Record<EligibilityBadge, { label: string; cls: string }> = {
  eligible: { label: "Eligible", cls: "bg-emerald-100 text-emerald-800 ring-emerald-600/20" },
  not_eligible: { label: "Not Eligible", cls: "bg-amber-100 text-amber-800 ring-amber-600/20" },
  excluded: { label: "Excluded", cls: "bg-red-100 text-red-800 ring-red-600/20" },
  pending: { label: "Pending", cls: "bg-slate-100 text-slate-600 ring-slate-500/20" },
};

export function eligibilityBadge(status: EligibilityBadge) {
  return ELIGIBILITY_BADGE[status] ?? ELIGIBILITY_BADGE.pending;
}
