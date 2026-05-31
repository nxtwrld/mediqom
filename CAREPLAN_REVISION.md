# Care Plan PRD — Revision Notes

Companion document to `CAREPLAN.md`. Captures the feasibility check, architectural
corrections, schema gaps, inconsistencies, and improvement opportunities surfaced
during codebase verification. Apply these before implementation begins.

**Verdict:** the PRD is ~85% feasible as written and the product vision is strong.
There is 1 architectural correction, 3 schema gaps, several inconsistencies, and
~12 product improvements that should be folded in before build.

---

## 1. Architectural Decision — Hybrid Assembly Model

`CAREPLAN.md` §"Missing Features — Build List" step 7 originally said:

> "Hook assembly into import pipeline post-save → `src/routes/v1/import/jobs/[id]/process/+server.ts`"

A pure server-side assembly was the wrong fit: it would have required Mediqom
servers to persistently hold and process the *aggregated* Care Plan, which is a
privacy multiplier over individual documents.

A pure client-side assembly is also the wrong fit: deterministic dedup cannot
handle the semantic cases — missing ICD codes, cross-language variations,
provisional → confirmed transitions, progression detection, implicit task
resolution — that make the Care Plan feel like a coherent story rather than a
fragmented duplicate-ridden list.

**Decision: hybrid model** — LLM does semantic matching where the LLM is
already in flight (server-side extraction); deterministic code does the merge
on the client.

### Phase 1 — Server-side semantic matching (during import extraction)

1. Client builds a compact `CarePlanExtractionContext` blob from the existing
   (decrypted) Care Plan — active items, active tasks, recent medications with
   their existing ids and key attributes.
2. Client encrypts the blob with the same per-job AES key as the document and
   sends it alongside in the import request. Same envelope, same persistence
   guarantee.
3. LangGraph extraction nodes read the context and annotate each output with
   link decisions:
   - `linkedCarePlanItemId?: string` on diagnoses (or `isNewCondition: true`)
   - `progressionFrom?: string` for supersession (stage 1 → 2; provisional → confirmed)
   - `linkedCarePlanTaskId?: string` on recommendations (or `isNewTask: true`)
   - `resolves?: string[]` for documents that satisfy existing tasks
4. Server encrypts annotated extraction with the per-job key → DB (unchanged
   from today).

### Phase 2 — Client-side deterministic merge (post-decryption)

5. Client decrypts via existing `decryptJobResults()` (`src/lib/import/finalizer.ts:80-138`).
6. Client runs `mergeCarePlan(existingPlan, annotatedExtraction) → newPlan` —
   a pure function that trusts the LLM's link annotations and applies updates
   deterministically.
7. Client applies user-action precedence:
   `User edit > Document extraction > AI inference`.
8. Client encrypts and saves the updated Care Plan singleton via the same
   pattern as `healthDocumentId` (`src/lib/health/signals.ts:16-33`).

### Why this split

| Concern | Server LLM phase | Client merge phase |
|---|---|---|
| Semantic understanding | needed | not needed (annotations pre-resolve) |
| Determinism / fixture-testable | n/a | yes — pure function |
| Re-runnable after schema change | no (re-pays LLM) | yes (free) |
| Mediqom server sees aggregated story | no — only encrypted context blob | n/a (client owns it) |
| LLM provider sees PHI | yes — same as extraction today | no |
| Bundle cost on client | low | modest (merge + dedup utilities) |

### Privacy reframing

The original PRD line 53 claim — *"the platform never sees unencrypted health
data"* — was already an overstatement of the current architecture: the server
holds source documents in plaintext transiently during extraction (to feed the
LLM). The Care Plan context blob inherits the exact same transient-only
exposure profile.

Updated, accurate guarantee:

> Mediqom never **stores** unencrypted health data. LLM providers see the data
> necessary for analysis, the same way they see new documents during extraction
> today. The Care Plan itself is only assembled and persisted in encrypted form
> by the client.

---

## 2. Schema Gaps — Three PRD Claims Are Partial

### 2.1 Treatment goals are strings, not structured objects — RESOLVED

**Resolution (2026-05-21):** option (a) — converged all three extraction
sites on a single structured shape with the new optional fields, plus a
client-side normaliser so legacy string extractions keep rendering.

Canonical shape (`src/lib/configurations/core.treatmentGoal.ts`):

```ts
{
  goal: string,                              // required
  category?: 'curative' | 'palliative'
           | 'symptomatic' | 'preventive'
           | 'rehabilitative',
  timeline?: string,
  measurableOutcome?: string,
  monitoringSignal?: string,
  targetValue?: number,
  targetRange?: { min: number; max: number },
}
```

Anti-hallucination guards: schema-level `CRITICAL: ONLY extract...` plus
field-level `ONLY populate if explicitly stated` on `targetValue`,
`targetRange`, `monitoringSignal`.

Changes landed:

- **New** `src/lib/configurations/core.treatmentGoal.ts` — shared definition.
- **Updated** `treatments.ts:357`, `treatment-plan.ts:299-303`,
  `core.recommendations.ts:101-105` — all now reference the shared shape.
- **New** `src/lib/careplan/normalize.ts` + tests — wraps legacy
  `string` goals into `{ goal }`; regression-guarded against fabricating
  `targetValue` / `targetRange`.
