# Mediqom AI Plugin / Tool Integration

> **Revision note (2026-08-07, second pass).** Re-verified against the codebase and
> against the *current* OpenAI rules — which have been **renamed from "Apps SDK" to
> "Plugins"** since the first pass. Five things changed materially:
>
> 1. **§9 was over-stated.** Document structuring is *constrained*, not categorically
>    prohibited. The PHI ban is unconditional and has no BAA path, but published
>    policy is **silent** on whether normalized clinical entities qualify — the
>    question the PRD's "host model as Node 0" architecture turns on. Verbatim
>    source snippets, however, must be dropped.
> 2. **New §9b: the promotion boundary.** We *may* suggest Mediqom inside the widget;
>    we may *not* put promotional language in model-readable fields, or point a CTA at
>    signup, subscribe or upgrade.
> 3. **Anonymity is now a compliance requirement, not just a product choice** — it is
>    what keeps the entities plausibly de-identified. Account linking would undermine it.
> 4. **§10 now carries a platform-sequencing decision.** ChatGPT first for anatomy;
>    Claude/Gemini/API first for the report wedge and acquisition.
> 5. **§5's component map was wrong.** `core/`, `interactions/` and `loaders/` are
>    empty; nearly every `Body.svelte` line reference had drifted; `sounds.focus` and
>    the `viewer:anatomy` payload bug are already fixed; `objects.json` exists twice.
> 6. **ChatGPT Health assessed** (§9b). **No partner program exists** — nothing to
>    apply to. Health has **no anatomy or imaging capability**, so the originality
>    risk earlier drafts feared does not apply to us. It is **US-only,
>    single-person, read-only and not zero-knowledge**, which is where the
>    remaining differentiation lives.
>
> Sections marked ✅ describe existing code. Claims marked ⚠️ are verified defects or
> open risks. Policy claims are labelled **documented**, **documented absence**, or
> **inference** — the distinction matters, because the decisive question is unresolved.

## Goal

Build a lightweight Mediqom integration for conversational AI platforms that gives the model a genuinely useful capability while driving discovery of the full Mediqom application.

The initial capability is the **interactive 3D anatomy viewer**. Per §9 and §10 it is also the only one that is clearly viable *on ChatGPT specifically* — the report-structuring wedge described in `Mediqom_Plugin_API_PRD.md` is sequenced onto Claude, Gemini and the Mediqom API instead.

The integration must preserve Mediqom's core architecture:

- patient records are encrypted client-side;
- Mediqom servers never receive decrypted patient records;
- the plugin/tool must not become a back door into the encrypted vault;
- the full Mediqom application remains the place where longitudinal medical context is decrypted and used;
- external AI platforms receive only information the user explicitly chooses to disclose.

The strategic positioning is:

> AI models compete on intelligence. Mediqom competes on medical context.

### The privacy boundary is now an external constraint too

OpenAI's plugin guidelines **prohibit apps from processing Protected Health Information**, require data minimization to "the minimum data required to perform the tool's function", and require suitability for ages 13–17.

This is largely the same line Mediqom already draws, enforced by someone else, and that alignment is worth stating explicitly in any submission. But it is **not** simply a restatement of our own boundary, and §9 works through where the two diverge:

- Our boundary is about *decryption* — the server cannot read the vault. OpenAI's is about *processing* — a far broader verb that reaches data we never store.
- Whether normalized clinical entities fall inside it is **unresolved in published policy**. That is the open question the report wedge depends on, not a settled prohibition.
- **The plugin requires no Mediqom account.** That is what keeps the entities plausibly de-identified, and it is a compliance position as much as a product one.

