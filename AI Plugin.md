# Mediqom AI Plugin / Tool Integration

> **Revision note (2026-08-07).** Rewritten after verifying every claim against the
> codebase and the current OpenAI Apps SDK rules. Four things changed materially:
> the canonical anatomy vocabulary the previous draft asked us to build **already
> exists**; that vocabulary **declares 35–50 meshes the geometry doesn't contain**;
> the asset problem is an **encoding** problem, not the geometry crisis it looks
> like; and the proposed document-structuring capability is **prohibited by
> OpenAI's app submission guidelines**. Sections marked ✅ describe existing code.
> Claims marked ⚠️ are verified defects in the current codebase.

## Goal

Build a lightweight Mediqom integration for conversational AI platforms that gives the model a genuinely useful capability while driving discovery of the full Mediqom application.

The initial — and, per §9, the *only* viable — capability is the **interactive 3D anatomy viewer**.

The integration must preserve Mediqom's core architecture:

- patient records are encrypted client-side;
- Mediqom servers never receive decrypted patient records;
- the plugin/tool must not become a back door into the encrypted vault;
- the full Mediqom application remains the place where longitudinal medical context is decrypted and used;
- external AI platforms receive only information the user explicitly chooses to disclose.

The strategic positioning is:

> AI models compete on intelligence. Mediqom competes on medical context.

### The privacy boundary is now an external constraint too

OpenAI's app submission guidelines **prohibit apps from collecting Protected Health Information**, require data minimization to "the minimum data required to perform the tool's function", and require suitability for ages 13–17.

This is not an obstacle — it is the same line Mediqom already draws, enforced by someone else. It means the plugin can only ever be the *anatomy* capability plus a handoff. That alignment is worth stating explicitly in any app submission.

---

# 1. Recommended first plugin: Interactive Anatomy

The anatomy viewer is an unusually good first integration because it provides clear value inside an AI conversation without requiring access to private medical records — and, critically, **without touching PHI**.

Example conversation:

> User: My doctor says I have a medial meniscus tear. Where exactly is that?

The AI explains the term and invokes Mediqom:

```text
show_anatomy({
  structure: "R_knee",              // enum — one of the 50 region ids
  highlight: ["medial meniscus"],   // free text, refined within the region
  layers: ["skeleton", "connective"],
  cameraPreset: "anterior"
})
```

The Mediqom widget then renders an interactive 3D knee with the relevant structure highlighted.

Useful interactions: rotate / zoom, isolate a structure, toggle anatomical layers, highlight affected structure, change camera preset, show adjacent structures, open the full Mediqom application.

The AI performs the conversational interpretation. Mediqom provides the visualization capability. This keeps the initial liability surface narrow: Mediqom is not diagnosing through the plugin, it is visualizing anatomy requested by the model.

---

# 2. ✅ What already exists — do not rebuild it

The previous draft asked us to "define canonical `AnatomyStructure` and `AnatomyLayer` enums" and build a semantic-ID → mesh mapping. **That layer is built, tested, and in production use by Care Plan.**

| Asset | Location | What it gives us |
|---|---|---|
| `ANATOMY_REGIONS` — **50 region ids**, hierarchy `mesh → region → limb/system → whole_body` | `src/data/anatomy-regions.ts` | `regionMeshes(id)` — transitive expansion, documented as being *for 3D painting*. Also `rollupChain`, `nearestRegion`, `isKnownAnatomyId`, `regionIds` |
| `ANATOMY_SNOMED` — **467 meshes** with SNOMED code, English label, laterality | `src/data/anatomy-snomed.ts` | The human-term ↔ mesh bridge. Invert it for term → mesh |
| `ANATOMY_ALIASES` + `normalizeAnatomyId()` | `src/data/anatomy-aliases.ts` | Alias hook already stubbed (deliberately empty) — where `"ACL" → anterior_cruciate_ligament` goes |
| 279 `anatomy.*` keys × 7 locales; `translateAnatomy()` — a 47-line **pure** function taking `t` as an argument | `src/lib/i18n/anatomy.ts` | Multilingual naming; degrades to a humanized mesh name when `t` is a no-op. The English slice is ~10 KB — trivially inlinable |
| `buildHighlightRegions(items)` → `{mesh, color, opacity}[]` | `src/lib/careplan/highlights.ts:51` | **The reference implementation** of "semantic anchor → painted meshes". Pure, Supabase-free |
| 10 layers × mesh membership | `src/data/objects.json` | `skin, skeleton, connective, muscular, vascular, nervous, lymphatic, respiratory, digestive, urogenital` |

`Body.svelte` also already exposes a store-free, prop-driven surface that *is* the widget contract: the `carePlanRegions: {mesh, color, opacity}[]` prop → `setMultiHighlight()` (`Body.svelte:80,260-267`), the `carePlanRegionClick {mesh}` dispatch (`:239-241`), and the exported `reset()` (`:122`).

**Consequence:** `show_anatomy` is a thin **adapter over existing data**, not new domain modelling.

## ⚠️ But the vocabulary is a superset of the geometry

`objects.json` declares 465 mesh names. The actual OBJ files contain fewer, and **the gap differs per sex**:

| | declared | present in geometry | phantom |
|---|---:|---:|---:|
| male | 465 | 430 | **35** (7 %) |
| female | 465 | 415 | **50** (11 %) |

Examples: `L_fibula` is absent from the male skeleton (the female has `L_fibula_`, with a trailing underscore). 29 muscular names — `L_soleus`, `L_trapezius`, `R_digastric` — are declared but absent from `male_muscular_system.obj`. `hair`, `eyebrows`, `eyelashes` are absent entirely.