- **Updated** `SectionTreatmentPlan.svelte` — consumes the normaliser;
  renamed `title → goal`, dropped duplicate `targetOutcome`, renamed
  `timeframe → timeline`.
- **Updated** `CAREPLAN.md` `CarePlanGoal` interface — `text → goal`,
  added `category`.

PRD-level field name choice: `goal` (matches existing `treatments.ts` and
the new shared schema).

`recommendations.carePlan.goals` was also upgraded to the same shape with
the same backwards-compat normaliser, since legacy extractions stored it
as strings too.

### 2.2 Medications lack explicit new / modified / discontinued split — RESOLVED

**Resolution (2026-05-24):** the revision's framing was outdated. The unified
`src/lib/configurations/medications.ts` (replacing the legacy
`prescription.ts`) already provides `newPrescriptions[]`,
`currentMedications[]`, `discontinuedMedications[]`, and `medicationChanges[]`
with a `changeType` enum. Work completed in this pass:

- **Legacy path deleted.** `src/lib/configurations/prescription.ts` and its
  only consumer (`src/lib/import.server/analyzeReport.ts` + its test) were
  removed — they had zero production callers. The LangGraph
  `medications-processing` node (`universal-node-factory.ts:163-171`) is the
  sole extraction path.
- **Consumer-mode anti-inference guards** added to `medications.ts`. Top-level
  preamble enforces "doctor-controlled — never infer". Field-level CRITICAL
  guards added on `medicationChanges.{changeType, previousDose, newDose,
  reason, effectiveDate}`, `discontinuedMedications.*` (entire array now
  scoped to explicit doctor-written stops), `currentMedications.{status,
  dosage}`, and `newPrescriptions.duration.*`.
- **`changeType` persisted on stored medications.** Added to the `Medication`
  interface in `src/lib/medications/types.ts` (and a `MedicationChangeType`
  type alias) so the doctor's authorial intent at the time of the source
  document persists for the Care Journey timeline and Care Plan merge.
- **Convert layer extended.** `src/lib/medications/convert.ts` now exposes
  `fromCurrentMedication` / `fromNewPrescription` / `fromMedicationChange` /
  `fromDiscontinuedMedication` and `extractMedicationsFromDocument` walks all
  four arrays. Each converter sets the correct `changeType`.
- **Care Plan link annotations added** (Phase 0 prereq for §1 hybrid model):
  `linkedMedicationId?` on `currentMedications` / `discontinuedMedications` /
  `medicationChanges`, and `isNewMedication?` on `newPrescriptions`. These
  are populated only when the import request carries a
  `CarePlanExtractionContext.recentMedications` blob.