For the ChatGPT surface specifically, the practical shape is the *anatomy* capability plus an informational handoff — see §9b for exactly what that handoff may say, and §10 for why the other platforms are sequenced differently.

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
| `ANATOMY_SNOMED` — **466 meshes** with SNOMED code, English label, laterality | `src/data/anatomy-snomed.ts` | The human-term ↔ mesh bridge. Invert it for term → mesh. ⚠️ **343 of 466 (74 %) have an empty `snomedCode`** — see below |
| `ANATOMY_ALIASES` + `normalizeAnatomyId()` | `src/data/anatomy-aliases.ts` | Alias hook already stubbed (deliberately empty) — where `"ACL" → anterior_cruciate_ligament` goes |
| 279 `anatomy.*` keys × 7 locales; `translateAnatomy()` — a 47-line **pure** function taking `t` as an argument | `src/lib/i18n/anatomy.ts` | Multilingual naming; degrades to a humanized mesh name when `t` is a no-op. The English slice is ~10 KB — trivially inlinable |
| `buildHighlightRegions(items)` → `{mesh, color, opacity}[]` | `src/lib/careplan/highlights.ts:51` | **The reference implementation** of "semantic anchor → painted meshes". Pure, Supabase-free |
| 10 layers × mesh membership | `src/data/objects.json` | `skin, skeleton, connective, muscular, vascular, nervous, lymphatic, respiratory, digestive, urogenital` |

`Body.svelte` also already exposes a store-free, prop-driven surface that *is* the widget contract: the `carePlanRegions: {mesh, color, opacity}[]` prop (`Body.svelte:82`) → `setMultiHighlight()` (`:272-281`, dispatched at `:278`), the `carePlanRegionClick {mesh}` dispatch (`:253-254`), and the exported `reset()` (`:124`).

**Consequence:** `show_anatomy` is a thin **adapter over existing data**, not new domain modelling.

## ⚠️ The SNOMED table is 74 % unpopulated

`anatomy-snomed.ts` has 466 entries, but **343 carry `snomedCode: ""`**. The file's own header says so: *"seed entries populated for well-known structures. Remaining entries have empty snomedCode — fill in from SNOMED CT Browser."*

This matters in two places. §6's resolver step 4 (numeric input → inverted `Map<snomedCode, meshName[]>`) covers only the populated quarter, and `AnatomyResolution.snomedCode` will be absent for most meshes. The English `label` field is populated throughout, so **step 5 (label index) is the load-bearing lookup, not step 4.** Order the resolver accordingly, and treat filling the table as a data task independent of the plugin — it is not on the critical path, but any claim that Mediqom returns SNOMED-coded anatomy is currently true for about a quarter of the body.

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

Leave `loadObj()` byte-untouched; add `loadGlb()` beside it and a `loadModelFile()` that branches on `state.assetFormat`. Swap the two loaders — `updateModel` (defined `model-loader.ts:54`, called from `Body.svelte:391`) and `loadShade` (defined `:407`, called from `Body.svelte:511`).

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

`src/components/anatomy/` is **28 files, 5 040 lines** (4 517 excluding JSON). Of those, **only `Body.svelte`, `label-manager.ts` and `store.ts` have app coupling at all:**

| file | external imports |
|---|---|
| `Body.svelte` (963 lines) | 12 — `$app/navigation`, `$lib/ui`, `$lib/context/objects`, `$lib/focused`, `$lib/profiles`, `$lib/types.d`, `$lib/documents`, `$components/ui/Sounds.svelte`, `$lib/i18n`, `$lib/i18n/anatomy`, `$components/chat/AskButton.svelte`, `$lib/datetime` |
| `label-manager.ts` | 3 — `$lib/context/objects`, `$lib/documents/tools`, `$lib/types.d` |
| `store.ts` | 2 — `$lib/focused`, `$lib/ui` |

The other 25 files need only `three`, `@tweenjs/tween.js`, and `isTouchDevice()`: `scene-state`, `scene-setup`, `model-loader`, `highlight-system`, `material-system`, `label-clustering`, `muscle-materials`, plus `3dtools.ts`, `particle-swarm.ts`, `transporter-ring.ts`, the four shader files, `context-manager.ts`, `context/*` and `animations/Immunity.ts`.