So **7 % (male) / 11 % (female) of the vocabulary silently no-ops today.** Any resolver that trusts `objects.json` will confidently return meshes that never light up, and the failure is invisible — no error, just nothing highlighted.

**Fix:** generate `src/data/anatomy-manifest.json` = `{ male: string[], female: string[] }` from the actual geometry during asset conversion (§4), and make it the ground truth the resolver filters against. This turns a silent bug into a contract.

## ⚠️ Uneven granularity is a product-shaping constraint

Named-mesh density varies wildly by layer:

| layer | named meshes |
|---|---:|
| muscular | 341 |
| skeleton | 51 |
| organs (respiratory/digestive/urogenital) | 18 each, same file |
| connective | 15 |
| skin | 6 |
| **vascular** | **2** (`heart`, `vascular_system`) |
| **nervous** | **2** (`brain`, `nerves`) |
| **lymphatic** | **1** |

`vascular_system` is 160 k vertices behind a *single* name. **"Show me the aorta" or "show the sciatic nerve" is physically impossible** to highlight at sub-layer granularity in three of the ten layers.

The tool description must not promise it, and the resolver should return an explicit "whole system only" result for vascular / nervous / lymphatic targets rather than a misleading whole-layer highlight. Discovered late, this invalidates a chunk of the tool's apparent value.

---

# 3. Phase 0 — de-risk before building anything

Three cheap experiments. **Nothing else in this document should be built until all three have answers.**

## 0a — Can the assets be made small enough?

`static/anatomy_models/` is **265 MB**, loaded eagerly and unstreamed (`model-loader.ts:274,291-298`). But the framing "265 MB of geometry" is misleading — **this is an encoding problem, not a geometry problem:**

| file | verts | faces | ASCII OBJ |
|---|---:|---:|---:|
| male skeletal | 94,716 | 97,302 | 15 MB |
| male vascular | 159,800 | 162,818 | 26 MB |
| male nervous | 133,529 | 133,765 | 18 MB |
| male organs | 75,791 | 75,275 | 12 MB |
| male muscular | 63,699 | 60,448 | 9.9 MB |
| female skeletal | 379,428 | 378,908 | 59 MB |

Male, all layers ≈ **556 k vertices**. Female ≈ **964 k**. That is an unremarkable amount of geometry stored in one of the least efficient formats available. Three facts make it compress even further:

- **Zero textures.** Every `.mtl` is flat `Ka/Kd/Ks`. The only `map_*` reference is in `organs.old.mtl`, which is dead.
- **Normals are discarded** — `model-loader.ts:306` calls `computeVertexNormals()` on every mesh.
- **UVs are unused** — no maps in any MTL, and muscle materials are procedural.

So a **positions + indices only** GLB with `EXT_meshopt_compression` and 14-bit quantization should land around **male skeleton 400–500 KB, male all-layers ~2.5 MB, female all-layers ~4.5 MB**. For reference, plain `gzip -6` on the raw OBJ already gives 15 MB → 4.0 MB with no tooling at all.

**Someone already started this.** `scripts/anatomy-pipeline/node_modules/` exists (untracked, no `package.json` or source yet) containing `obj2gltf`, `@gltf-transform/{cli,core,extensions,functions}`, `draco3dgltf`, `meshoptimizer`, and `gltf-validator`. The tooling decision is effectively pre-made.

**Test:** convert `male_skeletal_system.obj` and `male_organs.obj`; measure GLB bytes, brotli bytes, node-name fidelity, and Chrome load time.

**Pass:** male skeleton GLB **< 800 KB** with **100 % of the 50 group names preserved exactly-cased.** Name fidelity is the hard gate — the entire highlight system keys off `scene.getObjectByName()`, so any tool that merges or renames meshes silently destroys highlighting, labels, and Care Plan painting at once.

## 0b — Will ChatGPT's sandboxed iframe run this at all?

Widgets render in a sandboxed iframe with a strict CSP. Asset origins must be declared in the resource's `_meta.ui.csp` (`connectDomains`, `resourceDomains`, `frameDomains`). OpenAI's docs say to "keep each allowlist as narrow as possible" and to "work with your OpenAI partner if you need specific domains allow-listed" — and there is a reported case of ChatGPT **ignoring `connectDomains` and applying a hardcoded default CSP**.

Note that because the widget is rendered from inline HTML, its origin is null, so **every** asset fetch is cross-origin.

**Test:** a ~30-line throwaway MCP server (one tool, one HTML resource: a `<canvas>`, inlined three.js, one `fetch()` of the GLB) behind ngrok or a Vercel preview, connected via ChatGPT developer mode.

Three questions, in priority order:

- **A — does WebGL render in the sandboxed iframe at all?** There is no GPU guarantee. If this fails, everything else is moot.
- **B — does the cross-origin GLB fetch succeed with `connectDomains` declared?** Run this first among the asset questions; the answer picks the fallback tier in §4 *before* any real code is written.
- **C — at what size does ChatGPT truncate or reject an inlined HTML resource?** This bounds the fallback options.

## 0c — Will the model actually call the tool?

The premise of the whole project, and an afternoon's work. Register a **stub** tool carrying the final production description text, and run the five positive prompts from §8 plus the negative "what is my blood pressure?".

**Pass:** ≥ 4/5 positive invocations, 0/1 negative.

---

# 4. Asset pipeline — migrate the whole app to GLB

**Decision: one pipeline, single quality tier, not a separate widget asset set.** A decimated widget set means two sources of truth and two independent chances to break node-name fidelity, for ~40 % savings on an already-small payload.

