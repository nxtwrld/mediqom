# Care Plan — Product Requirements Document

## Vision

The Care Plan is the primary patient-facing output of Mediqom. It transforms imported
medical documents into a living, evolving record of what is known about a person's
health — and what deserves attention next.

It is not a dashboard. It is not a task manager. It is a calm, aware companion that
reflects the user's health journey as it actually is: incomplete, evolving, and
ultimately moving toward good outcomes.

**The mission:** Own the moment after every doctor visit. When a patient leaves
confused or overwhelmed, Mediqom is what they open.

---

## Product Principles

### 1. Awareness without alarm
The Care Plan communicates through gentle visual fading and plain language — not red
alerts, not "overdue" warnings. Items that need attention rise naturally to the top.
Items from the past fade gracefully. The user is always oriented, never stressed.

### 2. Positive framing
Every string follows this rule: **information + opportunity, never obligation + failure.**

Mediqom harnesses the positive power of awareness and trust in positive outcome,
while not numbing the user to take interest in self care.

### 3. Earned through data
No documents → no Care Plan. The empty state shows the shape of what will materialize —
a motivating preview, not an empty void. Every document imported adds clarity and
detail. The Care Plan is a promise that keeps being fulfilled.

### 4. Lives and breathes
The Care Plan evolves with:
- Every document imported
- Every user interaction (task completion, note, snooze)
- Every app launch (temporal state recomputed from current date)

No manual maintenance required. The system does the work.

---

## Unique Value Proposition

This combination does not exist in any consumer health product:

1. **Auto-assembled from real clinical documents** — not self-reported symptoms.
   Grounded in actual ICD-10 codes, LOINC lab values, real prescriptions.

2. **Encrypted, user-controlled** — Mediqom never *stores* unencrypted health data.
   At rest, the Care Plan is encrypted with user-controlled keys. During import
   analysis, the LLM provider sees the data necessary for extraction — the same
   exposure profile as every other document in the system. No new privacy
   trade-off is introduced by the Care Plan layer.

3. **3D anatomy as a navigation layer** — Care Plan items highlight their relevant
   body regions. The user can explore their body spatially rather than read a list.
   No consumer health app does this.

4. **Temporal certainty** — items fade as they age and brighten when confirmed by
   new data. The Care Plan communicates data freshness visually, without words.

5. **Full data integration** — medications, doctors, lab trends, appointments all
   already structured and ready to feed the Care Plan with zero new extraction.

---

## What We Already Extract (No New AI Needed)

Every field the Care Plan needs is already extracted by the import pipeline:

| Source | Fields available |
|---|---|
| Diagnoses | ICD-10 code, description, type (primary/secondary/differential/provisional/confirmed), confidence, date |
| Recommendations | Text, category, priority, timeframe ("in 2 weeks"), related diagnosis, monitoring signals, referral details |
| Follow-up schedule | Appointment type, timeframe, provider, purpose |
| Treatment goals | Goal text, category (curative/palliative/preventive/symptomatic/rehabilitative), timeline, measurable outcome, monitoring signal, optional numeric target value / range (only when explicitly stated) |
| Medications | New prescriptions (name, dose, frequency, route, duration), changes (type, previous/new dose), discontinued |
| Lab signals | Name, value, unit, reference range, urgency 1–5, date — already saved to health profile |
| Body parts | `bodyParts[].identification` — enum populated at runtime from the same `objects.json` mesh registry the 3D viewer uses, plus a region meta-layer (`anatomy-regions.ts`) for rollups. Schema carries an anti-hallucination CRITICAL guard — only literal regions, never inferred from disease names. |
| Provider | Role, name, specialty, institution |

The gap is entirely in the **assembly layer** (reading document output → building Care Plan
state) and the **UX layer** (surfacing it to users).

---

## Data Model

### Structure

One Care Plan document per profile — a singleton encrypted document, exactly like
the existing `healthDocumentId` and `profileDocumentId` pattern.

```
Profile
├── profileDocumentId   → vcard + insurance
├── healthDocumentId    → signals, medications, allergies
└── carePlanDocumentId  → Care Plan items (NEW)
```

Each profile — primary user, dependent, or family member — has its own
Care Plan. Switching profiles in the UI loads a different
`carePlanDocumentId`; nothing is shared across profiles, and encryption
uses the same per-profile key pattern as `healthDocumentId`.

### CarePlanDocument

```typescript
interface CarePlanDocument {
  items: CarePlanItem[]           // active + recent items
  historicalItems: CarePlanItem[] // archived, loaded lazily by the UI
  updatedAt: string
}
```

The set of documents that have contributed to the plan is derivable from
`union(items[].confirmingDocuments[], historicalItems[].confirmingDocuments[])`
— no separate registry is stored. Import idempotency is enforced upstream at
the import pipeline; re-merging the same extraction is a no-op at the merge
layer.

#### Archival policy

A patient with 10+ years of medical history could accumulate hundreds of
`CarePlanItem` entries. The singleton encrypted document must decrypt and
render on every Care Plan page open, so growth is bounded by an explicit
archival rule:

- Items with `status: 'historical' | 'resolved'` **and**
  `lastSeenInDocumentDate` older than **3 years (1095 days)** move from
  `items[]` into `historicalItems[]`.
- Threshold lives as `CAREPLAN_ARCHIVE_THRESHOLD_DAYS = 1095` in
  `src/lib/careplan/store.ts` — single source, easy to bump later.
- `getActivePlan()` returns `{ items, updatedAt }`. `getHistoricalItems()`
  is a separate call invoked when the user expands the History section.
  The AES decrypt is whole-doc (one envelope); the lazy win is JSON parse
  + render cost.
- **Resurrection:** if a new extraction returns
  `linkedCarePlanItemId` pointing to an archived item, the merge function
  first moves it back into `items[]` before applying the update. The merge
  logic stays uniform regardless of where the item lived.
- **Dashboard counts:** archived items are excluded from the profile
  homepage progress dial and task strip. They surface only in the Care
  Plan page's History section ("X items from before [date]").

### CarePlanItem

