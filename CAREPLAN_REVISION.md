# Care Plan PRD — Revision Notes

Companion to `CAREPLAN.md`. Tracks outstanding gaps not yet folded into the
PRD, v1 scope expansion, open decisions, and a changelog of what was resolved
and when.

**Status (2026-05-31):** core architecture, schema groundwork, and most
Phase 0 prerequisites are resolved and live in `CAREPLAN.md` as the canonical
design. Outstanding work is concentrated in the careplan logic module (still
essentially unbuilt), the body parts cluster (G1–G12), the first mutating
MCP tool, and the v1 UI layer.

---

## 1. Outstanding Work (2026-05-31)

Verified by reading the actual files. Each item maps to a build row in
`CAREPLAN.md` §"Missing Features — Build List" or to a §2 v1-expansion row
below.

### Schema

- `timeframeNormalized: { unit, value }` not yet on
  `src/lib/configurations/core.recommendations.ts` (Build List row 1a).
- `sourceQuote` + `sourceProvider` not yet on recommendation or
  treatment-goal schemas (Build List row 7g).
- Link annotations (`linkedCarePlanItemId`, `progressionFrom`,
  `linkedCarePlanTaskId`, `resolves`) not yet on diagnosis / recommendation
  schemas (Build List row 7a).
- Anti-hallucination CRITICAL prose guard not yet on
  `src/lib/configurations/core.bodyParts.ts` — enum constraint and
  lateralization guard are in place, but the "never infer from disease
  names, adjacent structures, or laterality assumptions" prose is missing
  (Build List row 7m).

### Data

- `src/data/anatomy-regions.ts` — region meta-layer registry — does not exist
  (Build List row 7n).
- `src/data/anatomy-aliases.ts` — mesh-rename migration table — does not
  exist (Build List row 7o).

### 3D anatomy

- `setMultiHighlight([{ mesh, color, opacity }])` additive API not built;
  bucketed `Map<variantKey, Material>` cache not built. Only single-focus
  `setHighlight(name)` exists. `focusObject()` accepts arrays but warns
  *"Multiple objects to focus not supported yet"* (Build List row 7t,
  `src/components/anatomy/highlight-system.ts` + `material-system.ts`).

### Logic module

`src/lib/careplan/` contains only `normalize.ts` + `normalize.test.ts`.
Everything else on the logic layer is unbuilt:

- `types.d.ts`, `store.ts`, `merge.ts`, `assembly.ts`, `context.ts`,
  `certainty.ts`, `dedup.ts`, `timeframe.ts`, `bodyparts.ts`,
  `plain-language.ts`, `notifications.ts`.
- Maps to Build List rows 1b, 2, 3, 4, 5, 6, 7b, 7c, 7d, 7e, 7f, 7h, 7k,
  7p, 7q, 7r.

### Chat integration

- `ChatContextItem` not yet extended with `carePlanItem` / `carePlanTask`
  kinds (Build List row 7i).
- `createCarePlanTask` mutating MCP tool not built — `src/lib/context/mcp-tools/tools/`
  contains 6 read-only tools today; this would be the first mutating tool
  in the system (Build List row 7j).

### UI

- No `src/components/careplan/` directory.
- No `src/routes/med/p/[profile]/care-plan/+page.svelte` route.
- All UI rows in Build List 8–19 pending.

### External dependency

`CAREPLAN.md` line 911 references porting `MilestoneProgress.svelte` from
the `aouros` repository. That component does not exist in Mediqom. Decide
between port or replace with a `src/components/charts/`-composed Gantt
(existing `VerticalReferenceRangeChart.svelte` already handles temporal
scaling).

---

## 2. v1 Scope Expansion — Not Yet in CAREPLAN.md

Six items surfaced by 2026-05-31 codebase verification. Each leverages
existing infrastructure the original PRD didn't claim. Approved for v1
scope.

### 2.1 Care Team as a first-class object

The PRD treats provider attribution as a bare `PerformerRef` (role + name +
specialty). The codebase has had a far richer `ProviderContact` model since
commit `504d5cd` (Contacts and Calendar) — vCard fields, institution,
role, `sourceDocuments` back-references, native contact sync state. The
Care Plan should claim it.

- **Item / task / goal cards** render the provider as a tappable contact
  card, not a string. Tap opens contact details (institution, phone,
  department) and "all items mentioning this provider."
- **Care Team rail** on the Care Plan page surfaces every provider across
  active items, grouped by role (primary physician, specialists, allied
  health). The rail is the human counterpart to the 3D body navigation —
  spatial on one side, social on the other.
- **Source documents per provider** are already tracked. "All
  recommendations from Dr. Novák" becomes a one-tap filter.