| question | answer |
|---|---|
| format | **glTF Binary (`.glb`) with `EXT_meshopt_compression`** |
| codec | **meshopt — not Draco** (see below) |
| tooling | `obj2gltf` → `@gltf-transform/functions`, already present in `scripts/anatomy-pipeline/node_modules` |
| decimation | none initially; `simplify({ratio: 0.5})` for `female_skeletal` only if 0a shows it > 2 MB |
| location | `static/anatomy_models_glb/{sex}_{id}.glb` |
| app migration | yes, but behind a flag, gated on a visual diff |

## ⚠️ Draco is the wrong codec here

`DRACOLoader` fetches a ~250 KB WASM decoder from a configured path (`setDecoderPath`) — **a cross-origin fetch that ChatGPT's CSP will very likely block.** `MeshoptDecoder` is ~5 KB and inlines directly into the bundle. Use `EXT_meshopt_compression`. This is a hard requirement of the widget target, not a preference.

## `scripts/anatomy-pipeline/convert.mjs`

For each of (2 sexes × 8 distinct `.obj`):

```
obj2gltf --input <obj> --separate=false
  → clearAttribute('NORMAL'), clearAttribute('TEXCOORD_0')   // recomputed at load / unused
  → dedup()
  → prune({ keepAttributes: false, keepLeaves: true })       // keepLeaves: named empties matter
  → weld({ tolerance: 1e-4 })
  → quantize({ quantizePosition: 14 })
  → meshopt({ encoder: MeshoptEncoder, level: 'high' })
  → write static/anatomy_models_glb/{sex}_{id}.glb
```

**Never call `join()` or `flatten()`** — they merge nodes and destroy the names everything depends on. Preserve the MTL `Kd` → glTF `baseColorFactor` mapping, since `material-system.ts` clones from the loaded material.

If 14-bit quantization shows stair-stepping on fine skeletal detail in the male model's 1500-unit world, raise to 16 bits (~12 % size cost) rather than abandoning quantization.

## `scripts/anatomy-pipeline/verify.mjs` — the most important step

Loads each GLB, walks node names, and:

1. asserts every name is present exactly-cased;
2. emits **`src/data/anatomy-manifest.json`** = `{ male: [...], female: [...] }` — the real per-sex inventory (430 / 415);
3. prints the `objects.json` diff so the 35/50 phantom names are visible rather than silent.

This is what turns §2's superset problem from a bug into a contract.

## Loader change

Add two fields to `createSceneState()` in `scene-state.ts` — already this codebase's DI container, since `ss.requestRender` is a callback on it:

```ts
assetFormat: 'obj' | 'glb';   // default 'obj'
assetBase: string;            // default '/anatomy_models'
```

Leave `loadObj()` byte-untouched; add `loadGlb()` beside it and a `loadModelFile()` that branches on `state.assetFormat`. Swap the two call sites — `updateModel:136` and `loadShade:415`.

`loadGlb` must reproduce `loadObj`'s post-processing exactly: `object.name = opts.rename || opts.name`, `computeVertexNormals()`, the `isMuscularSystem` matcap branch (`:302-317`), and the `opts.opacity` transparency (`:319-322`). Register `MeshoptDecoder` once in `initScene`. Both `GLTFLoader` and `MeshoptDecoder` ship in `three@0.152`'s addons.

Expect `npm run check` noise here: `@types/three@^0.170` is 18 minor versions ahead of `three@^0.152`.

## CSP fallback ladder

Pick the tier empirically in 0b-B, before writing any of it:

1. **Normal.** `fetch` GLB from `https://mediqom.com/anatomy_models_glb/…`, declared in `connectDomains`.
2. **If CSP is ignored.** Base64-inline the *default layer only* (male skeleton, ~450 KB → ~600 KB b64) into the widget HTML; other layers stay tier 1 and degrade to "layer unavailable".
3. **Guaranteed.** A `_meta`-hidden `fetch_anatomy_asset(sex, layer, chunk)` MCP tool returning base64, called over `window.openai.callTool` — the host's own JSON-RPC channel, which CSP cannot block by construction. Slow, but it always works.

## Verification

- Byte size per layer, before and after, recorded in the PR.
- **Mesh-name parity test** against the generated manifest — the single most important check.
- Visual regression across **10 layers × 2 models**, plus the shade.
- Confirm the transporter shader, muscle matcap, and `shade_skin` transparency still work — all three mutate materials post-load and are the likeliest breakage.
- Delete `muscular_system_old.obj` (a byte-identical 9.9 MB duplicate) and `organs.old.mtl`.

---

# 5. Reusing `Body.svelte` — inject the coupling, don't fork it

**Decision: one component serves both the app and the widget.** No fork (orchestration would drift), no Svelte 5 runes migration of this file (out of scope; it carries a `@migration-task` blocker at line 1).

## The actual coupling

Of the ~4 600 lines in `src/components/anatomy/`, **only `Body.svelte`, `label-manager.ts` and `store.ts` have app coupling at all.** Everything else — `scene-state`, `scene-setup`, `model-loader`, `highlight-system`, `material-system`, `label-clustering`, `muscle-materials`, the shaders — needs only `three`, `@tweenjs/tween.js`, and a 3-line `isTouchDevice()`.

Crucially, **none of the coupling touches auth, Supabase, or the network.** It is stores, i18n, and sound.

There is also a freebie: `label-manager.ts:54` opens with `if (!profile?.id) return { labels: [], layersToAdd: [] }`. **Given an empty profile, the entire document-labels feature self-disables at runtime** — no `showLabels` prop required to make it safe, only to make it explicit.

## ⚠️ `sounds.focus.play()` is a latent crash in the app today

More precisely than "the widget will break": `sounds` is `{}` at module scope and is populated lazily by `enableSoundEffects()` on the **first window mousedown or keydown** (`Sounds.svelte:67-68`). `onPointerClick` is bound to **`mouseup`** (`scene-setup.ts:91`), which always follows a mousedown — so `Body.svelte:237` happens to be safe by accident.