```typescript
interface CarePlanItem {
  id: string

  // Identity — deduplication anchor
  diagnosisCode?: string           // ICD-10 (primary key for cross-document dedup)
  diagnosisDescription: string     // fallback when code not available

  // Classification
  conditionType: 'acute' | 'chronic' | 'monitoring' | 'wellness' | 'exploratory'
  certaintyCycleInDays: number     // how fast certainty decays (see Temporal System)

  // Provenance — aggregated across confirmingDocuments[].
  // Per-record quotes live on tasks[] and goals[] (sourceQuote/sourceProvider),
  // not on the item itself. The item's `provider` is the diagnosis-level
  // performer; the verbatim recommendation/goal text belongs on the
  // record that originated it.
  firstSeenDate: string
  lastSeenInDocumentDate: string
  confirmingDocuments: string[]    // all docIds that confirm this item
  contradictingDocuments: string[] // docIds that dispute this item

  // Status (stored)
  status: 'active' | 'monitoring' | 'resolved' | 'historical'
  resolvedAt?: string
  resolvedByDocumentId?: string
  lastViewedAt?: string
  userNotes?: string

  // Clinical data
  diagnosis: DiagnosisRef          // code, description, type, confidence, date
  provider?: PerformerRef

  // Linked items
  tasks: FollowUpTask[]
  goals: CarePlanGoal[]
  medicationIds: string[]          // refs to medication store
  monitoringSignals: string[]      // signal names from signal catalog
  bodyParts: CarePlanBodyPartRef[] // anatomical regions with provenance — see CarePlanBodyPartRef
  relatedItems?: Array<{           // graph edges to other items on the same plan (G4)
    id: string                     // CarePlanItem.id
    reason: 'laterality' | 'progression' | 'comorbidity'
  }>
}
```

The three `relatedItems` reason types are the seed of a typed relation vocabulary.
The vocabulary is closed in v1 — new reason types require deliberate addition.
A broader set (`causation`, `manifestation`, `monitoring-dependency`) is on the
roadmap; see `ONTOLOGY.md` §Relation Vocabulary.

Body parts on `CarePlanItem` are richer than a mesh-name array — they carry
per-region status, urgency, and the document(s) that contributed each region,
so the union-merge across years of documents stays traceable.

```typescript
interface CarePlanBodyPartRef {
  identification: string           // mesh name from src/data/objects.json
  part?: string                    // region rollup parent (e.g., R_knee for R_patella) — see §3D Model Integration · Region meta-layer
  status?: 'active' | 'monitoring' | 'recovering'
  treatment?: string               // free-text, doctor-written
  urgency?: 1 | 2 | 3 | 4 | 5      // doctor-written severity, max across documents (drives 3D pulse intensity)
  sources: string[]                // docIds that contributed this region — union-merged on each import
}
```

`bodyParts: []` is valid — items with no anatomical locus (depression,
allergies, vitamin D deficiency, ME/CFS) are first-class. A reserved
`whole_body` `identification` exists for items that affect the body
generally. The Care Plan list view never hides an item because no mesh
lights up.

### FollowUpTask

```typescript
interface FollowUpTask {
  id: string
  text: string
  category: 'follow_up' | 'referral' | 'diagnostic_test' | 'monitoring'
           | 'lifestyle' | 'medication' | 'treatment' | 'prevention' | 'education'
  priority: 'immediate' | 'urgent' | 'routine' | 'as_needed'

  // Temporal
  sourceDocumentDate: string       // date of the document that created this task
  timeframeText?: string           // original free-text timeframe from the doc
  timeframeNormalized?: {          // LLM-emitted normalized duration (primary)
    unit: 'days' | 'weeks' | 'months' | 'years'
    value: number
  }
  dueDate?: string                 // computed: sourceDocumentDate + timeframeNormalized.
                                   // Falls back to `parseTimeframeFallback(timeframeText)`
                                   // for legacy extractions. Omitted when neither yields a date.
  certaintyCycleInDays: number     // immediate=3, urgent=14, routine=90, as_needed=180

  // State
  status: 'pending' | 'done' | 'snoozed' | 'ignored'
  completedAt?: string
  snoozedUntil?: string
  snoozeReason?: 'cost' | 'time' | 'unsure' | 'other'  // captured when user snoozes
  snoozeNote?: string                                   // optional free-text detail

  // Links
  diagnosisItemId: string
  sourceDocumentId?: string         // optional: chat-created tasks have no source document

  // Provenance (rendered by the "Why is this here?" reveal — see §UX)
  sourceQuote?: string              // verbatim from the source document
  sourceProvider?: PerformerRef     // who recommended it, if attributable
  sourceMessageId?: string          // set when chat created the task (see §Task creation paths)
}
```

### CarePlanGoal

```typescript
interface CarePlanGoal {
  id: string
  goal: string                     // the goal text — matches extraction schema
  category?: 'curative' | 'palliative' | 'symptomatic'
           | 'preventive' | 'rehabilitative'
  measurableOutcome?: string
  timeline?: string

  // Signal tracking
  monitoringSignal?: string        // signal name from signal catalog
  targetValue?: number
  targetRange?: { min: number; max: number }
  // trend computed live from profile.health.signals[signal].values — not stored

  // Provenance (rendered by the "Why is this here?" reveal — see §UX)
  sourceQuote?: string             // verbatim from the source document
  sourceProvider?: PerformerRef    // who set the goal, if attributable
}
```

---

## Temporal Certainty System

### The model (mirrors PropertyTile.svelte valueHeat)

Certainty is computed at load time from stored dates — never stored itself.
Uses the same `computeOutputForRereference()` utility already in the codebase.

```typescript
function computeItemCertainty(item: CarePlanItem): number {
  const age = durationFromFormatted('days', item.lastSeenInDocumentDate)
  const baseConfidence = {
    confirmed: 1.0, probable: 0.8, possible: 0.6, suspected: 0.4
  }[item.diagnosis.confidence] ?? 0.5
  const documentBoost = Math.min(0.2, item.confirmingDocuments.length * 0.05)
  const decay = computeOutputForRereference(
    age,
    [0, item.certaintyCycleInDays],
    [1.0, 0.3]                     // same range as valueHeat
  )
  return Math.min(1.0, (baseConfidence + documentBoost) * decay)
}
```

### certaintyCycleInDays per condition type

| Type | Days | Rationale |
|---|---|---|
| `exploratory` | 14 | Provisional — needs early confirmation |
| `acute` | 30 | Resolves or changes quickly |
| `wellness` | 90 | Seasonal review cadence |
| `chronic` | 180 | Stable but needs periodic reconfirmation |
| `monitoring` | `min(monitoringSignals[].valueExpirationInDays)` (90 if none) | Most conservative signal cadence wins — no signal's freshness window goes unwatched |

### What certainty drives in the UI

| Certainty | Opacity | Label |
|---|---|---|
| 0.8 – 1.0 | 1.0 | "Being monitored" |
| 0.5 – 0.8 | 0.75 | "Worth a check-in soon" |
| 0.3 – 0.5 | 0.55 | "Ready for a fresh look" |
| < 0.3 | 0.35 | "From your past — still relevant?" |

No color changes. No urgency indicators. Opacity alone communicates freshness.
Hover restores full opacity — same as PropertyTile pattern.

### Accessibility