Build cost: a Care Team rail component plus provider-card composition on
existing item/task/goal cards. No new model work — `src/lib/contacts/` is
ready.

### 2.2 Signal sparkline thumbnails on goal cards

`CarePlanGoal.monitoringSignal` links a goal to a signal in the catalog,
but the PRD doesn't specify how the trend renders. Existing
`src/components/charts/VerticalReferenceRangeChart.svelte` already draws
sparklines with reference-range shading, medication lanes, and point
hover.

- **Goal card**: miniature sparkline thumbnail inline (last 90 days of
  the linked signal), trend phrase from the PRD's language table.
- **Tap**: opens the full chart in a side panel — same chart, no
  duplication.
- Pure composition. No new chart code, no schema change.

Build cost: a `<GoalSparkline>` wrapper that reads
`profile.health.signals[name].values` and forwards into the existing
component.

### 2.3 Multi-profile Care Plan UX

Data model is per-profile (`carePlanDocumentId` matches the
`healthDocumentId` pattern). The PRD doesn't specify the *switching* UX —
crucial when a caregiver manages a dependent's plan.

- **Profile selector at homepage hero** above the 3D model. Switching
  refreshes the model, the active Care Plan singleton, and the timeline.
- **Plan-scoped copy**: *"Mom's Care Plan"*, *"Daniel's Care Plan"* on
  the page title and summary stats. Sets context without breaking the
  calm framing.