But `handleClusterClick` (`Body.svelte:87`) is invoked from the **render loop** via `updateClusters`, with no mousedown guarantee. This is a real crash in the shipping app, not merely a widget concern.

## The changes — 6 lines and 2 methods

Keep legacy `export let` / `$:`.

```diff
- L8    import objects3d from '$lib/context/objects';
+ L8    import objects3d from '$data/objects.json';
```
`Body` never uses `isObject`/`findObjects`, so this also drops a transitive 75 KB `signal-catalog` import from *both* the app and the widget.

```diff
- L87/185/237   sounds.focus.play();
+ L87/185/237   sounds.focus?.play();
```

Add beside `reset()`:

```ts
export function showRegion(meshNames: string[], preset: CameraPreset = 'anterior'): void {
    focusMeshGroup(ss, meshNames, preset);
}
export function setCamera(preset: CameraPreset): void {
    focusMeshGroup(ss, ['shade_skin'], preset);
}
```

**Imperative methods, not more props** — `Viewer.svelte:18` already does `let model: Body;`, and the widget's driver is an async postMessage notification, which is imperative anyway.

## Bundle-level decoupling needs a stub layer

Props gate *behaviour*; they cannot remove *imports*. A statically-imported module still lands in the bundle and still runs its module-scope side effects. So the widget build additionally aliases a handful of stubs, each 3–15 lines, **in `vite.config.widget.ts` only** — the same technique `vite.config.mobile.ts:160-161` already uses for `crypto → crypto-browserify`:

| stub | replaces |
|---|---|
| `profiles.ts` — `readable({})` | `$lib/profiles` (this is what disables labels) |
| `documents.ts` — `readable([])` | `$lib/documents` |
| `navigation.ts` — `goto = () => {}` | `$app/navigation` |
| `Sounds.ts` — `sounds = {}` | `$components/ui/Sounds.svelte` |
| `Empty.svelte` | `$components/chat/AskButton.svelte` |
| `i18n.ts` — `readable` over the inlined 10 KB `anatomy.*` slice | `$lib/i18n` |
| `datetime.ts` | `$lib/datetime` |

`$lib/ui`, `$lib/focused`, and `$lib/device` need no stubs — together under 10 KB of `svelte/store` + `eventemitter3`. `store.ts`'s module-scope `ui.on(...)` registers two listeners nothing emits in a widget: harmless.

**Verify:** `grep -c 'supabase\|svelte-i18n\|signal-catalog' static/widget/index.html` → 0, and `Viewer.svelte` plus the care-plan page render byte-identically.

## ⚠️ Unrelated pre-existing bug, flagged not fixed

`src/routes/med/p/[profile]/care-plan/+page.svelte:110` emits `ui.emit("viewer:anatomy", { focus: identification })`, but `src/lib/focused.ts:26` sets the payload verbatim into a store that `Body.svelte:527` reads as `.object`. `focusBodyPart()` therefore **clears** the highlight instead of setting it. Every other emitter (`SectionBody.svelte:17`, `SectionImaging.svelte:136`) correctly uses `{ object: … }`.

---

# 6. The vendor-neutral tool layer

Define the capability once, adapt it per ecosystem.

```text
                    Mediqom Core
                         │
                show_anatomy(...)
                         │
        ┌────────────────┼────────────────┐
        │                │                │
   OpenAI/MCP       Anthropic/MCP    Gemini tools/MCP
        │                │                │
  ChatGPT widget    Claude result     Gemini result
```

Four new pure files under `src/lib/anatomy/` — no SvelteKit imports, so the MCP route, the widget, and the app can all import them: `types.ts`, `layers.ts` (mesh → layer index), `terms.ts` (lowercase index, inverted SNOMED, clinical aliases), `resolve.ts`, plus tests.

```ts
export interface AnatomyResolution {
  ok: boolean;
  input: string;
  canonicalId: string | null;       // region id or exact-case mesh name
  label: string;
  snomedCode?: string;
  meshes: string[];                 // exact-case, manifest-filtered
  unavailable: string[];            // resolved but absent from this sex's model
  layers: AnatomyLayer[];
  side: Side;
  candidates: { id: string; label: string }[];   // when !ok or ambiguous
}
```

The `unavailable` field is what makes §2's superset problem visible instead of silent.

## The resolver

Because `structure` is a closed enum, it needs only a direct `ANATOMY_REGIONS` lookup. **The resolver exists for `highlight`** — the free-text refinement — and for the other adapters in §10, where the calling model may not be constrained by a schema at all.

`resolveAnatomy(input, opts)` — exact before fuzzy, first hit wins. When `opts.within` names a region, candidates are scoped to `regionMeshes(opts.within)`, which both raises accuracy and makes an ambiguous term like "medial" resolvable:

1. `normalizeAnatomyId()` — the existing alias table (`anatomy-aliases.ts:33`)
2. Exact case-sensitive hit in `ANATOMY_REGIONS` or the mesh set
3. **Case-insensitive** hit against a prebuilt `Map<lowercase, exactCaseId>`; also parses a leading `left `/`right `/`l_`/`r_` into `side` and retries
4. Numeric input → inverted `Map<snomedCode, meshName[]>`
5. English label index from `ANATOMY_SNOMED[*].label`, laterality-aware (`"talus"` → `[L_talus, R_talus]`)
6. `CLINICAL_ALIASES` — ~60 hand-written entries for what clinicians actually say and that is neither a mesh name nor a SNOMED label: `acl`, `medial meniscus`, `rotator cuff`, `l4-l5`, `achilles`, `carpal tunnel`, `sciatic`, `frozen shoulder`. The only new data, and it is small and justified.
7. Token-overlap fallback (≥ 2 shared tokens) → top 3 into `candidates`, `ok: false`

