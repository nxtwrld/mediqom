/**
 * Deterministic diagnosis matching (Care Plan build row 6).
 *
 * Used when no LLM link annotations are available (legacy / no-context imports)
 * and to validate suspicious annotations against the real plan. Strategy:
 * ICD-10 exact match (hard anchor) → fuzzy description token overlap → body
 * part rollup overlap tiebreak.
 */
import { rollupChain } from "$data/anatomy-regions";
import type { CarePlanItem, ExtractedDiagnosis } from "./types";

export interface DedupMatch {
  itemId: string;
  method: "icd10" | "description" | "bodypart-rollup";
  score: number;
}

const DESCRIPTION_THRESHOLD = 0.8;

/** Normalise an ICD-10 code: strip dots/spaces, uppercase. */
function normalizeIcd(code: string | undefined): string | undefined {
  if (!code) return undefined;
  const n = code.replace(/[\s.]/g, "").toUpperCase();
  return n.length ? n : undefined;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "") // strip diacritics
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2),
  );
}

/** Jaccard token overlap of two descriptions, 0–1. */
function descriptionSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersection = 0;
  for (const t of ta) if (tb.has(t)) intersection += 1;
  const union = ta.size + tb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Rollup-region overlap between an extracted diagnosis and an item. */
function bodyPartOverlap(dxRollups: Set<string>, item: CarePlanItem): number {
  if (dxRollups.size === 0 || item.bodyParts.length === 0) return 0;
  const itemRollups = new Set<string>();
  for (const bp of item.bodyParts) {
    itemRollups.add(bp.identification);
    for (const r of rollupChain(bp.identification)) itemRollups.add(r);
  }
  let overlap = 0;
  for (const r of dxRollups) if (itemRollups.has(r)) overlap += 1;
  return overlap / dxRollups.size;
}

/**
 * Match an extracted diagnosis against the current plan items. Returns the best
 * match or null. ICD-10 is the hard anchor; description and body-part overlap
 * are softer fallbacks.
 */
export function matchDiagnosis(
  dx: ExtractedDiagnosis,
  items: CarePlanItem[],
  dxBodyPartIds: string[] = [],
): DedupMatch | null {
  const dxIcd = normalizeIcd(dx.code);

  // 1. ICD-10 exact match.
  if (dxIcd) {
    for (const item of items) {
      if (normalizeIcd(item.diagnosisCode) === dxIcd) {
        return { itemId: item.id, method: "icd10", score: 1.0 };
      }
    }
  }

  // 2. Fuzzy description.
  let best: DedupMatch | null = null;
  for (const item of items) {
    const sim = descriptionSimilarity(
      dx.description,
      item.diagnosisDescription,
    );
    if (sim >= DESCRIPTION_THRESHOLD && (!best || sim > best.score)) {
      best = { itemId: item.id, method: "description", score: sim };
    }
  }
  if (best) return best;

  // 3. Body-part rollup tiebreak (only when description was inconclusive).
  if (dxBodyPartIds.length) {
    const dxRollups = new Set<string>();
    for (const id of dxBodyPartIds) {
      dxRollups.add(id);
      for (const r of rollupChain(id)) dxRollups.add(r);
    }
    for (const item of items) {
      const overlap = bodyPartOverlap(dxRollups, item);
      // Require a meaningful description similarity too, so anatomy alone never
      // collapses two unrelated conditions in the same region.
      const sim = descriptionSimilarity(
        dx.description,
        item.diagnosisDescription,
      );
      if (overlap >= 0.5 && sim >= 0.4 && (!best || overlap > best.score)) {
        best = { itemId: item.id, method: "bodypart-rollup", score: overlap };
      }
    }
  }

  return best;
}
