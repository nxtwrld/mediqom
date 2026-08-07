/**
 * Free-text -> anatomy resolution (AI_PLUGIN.md §6).
 *
 * `show_anatomy`'s `structure` argument is a closed enum over the 50 region ids,
 * so it needs no resolution. This resolver exists for the free-text `highlight`
 * refinement, and for the Claude / Gemini adapters where the calling model may
 * not be constrained by a schema at all.
 *
 * Exact before fuzzy, first hit wins. Failure is graceful by design: an
 * unresolved highlight leaves the chosen region correctly framed with nothing
 * extra painted, which is much better than a confidently wrong view.
 */
import {
  ANATOMY_REGIONS,
  isKnownAnatomyId,
  regionMeshes,
} from "$data/anatomy-regions";
import { normalizeAnatomyId } from "$data/anatomy-aliases";
import { resolveClinicalAlias } from "./clinical-aliases";
import { isWholeSystemOnly, layersFor } from "./layers";
import {
  LABEL_TO_MESHES,
  LOWER_TO_EXACT,
  SNOMED_TO_MESHES,
  labelFor,
  sideOf,
  snomedFor,
  splitSide,
  tokenize,
} from "./terms";
import type {
  AnatomyResolution,
  ResolveOptions,
  Side,
} from "./types";

const MAX_CANDIDATES = 3;
const MIN_SHARED_TOKENS = 2;

function empty(input: string): AnatomyResolution {
  return {
    ok: false,
    input,
    canonicalId: null,
    label: "",
    meshes: [],
    unavailable: [],
    layers: [],
    side: "midline",
    wholeSystemOnly: false,
    candidates: [],
    matchedBy: null,
  };
}

/** A raw hit, before expansion / manifest filtering. */
interface Hit {
  ids: string[];
  matchedBy: NonNullable<AnatomyResolution["matchedBy"]>;
}

export function resolveAnatomy(
  input: string,
  opts: ResolveOptions = {},
): AnatomyResolution {
  const raw = (input ?? "").trim();
  if (!raw) return empty(input ?? "");

  const scope = opts.within ? new Set(regionMeshes(opts.within)) : null;
  const { side: askedSide, rest } = splitSide(raw);

  const hit =
    step1Alias(raw) ??
    step2Exact(raw) ??
    step3CaseInsensitive(raw, rest, askedSide) ??
    step4Label(raw, rest, askedSide) ??
    step5Snomed(raw) ??
    step6Clinical(rest, askedSide) ??
    null;

  if (!hit) {
    const result = empty(raw);
    result.candidates = step7TokenOverlap(rest, scope);
    return result;
  }

  return finalize(raw, hit, askedSide, scope, opts);
}

// ── Steps ────────────────────────────────────────────────────────────────────

/** 1. The existing mesh-rename migration table. */
function step1Alias(input: string): Hit | null {
  const { id, resolved } = normalizeAnatomyId(input);
  return resolved && id !== input
    ? { ids: [id], matchedBy: "alias" }
    : null;
}

/** 2. Exact, case-sensitive region id or mesh name. */
function step2Exact(input: string): Hit | null {
  return isKnownAnatomyId(input) ? { ids: [input], matchedBy: "exact" } : null;
}

/**
 * 3. Case-insensitive, laterality-aware. This is the fix for the live bug where
 * term-driven focus silently no-ops on every `L_`/`R_` mesh. Always returns the
 * exact-case id.
 */
function step3CaseInsensitive(
  input: string,
  rest: string,
  side: Side | null,
): Hit | null {
  const direct = LOWER_TO_EXACT.get(input.toLowerCase());
  if (direct) return { ids: [direct], matchedBy: "case-insensitive" };

  const underscored = LOWER_TO_EXACT.get(
    input.toLowerCase().replace(/\s+/g, "_"),
  );
  if (underscored) return { ids: [underscored], matchedBy: "case-insensitive" };

  // "left knee" -> try "knee", then re-apply the side as an L_/R_ prefix.
  if (side) {
    const base = rest.toLowerCase().replace(/\s+/g, "_");
    const prefix = side === "left" ? "l_" : "r_";
    const sided = LOWER_TO_EXACT.get(prefix + base);
    if (sided) return { ids: [sided], matchedBy: "case-insensitive" };
    const bare = LOWER_TO_EXACT.get(base);
    if (bare) return { ids: [bare], matchedBy: "case-insensitive" };
  }

  return null;
}