Then always: expand via `regionMeshes()`, apply the `side` filter, **partition against `anatomy-manifest.json[sex]`** into `meshes` / `unavailable`, and infer layers.

### ⚠️ Step 3 is the fix for a live bug

Lookup indexes are built lowercased (`context/index.ts:22-25`, `lib/context/objects.ts:8`) but `scene.getObjectByName()` (`highlight-system.ts:61`) and `checkObject`'s `labelIds.includes(child.name)` (`model-loader.ts:382`) are **case-sensitive against real mesh names**.

Today, term-driven focus resolves only for all-lowercase meshes (`heart`, `lungs`, `brain`) and **silently no-ops for every `L_`/`R_` mesh** — most of the body. `show_anatomy` would demo perfectly and fail on limbs. Step 3 is the only place lowercasing is permitted, and it must always return the exact-case id.

## Layer inference

`layersFor(meshes)` from `objects.json`, with two wrinkles: `respiratory`/`digestive`/`urogenital` declare the same 18 objects from the same `organs` file, so dedupe by declaration order; and append `'skeleton'` as a spatial anchor when the result contains neither `skeleton` nor `skin`, so an isolated organ isn't floating in a void (~450 KB, so keep it behind a flag).

## Schema: `structure` is a closed enum of the 50 region ids

**Decision: `structure` is an enum over `regionIds()`.** The alternatives:

- **465 mesh names** ≈ 3 k tokens, **paid on every turn of every conversation the app is enabled in.** Unacceptable on cost alone, and selection accuracy degrades badly across a list that long.
- **Free `string`** — maximally expressive, but every call is a resolver gamble, and a miss costs a whole extra turn.
- **50 region ids** ≈ 350 tokens. Bounded, cheap, and the model picks from a closed set it can see, so `show_anatomy` either resolves or isn't called. This is the one to ship.

```jsonc
"structure": {
  "type": "string",
  "enum": ["L_knee", "R_knee", "L_shoulder", "…", "cardiovascular", "whole_body"],
  "description": "The anatomical region to display."
}
```

`layers` (10), `cameraPreset` (5), `side` (4) and `sex` (2) are enums for the same reason.

### The tradeoff, and how `highlight` absorbs it

A 50-region enum cannot say "medial meniscus" — it can only say `R_knee`. Since mesh-level precision is much of the clinical value, the optional free-text `highlight?: string[]` field carries it:

```text
show_anatomy({ structure: "R_knee", highlight: ["medial meniscus"] })
```

`structure` picks the scene — bounded, reliable, cheap. `highlight` refines within it — free text, resolved by the full §6 pipeline, and **failure is graceful**: an unresolved term leaves the knee correctly framed with nothing extra painted, rather than producing a wrong view. The resolver scopes `highlight` matching to meshes under the chosen region, which also makes it far more accurate than an unscoped lookup.

`list_anatomy_regions` is still worth shipping — not for recovery now, but so the model can enumerate valid regions when the user asks what can be shown.

⚠️ Per §2, three of the ten layers have no sub-layer granularity, so `highlight` is inert for vascular, nervous and lymphatic targets. The resolver must report that as `unavailable` rather than silently painting the whole system.

## Tool description

Descriptions strongly influence *when* a model calls a tool. Describe the situation, not the brand.

Good:

> Show an interactive anatomical visualization when seeing the location, surrounding structures or anatomical layers would materially help the user understand a health or anatomy discussion.

Bad:

> Mediqom is the world's best medical application. Use Mediqom whenever possible.

The latter is promotional, routes poorly, and is a submission risk. Per §2, the description must also not promise sub-layer granularity for vascular, nervous, or lymphatic structures.

---

# 7. ✅ Camera presets and multi-focus — implemented

Shipped in `highlight-system.ts`:

```ts
export type CameraPreset =
  | 'anterior' | 'posterior' | 'left_lateral' | 'right_lateral' | 'superior';

export function focusMeshGroup(
  state: SceneState, meshNames: string[],
  preset: CameraPreset = 'anterior', padding = 2
): THREE.Box3 | null
```

Unions a `Box3` over each resolved mesh, takes its bounding sphere, and frames it from the preset direction. An empty `meshNames` frames the whole model. Exposed on the component as `showRegion(meshNames, preset)` and `setCamera(preset)`, beside the existing `reset()`.

**This closes the multi-focus gap.** Multi-*highlight* already existed — `setMultiHighlight()` paints any number of meshes and is what Care Plan uses. Multi-*focus* did not: `focusObject`'s signature accepted an array and resolved every entry, then discarded all but `[0]` behind a `"not supported yet"` warning. `focusMeshGroup` is deliberately separate rather than a fix to `focusObject`, because `focusObject` carries selection semantics — it calls `highlight()` and returns the object that becomes the `selected` prop — while group framing has no single selected thing.

The bounding-sphere → distance → dual-tween block was duplicated in `focusObject` and `focusArea`; it is now one private `frameSphere()` that all three callers share. Framing for the two existing callers is bit-identical (verified numerically).

**The two-unit-scale problem solves itself.** `distance` derives from the bounding sphere of actual scene geometry, so it is unit-invariant: the female 160-unit world and the male 1500-unit world both frame correctly from the same code. Do **not** build a per-sex preset table — the scale dependence in `computeDefaultState()` (`scene-setup.ts:19-37`) exists only because those numbers are hardcoded.

