/**
 * Care Plan → 3D highlight adapter (Care Plan build row 13).
 *
 * Expands Care Plan items to a flat list of `{ mesh, color, opacity }` regions
 * for `setMultiHighlight()`. Colour encodes condition TYPE (not urgency);
 * opacity encodes certainty (bucketed by the highlight system). Per-mesh
 * conflicts resolve to the highest-urgency item.
 */
import { regionMeshes, rollupChain } from "$data/anatomy-regions";
import { computeItemCertainty, certaintyBucket } from "./certainty";
import type { CarePlanItem } from "./types";

export interface HighlightRegion {
  mesh: string;
  color: string;
  opacity: number;
}

// Condition-type colours (CAREPLAN.md §3D Model Integration). Resolved from CSS
// custom properties at call time so they track the theme; fall back to fixed hex.
const TYPE_COLOR_VAR: Record<CarePlanItem["conditionType"], string> = {
  chronic: "--color-primary",
  monitoring: "--color-warning",
  acute: "--color-positive",
  exploratory: "--cp-exploratory",
  wellness: "--color-positive",
};
const TYPE_COLOR_FALLBACK: Record<CarePlanItem["conditionType"], string> = {
  chronic: "#3b6fd4",
  monitoring: "#e0a43b",
  acute: "#3bb273",
  exploratory: "#8b5cf6",
  wellness: "#3bb273",
};

function resolveColor(type: CarePlanItem["conditionType"]): string {
  if (typeof document !== "undefined") {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue(TYPE_COLOR_VAR[type])
      .trim();
    if (v) return v;
  }
  return TYPE_COLOR_FALLBACK[type];
}

/**
 * Build the highlight regions for a set of Care Plan items. Each item paints its
 * body-part meshes (region ids expanded to leaf meshes). When two items paint
 * the same mesh, the higher-urgency item wins.
 */
export function buildHighlightRegions(
  items: CarePlanItem[],
  now?: Date,
): HighlightRegion[] {
  // mesh → { region, urgency } chosen so far
  const byMesh = new Map<
    string,
    { region: HighlightRegion; urgency: number }
  >();

  for (const item of items) {
    if (item.status === "resolved" || item.status === "historical") continue;
    const color = resolveColor(item.conditionType);
    const opacity = certaintyBucket(computeItemCertainty(item, now)).opacity;

    for (const bp of item.bodyParts) {
      const urgency = bp.urgency ?? 1;
      for (const mesh of regionMeshes(bp.identification)) {
        const existing = byMesh.get(mesh);
        if (!existing || urgency > existing.urgency) {
          byMesh.set(mesh, { region: { mesh, color, opacity }, urgency });
        }
      }
    }
  }

  return [...byMesh.values()].map((e) => e.region);
}

/**
 * Items whose body parts touch a clicked mesh or region — used for the
 * click-through filter. Matches in both rollup directions (a click on a leaf
 * mesh matches an item registered on its parent region, and vice versa).
 */
export function meshToItems(
  meshOrRegion: string,
  items: CarePlanItem[],
): CarePlanItem[] {
  const targetAncestors = rollupChain(meshOrRegion); // X's parents up to whole_body
  return items.filter((item) =>
    item.bodyParts.some((bp) => {
      if (bp.identification === meshOrRegion) return true;
      // X is an ancestor of the body part (clicked a region, item is a leaf under it).
      if (rollupChain(bp.identification).includes(meshOrRegion)) return true;
      // The body part is an ancestor of X (clicked a leaf, item is on the parent region).
      if (targetAncestors.includes(bp.identification)) return true;
      return false;
    }),
  );
}
