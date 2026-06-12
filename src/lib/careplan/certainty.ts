/**
 * Temporal certainty (Care Plan build row 5).
 *
 * Certainty is never stored — it is computed at load time from the stored dates,
 * mirroring the `valueHeat` pattern in PropertyTile.svelte. Recompute is
 * throttled by callers to once per page-load and once per merge.
 */
import { computeOutputForRereference } from "$data/properties";
import { durationFromFormatted } from "$lib/datetime";
import { getSignal } from "$data/signal-catalog";
import type { CarePlanItem, FollowUpTask } from "./types";

/** Per condition-type certainty decay cadence (CAREPLAN.md table). */
const CYCLE_BY_TYPE: Record<CarePlanItem["conditionType"], number> = {
  exploratory: 14,
  acute: 30,
  wellness: 90,
  chronic: 180,
  monitoring: 90, // overridden below by the tightest signal cadence
};

const BASE_CONFIDENCE: Record<string, number> = {
  confirmed: 1.0,
  probable: 0.8,
  possible: 0.6,
  suspected: 0.4,
};

/** Task priority → certainty cycle in days. */
const TASK_CYCLE: Record<FollowUpTask["priority"], number> = {
  immediate: 3,
  urgent: 14,
  routine: 90,
  as_needed: 180,
};

/**
 * Certainty cycle for an item. For `monitoring` items the most conservative
 * signal cadence wins — no signal's freshness window goes unwatched.
 */
export function certaintyCycleInDays(
  item: Pick<CarePlanItem, "conditionType" | "monitoringSignals">,
): number {
  if (item.conditionType !== "monitoring")
    return CYCLE_BY_TYPE[item.conditionType];
  const cadences = (item.monitoringSignals ?? [])
    .map((name) => getSignal(name)?.valueExpirationInDays)
    .filter((d): d is number => typeof d === "number" && d > 0);
  return cadences.length ? Math.min(...cadences) : 90;
}

export function computeTaskCertaintyCycle(
  priority: FollowUpTask["priority"],
): number {
  return TASK_CYCLE[priority] ?? 90;
}

/**
 * Item certainty in [0, 1]. Higher = fresher / better supported.
 * Mirrors CAREPLAN.md §Temporal Certainty System.
 */
export function computeItemCertainty(
  item: CarePlanItem,
  now: Date = new Date(),
): number {
  const age = Math.max(
    0,
    durationFromFormatted("days", item.lastSeenInDocumentDate, now),
  );
  const baseConfidence =
    BASE_CONFIDENCE[item.diagnosis?.confidence ?? ""] ?? 0.5;
  const documentBoost = Math.min(
    0.2,
    (item.confirmingDocuments?.length ?? 0) * 0.05,
  );
  const cycle = item.certaintyCycleInDays || certaintyCycleInDays(item);
  // Same arg convention as PropertyTile's valueHeat: [outMin, outMax] = faded,
  // full. Within [0, cycle] the value stays full (outMax = 1.0); beyond it the
  // signal fades toward outMin = 0.3 at cycle × 1.5.
  const decay = computeOutputForRereference(age, [0, cycle], [0.3, 1.0]);
  return Math.min(1.0, (baseConfidence + documentBoost) * decay);
}

export interface CertaintyBucket {
  opacity: number;
  labelKey: string;
}

/**
 * Map a certainty score to a display opacity + i18n label key. The buckets
 * mirror CAREPLAN.md §"What certainty drives in the UI"; the label keys feed
 * both the sr-only string and the optional inline label.
 */
export function certaintyBucket(score: number): CertaintyBucket {
  if (score >= 0.8)
    return { opacity: 1.0, labelKey: "careplan.certainty.monitored" };
  if (score >= 0.5)
    return { opacity: 0.75, labelKey: "careplan.certainty.check-in-soon" };
  if (score >= 0.3)
    return { opacity: 0.55, labelKey: "careplan.certainty.fresh-look" };
  return { opacity: 0.35, labelKey: "careplan.certainty.from-your-past" };
}

/** Convenience: the bucket's label key for a raw score. */
export function certaintyBucketLabelKey(score: number): string {
  return certaintyBucket(score).labelKey;
}