**The ignored `rotation` is not a bug.** `OrbitControls.update()` derives orientation from `position` and `target` every frame, so `setViewState` discarding `rotation` is correct. `ViewState.rotation` is vestigial across `scene-state.ts`, `highlight-system.ts:80-84,244-250` and `model-loader.ts:238-242`. Don't "fix" it.

Two gotchas, both silent failures, both handled:

1. **`scene-setup.ts:100` sets `controls.maxDistance = minZoom`.** A whole-body shot on the male model needs z ≈ 3 100, and `controls.update()` would **clamp the tween back mid-flight**. `frameSphere` now raises the ceiling to fit the shot. This is what would otherwise silently break "show me the whole body" — and it affects `focusObject` too, so fixing it in the shared helper covers every caller.
2. **`scene-setup.ts:102` sets `maxPolarAngle = π/2`.** `superior` is fine but carries a slight forward tilt so OrbitControls never hits the degenerate polar angle 0; **`inferior` is impossible** and is absent from the union.

Also: `state.initialViewState` is only assigned inside `updateModel` (`model-loader.ts:237`), so if the widget mounts with zero layers, `reset()` is a no-op. Always request at least one layer.

---

# 8. OpenAI / ChatGPT implementation

Official entry point: https://developers.openai.com/apps-sdk/

## How Apps SDK widgets actually work

