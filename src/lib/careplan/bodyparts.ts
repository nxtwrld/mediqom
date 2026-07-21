/**
 * Care Plan body-part helpers (build row 7p).
 *
 * Pure functions used by the merge layer and the UI to (a) normalise an
 * extracted body-part reference against the anatomy registry, and (b)
 * union-merge body-part references across documents while preserving
 * provenance and taking the max urgency.
 */
import { isKnownAnatomyId, nearestRegion } from "$data/anatomy-regions";
import { normalizeAnatomyId } from "$data/anatomy-aliases";
import type { CarePlanBodyPartRef, ExtractedBodyPart } from "./types";

/**
 * Alias-normalise → validate against the registry → compute the nearest rollup
 * parent. Returns null when the id is unknown (the alias telemetry counter is
 * bumped by `normalizeAnatomyId`).
 */
export function normalizeBodyPartRef(
  identification: string,
): { identification: string; part?: string } | null {
  if (!identification) return null;
  const { id, resolved } = normalizeAnatomyId(identification);
  if (!resolved || !isKnownAnatomyId(id)) return null;
  const part = nearestRegion(id);
  // For a region id, nearestRegion returns itself — omit `part` then.
  return part && part !== id
    ? { identification: id, part }
    : { identification: id };
}

function clampUrgency(
  value: number | undefined,
): 1 | 2 | 3 | 4 | 5 | undefined {
  if (value == null || Number.isNaN(value)) return undefined;
  const r = Math.round(value);
  if (r < 1) return 1;
  if (r > 5) return 5;
  return r as 1 | 2 | 3 | 4 | 5;
}

/**
 * Union-merge incoming extracted body parts into the existing set for one item.
 * Dedupe by normalised `identification`; urgency = max across documents;
 * `sources[]` union; status takes the latest document's value unless the field
 * was user-edited (the caller handles user-edit precedence at the item level).
 */
export function unionMergeBodyParts(
  existing: CarePlanBodyPartRef[],
  incoming: ExtractedBodyPart[],
  docId: string,
): CarePlanBodyPartRef[] {
  const byId = new Map<string, CarePlanBodyPartRef>();
  for (const ref of existing)
    byId.set(ref.identification, { ...ref, sources: [...ref.sources] });

  for (const raw of incoming) {
    const norm = normalizeBodyPartRef(raw.identification);
    if (!norm) continue;
    const urgency = clampUrgency(raw.urgency);
    const status = normalizeStatus(raw.status);

    const current = byId.get(norm.identification);
    if (!current) {
      byId.set(norm.identification, {
        identification: norm.identification,
        part: norm.part,
        status,
        treatment: raw.treatment || undefined,
        urgency,
        sources: [docId],
      });
      continue;
    }

    current.part = current.part ?? norm.part;
    if (status) current.status = status; // latest-doc-wins
    if (raw.treatment) current.treatment = raw.treatment;
    if (urgency != null) {
      current.urgency =
        current.urgency != null
          ? (Math.max(current.urgency, urgency) as 1 | 2 | 3 | 4 | 5)
          : urgency;
    }
    if (!current.sources.includes(docId)) current.sources.push(docId);
  }

  return [...byId.values()];
}

function normalizeStatus(
  status: string | undefined,
): CarePlanBodyPartRef["status"] | undefined {
  if (!status) return undefined;
  const s = status.toLowerCase();
  if (s === "active" || s === "monitoring" || s === "recovering") return s;
  return undefined; // free-text clinical status doesn't map to the enum; leave unset
}