Opacity-as-certainty is silent for screen readers and indistinct for
low-vision users. Two affordances cover the gap:

- **Always on:** every item card carries a screen-reader-only string
  derived from the certainty bucket — the same phrase from the "Label"
  column of the table above (e.g., *"From your past — still relevant?"*).
  Implemented as a visually-hidden `<span>` inside the card's accessible
  name, so it reads naturally with the item title.
- **User-toggleable:** a profile-level setting, *"Show certainty labels
  inline,"* renders the same phrase visually next to the item title.
  Default off — opacity-only is the design intent for sighted users; the
  inline labels are an accommodation, not a regression.

Both share the same source-of-truth function (`certaintyBucketLabel(score)`
in `src/lib/careplan/certainty.ts`), so visual and screen-reader text never
drift apart.

---

## Language System

### Task states

| State | Display text |
|---|---|
| Upcoming | "Your doctor suggested this" |
| Due soon | "A good time to schedule this" |
| Past due | "Ready for your attention" |
| Completed | "Done — well handled" |
| Snoozed | "We'll remind you later" |

### Item states

| State | Display text |
|---|---|
| Active, certain | "Being managed" |
| Active, aging | "Worth revisiting" |
| Historical | "From your past — is this still relevant?" |
| Resolved | "Resolved — great progress" |

### Goal trends

| Trend | Display text |
|---|---|
| Improving | "Moving in the right direction" |
| Stable | "Holding steady" |
| Declining | "Worth discussing with your doctor" |
| Unknown | "Not enough data yet — import a report to track this" |

---

## Assembly Architecture — Hybrid Model

The Care Plan is assembled in two coordinated phases, exploiting the fact that
the LLM is already in flight during import extraction. The split is deliberate:
**LLM handles semantic matching; deterministic code handles the merge.**

### Phase 1 — Server-side semantic matching (during import extraction)

When the client begins an import, it builds a compact **Care Plan context blob**
from the existing (decrypted) Care Plan and sends it in the body of the
`POST /v1/import/jobs/[id]/process` request over TLS — the same exposure profile
as the document's processed images, which are already sent to that endpoint.
(The per-job AES key is generated server-side at process time, so the client
cannot wrap the blob with it; see `CAREPLAN_REVISION.md` §8 conflict C2.) The
server holds the blob in memory only for the duration of LLM dispatch and
**never persists it** — not to `import_jobs`, not anywhere. Transient plaintext
during dispatch only, identical to the document extraction itself.

```typescript
interface CarePlanExtractionContext {
  activeItems: Array<{
    id: string                  // existing CarePlanItem.id
    icd10?: string
    description: string
    bodyParts: Array<{          // mesh + rollup ancestry (R_patella → R_knee → R_leg → lower_limb)
      identification: string
      rollup: string[]          // ordered parents, broadest last; empty when no rollup applies
    }>
    conditionType: 'acute' | 'chronic' | 'monitoring' | 'wellness' | 'exploratory'
    lastSeenDate: string
  }>
  activeTasks: Array<{
    id: string                  // existing FollowUpTask.id
    text: string
    category: string
    diagnosisItemId: string
  }>
  recentMedications: Array<{
    id: string                  // existing medication doc id
    name: string
    dose?: string
    status: 'active' | 'discontinued'
  }>
}
```

The rollup ancestry lets the LLM match across granularity differences —
*"patellar tendinopathy"* in one report and *"right knee pain"* in the
next should land on the same item without ICD-10 to anchor them. Phase 1
prompt rule: **body-part disagreement is a soft signal; ICD-10 is the
hard anchor; use rollup ancestry to match.**

The LangGraph extraction nodes are extended to read this context and annotate
each output with link decisions:

- Each extracted `diagnosis` → `linkedCarePlanItemId?: string` (matched an
  existing item) **or** `isNewCondition: true`
- Optional `progressionFrom?: string` — id of an item this supersedes (e.g.,
  stage 1 → stage 2; provisional → confirmed)
- Optional `relatedTo?: Array<{ id: string; reason: 'laterality' | 'progression' | 'comorbidity' }>`
  — graph edges the LLM emits when two items belong together but should not be
  collapsed (e.g., same ICD-10 with different sides — see §Conflict resolution).
  Phase 2 merge writes these onto `CarePlanItem.relatedItems`; both items keep
  independent state.
- Optional `linkReason?: string` — short phrase explaining *why* the link was
  made, rendered by the provenance reveal ("matched by ICD-10 + R_knee rollup").
- Each `recommendation` → `linkedCarePlanTaskId?: string` (duplicates an
  existing task) **or** `isNewTask: true`
- Optional `resolves?: string[]` — ids of existing tasks that this document
  satisfies (e.g., a lab report resolving a "get blood test" task)

This phase is the only step that needs LLM intelligence. It handles cases that
defeat deterministic matching:

- Missing or absent ICD codes
- Cross-language variations (CS / DE / EN)
- Different phrasings of the same recommendation
- Provisional → confirmed transitions
- Implicit task resolution via new document type

> **Epistemological note:** Phase 1 is LLM-assisted *entity resolution*, not
> ontological inference. The LLM handles cases that a formal ontology would
> resolve via explicit axioms over a disease or anatomy hierarchy. Both
> approaches can reach the same practical answer; the auditability and
> decidability guarantees differ. See `ONTOLOGY.md` §The LLM-as-Reasoner Gap.

### Phase 2 — Client-side deterministic merge (post-decryption)

The client decrypts the extraction (now containing link annotations) using the
existing `decryptJobResults()` flow and runs a pure merge function:

```
mergeCarePlan(existingPlan, annotatedExtraction)
  → { newPlan: CarePlanDocument; delta: CarePlanDelta }
```

The `delta` describes what changed — it powers the post-import summary screen
(§Import Flow step 5) without recomputing anything. See §Merge result for the
type.

1. For each diagnosis with `linkedCarePlanItemId` → update existing item:
   `lastSeenInDocumentDate`, append to `confirmingDocuments`, merge new
   tasks/goals.
2. For each diagnosis marked `isNewCondition` → create new `CarePlanItem`.
3. For each diagnosis with `progressionFrom` → set source item to
   `status: 'historical'`, link new item via `supersedes` field.
4. For each recommendation with `linkedCarePlanTaskId` → update task. Without
   it → create new task (including when the recommendation matches a
   previously completed task — see §"Task lifecycle" below).
5. For each `resolves[]` entry → mark referenced tasks `status: 'done'` with
   `completedAt` and `completedByDocumentId`.
6. Apply user-action precedence: user edits override document-derived changes
   (`User edit > Document extraction > AI inference`).
7. Recompute monitoring signal links from `monitoringSignals[]` and the
   medication store.