Crucially, **none of the coupling touches auth, Supabase, or the network.** No `supabase`, no `fetch(`, no session references anywhere in the directory — verified. All assets load from static `/anatomy_models/` paths. It is stores, i18n, and sound.

Two corrections to earlier drafts of this section:

- **`core/`, `interactions/` and `loaders/` are empty.** They were created in June 2025 and never populated (`ls` reports `total 0`). The `bb45abb` refactor split `Body.svelte` into **flat top-level modules**, not into those directories. Only `context/` (81 lines, the educational-overlay registry) and `animations/` (249 lines) have contents. `body.ts` is a 0-byte file.
- **`isTouchDevice()` is not incidental.** `src/lib/device.ts` is 14 lines and is imported by **four** files — `model-loader.ts:8`, `scene-setup.ts:7`, `particle-swarm.ts:2`, `transporter-ring.ts:2`.

## ⚠️ `objects.json` exists twice, byte-identically

`src/components/anatomy/objects.json` and `src/data/objects.json` are two independent regular files with the same MD5 (`815cdab36486be1428ac603be0e03b43`) — not a symlink. Consumers are **split across both copies**:

| copy | imported by |
|---|---|
| `$data/objects.json` | `src/lib/context/objects.ts:1`, `src/lib/langgraph/nodes/_schema-enums.ts:16`, `src/lib/import.server/convertWorkflowResult.ts:2` |
| `$components/anatomy/objects.json` | `src/components/anatomy/context/index.ts:3`, `src/components/layout/Viewer.svelte:6`, `src/lib/config/chat-config.ts:7`, `src/lib/chat/anatomy-integration.ts:2` |

Non-anatomy app code reaches *into* the component folder for data. This is a live drift hazard: an edit to one copy silently diverges from the other. **The widget must consume `$data/objects.json`**, and the duplicate should be collapsed — but that is a separate cleanup, not part of the widget work.

There is also a freebie: `label-manager.ts:54` opens with `if (!profile?.id) return { labels: [], layersToAdd: [] }`. **Given an empty profile, the entire document-labels feature self-disables at runtime** — no `showLabels` prop required to make it safe, only to make it explicit.

## ✅ `sounds.focus` — already fixed

An earlier draft flagged this as a latent crash: `sounds` is `{}` at module scope, populated lazily by `enableSoundEffects()` on first user gesture, and `handleClusterClick` is invoked from the **render loop** with no gesture guarantee.

**Both halves are now fixed and this section is historical.** All six call sites are optional-chained — `Body.svelte:89,199,251` and `Viewer.svelte:63,73,113` — and `Sounds.svelte:76` registers its unlock listeners in the **capture phase** (`addEventListener(event, enableSoundEffects, true)`), so label and cluster handlers calling `stopPropagation()` no longer swallow the first gesture.

## The changes — 1 line

Keep legacy `export let` / `$:`. Only one edit remains; the rest of this section's original checklist has shipped.

```diff
- L8    import objects3d from '$lib/context/objects';
+ L8    import objects3d from '$data/objects.json';
```
`Body` never uses `isObject`/`findObjects`, so this also drops a transitive 75 KB `signal-catalog` import from *both* the app and the widget. It also moves `Body` onto the copy of `objects.json` the widget will consume — see the duplication warning above.

**Already implemented** (verified in place, contrary to earlier drafts):

| method | location |
|---|---|
| `focusMeshGroup(state, meshNames, preset, padding)` | `highlight-system.ts:94` |
| `CameraPreset` (5 values) | `highlight-system.ts:25` |
| `showRegion(meshNames, preset)` | `Body.svelte:133` |
| `setCamera(preset)` | `Body.svelte:138` — delegates with `[]`, which frames the whole model |

