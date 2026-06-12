/**
 * Anatomy mesh-rename migration table (Care Plan build row 7o).
 *
 * Stored Care Plan items reference mesh / region ids that may be renamed years
 * later when the 3D model is upgraded. This table maps deprecated ids to their
 * current equivalents; `normalizeAnatomyId()` runs at Care Plan load time
 * (`src/lib/careplan/store.ts`) so old documents keep painting the right region.
 *
 * Starts near-empty by design — it is a forward-looking migration surface, not
 * a backfill. Add an entry whenever a mesh name changes in `objects.json`.
 * A telemetry counter records ids that resolve to nothing, so drift surfaces
 * before users see broken highlights.
 */
import { isKnownAnatomyId } from "./anatomy-regions";

/** deprecated id → current mesh / region id. */
export const ANATOMY_ALIASES: Record<string, string> = {
  // Example shape (no live renames yet):
  // "L_calcaneum": "L_calcaneus",
};

let unresolvedCount = 0;

/**
 * Map a stored anatomy id through the alias table and validate it against the
 * region registry. `resolved` is false when the id is neither a known id nor an
 * alias — the caller should drop or flag it (the telemetry counter is bumped).
 */
export function normalizeAnatomyId(id: string): {
  id: string;
  resolved: boolean;
} {
  const mapped = ANATOMY_ALIASES[id] ?? id;
  if (isKnownAnatomyId(mapped)) return { id: mapped, resolved: true };
  unresolvedCount += 1;
  return { id: mapped, resolved: false };
}

/** Number of unresolved anatomy ids seen since process start (telemetry). */
export function getUnresolvedAnatomyCount(): number {
  return unresolvedCount;
}

/** Test/diagnostic reset. */
export function resetUnresolvedAnatomyCount(): void {
  unresolvedCount = 0;
}