8. Encrypt and save the updated Care Plan singleton via the same envelope
   pattern as `healthDocumentId`.

Phase 2 is fully deterministic, fully client-side, **idempotent**, and
**re-runnable** — re-running the merge after a schema change does not require
another LLM call.

### Conflict resolution

Precedence rule applied in step 6 above:

> **User edit > Document extraction > AI inference**

A *user edit* is any explicit user action: manually changing `status`, marking
a task `done` / `ignored` / `snoozed`, writing `userNotes`, or dismissing a
suggestion. User-edited fields are not overwritten by subsequent document
extractions or AI inference — they stay until the user clears them.

Worked examples:

| Scenario | Resolution |
|---|---|
| New document says the condition is resolved, but the user marked the related task `ignored` | Item → `status: 'resolved'`, `resolvedByDocumentId` set. Task → stays `ignored`. Resolving an item does not auto-undo a user's ignore on its tasks; they are independent fields. |
| User manually set `status: 'historical'`; a new document confirms the condition is active | Item → stays `historical` (user edit wins). New document appended to `confirmingDocuments`. Surfaced as a soft prompt: *"A new document mentions this — is it still historical?"* No silent state flip. |
| Two documents disagree on `diagnosis.confidence` (`probable` vs `confirmed`) | Higher confidence wins on `diagnosis.confidence`. Both docIds remain in `confirmingDocuments`. Opposing direction (`confirmed` vs `ruled_out`) → append dissenting doc to `contradictingDocuments` and surface for user review. |

The merge never silently reverses a user edit. When documents and user state
disagree, the user state stands and the disagreement surfaces as a prompt.

### Merge result

`mergeCarePlan()` returns the next Care Plan **and** a structured `delta`
describing what changed. The post-import summary screen (§Import Flow step 5)
renders directly from this delta — no recomputation, no second pass over the
plan.

```typescript
interface CarePlanDelta {
  newItems: CarePlanItem[]                       // freshly created from this import
  updatedItems: Array<{                          // existing items the merge touched
    id: string
    changedFields: string[]                      // e.g., ['confirmingDocuments', 'tasks']
  }>
  newTasks: FollowUpTask[]                       // newly created tasks (across all items)
  resolvedTasks: Array<{                         // tasks the document satisfies
    id: string
    resolvedByDocumentId: string
  }>
  resurrected: string[]                          // ids moved back from historicalItems[]
  progressions: Array<{ from: string; to: string }>  // item supersessions
  conflicts: Array<{                             // surface as soft prompts
    itemId: string
    kind: 'historical_vs_active' | 'confidence_opposed' | 'side_disagreement'
  }>
}
```

Lifetime: computed once per merge, attached to the import job result,
consumed by the post-import summary. **Not persisted in the Care Plan
document** — the plan is the source of truth; the delta is ephemeral.

### Task lifecycle

When a new recommendation matches a previously completed task on the same
item, the merge creates a **new task** rather than reopening the old one:

- The new task starts `status: 'pending'` with a fresh `dueDate`.
- It carries a `previouslyCompleted: { taskId, completedAt }` hint.
- The UI renders the hint as a subtle line on the task card — *"Previously
  completed on Mar 14, 2026"* — context, not friction.

Why not reopen? A new clinical recommendation is its own event. Reopening
would collapse two distinct moments in care into one row and lose the
completion history. A new task with a hint preserves both: the prior act
of doing it, and the new ask to do it again.

This rule covers re-prescriptions, re-referrals, and scheduled re-screenings
(annual mammogram, quarterly HbA1c). Each instance is a separate task with
a `previouslyCompleted` reference back to its most recent predecessor.

### Task creation paths

A `FollowUpTask` can originate from three independent paths. Each path
populates a different provenance signature on the task — the "Why is this
here?" reveal (§UX · Provenance) renders one of three messages accordingly.

| Path | How it's created | Provenance fields populated |
|---|---|---|
| Document extraction | Phase 1 LLM emits the task during import | `sourceDocumentId`, `sourceQuote`, `sourceProvider` |
| User edit | User manually adds a task from the Care Plan UI | none of the source fields; `userNotes` may carry context |
| Chat (`createCarePlanTask` MCP tool) | The AI proposes follow-through during a chat thread; the user accepts the suggested action | `sourceMessageId` only (links back to the chat message) |

The merge function only writes tasks via path 1. Paths 2 and 3 write directly
to the Care Plan store via the same encrypted-singleton save pattern, so a
chat-created task survives the next document merge without special handling
(no `linkedCarePlanTaskId` will ever match it, so it is left untouched).

The `createCarePlanTask` tool is the first **mutating** MCP tool in the
system; existing tools are read-only. Its build entry is in §Missing
Features Build List (row 7j).

### Why this split

| Concern | Server LLM phase | Client merge phase |
|---|---|---|
| Semantic understanding required | yes | no (annotations pre-resolve ambiguity) |
| Determinism required | no | yes |
| Testable with fixtures | no | yes (pure function) |
| Re-runnable after schema change | no (would re-cost LLM) | yes (free) |
| Mediqom server sees aggregated story | no (only encrypted context blob) | n/a (client owns it) |
| LLM provider sees PHI | yes (same as extraction today) | no |

### Privacy boundary

- **At rest:** all PHI encrypted with user keys, including the Care Plan
  context blob in transit (per-job AES, RSA-wrapped to user).
- **During inference:** the LLM provider sees the new document plus the Care
  Plan context — the same exposure profile as extraction today.
- **Mediqom servers:** transient plaintext during LLM dispatch only; never
  persists Care Plan in plaintext.

The platform guarantee: *"Mediqom never stores unencrypted health data. LLM
providers see the data necessary for analysis, the same way they see new
documents during extraction."*

---

## Import Flow (User-Facing)

```
1. User imports document
2. Document attaches to profile — user confirms
3. Document saves → import pipeline runs → document extracted
4. Care Plan assembly service runs (Direction 1)
5. **Post-import Care Plan summary screen** — leads with **change**, not
   status. Headline framed as concrete delta:
   *"3 new things to know · 1 condition is improving · 1 task you can mark done."*
   Cards below the headline iterate the `CarePlanDelta` returned from the
   merge (§Assembly · Merge result) — no recomputation, no second pass
   over the plan:
   - **New items** — first-time conditions, each with its source quote and provider
   - **Updated items** — *"Confirmed again by today's report"* / *"Now staged 2"*
   - **Resolved tasks** — *"This document satisfies your blood test task — mark it done?"*
   - **Conflicts** — soft prompts for `delta.conflicts[]` (historical-vs-active, opposed confidence)
   - **New tasks** — grouped under their parent item, with due dates
   Medication and signal changes appear inline with their parent item rather
   than in separate sections. The screen never shows a "no changes" empty
   state — if `delta` is empty the user is routed straight to the Care Plan.
6. User lands in their updated Care Plan
```

