/**
 * Lookup indexes for the anatomy resolver, built once at module load.
 *
 * The important one is `LOWER_TO_EXACT`. Every existing lookup index in the app
 * is built lowercased (`src/lib/context/objects.ts:8`,
 * `src/components/anatomy/context/index.ts:22-25`), but
 * `scene.getObjectByName()` (`highlight-system.ts:61`) and `checkObject`'s
 * `labelIds.includes(child.name)` (`model-loader.ts:382`) match case-SENSITIVELY
 * against real mesh names. So term-driven focus works today only for
 * all-lowercase meshes (`heart`, `lungs`, `brain`) and silently no-ops for every
 * `L_`/`R_` mesh — most of the body. This module is the only place lowercasing is
 * permitted, and it always hands back the exact-case id.
 */
import { ANATOMY_REGIONS, regionIds } from "$data/anatomy-regions";
import { ANATOMY_SNOMED } from "$data/anatomy-snomed";
import { ALL_MESHES } from "./layers";
import type { Side } from "./types";

/** lowercase form -> exact-case region id or mesh name. Regions win ties. */
export const LOWER_TO_EXACT = new Map<string, string>();
for (const mesh of ALL_MESHES) {
  const key = mesh.toLowerCase();
  if (!LOWER_TO_EXACT.has(key)) LOWER_TO_EXACT.set(key, mesh);
}
for (const id of regionIds()) {
  // A region id shadows a mesh of the same name — it is the broader anchor.
  LOWER_TO_EXACT.set(id.toLowerCase(), id);
}

/** SNOMED CT concept id -> mesh names. Only 122 of 465 meshes carry a code. */
export const SNOMED_TO_MESHES = new Map<string, string[]>();
for (const [mesh, entry] of Object.entries(ANATOMY_SNOMED)) {
  if (!entry.snomedCode) continue;
  const list = SNOMED_TO_MESHES.get(entry.snomedCode);
  if (list) list.push(mesh);
  else SNOMED_TO_MESHES.set(entry.snomedCode, [mesh]);
}

/**
 * Lowercased English label -> mesh names, laterality-aware, so "talus" yields
 * both `L_talus` and `R_talus`. `label` is populated for all 465 entries whereas
 * `snomedCode` is populated for 122, which is why the resolver consults this
 * index BEFORE the SNOMED one.
 */
export const LABEL_TO_MESHES = new Map<string, string[]>();
for (const [mesh, entry] of Object.entries(ANATOMY_SNOMED)) {
  if (!entry.label) continue;
  const key = entry.label.toLowerCase();
  const list = LABEL_TO_MESHES.get(key);
  if (list) list.push(mesh);
  else LABEL_TO_MESHES.set(key, [mesh]);
}

/** Exact-case mesh / region id -> its English label, when one is known. */
export function labelFor(id: string): string {
  const entry = ANATOMY_SNOMED[id];
  if (entry?.label) return entry.label;
  if (id in ANATOMY_REGIONS) return humanize(id);
  return humanize(id);
}

export function snomedFor(id: string): string | undefined {
  return ANATOMY_SNOMED[id]?.snomedCode || undefined;
}

/**
 * Turn `L_biceps_femoris_longus` into `Biceps femoris longus (left)`.
 * Mirrors `translateAnatomy()` in `$lib/i18n/anatomy` for the untranslated case,
 * but stays dependency-free so this module has no `$t` requirement.
 */
export function humanize(id: string): string {
  let name = id;
  let side = "";
  if (/^L_/.test(name)) {
    side = " (left)";
    name = name.slice(2);
  } else if (/^R_/.test(name)) {
    side = " (right)";
    name = name.slice(2);
  }
  name = name.replace(/_+$/, "").replace(/_+/g, " ").trim();
  return (name.charAt(0).toUpperCase() + name.slice(1) + side) || id;
}

const SIDE_PREFIXES: [RegExp, Side][] = [
  [/^left[\s_-]+/i, "left"],
  [/^right[\s_-]+/i, "right"],
  [/^l[\s_-]+/i, "left"],
  [/^r[\s_-]+/i, "right"],
  [/^l_/i, "left"],
  [/^r_/i, "right"],
];

/**
 * Split a leading laterality word off an input: `"left knee"` -> `{side: 'left',
 * rest: 'knee'}`. Returns `side: null` when no prefix is present, which the
 * caller distinguishes from an explicit `bilateral`.
 */
export function splitSide(input: string): { side: Side | null; rest: string } {
  for (const [re, side] of SIDE_PREFIXES) {
    if (re.test(input)) return { side, rest: input.replace(re, "").trim() };
  }
  return { side: null, rest: input };
}

/** Laterality implied by an exact-case id's own prefix. */
export function sideOf(id: string): Side {
  if (id.startsWith("L_")) return "left";
  if (id.startsWith("R_")) return "right";
  return "midline";
}

/** Lowercase alphanumeric tokens, for the token-overlap fallback. */
export function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}
