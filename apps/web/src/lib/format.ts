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
  eligible: { label: "Eligible", cls: "pill-ok" },
  not_eligible: { label: "Not Eligible", cls: "pill-warn" },
  excluded: { label: "Excluded", cls: "pill-full" },
  pending: { label: "Pending", cls: "pill-neutral" },
};

export function eligibilityBadge(status: EligibilityBadge) {
  return ELIGIBILITY_BADGE[status] ?? ELIGIBILITY_BADGE.pending;
}