**Imperative methods, not more props** — `Viewer.svelte` already holds `let model: Body;`, and the widget's driver is an async postMessage notification, which is imperative anyway.

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

## ✅ The `viewer:anatomy` payload mismatch — fixed

An earlier draft flagged `care-plan/+page.svelte` emitting `{ focus: … }` where every other emitter uses `{ object: … }`, silently clearing the highlight instead of setting it.

**This is resolved** and the §12 Phase 2 `[x]` is accurate. `src/lib/focused.ts:22-29` now validates that `payload.object` is a non-empty string and warns otherwise, and **no `{focus}` emitter remains anywhere** — the care-plan page no longer emits `viewer:anatomy` at all. Surviving emitters are all correct: `UI.svelte:200` and `NavBar.svelte:47` pass the boolean "open the panel" form; `SectionBody.svelte:17` and `SectionImaging.svelte:136` pass `{ object: … }`.

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

Official entry point: https://developers.openai.com/plugins/ — **note the rename.** What this document originally called the "Apps SDK" is now documented as **"Plugins"**; `developers.openai.com/apps-sdk/*` redirects there. Key pages: [guidelines](https://developers.openai.com/plugins/app-guidelines), [auth](https://developers.openai.com/plugins/build/auth), [security & privacy](https://developers.openai.com/plugins/guides/security-privacy), [UI guidelines](https://developers.openai.com/plugins/concepts/ui-guidelines), [reference](https://developers.openai.com/plugins/reference), [review](https://developers.openai.com/plugins/deploy/app-review).

## How plugin widgets actually work

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

# 9. ⚠️ Document structuring — constrained, not categorically prohibited

