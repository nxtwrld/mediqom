/**
 * Mesh -> layer index, inverted from `src/data/objects.json`.
 *
 * Two wrinkles the raw JSON does not handle:
 *
 *  - `respiratory`, `digestive` and `urogenital` all declare the SAME 18 objects
 *    from the same `organs` file, so a naive inversion reports all three layers
 *    for every organ. We dedupe by declaration order — first layer wins — which
 *    makes `lungs` respiratory rather than respiratory+digestive+urogenital.
 *  - An isolated organ floating in a void reads as nowhere in particular, so
 *    `layersFor` can append `skeleton` as a spatial anchor. That costs ~700 KB,
 *    so it is opt-in.
 */
import objects from "$data/objects.json";
import {
  ANATOMY_LAYERS,
  WHOLE_SYSTEM_ONLY_LAYERS,
  type AnatomyLayer,
} from "./types";

type LayerDecl = { files: string[]; objects: string[] };
const DECL = objects as unknown as Record<AnatomyLayer, LayerDecl>;

/** mesh name -> the single layer that owns it (first declaration wins). */
const MESH_TO_LAYER = new Map<string, AnatomyLayer>();
for (const layer of ANATOMY_LAYERS) {
  for (const mesh of DECL[layer]?.objects ?? []) {
    if (!MESH_TO_LAYER.has(mesh)) MESH_TO_LAYER.set(mesh, layer);
  }
}

/** layer -> the .obj basenames it loads from. */
const LAYER_FILES = new Map<AnatomyLayer, string[]>(
  ANATOMY_LAYERS.map((l) => [l, DECL[l]?.files ?? []]),
);

/** Every unique mesh name declared across all layers (465). */
export const ALL_MESHES: readonly string[] = [...MESH_TO_LAYER.keys()];

export function layerOf(mesh: string): AnatomyLayer | undefined {
  return MESH_TO_LAYER.get(mesh);
}

export function meshesInLayer(layer: AnatomyLayer): string[] {
  return (DECL[layer]?.objects ?? []).filter(
    (m, i, a) => a.indexOf(m) === i,
  );
}

export function filesForLayer(layer: AnatomyLayer): string[] {
  return LAYER_FILES.get(layer) ?? [];
}

/** True when `mesh` sits in a layer with no sub-layer granularity. */
export function isWholeSystemOnly(mesh: string): boolean {
  const layer = MESH_TO_LAYER.get(mesh);
  return layer ? WHOLE_SYSTEM_ONLY_LAYERS.includes(layer) : false;
}

/**
 * Layers the given meshes belong to, in canonical order.
 *
 * `anchor` appends `skeleton` when the result contains neither `skeleton` nor
 * `skin`, so an isolated organ has something to sit inside.
 */
export function layersFor(
  meshes: string[],
  opts: { anchor?: boolean } = {},
): AnatomyLayer[] {
  const found = new Set<AnatomyLayer>();
  for (const mesh of meshes) {
    const layer = MESH_TO_LAYER.get(mesh);
    if (layer) found.add(layer);
  }

  if (
    opts.anchor &&
    found.size > 0 &&
    !found.has("skeleton") &&
    !found.has("skin")
  ) {
    found.add("skeleton");
  }

  return ANATOMY_LAYERS.filter((l) => found.has(l));
}