Step 5 is a new dedicated screen — not the document view. The document view remains
available as the full detail/reference layer. The delta-driven framing is the
single highest-engagement moment in the product; positive framing rules apply
(information + opportunity, never obligation + failure).

---

## Empty State — Potential UX

### First-time empty state (no documents imported)

- Profile shows Care Plan section with **frosted/shaded placeholder items**
- Structure is visible (condition name shape, task rows, goal bar) but content is unreadable
- Subtle pulse animation — the placeholders feel alive, not static
- Label: "Your Care Plan takes shape with each document you add"
- Forward-looking promise: *"And Mediqom will help you share this with your next doctor."*
- Single CTA: "Import your first document"

The shaded bars are a promise of value, not an absence of it.
They show what categories will appear: conditions, tasks, goals, care team.
Sharing is a v1 capability (see `CAREPLAN_REVISION.md` §6.17 — extends
the existing `document_shares` system), so the share line in the empty
state is a real promise the product can keep, not an expectation set
against a future release.

### Time-aware empty state (profile has documents, none recent)

When the profile has prior documents but nothing imported in the last 90
days, the *task strip* on the profile homepage swaps its standard empty
state for a gentle nudge:

> *"Your last update was [Month] — Mediqom is most useful when it's
> current. Want to add a recent visit?"*

No shame, no red dot, no "overdue" framing. The body of the Care Plan
continues to render normally; only the task strip changes copy. The 90-day
threshold lives as `CAREPLAN_RECENCY_NUDGE_DAYS = 90` next to
`CAREPLAN_ARCHIVE_THRESHOLD_DAYS` in `src/lib/careplan/store.ts`.

---

## UX Direction & Visual Language

### Design references

Two screens from ClyHealth (George Railean, 2024) establish the visual language direction.

**Screen 1 — Dark medical dashboard**
Central gauge dial with percentile score, disease risk probabilities arranged in an arc,
radar chart for multi-system health, card panels for specific biomarkers. Dark theme
makes data feel sophisticated rather than clinical or alarming.

**Screen 2 — Health Plan / Progress view**
- **Progress by Periods**: Capsule bars across time windows (today / yesterday / week /
  month / year) with achieved vs. awaiting split inside each bar — shows momentum.
- **Overall Progress dial**: Semicircular gauge showing achieved/awaiting ratio.
  3/5 reads as progress, not failure.
- **General Goals cards**: Title, description, impact tag (`+25% → Improve lung function`),
  "Suggested" badge. Outcome-framed, not task-framed.
- **Health Plan Gantt**: Horizontal timeline with activity rows (Dose Taken, Routine Set,
  BP Monitoring, Test Booked, Diet Switched) at their actual time points.
  Events are readable as a care narrative, not a checklist.

### What we take, and what we make our own

| ClyHealth pattern | Mediqom adaptation |
|---|---|
| Central gauge dial | 3D anatomy model as hero — spatial, not numerical |
| Disease risk arc around dial | Care Plan highlights on body regions |
| Daily activity Gantt (hours) | Care journey Gantt (weeks → months) |
| Progress by periods | Tasks completed per period across the Care Plan |
| Goals with impact tags | Tasks with contextual "staying ahead of this" tags |
| Dark sophisticated theme | Dark for stats/hero, light for content cards |

The 3D model is our differentiator where ClyHealth uses a gauge. Everything orbits it.

### Impact tags — positive framing in practice

Every Care Plan task shows what it's protecting or improving:

```
Schedule blood test          → "Monitoring your cholesterol"
                               Staying ahead of this

Book cardiology follow-up    → "Your doctor wants to check in"
                               Related to your heart health

Start Lisinopril 10mg        → "Supporting your blood pressure"
                               New prescription from Dr. Novák
```

### Provenance reveal — the trust UX (v1)

Every recommendation in v1 comes through LLM extraction of doctor text — there
is no signal-threshold rule engine yet, so labeling tasks "Recommended" vs
"Suggested" would split a single state. Trust in v1 comes from **who said it
and where it's written**, not from an opaque badge. The "Suggested" badge
returns in v2 when signal-threshold rules or other non-doctor-derived tasks
land; at that point doctor-extracted tasks get "Recommended" by contrast.

**Affordance.** Every item card, task card, and goal card carries a small
"Why is this here?" affordance (a discreet `(i)` icon, not a CTA). One tap
opens a provenance reveal — a side panel on mobile, an inline expansion on
desktop. The affordance never shouts; users who don't tap it never see it.

**Content rendered, per creation path** (see §Task creation paths):

| Path | Reveal copy |
|---|---|
| Document extraction | *"Dr. Novák wrote: '\[sourceQuote\]' — from your \[document title\] on Mar 14, 2026."* Link to the source document opens in a side panel; tapping the quote scrolls to the highlighted span in the source view. |
| Chat (`createCarePlanTask`) | *"You added this from a chat with AI on Mar 14, 2026. The conversation is in your chat history."* Link routes to the chat message that produced it (`sourceMessageId`). |
| User edit / user-created | *"You added this on Mar 14, 2026."* (or *"You edited this on …"* for in-place changes). |

**Conflict cases.** When `contradictingDocuments[]` is non-empty on the
parent item, the reveal appends a second line — *"A newer document disagrees
— tap to review."* — that routes to the soft-prompt UI from §Conflict
resolution. The reveal never silently picks a winner; it surfaces the
disagreement.

**No-quote fallback.** When `sourceQuote` is missing (older documents extracted
before the schema gained the field), the reveal degrades gracefully to
*"From your \[document title\] on \[date\]."* with a link to the source. No
fabricated quotes — the field is omitted, not invented.

This collapses §6.1 of the revision into the v1 UX. The data feeding it
(`sourceQuote`, `sourceProvider`, `sourceMessageId`) is captured at
extraction (recommendation schema) and at chat task creation (MCP tool) and
persisted on `FollowUpTask` and `CarePlanGoal`.

### Plain-language translation

Clinical content stays clinical in the source — `diagnosis.description`,
`recommendation.text`, `goal.goal` carry the doctor's wording verbatim
(often Latin or specialty shorthand). Every item, task, and goal card
exposes an **"Explain in plain language"** toggle alongside the
provenance affordance.

Behind the toggle: a single call to the existing chat AI pipeline with a
fixed prompt — *"Rewrite for a non-medical reader. Preserve all clinical
facts. Do not add warnings, recommendations, or interpretation. Match the
user's interface language."* Output replaces the clinical string inline
when toggled on; toggling off restores the original.