> **Naming note.** OpenAI has renamed "Apps SDK" to **"Plugins."** The canonical policy page is now
> [Plugin guidelines](https://developers.openai.com/plugins/app-guidelines); commercial terms are the
> [App Developer Terms, updated 9 July 2026](https://openai.com/policies/developer-apps-terms/).
> Every claim in this section is labelled **documented**, **documented absence**, or **inference**.

An earlier draft declared document structuring flatly impossible. That was **over-stated in one direction and under-stated in another**, and the correction matters because `Mediqom_Plugin_API_PRD.md` builds its entire go-to-market wedge on this capability.

## What is actually settled

**The PHI ban is unconditional — documented.** App Developer Terms §2.4:

> "You agree that your App will **not create, receive, maintain, transmit, or otherwise process**: (a) Protected Health Information as defined under the HIPAA Privacy Rule (45 C.F.R. Section 160.103)…"

The Plugin guidelines repeat it under Restricted Data. Three things follow, all verified by full-text search of the guidelines:

- **There is no BAA path.** Terms §2.3 forecloses it structurally: *"neither party is processing personal data on behalf of the other or acting as a service provider of the other"* — precisely the relationship a BAA requires. BAAs exist for the API platform and Enterprise, not for published plugins.
- **There is no health-app category and no consent exception.** §2.4 has no consent gate at all, while the *very next sentence* about other sensitive data explicitly does have one. The drafters knew how to write a conditional rule and chose not to for PHI.
- **There is no medical section in the guidelines.** The word "health" appears once, in the prohibition bullet.

## What is genuinely unresolved

**Whether normalized clinical entities count as PHI is not addressed anywhere in published policy.** This is the crux, and the honest answer is that no citable rule decides it.

The PRD's "host model as Node 0" architecture (its §6) means ChatGPT reads the document and Mediqom receives only:

```jsonc
{ documentType: "MRI", bodyRegion: "R_knee", laterality: "right",
  structures: ["medial meniscus"], findings: ["posterior horn tear"] }
```

The raw report never reaches our server. Under HIPAA proper, PHI is *individually identifiable* health information held by a covered entity or business associate; that payload contains **none of the 18 Safe Harbor identifiers** (45 C.F.R. §164.514(b)(2)). *That is our argument — it is inference, not policy text.*

Cutting against it: §2.4's verb list is exhaustive and process-agnostic (*"or otherwise process"*), so if a reviewer classifies the entities as PHI, the architecture does not save us.

**Minimization, by contrast, we pass cleanly — documented.** The guidelines' Data boundaries clause reads almost as an endorsement of Node 0: *"Operate only on the explicit snippets and resources the client or model chooses to send."* But minimization and the Restricted Data ban are **separate bullets**; being minimal about PHI is still processing PHI.

## Anonymity is the decisive mitigation

**The plugin must not require a Mediqom account.** This is settled product direction and it is also our strongest compliance position:

- With no OAuth we hold **no durable subject identifier**, so the entities stay plausibly de-identified.
- **Account linking would actively weaken this.** Linking makes the data individually identifiable *to us* — the exact thing the Safe Harbor argument depends on avoiding. Terms §2.3 (consent-conditioned) and §2.4 (flat ban) are separate clauses: user authorization satisfies §2.3 and **does not unlock §2.4**.
- OAuth 2.1 + PKCE is fully supported by the platform, and its obligations are purely additive. We are declining it on PHI grounds, not capability grounds.

## What must be dropped

**Verbatim source snippets and quoted provenance.** The PRD requests these in its §7 (`map_report_anatomy` "optional source snippets/references") and §16 P0 ("Source/provenance display"). Two documented clauses cut directly against them:

> "Do not request the full conversation history, **raw chat transcripts**, or broad contextual fields 'just in case.'"

> "Design the input schema to limit data collection by default, rather than **a funnel for optional context**."

An optional `sourceSnippets` field is that second phrase's textbook case, and it hands a reviewer a clean, quotable basis for rejection. Entities-only is defensible-but-unresolved; entities **plus** verbatim quotes is materially worse.

If provenance must be shown, the safer shape is **host-side**: pass an anchor or offset that the widget resolves client-side against content the host already holds, rather than transmitting quoted text to our server. *(The policy does not address this distinction either — inference.)*

## The directory tells us where the line falls in practice

53 apps sit under Healthcare. Every personal-data one is **wellness/fitness** — Peloton, MyFitnessPal, Sleep Cycle, COROS. **None ingests clinical documents.** The single app that handles clinical records is *Health*, by OpenAI. Wellness data is not PHI (it does not come from a covered entity); an MRI report is. *That the line is enforced at the clinical/wellness boundary is inference from the app list, not documented policy.*

There is one genuine counter-signal worth recording: OpenAI's own Health documentation explicitly contemplates health information reaching third-party plugins, gated by consent prompts rather than a hermetic ban. So the practice is a safeguard model, not an absolute one — but nothing in that help article overrides Terms §2.4 for our purposes.

## Consequence for platform sequencing

Both this document and the PRD assume ChatGPT first. **On the report wedge, that ordering is backwards.** The PHI gray zone is a marketplace-directory rule, not a universal one; user-installed Claude connectors, Gemini, and the Mediqom API carry no equivalent restriction. See §10.

## The replacement: same funnel, zero PHI

1. **`show_anatomy`** — the hook. Arguments are body-structure terms.
2. **`explain_structure(structure)`** — SNOMED-coded, education-grade text *about a structure*, not about the user. No PHI in, none out. Establishes "Mediqom knows anatomy" and gives the model something to say alongside the widget.
3. **`list_anatomy_regions`** — lets the model enumerate what can be shown. Cheap.
4. **An informational link, not a tool — and not a signup link.** Widget footer → an **informational** page describing what Mediqom is. See §9b for why the destination cannot be `/import` or any signup flow.
5. *(conditional)* **`fetch_anatomy_asset`** — the `_meta`-hidden CSP fallback, tier 3 of §4.

```text
User asks about a structure in ChatGPT
        ↓
show_anatomy renders the interactive 3D view
        ↓
"Mediqom keeps your records encrypted and connects findings over time" → informational page
        ↓
User decides, on our own site, whether to join
```

Mediqom never receives the documents through OpenAI, so there is nothing to disclose, retain, or defend. The plugin's job is recognition and desire; the app's job is context.

**Additional constraint: do not log tool arguments.** `"show me my herniated L4-L5"` arrives as `structure: "l4-l5"` — benign in isolation, PHI when logged against a session. The guidelines' Security & Privacy page states the rule directly: *"Redact PII before writing to logs."*

---

# 9b. The promotion boundary — what we may and may not say

The product intent is: **show anatomy to everyone, free and anonymous, and inside the widget suggest Mediqom as the more elegant place to keep records and get context-aware answers.** That is permitted. The boundary is precise, so it is worth stating exactly.

## ✅ Permitted — documented

| | source |
|---|---|
| Link out from the widget | `window.openai.openExternal({ href })`; `setOpenInAppUrl({ href })` exists specifically for app handoff |
| Suggest Mediqom contextually | the test is *"Every plugin must deliver clear, legitimate functionality that provides **standalone value** to users"* — the anatomy viewer clears it |
| Link to an **informational** page | plugins may *"Link to an informational page describing available plans or entitlement options."* |
| Sign **in** to an existing account | *"Users may sign in to an existing paid account and access features already included in their subscription."* |

## ❌ Prohibited — documented, verbatim

| prohibition | text |
|---|---|
| Promotional **model-readable** fields | *"Descriptions must not favor or disparage other plugins or services or attempt to influence the model to select them over another plugin's tools."* / *"Avoid misleading, overly promotional, or comparative language."* |
| Signup, subscribe, upgrade | *"Plugins must not display subscription plans, initiate new subscriptions, or promote upgrades."* **"Freemium upsells"** are named explicitly as prohibited indirect selling |
| Transactional destinations | may not *"Link to a page that explicitly initiates the process to upgrade, subscribe, or complete a purchase."* |
| Redirecting the interaction | *"Do not insert unrelated content, attempt to redirect the interaction…"* |
| Existing as an ad vehicle | *"Plugins must not serve advertisements and must not exist primarily as an advertising vehicle."* |
| Our logo in the widget body | *"Do not include your logo as part of the response."* ChatGPT appends it automatically |
| More than two CTAs | *"one primary CTA and one optional secondary CTA"* |

## The load-bearing rule

> **Promotion lives in the widget UI. Never in the model-readable layer.**

Tool names, descriptions and annotations are policed separately and strictly — they must describe *when the capability is useful*, never *why Mediqom is good*. §6's guidance on tool description copy already gets this right and should be followed literally.

## Three practical consequences

1. **The destination is an informational page, not `/import`.** `/import` does not exist as a page route today (only `src/routes/v1/import/*` APIs), and Mediqom signup is invite-only in code (`auth/+page.server.ts:80` sets `shouldCreateUser: false`) with manual approval. Pointing a CTA there would be both broken *and* prohibited. **This is convenient**: v1 needs only a static informational page — no import deep link, no attribution machinery, no change to the invite gate.
2. **Attribution parameters are unaddressed in published policy.** No guideline mentions referral codes or UTM tags either way. ChatGPT itself appends `?redirectUrl=` to approved external links, so URL parameters are not inherently disallowed — but we should not assume a referral scheme is sanctioned. Treat this as an open question for review, not a settled permission.
3. **The anatomy viewer must be worth using on its own.** The "standalone value" test is what separates a legitimate handoff from an ad vehicle. If the widget is genuinely useful to someone who never clicks through, the suggestion is fine. That is a design constraint on the viewer, not just a copy constraint.

## ChatGPT Health — no way in, and a narrower threat than it looks

**There is no developer or partner program for ChatGPT Health.** Verified 2026-08-07:

- `developers.openai.com/plugins/llms-full.txt` — the complete Plugins documentation export — contains **zero** occurrences of health, medical, HIPAA, or ChatGPT Health. The only "protected health information" hit is the *prohibited data* list.
- The submission and review docs describe **one universal queue** with a generic category field. No health track, no health tier, no elevated-review application.
- Apps inside Health are **named launch partners** — Function, MyFitnessPal, Weight Watchers, AllTrails, Instacart, Peloton, One Medical, plus Apple Health. The only published gate is *"additional security review specific to inclusion in Health"*, with no process attached. This reads as business development, not a program.
- **§2.4 was updated 9 July 2026 — two weeks *before* Health's GA — and still bars apps from processing PHI.** Health created no carve-out. Health itself *"does not offer a Business Associate Agreement."*

The BAA path exists only outside Health: ChatGPT for Healthcare / for Clinicians (sales-managed) and the API (`baa@openai.com`). Neither is a plugin surface.

**Do not plan around becoming a Health app.** If that changes it will be announced; there is nothing to apply to today.

### ✅ The originality risk is resolved in our favour

Health has **no anatomy, no imaging rendering, no 3D** — its documented visual layer is *"seeing recent data and trends."* It syncs radiologists' *"diagnostic interpretations"* as text and has no DICOM capability. So the guidelines' *"not natively supported by the products' built-in capabilities"* test is comfortably passed by the anatomy viewer. **This de-risks the §12 Phase 7 submission**; the concern flagged in earlier drafts applied to a records capability, not to ours.

### ✅ Health does not operate in our market

**Mediqom is Europe-only by choice. ChatGPT Health is United States-only.** The EEA, Switzerland and the UK were excluded at the January limited release and remain excluded at general availability; medical-record integrations were US-only from the start.

**So Health is not a competitor in any market we serve, and this section is a watching brief rather than a strategic constraint.**

For the record, the gaps that would matter if that ever changed — all documented, not inferred:

| | ChatGPT Health | Mediqom |
|---|---|---|
| Market | **US only** | 7 locales (cs, de, en, es, it, pl, tr) |
| Profiles | **One person.** Verbatim: *"intended for your own records… use a separate account"* | family / caretaker, `/med/p/[profile]`, sharing |
| Encryption | *"authorized OpenAI personnel and trusted service providers might access data… unless you have opted out"* | zero-knowledge; RSA-4096 + ML-KEM-768 (`CRYPTOGRAPHY.md`) |
| Record ownership | read-only; no write-back; disconnecting **deletes** rather than exports | user-owned, exportable, client-decrypted |
| Anatomy / imaging | **absent entirely** | the wedge |
| Platforms | web + iOS; no Android | web + iOS + Android (Capacitor) |

**Zero-knowledge is the one position OpenAI structurally cannot take.** Health has to read the records to work — that is not a feature they declined to build, it is incompatible with the product.

One structural note, recorded so it is not rediscovered: OpenAI does not own its aggregation layer. It licenses FHIR connectivity from **b.well**, a US network which sells the same SDK to Google, Samsung, athenahealth and Perplexity. **This is a US path and we are not taking it** — the EU equivalent is EHDS / MyHealth@EU, which is the direction any future record-ingestion work should look.

**Net effect on this document: unchanged, and de-risked.** Anatomy is the plugin; the Mediqom suggestion stays restrained and informational; the EU funnel premise is untouched by Health.

---

# 10. Claude and Gemini

## Tool/MCP layer: portable

Anthropic supports user-defined tools and remote MCP connectors; Gemini supports function calling and increasingly MCP-capable agent infrastructure. The same `show_anatomy` contract and the same `src/lib/anatomy/` domain logic serve all three with no rewrite.

- Tool use: https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview
- Remote MCP / custom connectors: https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
- Gemini tools/function calling: https://ai.google.dev/gemini-api/docs/tools

The PHI constraint in §9 is an *OpenAI marketplace* rule, not a universal one. Other platforms have their own policies, to be checked rather than assumed either stricter or looser.

## ⚠️ Decision: split the roadmap by platform, not by phase

Both this document and `Mediqom_Plugin_API_PRD.md` §20 sequence ChatGPT first for everything. **For the anatomy wedge that is right; for the report wedge and the acquisition funnel it is backwards.** Three constraints all point the same way, and all three are specific to the OpenAI *directory*:

| constraint | ChatGPT | Claude connector / Gemini / Mediqom API |
|---|---|---|
| PHI ban on clinical entities | unresolved gray zone (§9) | no equivalent marketplace rule; user-installed connectors and a direct API are a different regime |
| Signup / upsell CTAs | prohibited (§9b) | our own surface, our own rules |
| Originality vs. first-party product | ChatGPT Health competes directly | no conflict |

So:

- **ChatGPT** gets the anatomy viewer, `explain_structure`, `list_anatomy_regions`, and one informational handoff. Anonymous, no PHI, standalone-valuable. Its job is **reach and recognition**.
- **Claude custom connectors, Gemini, and the Mediqom API** carry the report-structuring wedge and any genuine acquisition mechanics.

This is a change of plan, not a restatement. Each platform's policies still need checking on their own terms before building — the point is only that OpenAI's directory rules must stop being treated as universal constraints on the whole product.

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
- [ ] Privacy policy; tool-description copy pass; audit that **no tool argument is ever logged** (guidelines: *"Redact PII before writing to logs"*).
- [ ] **Confirm the plugin requires no Mediqom account** — no OAuth, no login step. Both a product decision and the §9 PHI mitigation. New-account-signup flows are an automatic review rejection.
- [ ] **Promotion-boundary audit against §9b**: one CTA; destination is an *informational* page, never signup/checkout; no Mediqom logo in the widget body (ChatGPT appends it); **no promotional language in any model-readable field** — tool names, descriptions, annotations.
- [ ] Build the informational landing page the CTA points at. Static; no dependency on `/import`, attribution params, or the invite gate.
- [ ] Confirm the anatomy viewer passes the **standalone-value** test — useful to someone who never clicks through.
- [ ] Re-read the guidelines immediately before submission. They changed naming ("Apps SDK" → "Plugins") between drafts of this document; assume further drift.

## Phase 8 — other ecosystems

- [ ] Claude custom connector against the same MCP server; verify tool-selection quality.
- [ ] Gemini function declarations; verify tool-selection quality.

---

# 13. What not to build in the first iteration

- Mediqom login inside ChatGPT — **and not later either**: anonymity is a §9 compliance position, not a v1 shortcut;
- any plugin access to the encrypted vault;
- **any tool that receives raw medical documents or verbatim report text** (§9);
- **any CTA that initiates signup, subscription or upgrade** (§9b — prohibited, not merely deferred);
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

**The PHI rule is narrower than it looks, and wider than we'd like.** It is unconditional, has no BAA path and no health-app category — but it is an *OpenAI directory* rule, and published policy is **silent** on whether normalized clinical entities count. Staying anonymous is what keeps that silence working in our favour; account linking would end it. Verbatim source snippets must go.

**We can promote Mediqom — in the widget, not in the tool description.** One contextual CTA to an *informational* page is permitted. Signup, subscribe and upgrade flows are explicitly prohibited, "freemium upsells" by name. The anatomy viewer has to be worth using on its own; that is what makes the suggestion legitimate rather than an ad.

**OpenAI:** best first target *for anatomy* — the plugin platform combines MCP tools with embedded UI, and Svelte works fine. **Not** the first target for report structuring or acquisition; see §10.

**Anthropic / Gemini:** the tool layer is portable; the inline UI contract is not.

Therefore:

> **Build Mediqom's anatomy capability as a vendor-neutral tool. Use OpenAI as the first rich UI distribution adapter, not as the architecture.**