- **Cross-plan task strip** on the caregiver's *own* homepage: gentle
  surfacing of high-priority items across managed profiles ("Mom has a
  cardiology appointment Friday"). Opt-in; off by default.

Build cost: profile selector component reuse from existing profile UI
(already exists for switching), plus copy threading and a top-of-strip
aggregation query.

### 2.4 Plain-language i18n fallback

CAREPLAN.md §"Plain-language translation" assumes a one-off LLM call per
item. The i18n system already covers 3,750 keys across 7 locales,
including anatomy and many medical condition names. Cheaper, more
consistent default:

- Before the LLM call, look up `careplan.plain.<icd10>` (or whichever
  key convention §4.3 settles on).
- Hit → return the localised string; cache invalidation on locale
  change is automatic.
- Miss → fall back to the LLM rewrite path the PRD already describes.

Two wins: cost (no per-condition LLM call for the common conditions
that populate the i18n dictionary over time) and translation
consistency (common conditions read the same way every time, not a
fresh LLM paraphrase each render).

Build cost: a key-lookup wrapper at the top of
`src/lib/careplan/plain-language.ts` (already on the build list). i18n
keys populate incrementally — not blocking.

### 2.5 Care Plan sharing — extend `document_shares`

`CAREPLAN.md` §Deferred originally deferred "share with the next doctor"
to a future phase; the empty-state copy is now updated to make it a v1
promise. The `DocumentShare` system at `src/routes/v1/share/` already
handles RSA-wrapped AES keys per recipient, pending-share encryption,
accept flow, and revocation. Extending to Care Plan is a small typed
variant, not a new system.

- **Schema**: add `share.type: 'document' | 'carePlan'` (or
  `target_kind` column in `document_shares`). Migration is additive.
- **Encryption boundary unchanged**: Care Plan singleton already
  encrypts with the same per-profile AES + RSA-wrap pattern as
  `healthDocumentId`. Sharing reuses the same key-rewrap flow.
- **Read-only on the recipient side**: merge operations stay on the
  owner's device. Recipient sees a decrypted, frozen snapshot they can
  navigate. Re-shares forbidden.
- **"Share this Care Plan" button** on the Care Plan page → reuses the
  existing Share UI flow → recipient gets the empty-state promise
  delivered.

Build cost: one schema column, one share-type branch in the share
endpoints, one button + accept route in the UI. The encryption work is
zero — the existing helpers already do everything required.

### 2.6 Local notifications for task reminders

`CAREPLAN.md` §Deferred originally deferred push/local notifications;
the Deferred section is now split — push notifications stay deferred
(server-side FCM/APNs configuration is significant), local
notifications are v1. `@capacitor/local-notifications` does not need
server work — the device schedules and fires the notification on its
own.

- **Schedule** on task creation / `dueDate` update: 3 days before,
  1 day before, on the morning of. Cancellation on `status: 'done' |
  'snoozed' | 'ignored'`.
- **Copy** follows the positive-framing rule (§4.4): *"A good time to
  schedule your blood test"* — never *"OVERDUE: blood test"*.
- **Opt-in**: a settings switch (default off) honouring native
  permission state. Snoozed tasks reschedule for `snoozedUntil`.
- **Web** is a no-op; the feature only mounts on Capacitor.

Build cost: package install + `src/lib/careplan/notifications.ts`
scheduler + settings toggle. No server work.

---

## 3. Roadmap (Post-v1)

Considered but not v1:

- **Doctor-prep mode** — pre-appointment "things to discuss" sheet
  (active items with low certainty, overdue tasks, signals trending
  wrong → print / PDF / email).
- **"I did this elsewhere" task completion** — when marking a task done,
  capture *when* and *where* (free text). Reflects out-of-system
  resolution back into the timeline.
- **Body region tap → persistent filter view** — extend the PRD's "tap
  region opens filtered Care Plan" so the filter is a URL-shareable
  *view*. Other lists (chat, document list) respect it while active.

Deferred in `CAREPLAN.md` §Deferred:

- Session-content auto-merge into Care Plan items (icon-on-timeline
  ships in v1; content merge is post-v1).
- Push notifications (requires FCM/APNs).
- Calendar integration (promote once §2.6 local notifications land and
  prove the mobile reminder pattern).

---

## 4. Open Decisions for the Author

1. **Context blob scope** — confirm the `CarePlanExtractionContext` shape
   (active items, active tasks, recent medications). Trade-off: more
   context = better matching but more LLM tokens per import.
2. **Care Team rail layout (§2.1)** — sidebar on desktop ≥ 1024px,
   horizontal scroll rail on mobile. Confirm before component build.
3. **Plain-language i18n key convention (§2.4)** — pin
   `careplan.plain.<icd10>` (recommended — keeps Care-Plan-scoped keys
   grouped, doesn't collide with the existing `diagnosis.*` namespace
   used elsewhere) vs `diagnosis.<icd10>.plain_language` vs
   `medical.icd10.<code>.plain` before any keys land.
4. **Notification copy review (§2.6)** — positive-framing rule
   (information + opportunity, never obligation + failure) applies to
   notifications too. Reuse PRD §Language System task-state strings as
   the source. Owner: language reviewer, not build.

---

## 5. Phased Build Order

`CAREPLAN.md` §"Missing Features — Build List" carries the flat row-level
breakdown. This section groups those rows into phases. All Logic rows
ship before any UI row.

| Phase | Build List rows | Scope |
|---|---|---|
| 0 — Schema groundwork | 1a, 7a, 7g, 7m | `timeframeNormalized`, link annotations, `sourceQuote`/`sourceProvider`, anti-hallucination guard on `core.bodyParts.ts` |
| 0 — Body parts (G1–G12) | 7m, 7n, 7o, 7p, 7q, 7r, 7s, 7t | Region meta-layer, alias table, anatomy helper, `CarePlanBodyPartRef`, `relatedItems` graph, AnatomyIntegration unification, `setMultiHighlight` + bucketed cache |
| 1 — Logic core | 1b, 2, 3, 4, 5, 6, 7b, 7e, 7h, 7k | Timeframe compute, types, store, assembly, certainty, dedup, context blob, merge function, `CarePlanDelta`, plain-language cache |
| 1 — Server hooks | 7c, 7d, 7f, 7l | Wire context blob into import envelope; extend LangGraph nodes; hook merge into finalizer; document `originKind` flag |
| 1 — Chat integration | 7i, 7j | `ChatContextItem` extension; `createCarePlanTask` mutating MCP tool |
| 2 — UI shell | 8, 9, 10, 11, 12 | Empty state, item card, page route, profile dashboard slot, nav item |
| 3 — Differentiator | 13, 14 | 3D model highlight wiring; post-import delta summary screen |
| 4 — Trust layer | 15, 16, 17, 18 | Provenance reveal, snooze dialog, session timeline icon, settings toggle |
| 5 — Chat → Care Plan loop | 19 | Suggested-action footer invoking `createCarePlanTask` |
| 6 — v1 expansion (§2.1–2.6) | not yet in CAREPLAN.md Build List | Care Team rail, signal sparklines, multi-profile UX, plain-language i18n fallback, Care Plan share, local notifications |

---

## 6. Critical Files for Implementation

Reference before writing assembly:

- `src/lib/import/finalizer.ts` — hook point, lines 80-138 (decrypt) and
  146-434 (assembly).
- `src/components/import/ImportView.svelte:135-144` — the call site.
- `src/components/profile/PropertyTile.svelte:122,139,162,214` — exact
  certainty / opacity pattern to mirror.
- `src/data/properties.ts:55-79` — `computeOutputForRereference()`
  signature.
- `src/lib/datetime.ts:133-139` — `durationFromFormatted()` signature.
- `src/data/signal-catalog.ts` — signal expiration data.
- `src/lib/configurations/core.{diagnosis,recommendations,bodyParts,signals,treatmentGoal}.ts`
  — extraction shapes.
- `src/lib/medications/{store.ts,convert.ts,types.ts}` — medication
  linking; `Medication.changeType` persists doctor intent.
- `src/lib/health/signals.ts:16-33` — singleton encrypted document load
  pattern (template for Care Plan singleton).
- `src/lib/contacts/` — Care Team rail source (§2.1).
- `src/routes/v1/share/` — Care Plan share base (§2.5).
- `src/components/charts/VerticalReferenceRangeChart.svelte` — goal
  sparkline source (§2.2).
- `src/components/profile/ProfileDashboard.svelte`,
  `src/components/layout/NavBar.svelte` — UI integration sites.

---

## 7. Semantic Architecture — ONTOLOGY.md

Cross-cutting semantic decisions (FHIR alignment, ontological grounding,
the LLM-as-reasoner gap, typed relation vocabulary roadmap) live in
`ONTOLOGY.md`. Care Plan should adopt FHIR `CarePlan` + `Goal` resource
shapes at the type-definition stage rather than retrofit later.

---

## 8. Changelog

| Date | Resolution |
|---|---|
| 2026-05-21 | **Treatment goals shared shape** — `src/lib/configurations/core.treatmentGoal.ts` + `src/lib/careplan/normalize.ts`. Consumed by `treatments.ts:357`, `treatment-plan.ts:299-303`, `core.recommendations.ts:101-105`. |
| 2026-05-24 | **Medications new/changed/discontinued split + `changeType`** — unified `src/lib/configurations/medications.ts`; legacy `prescription.ts` and `analyzeReport.ts` deleted; `Medication.changeType` persisted via `src/lib/medications/types.ts:79`; convert layer walks all four arrays in `src/lib/medications/convert.ts`. |
| 2026-05-25 | **Empty-enum population stability** — `populateSchemaEnums()` helper in `src/lib/langgraph/nodes/_schema-enums.ts`; covers all 16 `coreBodyParts` consumers plus inlined `imaging.ts` enum. |
| 2026-05-25 | **Archival policy** — folded into CAREPLAN.md §"Archival policy": `CAREPLAN_ARCHIVE_THRESHOLD_DAYS = 1095`, `getActivePlan()` / `getHistoricalItems()` split, resurrection on `linkedCarePlanItemId`. |
| 2026-05-25 | **Timeframe parser plan** — push cross-language understanding to the LLM (`timeframeNormalized` schema field with anti-hallucination guard); thin client fallback in `src/lib/careplan/timeframe.ts` with chrono-node EN + regex cs/de; ~30 fixture examples gate the fallback. Schema and client modules still pending — see §1. |
| 2026-05-25 | **3D material caching verified live** — `material-system.ts` (`getCachedMaterials`, `precacheMaterials`), invoked at model load in `model-loader.ts:104,232`. Outstanding work is bucketed multi-variant cache (G2 in §1), not the original cache. |
| 2026-05-25 | **Trust UX reframed** — dropped "Recommended" / "Suggested" badge distinction from v1; provenance reveal is the v1 trust surface. `sourceQuote` + `sourceProvider` Phase 0 schema additions still pending — see §1. |
| 2026-05-25 | **Hybrid assembly model** — server-side LLM emits link annotations, client does the deterministic merge. Folded into CAREPLAN.md §"Assembly Architecture — Hybrid Model". |
| 2026-05-25 | **Privacy guarantee corrected** — "Mediqom never **stores** unencrypted health data" replaces the over-stated "never sees" framing. Folded into CAREPLAN.md §"Privacy boundary". |
| 2026-05-25 | **Conflict resolution rules + worked examples** folded into CAREPLAN.md §"Conflict resolution". User edit > Document extraction > AI inference. |
| 2026-05-25 | **Task lifecycle on re-import** folded into CAREPLAN.md §"Task lifecycle": new task with `previouslyCompleted` hint, not a reopen. |
| 2026-05-25 | **Body parts design (G1–G12)** — `CarePlanBodyPartRef`, region meta-layer concept, multi-region rendering, mesh durability all documented in CAREPLAN.md §"3D Model Integration" and §"CarePlanItem". Implementation still pending — see §1. |
| 2026-05-31 | **Codebase verification + v1 scope expansion** — §1 outstanding-work list anchored to actual files; §2.1–2.6 promoted to v1 (Care Team, signal sparklines, multi-profile UX, plain-language i18n fallback, Care Plan share, local notifications); CAREPLAN.md §Deferred updated to move sharing + local notifications out, and empty-state share copy updated to drop the "later" framing. |