- **Cache:** rewrites are stored on the item under
  `plainLanguage: { [fieldName]: { text, sourceHash, language } }` on the
  Care Plan document. Cache invalidates automatically when the source field
  changes (`sourceHash` mismatch) or the user's UI language changes.
- **Cost:** one LLM call per item per language per source-version. With
  caching, repeat opens are free and instant.
- **Scope (v1):** translation operates on the three fields listed above.
  Lab signal names, ICD code descriptions, and provider titles stay as-is
  — they're already short and stable.

### Snooze with reason

When the user snoozes a task, the dialog asks **why** — `cost`, `time`,
`unsure`, or `other` with an optional free-text note. The reason is
captured silently on the task (`snoozeReason`, `snoozeNote`) and never
surfaced back to the user in v1. The data feeds a future pattern reveal
("3 of your tasks are snoozed for cost — let's talk about alternatives"),
which lands in a later phase once enough data has accumulated to make the
pattern useful.

Snooze is **not** an ignore — a snoozed task returns to the list when
`snoozedUntil` passes. Ignoring a task is a separate explicit action
(`status: 'ignored'`) that respects the user-edit precedence rule and
never auto-reverts from a document merge.

### Theming

Dark background for the profile hero (3D model + Care Plan summary stats).
Light cards for individual Care Plan items, tasks, and goals.
The contrast creates visual hierarchy: the overview is immersive, the detail is readable.

---

## Profile Homepage Restructure

### Current layout
Avatar → Vitals grid → Medication week → Documents list

### Proposed layout

```
┌─────────────────────────────────────────────────────┐
│  [3D Body Model — centered, interactive hero]       │
│   Care Plan regions glow by condition type          │
│   Certainty maps to glow intensity                  │
│   Dark gradient background                          │
├──────────────────┬──────────────────────────────────┤
│  Progress dial   │  Top 3 upcoming tasks            │
│  X/Y tasks done  │  Each with impact tag            │
│  this month      │  "View Care Plan →"              │
├──────────────────┴──────────────────────────────────┤
│  Vitals grid (existing — below the fold)            │
│  Weekly medication plan (existing)                  │
└─────────────────────────────────────────────────────┘
```

If no documents: the 3D model shows without highlights and the task area shows the
frosted placeholder state. The model alone is compelling — it invites exploration.

---

## Care Plan Page (new route)

`/med/p/[profile]/care-plan`

### Layout

```
┌─────────────────────────────────────────────────────┐
│  Progress by Periods                                │
│  Capsule bars: Today · Week · Month · Year          │
│  Achieved (filled) vs. Awaiting (outlined)          │
├─────────────────────────────────────────────────────┤
│  Care Journey Timeline (Gantt)                      │
│  Horizontal axis: weeks → months                   │
│  Rows: documents imported · tasks done · upcoming  │
│  ← Past ——————————— Now ——————————— Future →        │
├─────────────────────────────────────────────────────┤
│  Active Care Plan items (light cards)               │
│  Sorted by certainty × recency                      │
├─────────────────────────────────────────────────────┤
│  History (collapsed, lazy-loaded — see below)       │
└─────────────────────────────────────────────────────┘
```

The History section calls `getHistoricalItems()` only when the user expands it.
Archived items (status `historical` or `resolved`, older than 3 years) live in
the encrypted document's `historicalItems[]` array and are not parsed into
state on the initial page load — keeping the active view fast for users with
many years of records.

### Care Journey Timeline detail

The Gantt uses weeks as the unit (not hours). It tells the clinical story:

```
Jan          Feb          Mar          Apr
 │            │            │            │
 ●            ●      ✓     ◎            ◎
[Lab report] [GP visit]  [Blood test  [Cardiology
 imported     imported    completed]   appt due]
```

Event types:
- `●` Document imported — blue, filled
- `🎙️` Session analysed — orange, outlined (any document whose origin is a
  recorded consultation; see the Care Plan store flag `document.originKind === 'session'`)
- `✓` Task completed — green, filled
- `◎` Upcoming task / appointment — outlined, certainty-faded opacity
- `○` Snoozed — grey, outlined

Session events render as their own document type with a distinct icon — the
underlying record is a document the existing pipeline already saves. Full
auto-merge of session content (extracting tasks / goals / diagnoses from the
transcript) into Care Plan items is **deferred** (see §Deferred); the v1
work here is purely the icon tag, since both session persistence and
session-output-as-document already exist.

Ports from `MilestoneProgress.svelte` in aouros — same concept, clinical time scale.

### Item card anatomy

- Condition name + type badge (chronic / monitoring / wellness / acute)
- Certainty-faded opacity (not color alarm) — accompanied by a
  screen-reader-only certainty label (see §Temporal Certainty System ·
  Accessibility); the optional inline label appears here when the user has
  toggled it on in settings
- Body part icon → tapping highlights region on 3D model
- Task count with impact tag: "2 things — staying ahead of this"
- Signal trend if monitoring: sparkline + trend phrase
- **"Why is this here?" affordance** (`(i)` icon) → opens the provenance
  reveal (§UX · Provenance reveal). Replaces the static "Provenance: From
  your [document]" line; the line is now inside the reveal, not on the card.
- **"Explain in plain language" toggle** → swaps the clinical description
  for the cached plain-language rewrite (§UX · Plain-language translation).
  Toggle state persists per-user-per-item.
- **"Ask AI about this"** → opens chat with the item as a first-class
  context object (`ChatContextItem.kind: 'carePlanItem'`). When the AI
  response proposes follow-through, it surfaces a *Suggested action* footer
  (e.g., *"Want me to add a reminder to call your doctor?"*). Tapping the
  footer invokes the `createCarePlanTask` MCP tool; the resulting task
  appears on this card with chat-message provenance (path 3 in §Task
  creation paths). The footer renders only when the AI emits a structured
  suggestion — it is not shown on every response.

### Priority orders, never filters

Items sort by `certainty × recency`. Tasks within an expanded item sort by
`priority` (`immediate > urgent > routine > as_needed`), then by `dueDate`.

The UI never exposes priority as a filter chip, a red-vs-green badge, an
"urgent only" toggle, or an "overdue!" alert. Urgency surfaces structurally
(what's at the top) rather than chromatically (what's red). The system orders;
the user browses. Stress framing stays out.

---

## 3D Model Integration

`bodyParts[].identification` and the 3D viewer's mesh names both derive from a
single source (`src/data/objects.json`). The schema enum is populated at LLM
dispatch via the shared `populateSchemaEnums()` helper, so extraction output and
the 3D model are aligned by construction across every schema that mounts the
body-parts subschema — no manual sync, no drift. The link exists in the data;
it just needs to be surfaced in the UI.