/**
 * 4. English label index. `label` is populated for all 465 entries whereas
 * `snomedCode` is populated for 122, so this runs BEFORE the SNOMED lookup.
 */
function step4Label(
  input: string,
  rest: string,
  side: Side | null,
): Hit | null {
  const byFull = LABEL_TO_MESHES.get(input.toLowerCase());
  if (byFull) return { ids: byFull, matchedBy: "label" };

  if (side) {
    const byRest = LABEL_TO_MESHES.get(rest.toLowerCase());
    if (byRest) return { ids: byRest, matchedBy: "label" };
  }
  return null;
}

/** 5. Numeric SNOMED CT concept id. Covers only the populated quarter. */
function step5Snomed(input: string): Hit | null {
  if (!/^\d+$/.test(input.trim())) return null;
  const meshes = SNOMED_TO_MESHES.get(input.trim());
  return meshes ? { ids: meshes, matchedBy: "snomed" } : null;
}

/** 6. What clinicians actually say. */
function step6Clinical(rest: string, side: Side | null): Hit | null {
  const asked = side === "left" || side === "right" ? side : null;
  const ids = resolveClinicalAlias(rest, asked);
  return ids ? { ids, matchedBy: "clinical-alias" } : null;
}

/** 7. Token overlap, for suggestions only — never a match. */
function step7TokenOverlap(
  input: string,
  scope: Set<string> | null,
): AnatomyResolution["candidates"] {
  const tokens = new Set(tokenize(input));
  if (tokens.size === 0) return [];

  const pool = scope
    ? [...scope]
    : [...LOWER_TO_EXACT.values()];

  const scored: { id: string; score: number }[] = [];
  for (const id of pool) {
    const shared = tokenize(id).filter((t) => tokens.has(t)).length;
    if (shared >= MIN_SHARED_TOKENS) scored.push({ id, score: shared });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, MAX_CANDIDATES)
    .map(({ id }) => ({ id, label: labelFor(id) }));
}

// ── Expansion, filtering, reporting ─────────────────────────────────────────

function finalize(
  input: string,
  hit: Hit,
  askedSide: Side | null,
  scope: Set<string> | null,
  opts: ResolveOptions,
): AnatomyResolution {
  const canonicalId = hit.ids[0];

  // Expand region ids to leaf meshes; a mesh id expands to itself.
  let meshes = hit.ids.flatMap((id) =>
    id in ANATOMY_REGIONS ? regionMeshes(id) : [id],
  );
  meshes = [...new Set(meshes)];

  // Laterality filter, but only when it does not empty the result — a request
  // for the "left sternum" should still show the sternum.
  if (askedSide === "left" || askedSide === "right") {
    const wanted = askedSide === "left" ? "L_" : "R_";
    const sided = meshes.filter((m) => m.startsWith(wanted));
    if (sided.length > 0) meshes = sided;
  }

  // Scope to the enclosing region when one was given, unless that empties it.
  if (scope) {
    const scoped = meshes.filter((m) => scope.has(m));
    if (scoped.length > 0) meshes = scoped;
  }

  // Partition against the real geometry for this sex.
  const available = opts.sex && opts.manifest ? new Set(opts.manifest[opts.sex]) : null;
  const present = available ? meshes.filter((m) => available.has(m)) : meshes;
  const unavailable = available ? meshes.filter((m) => !available.has(m)) : [];

  const side: Side =
    askedSide ??
    (hit.ids.length > 1 && hit.ids.some((i) => i.startsWith("L_"))
      ? "bilateral"
      : sideOf(canonicalId));

  return {
    ok: present.length > 0,
    input,
    canonicalId,
    label: labelFor(canonicalId),
    snomedCode: snomedFor(canonicalId),
    meshes: present,
    unavailable,
    layers: layersFor(present),
    side,
    wholeSystemOnly: present.some(isWholeSystemOnly),
    candidates: [],
    matchedBy: hit.matchedBy,
  };
}
