import { ApplicationStage } from "./enums";

export type StallableStage = Exclude<
  ApplicationStage,
  (typeof ApplicationStage)["Released"]
>;

/**
 * Days an application may sit in a stage before it counts as stalled.
 * flagged→drafted 3, drafted→filed 5, filed→hearing_scheduled 10,
 * hearing_scheduled→order_passed 14, order_passed→released 3 (bond/surety delay).
 */
export const STALL_THRESHOLDS_DAYS: Record<StallableStage, number> = {
  [ApplicationStage.Flagged]: 3,
  [ApplicationStage.Drafted]: 5,
  [ApplicationStage.Filed]: 10,
  [ApplicationStage.HearingScheduled]: 14,
  [ApplicationStage.OrderPassed]: 3,
};

export const STALLED_ENTITY_TYPE_APPLICATION = "Application";