### Region meta-layer

`objects.json` carries 472 fine-grained mesh names. A second registry
(`src/data/anatomy-regions.ts`) groups related meshes into named regions:

```
R_patella → R_knee → R_leg → lower_limb
L_atrium  → heart  → cardiovascular
```

Regions are first-class anchors in the extraction schema — the LLM may emit
either a leaf mesh or a region name. `CarePlanBodyPartRef.part` carries the
nearest rollup parent so the UI can paint the parent region when the leaf is
ambiguous, and the merge function can match across granularity differences
(*"patellar tendinopathy"* vs *"right knee pain"*).

The body-parts schema carries a `CRITICAL: ONLY extract body parts that the
document literally names — never infer from disease names, adjacent
structures, or laterality assumptions. Omit if uncertain.` guard, mirroring
the medications anti-hallucination pattern.

A reserved `whole_body` region exists for items that affect the body
generally (depression, autoimmune disease without a localised lesion).
`bodyParts: []` is also valid — the Care Plan list never hides an item
because no mesh lights up.

The rollup hierarchy in `anatomy-regions.ts` is an internal taxonomy — useful
and self-consistent, but not linked to an external formal standard. The dual-layer
anatomy grounding strategy (mesh names as rendering addresses + SNOMED CT as
semantic addresses) is documented in `ONTOLOGY.md` §Anatomy. A mapping scaffold
exists at `src/data/anatomy-snomed.ts`; ~200 muscular-system entries need manual
authoring before the table is complete.

### Multi-region rendering

The existing `setHighlight(meshName)` API stays unchanged — single-focus is
the right path for chat and document anatomy callouts. The Care Plan adds
an additive sibling:

```typescript
setMultiHighlight(regions: Array<{
  mesh: string             // mesh name or region-meta name
  color: string            // condition-type color
  opacity: number          // certainty-driven, bucketed
}>): void
```

Implementation notes:

- **Bucketed material cache** — `Map<variantKey, Material>` keyed by
  `(color, opacityBucket)` so the cache stays bounded even when many items
  paint at once. Five opacity buckets cover the certainty range.
- **Delta swap** — on certainty recompute, only meshes whose effective
  `(color, opacity)` pair changed get their material reference swapped.
  No clone, no re-build.
- **Throttle** — certainty recompute fires once per page-load and once per
  merge. No per-frame recomputation.

### Behavior
- Care Plan items with `bodyParts[]` paint highlights via `setMultiHighlight`
- Highlight opacity maps to item certainty (high certainty = brighter)
- `CarePlanBodyPartRef.urgency` (doctor-written 1–5) drives an optional pulse
  intensity *independent* of certainty — a freshly recommended high-urgency
  region pulses even before certainty fades
- Highlight color encodes condition type — not urgency:
  - `chronic` → steady blue
  - `monitoring` → soft amber
  - `acute` / recovering → warm green (healing direction)
  - `exploratory` → soft purple
- Clicking a highlighted region → opens Care Plan items for that anatomy
- The 3D model becomes a **spatial index** into the Care Plan — one of
  several views, not the home screen of the Care Plan list

### Mesh name durability

Stored Care Plan items reference mesh names that may be renamed years
later. An alias/migration table (`src/data/anatomy-aliases.ts`) maps
deprecated names to current ones; client-side normalisation runs on
Care Plan load. A telemetry counter for unresolved names catches drift
before users see broken highlights.

This is the differentiating UX layer. No other consumer health product
navigates a care plan through an interactive anatomy model.

---

## Missing Features — Build List

### Logic layer (no UI dependency)

| # | Feature | New file |
|---|---|---|
| 1a | Schema: `timeframeNormalized: { unit, value }` on recommendation + follow-up schemas with anti-hallucination guard (only when explicitly stated) | `src/lib/configurations/core.recommendations.ts` (and any sibling follow-up schema) |
| 1b | Client `computeDueDate(sourceDocumentDate, timeframeNormalized) → ISO` + `parseTimeframeFallback(text, locale)` fallback for legacy extractions + fixture set (~30 examples) | `src/lib/careplan/timeframe.ts`, `__tests__/timeframe.fixtures.json` |
| 2 | Care Plan types — `CarePlanItem`, `FollowUpTask`, `CarePlanGoal`, `CarePlanBodyPartRef`, `CarePlanDelta`, `relatedItems` graph field | `src/lib/careplan/types.d.ts` |
| 3 | Care Plan store (singleton doc load/save) + archival policy (`CAREPLAN_ARCHIVE_THRESHOLD_DAYS = 1095`, `getActivePlan()` / `getHistoricalItems()` split, resurrection on `linkedCarePlanItemId`) + recency-nudge constant (`CAREPLAN_RECENCY_NUDGE_DAYS = 90`) | `src/lib/careplan/store.ts` |
| 4 | Assembly service (document → Care Plan, bidirectional) | `src/lib/careplan/assembly.ts` |
| 5 | Certainty computation (load-time, not stored; throttled to once per page-load + once per merge) | `src/lib/careplan/certainty.ts` |
| 6 | Deduplication (ICD code primary, fuzzy description fallback, body-part rollup tiebreak) | `src/lib/careplan/dedup.ts` |
| 7a | Schema: add link annotation fields (`linkedCarePlanItemId`, `progressionFrom`, `linkedCarePlanTaskId`, `resolves`) to diagnosis & recommendation schemas | `src/lib/configurations/core.diagnosis.ts`, `core.recommendations.ts` |
| 7b | Care Plan context blob builder (client) — builds `CarePlanExtractionContext` from current plan | `src/lib/careplan/context.ts` |
| 7c | Wire context blob into import request envelope (encrypt with per-job key, same as document) | `src/lib/import/`, `src/routes/v1/import/jobs/+server.ts` |
| 7d | Extend LangGraph extraction nodes to consume context + emit link annotations | `src/lib/langgraph/nodes/*` |
| 7e | Deterministic client merge function (`mergeCarePlan`) | `src/lib/careplan/merge.ts` |
| 7f | Hook merge into client import flow after `decryptJobResults()` | `src/lib/import/finalizer.ts` + `src/components/import/ImportView.svelte` |
| 7g | Schema: `sourceQuote` + `sourceProvider` on recommendation items, follow-up items, treatment-goal entries (F1, anti-hallucination CRITICAL guards — verbatim only) | `src/lib/configurations/core.recommendations.ts`, `core.treatmentGoal.ts` |
| 7h | `mergeCarePlan()` returns `{ newPlan, delta: CarePlanDelta }` (F2) | `src/lib/careplan/merge.ts` |
| 7i | `ChatContextItem` union extended with `carePlanItem` / `carePlanTask` kinds; chat manager handles new payload shapes (F3) | `src/lib/chat/chat-manager.ts` + types |
| 7j | `createCarePlanTask` MCP tool — **first mutating MCP tool**; appends a `FollowUpTask` with `sourceMessageId` provenance (F4) | new `src/lib/context/mcp-tools/tools/create-care-plan-task.ts`, registry `src/lib/context/mcp-tools/tools/index.ts` |
| 7k | Plain-language rewrite cache + invoke helper (6.9) — stores rewrites keyed by `sourceHash` on the Care Plan document | new `src/lib/careplan/plain-language.ts` |
| 7l | Document `originKind` flag (`'import' \| 'session'`) surfaced from the document store for the timeline tag (6.10) | modify `src/lib/documents/types.ts` (or equivalent) |
| 7m | Schema: anti-hallucination CRITICAL guard on `core.bodyParts.ts` — only literal regions, no inference from disease names, omit on side ambiguity (G3, G10) | `src/lib/configurations/core.bodyParts.ts` |
| 7n | Region meta-layer registry — explicit named groups connecting related meshes (R_patella → R_knee → R_leg → lower_limb), used as first-class anchors in `identification` (G3) | new `src/data/anatomy-regions.ts` |
| 7o | Mesh-rename alias/migration table + telemetry counter for unresolved names (G9) | new `src/data/anatomy-aliases.ts` |
| 7p | Care Plan anatomy helper — validate against registry, rollup to parent region, normalise via aliases | new `src/lib/careplan/bodyparts.ts` + fixture tests |
| 7q | `CarePlanBodyPartRef[]` with `{ identification, part, status, treatment, urgency, sources[] }`; per-region urgency and union-merge with provenance (G1, G6, G8) | `src/lib/careplan/types.d.ts`, `merge.ts` |
| 7r | `relatedItems` graph field; Phase 1 LLM emits `relatedTo?: Array<{id, reason}>` for same ICD-10 / different sides; merge writes them onto both items; both keep independent state (G4) | `src/lib/careplan/types.d.ts`, `merge.ts`, Phase 1 prompt |
| 7s | Unify `AnatomyIntegration` chat aliases with the region registry — single source of names across chat callouts + Care Plan + extraction (G3) | `src/lib/chat/integrations/anatomy-integration.ts` |
| 7t | `setMultiHighlight([{ mesh, color, opacity }])` additive API; bucketed `Map<variantKey, Material>` cache keyed by `(color, opacity bucket)`; delta swap on certainty recompute (G2, G12) | `src/components/anatomy/highlight-system.ts`, `material-system.ts`, `scene-state.ts` |

