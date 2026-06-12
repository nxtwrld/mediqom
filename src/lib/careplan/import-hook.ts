/**
 * Care Plan merge hook for the import flow (Care Plan build row 7f).
 *
 * Called from `saveDocuments()` after a document and its health data are saved.
 * Extracts Care Plan inputs from the document content, merges them into the
 * profile's singleton plan, persists the result, and returns the delta for the
 * post-import summary screen. Failures are swallowed (logged) — a Care Plan
 * merge must never fail the underlying document save.
 */
import { extractCarePlanInputs } from "./assembly";
import { mergeCarePlan } from "./merge";
import { getFullPlan, saveCarePlan } from "./store";
import { logger } from "$lib/logging/logger";
import type { CarePlanDelta } from "./types";

export interface CarePlanDeltaEntry {
  profileId: string;
  documentId: string;
  delta: CarePlanDelta;
}

/**
 * Merge a saved document into the profile's Care Plan. Returns the delta, or
 * null when nothing was extracted (or on error — never throws).
 */
export async function mergeDocumentIntoCarePlan(
  content: any,
  profileId: string,
  documentId: string,
  documentDate: string,
  hadContext: boolean,
  locale: string = "en",
): Promise<CarePlanDelta | null> {
  try {
    const extraction = extractCarePlanInputs(
      content,
      documentId,
      documentDate,
      hadContext,
    );
    const hasInputs =
      extraction.diagnoses.length > 0 ||
      extraction.recommendations.length > 0 ||
      extraction.goals.length > 0 ||
      extraction.bodyParts.length > 0;
    if (!hasInputs) return null;

    const existing = await getFullPlan(profileId);
    const { newPlan, delta } = mergeCarePlan(existing, extraction, {
      documentId,
      documentDate,
      locale,
    });
    await saveCarePlan(profileId, newPlan);
    return delta;
  } catch (err) {
    logger.documents?.error?.(
      "Care Plan merge failed (document save unaffected)",
      {
        profileId,
        documentId,
        error: String(err),
      },
    );
    return null;
  }
}