- **Discontinuation-by-absence is intentionally NOT in the schema.** When a
  reconciliation document lists current meds but omits one that exists in the
  store, the absence is meaningful but the AI is forbidden from inferring it.
  The client merge phase detects the discrepancy and surfaces it as a
  user-confirmation prompt ("X is in your list but not in this new
  prescription — was it stopped?"); the store never auto-mutates from
  an inferred discontinuation.

### 2.3 Body parts — the enum is the smallest of the problems

`src/lib/configurations/core.bodyParts.ts:12` literally has `enum: []`. It gets
populated at LLM dispatch time from `src/data/objects.json` (472 mesh names).
Same source feeds the 3D viewer.

The wording fix ("populated at runtime from the 3D model mesh registry; both
extraction and the Care Plan consume the same source") is correct but only half
the work. Deep analysis surfaces 12 gaps between today's extraction pipeline and
what the Care Plan needs. They divide into three buckets:

**Enum population stability — RESOLVED 2026-05-25** (covers G10's
anti-hallucination prerequisite and the consistency half of G11):

Old state — two duplicated population sites
(`_base-processing-node.ts:280-308`, `medical-imaging-analysis.ts:167-178`)
each matched a narrow hardcoded JSON path. The check fired for only 4 of the
16 `coreBodyParts` consumers (those mounting it under the key `bodyParts`);
the other 12 schemas (mounting it under `affectedBodyParts`, `treatmentSites`,
`targetAreas`, `affectedStructures`, `bodyPart`, `targetBodyParts`,
`sourceBodyPart`, `system`, etc.) relied on the shared `coreBodyParts` object
reference being mutated by some other schema's load to inherit the populated
enum. If a workflow ran only an "unmatched" schema in a fresh process, the LLM
saw `enum: []` — i.e. no constraint — and could hallucinate mesh names.

New state — single helper `populateSchemaEnums(schema)` in
`src/lib/langgraph/nodes/_schema-enums.ts` walks the schema tree and fills
every empty enum at known slots, irrespective of nesting key. Slots covered:

- `properties.identification.enum` ← anatomy mesh names from `objects.json`
- `properties.signal.enum` ← lab catalog keys minus `STATIC_PROPERTIES`

Properties:
- One call site per node: `populateSchemaEnums(this.schema)` replaces 28 lines
  in `_base-processing-node.ts:278-280`; `populateSchemaEnums(schema)` replaces
  11 lines in `medical-imaging-analysis.ts:167-169`.
- Anatomy enum computed once at module load and frozen.
- Idempotent (`enum.length === 0` guard) so repeated calls are safe.
- WeakSet visit-guard inside a walk prevents cycles.
- All 16 `coreBodyParts` consumers covered, plus the inlined `imaging.ts:24`
  body-parts enum (which is a separate enum, not shared with `coreBodyParts`).

This is not the full G11 "static compile-time import" refactor — the enum is
still set at runtime — but the stability and consistency problem G11 was
created to solve is now resolved. The remaining static-import refactor is
purely a cleanup that can ship later without changing behavior.

**Decided (folded into Phase 0 below):**

- **G1 — Nothing is lost.** Promote `CarePlanItem.bodyParts` from `string[]` to
  `CarePlanBodyPartRef[]` that carries `identification`, `part`, `status`,
  `treatment`, `urgency` (max across documents) *and* a `sources[]` array of
  back-references to the originating extraction. The Care Plan is a view over
  the documents; the documents remain the source of truth.
- **G2 — Multi-region highlight, now.** `setHighlight(name)` stays unchanged
  (single-focus path for chat / documents). New additive
  `setMultiHighlight([{ mesh, color, opacity }])` paints all active items at
  once. Material cache extends to a bucketed `Map<variantKey, Material>` keyed
  by `(color, opacity bucket)` so the cache stays bounded. Delta-swap so each
  certainty recompute only updates meshes whose effective state changed.
- **G3 — Two-layer registry + zero hallucination.** Keep the 472-mesh registry
  as the granular layer. Add a new region meta-layer (`src/data/anatomy-regions.ts`)
  that explicitly groups related meshes — `R_patella → R_knee → R_leg →
  lower_limb`. Regions are first-class anchors in `identification`, not soft
  aliases. The schema gains a `CRITICAL: ONLY extract...` guard matching the
  medications schema pattern (revision §2.2): no inference from disease names,
  no adjacent structures, omit rather than guess at side.
- **G4 — Laterality is a question, not a merge rule.** When the same ICD-10
  appears with different sides across documents, Phase 1 LLM decides whether
  to link or to create a new item with `relatedTo[]` pointing back. Phase 2
  merge respects the decision; both items keep their own state. The graph
  edge surfaces in the UI as "you may want to discuss this" — never a silent
  collapse or split.
- **G5 — Anatomy is a perspective layer, not the main view.** Care Plan items
  with no anatomical locus (depression, allergies, vitamin D deficiency, ME/CFS)
  are first-class. `bodyParts: []` is valid. A reserved `whole_body` region
  exists for items that affect the body generally. The Care Plan list must
  not hide items just because no mesh lights up. The 3D body is one of several
  views, not the home screen of the Care Plan.
- **G11 — No empty enums.** ~~With the registry now living in `.ts`, the
  enum becomes a static compile-time import in `core.bodyParts.ts`. The runtime
  population code at `_base-processing-node.ts:280-294` is removed.~~ The
  consistency goal is **RESOLVED 2026-05-25** via the shared
  `populateSchemaEnums()` helper (see "Enum population stability" above) —
  every empty enum is now reliably populated regardless of where it sits in a
  schema. The remaining static-import refactor is optional cleanup.

**Provenance and durability:**

- **G6 — Union-merge with provenance.** Diabetes complications surface over
  years: kidneys (2022), eyes (2024), feet (2025). The item accumulates body
  parts via union; each entry's `sources[]` records which document contributed it.
- **G8 — Per-region urgency.** The extraction's `urgency` 1–5 is a doctor-written
  region-level severity signal that survives in the `CarePlanBodyPartRef`. Drives
  pulse / aura intensity on the 3D model (independent of item-level certainty).
- **G9 — Mesh-rename migration table** (`src/data/anatomy-aliases.ts`). Stored
  Care Plan items reference mesh names that may be renamed years later. Client-side
  normalization on load; telemetry counter for unresolved names to catch drift.

**Phase 1 LLM guidance:**

- **G7 — Region rollup in the context blob.** Body parts in
  `CarePlanExtractionContext.activeItems[].bodyParts` carry their rollup parents
  (`R_patella (R_knee, R_leg)`). Phase 1 prompt: *"Body-part disagreement is a
  soft signal. ICD-10 is the hard anchor. Use rollup ancestry to match."* Phase 1
  also emits `linkReason?: string` for the provenance reveal.
- **G10 — Anti-hallucination guard** on `core.bodyParts.ts` is the same change
  as G3's CRITICAL guard. Listed separately because it applies independent of
  whether the meta-layer ships.

**Performance:**

- **G12 — Delta swap and bucketed opacities.** Already covered by G2's cache
  redesign. Certainty recompute is throttled to once per page-load + once per
  merge.

**Constraint across all of the above: do not regress current behavior.** The
single-mesh focus API, the chat anatomy integration, and the document-side
extraction outputs must keep working identically through this refactor.

Full analysis with file paths and merge rules lives in
`~/.claude/plans/we-are-analyzing-the-cheerful-rain.md`.

---

## 3. Missing Dependency — `MilestoneProgress.svelte`

`CAREPLAN.md` line 478 references porting from `aouros` (a different repo).
Component does not exist in Mediqom. Either:

- Port it as a new build step, or
- Replace with a simpler timeline implementation built on existing chart
  components (see `src/components/charts/`).

---

## 4. Inconsistencies in the PRD

### 4.1 Privacy claim is overstated for the current architecture

Covered in §1. The original PRD line 53 (*"the platform never sees unencrypted
health data"*) doesn't match how extraction works today — the server holds
source documents in plaintext transiently for LLM dispatch. Replace with the
accurate guarantee: *"Mediqom never **stores** unencrypted health data."* The
hybrid model in §1 inherits this same guarantee.

### 4.2 "No urgency filters" conflicts with task priority

PRD line 491 says "No urgency filters." PRD line 160 defines task `priority:
'immediate' | 'urgent' | 'routine' | 'as_needed'`. If priority drives sort,
you're filtering implicitly. Clarify the intended position: priority is allowed
to influence ordering ("system orders; the user browses") but the UI exposes
no explicit priority filter chips. State this directly; otherwise reviewers
read it as a contradiction.

### 4.3 Empty enum signaling

See §2.3. Reword to clarify runtime population.

### 4.4 `certaintyCycleInDays` for monitoring items is ambiguous

PRD line 228 says monitoring inherits `valueExpirationInDays` of the signal —
but a monitoring item can track *multiple* signals (`monitoringSignals: string[]`,
line 148). Define the resolution rule. **Recommend: use the minimum (most
conservative) of all monitored signals.**

### 4.5 Conflict resolution rules are undefined

The PRD has fields (`contradictingDocuments`, `userNotes`) but no rule for:

- A new document says condition is resolved, but the user marked the task
  `ignored`.
- The user manually set `status: 'historical'` and a new document confirms the
  condition is active.
- Two documents disagree on diagnosis confidence.

**Default rule to state explicitly:** documents win over inferred-by-AI state;
user actions win over both. Source of truth precedence: User edit > Document
extraction > AI inference.

### 4.6 `processedDocuments` dedup field — purpose unclear

`processedDocuments: Record<string, string>` (line 109) is described as a
"dedup guard" by `contentHash`. But import is already idempotent at the
document level. State the actual scenario this guards against (e.g., re-running
assembly after a schema change) in the field's documentation, or drop the field.

### 4.7 Task lifecycle vs. document re-import not specified

If a task is `done` and a later document recommends the same thing again, do
you (a) create a new task, (b) reopen the old one, (c) ignore? **Recommend
(a) with a "previously completed [date]" hint shown on the new task.**

### 4.8 Multi-profile note missing

Family member profiles aren't mentioned. Just confirm the Care Plan singleton
is per-profile (matches `healthDocumentId` pattern) — code-wise this is
automatic, but a one-liner in §Data Model avoids confusion.

---

## 5. Approach Concerns

### 5.1 Bidirectional flow strategy — RESOLVED via hybrid (§1)

The chosen strategy is the **hybrid model** in §1: encrypted Care Plan context
blob travels with the import (same per-job key as the document), LLM in the
existing extraction pipeline emits link annotations, client does the
deterministic merge.

This supersedes the three earlier options considered. The fully-deterministic
client-only path was rejected because deterministic matching can't handle
missing ICD codes, cross-language variations, or progression detection. The
fully-server-side path was rejected because it would have required Mediqom to
hold the aggregated Care Plan in plaintext, multiplying privacy exposure over
the per-document model. The hybrid keeps the LLM in the role where it earns
its keep and keeps deterministic code in charge of the merge.

### 5.2 Care Plan document size growth — RESOLVED

**Resolution (2026-05-25):** archival policy folded into `CAREPLAN.md`
§"Data Model" / `CarePlanDocument`. Key decisions:

- `CarePlanDocument.historicalItems[]` added alongside `items[]`.
- Threshold: `status: 'historical' | 'resolved'` **and**
  `lastSeenInDocumentDate > 1095 days` (3 years). Constant
  `CAREPLAN_ARCHIVE_THRESHOLD_DAYS` lives in `src/lib/careplan/store.ts`.
- Store exposes `getActivePlan()` (whole-doc decrypt + parse of `items[]`
  only) and `getHistoricalItems()` (on-demand parse of the archived slice).
  AES decryption is whole-doc — the lazy win is JSON parse + render cost,
  which is the actual bottleneck for large histories.
- Resurrection: if Phase 1 LLM returns `linkedCarePlanItemId` pointing to an
  archived item, the merge moves it back into `items[]` before applying the
  update. Merge logic stays uniform regardless of source array.
- Dashboard counts: archived items are excluded from the homepage progress
  dial and task strip; they appear only inside the Care Plan page's History
  section.

Build-order impact: one new row in §7 Phase 1 Logic (*"Archival/resurrection
in store + lazy `getHistoricalItems()`"*). Medications avoid this same
problem only because they're per-document; the Care Plan singleton design
needs the explicit policy.

### 5.3 Timeframe parser robustness — RESOLVED

**Resolution (2026-05-25):** push the cross-language understanding upstream
into the LLM extraction; keep a thin client fallback for legacy/missing
cases.

Codebase state checked: timeframe is currently a free-text string in three
schemas (`core.recommendations.ts:51,128`, `imaging-findings.ts:418`,
`session.diagnosis.ts:376`) — there is no client-side parsing today.
`chrono-node` and `dayjs` are already dependencies but `parseDate()` only
handles concrete dates, not natural-language durations.

Decisions:

1. **Schema extension** — add a structured sibling to the free-text field on
   `core.recommendations.ts` (and any sibling schemas with timeframe):
   ```ts
   timeframe?: string                  // existing free-text, preserved
   timeframeNormalized?: {             // NEW
     unit: 'days' | 'weeks' | 'months' | 'years'
     value: number
   }
   ```
   Field-level guard: *"ONLY populate `timeframeNormalized` when the
   timeframe text contains an explicit duration. Do not infer from context."*
   Mirrors the medications anti-hallucination pattern from §2.2.

2. **Client compute + fallback** (`src/lib/careplan/timeframe.ts`):
   - `computeDueDate(sourceDocumentDate, timeframeNormalized) → ISO` — pure
     `dayjs` math.
   - `parseTimeframeFallback(text, locale) → TimeframeNormalized | null` —
     thin fallback for legacy extractions. `chrono-node` for English;
     targeted regex for cs/de. Returns `null` on uncertainty (no guessing).

3. **Fixture-first** (`src/lib/careplan/__tests__/timeframe.fixtures.json`):
   ~30 examples drawn from real CS/DE/EN documents, plus edge cases (compound
   forms "2-3 weeks", ranges "1–2 months", ambiguous "soon"). Built before
   the parser; becomes the regression net for both the LLM normalisation and
   the client fallback.

4. **UI fallback:** when neither `timeframeNormalized` nor the fallback
   parser yields a date, the task card shows the original text verbatim
   ("in 2 weeks per Dr. Novák") with no `dueDate`. The "ready for your
   attention" framing never fires from a missing date.

Why upstream: the LLM is already reading the doc cross-lingually for free —
re-implementing that as a client parser would be the bug source. Delegate
parsing to the LLM at extraction time; keep the fallback narrow.

Build-order impact: §7 Phase 0 row split into "Schema: add
`timeframeNormalized`" and "Client `computeDueDate()` + fallback + fixture
set".

### 5.4 3D model highlight performance — DISMISSED (premise stale)

**Resolution (2026-05-25):** the original concern's premise no longer
matches the codebase.

State checked: material caching is live in `src/components/anatomy/material-system.ts`
— `getCachedMaterials()` builds 3 variants per mesh, `precacheMaterials()` is
invoked at model load (`model-loader.ts:104, 232`), and `highlight()` in
`highlight-system.ts:125-171` uses the cache exclusively (reference swaps, no
on-the-fly cloning). `Body.svelte:569` clears the cache on destroy. The
"reverted in `5854011`" note in memory is out of date as of today.

The real outstanding work — multi-region painting with bucketed-by-variant
caching — is already captured by **G2** in §2.3 of this revision:

> `setHighlight(name)` stays unchanged (single-focus path for chat /
> documents). New additive `setMultiHighlight([{ mesh, color, opacity }])`
> paints all active items at once. Material cache extends to a bucketed
> `Map<variantKey, Material>` keyed by `(color, opacity bucket)` so the
> cache stays bounded. Delta-swap so each certainty recompute only updates
> meshes whose effective state changed.

Combined with G12's throttle (certainty recompute = once per page-load +
once per merge), the multi-region painting risk is fully addressed. No
additional Phase 0 row is needed for §5.4 specifically.

### 5.5 Trust separation — "Recommended" vs "Suggested" — RESOLVED (reframed)

**Resolution (2026-05-25):** the original split labels two states that don't
exist in v1. Reframed around provenance instead of badges.

State checked: every recommendation today comes through LLM extraction of
doctor text — no signal-threshold rule engine, no AI-derived "Suggested"
path. The recommendation schema currently has no provenance fields
(`originalText`, `sourceQuote`, `sourceProvider`) and no `isExplicitProviderInstruction`
flag. `SectionRecommendations.svelte` renders `description` + `urgency`
only; no source link, no provider attribution.

Decisions:

1. **Drop the "Recommended" / "Suggested" badge distinction from v1.** With
   only one extraction pathway, slapping "Recommended" on every task makes
   the badge meaningless; asking the LLM to mark "imperative enough" is a
   brittle cross-language signal that won't survive.

2. **Add provenance fields to the recommendation schema**
   (`src/lib/configurations/core.recommendations.ts`):
   ```ts
   sourceQuote?: string           // exact substring from the doctor text
   sourceProvider?: PerformerRef  // who recommended it, if attributable
   ```
   Field-level CRITICAL guards (anti-hallucination, same pattern as
   medications schema §2.2):
   - `sourceQuote`: *"ONLY populate with verbatim text from the source
     document. Never paraphrase. Omit if the recommendation is not stated
     literally."*
   - `sourceProvider`: *"ONLY populate when an identifiable provider is
     attached to this recommendation in the source. Do not infer from the
     document's overall provider."*

3. **Provenance reveal is the v1 trust UX.** Every Care Plan task surfaces a
   one-tap reveal — *"Dr. Novák wrote: '...'"* — which collapses §5.5 into
   §6.1 (the existing "Why is this here?" provenance reveal). No badge
   needed; the source quote is the trust signal.

4. **Defer "Suggested" until v2.** When signal-threshold rules or other
   non-doctor-derived task generators land, *they* get the "Suggested"
   badge and doctor-extracted tasks get "Recommended" by contrast. Not
   before.

Build-order impact: §7 Phase 0 Schema row added for `sourceQuote` +
`sourceProvider` with anti-hallucination guards. §6.1 (provenance reveal)
remains v1-essential — it was already on the "v1 must-have" list.

---

## 6. Best-in-Class Usability Improvements

Net-new ideas to raise the bar on the feature.

### 6.1 "Why is this here?" provenance reveal

Every Care Plan item, every task, every goal should expose a one-tap provenance
card showing the exact document snippet + page that produced it. Builds trust
faster than any UI polish. The data is already there (`sourceDocumentId`,
`confirmingDocuments[]`).

### 6.2 Doctor-prep mode

Before an appointment, generate a one-page "things to discuss" sheet from the
Care Plan: active items with low certainty, overdue tasks, signals trending
wrong. Print / PDF / email. This is the moment users will tell their friends
about Mediqom — they walked into the appointment prepared.

### 6.3 "I did this elsewhere" task completion

When marking a task done, ask "When?" (default: today) and "Where was this
done?" (free text, optional). Captures real-world resolution that didn't
come through a document. Feeds back into the timeline naturally.

### 6.4 Snooze with reason

PRD has `status: 'snoozed'` but no reason. Add
`snoozeReason?: 'cost' | 'time' | 'unsure' | 'other'` + free text. Later lets
the system surface patterns ("3 of your tasks are snoozed for cost — let's
talk about alternatives"). Don't surface the pattern in v1, just capture the
data.

### 6.5 Care Plan delta on post-import screen

The post-import summary (PRD step 5, lines 313-323) is the single
highest-engagement moment in the product. Lead with **change**, not status:
*"3 new things to know · 1 condition is improving · 1 task you can mark done."*
Concrete deltas beat abstract summaries.

### 6.6 Body region tap → filtered Care Plan view

PRD says tapping a 3D region opens Care Plan items for that anatomy. Go
further: persist that filter as a *view* (the URL becomes shareable across the
app). When the user returns to the chat or document list, the body filter
persists and other lists respect it.

### 6.7 Time-aware empty state

PRD's empty state is good. Make it dynamic: if no document in 90 days, the
empty state of the *task strip* on profile becomes *"Your last update was
March — Mediqom is most useful when it's current."* — gentle, no shame.

### 6.8 Chat as the universal action

Every Care Plan item should expose "Ask AI about this" (PRD line 489 already
mentions it). Extend: when the chat thread starts from a Care Plan item, the
response gets a *Suggested action* footer ("Want me to add a reminder to call
your doctor?") that creates a task back in the Care Plan. The chat → care
plan loop is the killer feature.

### 6.9 Plain-language translation of clinical content

The PRD's "Language System" tables are great for status labels, but the
*content* (diagnosis descriptions, recommendation text) is still clinical
Latin. Add a "Explain in plain language" toggle on each item — uses the
existing chat pipeline to rewrite the description in everyday words. One LLM
call per item, cached client-side after first use.

### 6.10 Sessions on the Care Journey Timeline

PRD defers session-driven Care Plan augmentation. Soft-disagree: a *single
recorded consultation* can produce richer Care Plan input than 3 imported
reports (because the patient is in the room asking questions). Even if v1
doesn't auto-merge session output into Care Plan, **show sessions on the
Care Journey Timeline** as `🎙️` events. Cheap to add, immediately legible.

### 6.11 Accessibility of opacity-only certainty

Opacity-as-certainty is elegant but invisible to screen readers and hard for
low-vision users. Add a screen-reader-only certainty phrase ("From 4 months
ago — still relevant?") and a settings toggle for "show certainty labels
inline."

### 6.12 Export / share with the next doctor

Deferred in the PRD, but mention it in the empty state copy ("Mediqom will
help you share this with your next doctor"). It's the *eventual* killer
feature — making it visible from day 1 grows expectations correctly.

---

## 7. Revised Build Order

PRD's order is right (logic before UI) but missing key dependencies. Revised:

| Phase | Step | Scope |
|---|---|---|
| 0 — Prerequisites | Extend `treatment-plan.ts` to add structured goal fields | Schema (`src/lib/configurations/`) |
| 0 — Prerequisites | ~~Add `changeType` to `prescription.ts`~~ — RESOLVED 2026-05-24 (see §2.2): unified into `medications.ts` + `Medication.changeType` in store; legacy `prescription.ts` deleted | Schema |
| 0 — Prerequisites | Add link annotation fields (`linkedCarePlanItemId`, `progressionFrom`, `linkedCarePlanTaskId`, `resolves`) to diagnosis & recommendation schemas | Schema |
| 0 — Prerequisites (§5.3) | Schema: add `timeframeNormalized` (`{ unit, value }`) to recommendation + follow-up schemas with anti-hallucination guard | `src/lib/configurations/core.recommendations.ts`, `core.followup.ts` if present |
| 0 — Prerequisites (§5.3) | Client `computeDueDate()` + `parseTimeframeFallback()` (chrono-node EN, regex cs/de) + fixture set (~30 examples) | New `src/lib/careplan/timeframe.ts`, `__tests__/timeframe.fixtures.json` |
| 0 — Prerequisites (§5.5) | Schema: add `sourceQuote` + `sourceProvider` to recommendation schema with field-level CRITICAL guards (verbatim only, no inference) | `src/lib/configurations/core.recommendations.ts` |
| 0 — Body parts (§2.3) | ~~Convert mesh registry to typed `.ts` and static-import enum into `core.bodyParts.ts`; remove runtime patch~~ — RESOLVED 2026-05-25 (see §2.3 "Enum population stability"): consistency achieved via shared `populateSchemaEnums()` helper. Static-import refactor is now optional cleanup, not a Phase 0 blocker. (G11) | `src/lib/langgraph/nodes/_schema-enums.ts` (new), `_base-processing-node.ts`, `medical-imaging-analysis.ts` |
| 0 — Body parts (§2.3) | Region meta-layer registry — explicit named groups connecting related meshes (G3) | New `src/data/anatomy-regions.ts` |
| 0 — Body parts (§2.3) | Anti-hallucination CRITICAL guards on body-parts schema (G3, G10) | `src/lib/configurations/core.bodyParts.ts` |
| 0 — Body parts (§2.3) | Unify `AnatomyIntegration` chat aliases with region registry (G3) | `src/lib/chat/integrations/anatomy-integration.ts` |
| 0 — Body parts (§2.3) | Mesh-name alias / migration table for future renames (G9) | New `src/data/anatomy-aliases.ts` |
| 0 — Body parts (§2.3) | Care Plan anatomy helper — validate, rollup, normalize (G3, G9) | New `src/lib/careplan/bodyparts.ts` + fixture tests |
| 0 — Body parts (§2.3) | `CarePlanBodyPartRef[]` with full provenance + per-region urgency (G1, G6, G8) | New `src/lib/careplan/types.d.ts` |
| 0 — Body parts (§2.3) | `relatedItems` graph field; Phase 1 emits relationship hints (G4) | `src/lib/careplan/types.d.ts`, `merge.ts`, Phase 1 prompt |
| 0 — Body parts (§2.3) | `setMultiHighlight([])` additive API; bucketed material cache; delta swap (G2, G12) | `src/components/anatomy/highlight-system.ts`, `material-system.ts`, `scene-state.ts` |
| 1 — Logic | Types, store (singleton load/save via existing encryption helpers) | New `src/lib/careplan/{types.d.ts,store.ts}` |
| 1 — Logic (§5.2) | Archival policy in store: `CAREPLAN_ARCHIVE_THRESHOLD_DAYS = 1095`, `getActivePlan()` / `getHistoricalItems()` split, resurrection on `linkedCarePlanItemId` | `src/lib/careplan/store.ts`, `merge.ts` |
| 1 — Logic | Care Plan context blob builder (Phase 1 input) | New `src/lib/careplan/context.ts` |
| 1 — Logic | Wire context blob into import request envelope (encrypt with per-job key) | `src/lib/import/`, `src/routes/v1/import/jobs/+server.ts` |
| 1 — Logic | Extend LangGraph extraction nodes to consume context + emit link annotations | `src/lib/langgraph/nodes/*` |
| 1 — Logic | Deterministic merge function (Phase 2) | New `src/lib/careplan/merge.ts` |
| 1 — Logic | Certainty & dedup utilities | New `src/lib/careplan/{certainty.ts,dedup.ts}` |
| 1 — Logic | Hook merge into client import flow after `decryptJobResults()` | Modify `src/lib/import/finalizer.ts` + `ImportView.svelte` |
| 2 — UI shell | Empty state + Care Plan item card | New components |
| 2 — UI shell | Care Plan page route | New `src/routes/med/p/[profile]/care-plan/+page.svelte` |
| 2 — UI shell | Nav item, ProfileDashboard slot | Modify existing |
| 3 — Differentiator | 3D model highlight integration (material caching is already live — see §5.4; G2 multi-highlight + G12 throttle land in Phase 0) | Modify `Body.svelte` |
| 3 — Differentiator | Post-import summary screen with delta framing | New component |
| 4 — Trust layer | Provenance reveal on every item | Augment item card |
| 4 — Trust layer | "Explain in plain language" toggle | Augment item card |
| 5 — Deferred but cheap | Show sessions on Care Journey Timeline | Modify timeline component |

**v1-essential improvements from §6** (author's bias for "best-in-class"):
6.1 (provenance), 6.5 (delta framing), 6.8 (chat ↔ care plan), 6.10 (sessions
on timeline). The rest can wait.

---

## 8. Critical Files for Implementation

Read before writing assembly:

- `src/lib/import/finalizer.ts` — the correct hook point, lines 80-138
  (decrypt) and 146-434 (assembly)
- `src/components/import/ImportView.svelte:135-144` — the call site
- `src/components/profile/PropertyTile.svelte:122,139,162,214` — exact
  certainty / opacity pattern to mirror
- `src/data/properties.ts:55-79` — `computeOutputForRereference` signature
- `src/lib/datetime.ts:133-139` — `durationFromFormatted` signature
- `src/data/signal-catalog.ts` — signal expiration data
- `src/lib/configurations/core.{diagnosis,recommendations,bodyParts,signals}.ts`
  — extraction shape
- `src/lib/configurations/treatment-plan.ts` — needs schema extension (Phase 0)
- ~~`src/lib/configurations/prescription.ts`~~ — DELETED 2026-05-24; `src/lib/configurations/medications.ts` is the sole source, with `Medication.changeType` persisted via `src/lib/medications/types.ts` and `src/lib/medications/convert.ts`
- `src/lib/medications/store.ts` — for medication linking
- `src/lib/health/signals.ts:16-33` — singleton encrypted document load pattern
- `src/components/profile/ProfileDashboard.svelte`,
  `src/components/layout/NavBar.svelte` — UI integration sites

---

## 9. Semantic Architecture — ONTOLOGY.md

Broader questions about formal ontological grounding live in `ONTOLOGY.md`:

- Honest positioning of the current architecture (well-governed conceptual map,
  not formal ontology)
- The LLM-as-reasoner epistemological gap (Phase 1 entity resolution is
  probabilistic, not axiom-derived)
- Concrete grounding paths: ICD-10 hierarchy traversal, FMA mapping for anatomy,
  SNOMED CT, explicit clinical rules, OWL reasoning
- Typed relation vocabulary roadmap — how `relatedItems.reason` grows from
  `laterality/progression/comorbidity` toward `causation/manifestation/
  monitoring-dependency`

Decisions in §1–8 above are Care Plan-scoped; ONTOLOGY.md is the home for
any cross-cutting semantic architecture decisions.

---

## 10. Open Decisions for the Author

1. **Hybrid assembly model (§1)** — confirm the split: server-side LLM emits
   link annotations during extraction; client does the deterministic merge.
2. **Schema gaps** — confirm the four Phase 0 schema changes (treatment goals,
   medication change types, body parts enum source, link annotation fields)
   happen before logic work starts.
3. **Context blob scope** — confirm the `CarePlanExtractionContext` shape
   (active items, active tasks, recent medications). Trade-off: more context
   = better matching but more LLM tokens per import.
4. **Improvement scope** — which of §6.1–6.12 ship in v1 vs. v2.

---

## 11. Verified Codebase Claims (Reference)

| Claim | Status | Evidence |
|---|---|---|
| `computeOutputForRereference()` exists | TRUE | `src/data/properties.ts:55-79` |
| `durationFromFormatted()` exists | TRUE | `src/lib/datetime.ts:133-139` |
| `PropertyTile.svelte` valueHeat pattern | TRUE | `src/components/profile/PropertyTile.svelte:122,139,162,214` |
| Signal `valueExpirationInDays` per signal | TRUE | `src/data/signal-catalog.ts:30` |
| Singleton encrypted doc pattern | TRUE | `src/lib/types.d.ts`, `src/lib/health/signals.ts:16-33` |
| Diagnosis fields (ICD-10, type, confidence, date) | TRUE | `src/lib/configurations/core.diagnosis.ts:8-38` |
| Recommendation fields | TRUE | `src/lib/configurations/core.recommendations.ts:19-95` |
| Follow-up schedule fields | TRUE | `core.recommendations.ts:118-142` |
| Signal urgency 1–5 | TRUE | `src/lib/configurations/core.signals.ts:61-64` |
| `bodyParts[].identification` field | TRUE (enum populated at runtime via shared helper since 2026-05-25) | `src/lib/configurations/core.bodyParts.ts:8-12` + `src/lib/langgraph/nodes/_schema-enums.ts` |
| Medication store linkable by document id | TRUE | `src/lib/medications/store.ts` |
| `ProfileDashboard.svelte`, `NavBar.svelte` | TRUE | both exist, ready for modification |
| Treatment goals are structured objects | TRUE (resolved 2026-05-21) | shared shape in `core.treatmentGoal.ts`, consumed by `treatments.ts:357`, `treatment-plan.ts:299-303`, `core.recommendations.ts:101-105` |
| Medications have new/changed/discontinued split | TRUE (resolved 2026-05-24) | unified `medications.ts` with split arrays + `changeType` on stored `Medication` (`medications/types.ts`); legacy `prescription.ts` and `analyzeReport.ts` deleted; convert layer walks all four arrays in `medications/convert.ts` |
| Empty-enum population is reliable across all schemas | TRUE (resolved 2026-05-25) | shared `populateSchemaEnums()` helper in `src/lib/langgraph/nodes/_schema-enums.ts`; recursive walk covers all 16 `coreBodyParts` mount keys + inlined `imaging.ts` enum + signal enum; idempotent; both prior call sites collapsed to one line |
| Material caching in 3D anatomy is active | TRUE (verified 2026-05-25 — §5.4 premise stale) | `material-system.ts` (`getCachedMaterials`, `precacheMaterials`), invoked at model load in `model-loader.ts:104,232`; cache cleared on destroy in `Body.svelte:569`. Outstanding work is bucketed multi-variant cache (G2 / §2.3), not the original cache. |
| `MilestoneProgress.svelte` exists | FALSE (external aouros ref) | not in repo |
| Server route is the *sole* assembly hook | FALSE → resolved via hybrid (§1) | LLM phase server-side, merge phase client-side in `finalizer.ts:80-138` |
| Platform "never sees unencrypted health data" | OVERSTATED | server holds plaintext transiently during extraction for LLM dispatch — correct claim is "never stores" |
| Timeframe is parsed to a structured duration | FALSE (resolved by §5.3 plan) | extraction captures `timeframe` as free-text only across `core.recommendations.ts:51,128`, `imaging-findings.ts:418`, `session.diagnosis.ts:376`. Phase 0 adds `timeframeNormalized` + client `computeDueDate()`. |
| Recommendation schema captures source quote / provider | FALSE (resolved by §5.5 plan) | no `sourceQuote` or `sourceProvider` field today. Phase 0 adds both with anti-hallucination guards; provenance reveal in UI supersedes the Recommended/Suggested badge split for v1. |