### UI layer

| # | Feature | New file |
|---|---|---|
| 8 | Empty / potential state component — first-time + time-aware variants (6.7) + forward share copy (6.12) | `src/components/careplan/CarePlanPotential.svelte` |
| 9 | Care Plan item card — with reveal affordance, plain-language toggle, suggested-action footer hook, sr-only certainty label (6.1, 6.9, 6.8, 6.11) | `src/components/careplan/CarePlanItem.svelte` |
| 10 | Care Plan page | `src/routes/med/p/[profile]/care-plan/+page.svelte` |
| 11 | Profile homepage Care Plan section — task strip swaps to time-aware empty state when `daysSinceLastDocument >= 90` (6.7) | modify `src/components/profile/ProfileDashboard.svelte` |
| 12 | Nav item | modify `src/components/layout/NavBar.svelte` |
| 13 | 3D model highlight integration — wires Care Plan items to `setMultiHighlight` (7t) with condition-type color + certainty-bucket opacity; click on a highlighted region opens the filtered Care Plan view | modify `src/components/anatomy/Body.svelte` |
| 14 | Post-import summary screen — delta-driven framing from `CarePlanDelta` (6.5) | `src/components/careplan/CarePlanUpdate.svelte` |
| 15 | Provenance reveal — shared component used by item / task / goal cards (6.1) | new `src/components/careplan/ProvenanceReveal.svelte` |
| 16 | Snooze-with-reason dialog — captures `snoozeReason` + `snoozeNote` on the task (6.4) | new `src/components/careplan/SnoozeDialog.svelte` |
| 17 | Care Journey Timeline — render 🎙️ for `document.originKind === 'session'` (6.10) | inside #10 |
| 18 | Settings — "Show certainty labels inline" toggle (6.11) | modify settings page |
| 19 | Suggested-action footer in chat responses — renders when AI emits a structured `suggestedAction`; invokes `createCarePlanTask` on tap (6.8) | modify `src/components/chat/AIChatSidebar.svelte` |

All Logic rows (1a–7t) ship before any UI row (8–19). Real data must flow
before UI is built against it.

---

## What Does Not Change

- All 47 extraction schemas — data quality is not the problem
- The document import pipeline — it works, we hook into it after save
- The signal history store — already saves to health profile correctly
- The medication store — exists, reconciliation bridges to it
- The document view — remains as the full detail/reference layer
- The 3D model mesh names / body part enum — both extraction and viewer pull from `objects.json`, populated into the schema at runtime

---

## Deferred

- Session-based **auto-merge into Care Plan items** (extracting tasks,
  goals, and diagnoses from session transcripts and applying them through
  the same merge pipeline as document imports). Deferred until the
  document-import path is validated.
  **Sessions already appear as 🎙️ events on the Care Journey Timeline in
  v1** (see §Care Journey Timeline) — the v1 work was purely the icon tag,
  since both session persistence and session-output-as-document already
  exist. What stays deferred is the content-level merge.

- Push notifications for task reminders
  Requires server-side FCM/APNs configuration via
  `@capacitor/push-notifications`. **Local notifications are v1** — see
  `CAREPLAN_REVISION.md` §6.18 (no server work, device-scheduled).

- Calendar integration for follow-up appointments
  Requires Capacitor calendar plugin. The `Appointment` model already
  carries `nativeEventId` + sync fields from the contacts/calendar PR;
  the missing piece is the UI flow. Promote to v1 once local
  notifications (§6.18) lands and proves the mobile reminder pattern.

- ~~Second-opinion workflow (share Care Plan with another doctor)~~
  **Promoted to v1.** See `CAREPLAN_REVISION.md` §6.17 — extends the
  existing `document_shares` system with a `type: 'carePlan'` variant.
  Read-only share; merge stays client-only on the owner's device.

---

## Success Indicators

- % of imports where user opens the post-import Care Plan summary
- % of tasks completed before their due date
- % of medication changes that result in an automatic medication list update
- % of users who import a second document within 7 days of first
- Care Plan items per profile (tracks data richness over time)
- AI chat messages initiated from Care Plan context vs. raw document view