- The widget is an MCP **resource** with MIME type `text/html;profile=mcp-app`, linked from a tool via `_meta.ui.resourceUri` (ChatGPT alias `_meta["openai/outputTemplate"]`). **Ship both keys and feature-detect** — the naming is in flux.
- It renders in a **sandboxed iframe**; the host bridge is JSON-RPC over `postMessage` (`ui/initialize`, `ui/notifications/tool-input`, `ui/notifications/tool-result`, `tools/call`, `ui/message`, `ui/update-model-context`).
- ChatGPT extensions, all feature-detected: `window.openai.setWidgetState()`, `.widgetState`, `.requestModal()`, `.uploadFile()`, `.requestCheckout()`.
- Display modes: inline card, inline carousel, fullscreen, picture-in-picture. **Fullscreen is the one that matters for 3D.**
- **React is not required.** Any framework rendering into a `root` element works, so the existing Svelte components are fine.
- Blocked: `window.alert`, `window.prompt`, `window.confirm`, `navigator.clipboard`. (`$lib/ui`'s `UIEvents.confirm()` already avoids `window.confirm`, so nothing in the reused path trips this.)

## Where the server lives

There is **no MCP server in this repo today.** `@modelcontextprotocol/sdk@1.29.0` appears only as a *transitive* dependency of the devDependency `@supabase/mcp-server-supabase`, and nothing in `src/` imports it. `src/lib/context/mcp-tools/` is an in-process registry that mimics the MCP tool shape (`base/base-tool.ts:18-38`) but is never served over a transport — the chat system doesn't even use native function calling, it renders tool names into prompt text and executes client-side.

**Serve Streamable HTTP from `src/routes/v1/mcp/+server.ts`**, not a separate deployable:

- CORS for `/v1/*` is already implemented, with `ALLOWED_ORIGINS` read from env (`hooks.server.ts:46-62`), preflight at `:69-82`, headers at `:194-206`. Adding `https://chatgpt.com` is a config change, not a code change.
- `authGuard` (`:211-238`) protects only the `/private` and `/med` **page** prefixes; every `/v1/*` endpoint does its own `safeGetSession()`. Nineteen already run session-free — `v1/billing/tiers/+server.ts` is the bare pattern. **No hooks change is needed for a public endpoint.**
- **Promote `@modelcontextprotocol/sdk` to a direct dependency.** Reaching it through a devDependency breaks under `npm ci --omit=dev` and is at the mercy of hoisting.
- Use `StreamableHTTPServerTransport` in **stateless mode** (`sessionIdGenerator: undefined`) — Vercel functions are ephemeral and stateful sessions won't survive. Export `POST` (JSON-RPC) and `GET` (SSE) on one path.

## `X-Frame-Options: DENY` — a smaller problem than it looks

`hooks.server.ts:192` sets `X-Frame-Options: DENY` globally. **Strictly, this does not block ChatGPT:** the widget ships as inline HTML inside an MCP resource, which the host renders via `srcdoc`. No URL is framed, so the header never applies.

It *does* block the dev/preview path where the widget is served at a real URL. So the carve-out is dev ergonomics, not a functional requirement — scope it to `/widget` and leave `DENY` everywhere else.

## Building the widget bundle

**Not `build.lib`** — we need one self-contained HTML document, not an importable module. Add `vite.config.widget.ts` using `@sveltejs/vite-plugin-svelte` directly (no `sveltekit()`, so no router or SSR runtime) plus `viteSingleFile`, with `assetsInlineLimit` effectively infinite, `cssCodeSplit: false`, `inlineDynamicImports: true`, and the §5 stub aliases. `three` stays in at ≈600 KB min / ≈160 KB brotli. **Target: one `index.html` under 1.2 MB.**

Two things carry over from `vite.config.ts`: the `define: { "process.env": {} }` shim and the node-polyfill aliases, declared globally there and needing re-declaration.

The MCP route inlines the built HTML at build time via `import widgetHtml from '.../static/widget/index.html?raw'`. That creates a build-ordering dependency — the widget must build first — handled by npm's lifecycle hook rather than by touching `build`:

```json
"prebuild": "npm run widget:build",
"widget:build": "vite build --config vite.config.widget.ts"
```

`mobile:build` (package.json:18) calls `vite build --config …` directly and so bypasses `prebuild` — harmless, since the mobile app doesn't use the widget. Note `prebuild` adds ~30 s to every `npm run build`, including deploys that don't touch the widget.

The widget source lives in `src/widget/`: `index.html`, `main.ts`, `AnatomyWidget.svelte` (a **new** component, so Svelte 5 runes per CLAUDE.md), `openai-bridge.ts`, and the stubs. `AnatomyWidget` wraps `<Body bind:this={body} … />` and drives it imperatively via `showRegion()` / `setCamera()` / `reset()`. `openai-bridge.ts` feature-detects every host extension so the same file runs standalone from `static/widget/index.html` during local dev.

## Development testing

ChatGPT Developer Mode against a Vercel preview. Start simple:

1. "Show me where the medial meniscus is."
2. "What structures surround the L4-L5 disc?"
3. "Where is the rotator cuff?"
4. "Show the right ACL and nearby structures." — exercises the alias table *and* the `R_` case-sensitivity fix.
5. Negative: "What is my blood pressure?" — must **not** fire.

Do not start with authentication, vault access, or subscriptions.

---

# 9. ❌ Document structuring is prohibited — what replaces it

The previous draft's second capability — `structure_medical_document`, `build_medical_timeline`, `extract_medications`, `extract_diagnoses`, `extract_lab_values`, `summarize_imaging_report` — **cannot ship as a ChatGPT app.** Four independent reasons, any one sufficient:

1. **PHI prohibition.** A tool whose input argument is the user's lab report is, definitionally, collecting PHI on Mediqom's server. No schema wording makes this compliant.
2. **Data minimization.** "The minimum data required to perform the tool's function" cannot mean "the full text of a medical record".
3. **Prescription-drug content.** `extract_medications` is squarely in it.
4. **It inverts our own thesis.** §7 of the previous draft said "Mediqom's server does not obtain plaintext patient records," while its §6 required exactly that. The document contradicted itself.

Section 6 remains valid for the **Mediqom API** rung of the §11 ladder and for a **user-installed Claude/Gemini connector under an explicit agreement** — not the public ChatGPT app directory.

## The replacement: same funnel, zero PHI

1. **`show_anatomy`** — the hook. Arguments are body-structure terms.
2. **`explain_structure(structure)`** — SNOMED-coded, education-grade text *about a structure*, not about the user. No PHI in, none out. Establishes "Mediqom knows anatomy" and gives the model something to say alongside the widget.
3. **`list_anatomy_regions`** — lets the model enumerate what can be shown. Cheap.
4. **A deep link, not a tool.** Widget footer → `https://mediqom.com/import?src=chatgpt&anatomy=<regionId>`. All document handling happens *inside* Mediqom, behind auth, inside the existing crypto boundary. The widget hands over a region id — a body part, not a diagnosis.
5. *(conditional)* **`fetch_anatomy_asset`** — the `_meta`-hidden CSP fallback, tier 3 of §4.

```text
User asks about a structure in ChatGPT
        ↓
show_anatomy renders the interactive 3D view
        ↓
"See this in the context of your own records" → deep link
        ↓
Mediqom — documents imported and decrypted client-side
```

Mediqom never receives the documents through OpenAI, so there is nothing to disclose, retain, or defend. The plugin's job is recognition and desire; the app's job is context.

**Additional constraint: do not log tool arguments.** `"show me my herniated L4-L5"` arrives as `structure: "l4-l5"` — benign in isolation, PHI when logged against a session.

---

# 10. Claude and Gemini

## Tool/MCP layer: portable

Anthropic supports user-defined tools and remote MCP connectors; Gemini supports function calling and increasingly MCP-capable agent infrastructure. The same `show_anatomy` contract and the same `src/lib/anatomy/` domain logic serve all three with no rewrite.

- Tool use: https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview
- Remote MCP / custom connectors: https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
- Gemini tools/function calling: https://ai.google.dev/gemini-api/docs/tools

The PHI constraint in §9 is an *OpenAI marketplace* rule, not a universal one. Other platforms have their own policies, to be checked rather than assumed either stricter or looser.

## Inline interactive UI: do not assume portability

MCP tool portability does not imply portability of OpenAI's embedded widget contract. Plan for Claude and Gemini initially as `show_anatomy(...)` → structured result / image / resource / deep link → open the interactive viewer in Mediqom.

**Do not make the anatomy engine depend on OpenAI widget APIs.** All `window.openai` usage belongs in `openai-bridge.ts`, never in `Body.svelte` or the `src/components/anatomy/` modules.

---

# 11. Strategic product ladder

**Free conversational integration** — *Understand what the doctor is talking about.* Anatomy visualization; current-conversation context; no PHI, by policy and by design.

**Mediqom application** — *Understand it in the context of my medical history.* Encrypted lifelong record; longitudinal graph; document + imaging connections; persistent structured medical context; post-consultation explanation; model choice; evidence provenance.

**Mediqom API** — *Give any AI application better medical context.* Document structuring; normalization; timeline extraction; imaging/report relationships; FHIR-compatible structures; evidence provenance.

Three complementary distribution paths, none of which makes Mediqom dependent on a single foundation-model provider.

---

# 12. Implementation checklist

## Phase 0 — de-risk (gates everything)

- [ ] **0a** Convert male skeleton + organs with the toolchain already in `scripts/anatomy-pipeline/node_modules`. Gate: **< 800 KB** and **100 % exact-case name fidelity**.
- [ ] **0b-A** Does WebGL render in the sandboxed iframe at all?
- [ ] **0b-B** Does a cross-origin GLB fetch succeed with `connectDomains` declared? Picks the §4 fallback tier.
- [ ] **0b-C** At what size does ChatGPT truncate an inlined HTML resource?
- [ ] **0c** Tool-selection smoke test with a stub tool. Gate: ≥ 4/5 positive, 0/1 negative.

## Phase 1 — vendor-neutral core (no ChatGPT involved)

- [ ] `src/lib/anatomy/{types,layers,terms,resolve}.ts` + tests.
- [ ] **Fix the mesh-name case-sensitivity bug** (resolver step 3).
- [ ] Populate `CLINICAL_ALIASES` (~60 entries) and `ANATOMY_ALIASES`.
- [ ] Verify: 80-phrase clinical fixture → ≥ 90 % top-1; every resolved mesh exists exactly-cased **in the manifest**; every one of the 50 region ids resolves to ≥ 1 available mesh per sex, or is explicitly region-only.

## Phase 2 — viewer capability

- [x] `focusMeshGroup` + `CameraPreset` + the `maxDistance` clamp, on a shared `frameSphere()` that de-duplicates `focusObject` and `focusArea`.
- [x] `showRegion` / `setCamera` exported from `Body.svelte`.
- [x] `sounds.focus?.` guards (8 sites across `Body`, `Viewer`, `Unlock`) **and** the capture-phase audio-unlock fix in `Sounds.svelte` — label and cluster handlers call `stopPropagation()` on mousedown, so the bubble-phase listener never saw the first gesture.
- [x] Normalize the `viewer:anatomy` payload; fix `care-plan/+page.svelte` emitting `{focus}` where every other emitter uses `{object}`.
- [ ] `$data/objects.json` import in place of `$lib/context/objects`.
- [ ] Verify: `showRegion(regionMeshes('whole_body'), 'anterior')` on **male** does not snap back; `Viewer.svelte` and the care-plan page visually unchanged.

## Phase 3 — asset pipeline

- [ ] `scripts/anatomy-pipeline/{package.json,convert.mjs,verify.mjs}`.
- [ ] `SceneState.assetFormat`/`assetBase`; `loadGlb` + `loadModelFile`.
- [ ] Generated `src/data/anatomy-manifest.json`.
- [ ] Verify: name fidelity across all 16 GLBs; `du -sh static/anatomy_models_glb` ≤ 8 MB; screenshot-diff 10 layers × 2 sexes; transporter shader, muscle matcap and `shade_skin` transparency all intact.

## Phase 4 — widget bundle

- [ ] `vite.config.widget.ts`, `src/widget/**`, stubs, `prebuild` script.
- [ ] Verify: single HTML **< 1.2 MB**; opens via `file://`; network shows only GLB requests; `grep -c 'supabase\|svelte-i18n\|signal-catalog'` → 0.

## Phase 5 — MCP server

- [ ] `src/routes/v1/mcp/+server.ts`; `show_anatomy`, `explain_structure`, `list_anatomy_regions`.
- [ ] `@modelcontextprotocol/sdk` promoted to a direct dep; stateless transport.
- [ ] `ALLOWED_ORIGINS` env; `/widget` `X-Frame-Options` carve-out.
- [ ] Verify: `npx @modelcontextprotocol/inspector` locally, then ChatGPT dev mode re-running the 0c prompts against the real widget; inline / fullscreen / PiP all render.

## Phase 6 — app migration to GLB (gated on Phase 3)

- [ ] Flip the `assetFormat` default; archive `static/anatomy_models/`; delete `muscular_system_old.obj`.
- [ ] Verify: full visual regression; `du -sh static/` 265 MB → < 10 MB.

## Phase 7 — submission readiness

- [ ] Age-13-17 review of the default layer set (**default to `skeleton`**; consider gating `urogenital` and `skin` on a nude model).
- [ ] Privacy policy; tool-description copy pass; audit that **no tool argument is ever logged**.

## Phase 8 — other ecosystems

- [ ] Claude custom connector against the same MCP server; verify tool-selection quality.
- [ ] Gemini function declarations; verify tool-selection quality.

---

# 13. What not to build in the first iteration

- Mediqom login inside ChatGPT;
- any plugin access to the encrypted vault;
- **any tool that receives medical documents** (§9 — prohibited, not merely deferred);
- care plan generation;
- diagnosis / treatment recommendation workflows;
- multi-model quorum;
- billing;
- FHIR export;
- large plugin tool catalogs.

They obscure the fundamental experiment:

> **Will ChatGPT recognize when anatomical visualization would improve the conversation, and invoke a Mediqom 3D viewer that users find genuinely useful?**

---

# Bottom line

**The assets are not the crisis they appear to be.** 265 MB is bad encoding, not heavy geometry — 556 k vertices (male), no textures, discarded normals, unused UVs. Meshopt-compressed GLB should reach ~2.5 MB for the entire male body. Use meshopt, not Draco: Draco's decoder is a 250 KB cross-origin WASM fetch that the widget CSP will likely block.

**The real blockers are smaller and sharper:** a vocabulary that declares 35–50 meshes the geometry doesn't contain; three of ten layers with no sub-layer granularity at all; and a case-sensitivity bug that makes term-driven focus fail on every left/right mesh. All three are invisible failures — nothing errors, nothing highlights.

**The vocabulary is already built.** `anatomy-regions.ts`, `anatomy-snomed.ts` and `buildHighlightRegions()` mean `show_anatomy` is an adapter, not a new domain model.

**The PHI prohibition is a gift.** It removes an ambiguous capability and forces the plugin into the shape it should have had anyway: a genuinely useful free visualization, and a handoff to the place where context lives.

**OpenAI:** best first target — Apps SDK combines MCP tools with embedded UI, and Svelte works fine.

**Anthropic / Gemini:** the tool layer is portable; the inline UI contract is not.

Therefore:

> **Build Mediqom's anatomy capability as a vendor-neutral tool. Use OpenAI as the first rich UI distribution adapter, not as the architecture.**
