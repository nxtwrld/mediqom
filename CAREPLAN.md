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

2. **Encrypted, user-controlled** — the platform never sees unencrypted health data.
   The Care Plan is as private as the documents that feed it.

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
| Body parts | `bodyParts[].identification` uses same enum as 3D model mesh names |
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

### CarePlanDocument

```typescript
interface CarePlanDocument {
  items: CarePlanItem[]
  updatedAt: string
  processedDocuments: Record<string, string>  // docId → contentHash (dedup guard)
}
```

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

  // Provenance
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
  bodyParts: string[]              // 3D model identifiers (R_knee, L_lung, heart...)
}
```

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
  dueDate?: string                 // computed: sourceDocumentDate + parsed timeframe
  certaintyCycleInDays: number     // immediate=3, urgent=14, routine=90, as_needed=180

  // State
  status: 'pending' | 'done' | 'snoozed' | 'ignored'
  completedAt?: string
  snoozedUntil?: string

  // Links
  diagnosisItemId: string
  sourceDocumentId: string
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
| `monitoring` | Inherits signal's `valueExpirationInDays` | Already defined per signal |

### What certainty drives in the UI

| Certainty | Opacity | Label |
|---|---|---|
| 0.8 – 1.0 | 1.0 | "Being monitored" |
| 0.5 – 0.8 | 0.75 | "Worth a check-in soon" |
| 0.3 – 0.5 | 0.55 | "Ready for a fresh look" |
| < 0.3 | 0.35 | "From your past — still relevant?" |

No color changes. No urgency indicators. Opacity alone communicates freshness.
Hover restores full opacity — same as PropertyTile pattern.

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
from the existing (decrypted) Care Plan and sends it alongside the document to
the existing import endpoint. The blob is encrypted with the same per-job AES
key as the document extraction, so it has identical persistence guarantees:
transient plaintext on the server during LLM dispatch, encrypted at rest, never
persisted in plaintext.

```typescript
interface CarePlanExtractionContext {
  activeItems: Array<{
    id: string                  // existing CarePlanItem.id
    icd10?: string
    description: string
    bodyParts: string[]
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

The LangGraph extraction nodes are extended to read this context and annotate
each output with link decisions:

- Each extracted `diagnosis` → `linkedCarePlanItemId?: string` (matched an
  existing item) **or** `isNewCondition: true`
- Optional `progressionFrom?: string` — id of an item this supersedes (e.g.,
  stage 1 → stage 2; provisional → confirmed)
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

### Phase 2 — Client-side deterministic merge (post-decryption)

The client decrypts the extraction (now containing link annotations) using the
existing `decryptJobResults()` flow and runs a pure merge function:

```
mergeCarePlan(existingPlan, annotatedExtraction) → newPlan
```

1. For each diagnosis with `linkedCarePlanItemId` → update existing item:
   `lastSeenInDocumentDate`, append to `confirmingDocuments`, merge new
   tasks/goals.
2. For each diagnosis marked `isNewCondition` → create new `CarePlanItem`.
3. For each diagnosis with `progressionFrom` → set source item to
   `status: 'historical'`, link new item via `supersedes` field.
4. For each recommendation with `linkedCarePlanTaskId` → update task. Without
   it → create new task.
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
5. Post-import Care Plan summary screen shown:
   - New or updated Care Plan items
   - New tasks created with due dates
   - Medication changes detected → "Review and update your list"
   - Signals with urgency ≥ 3 surfaced with plain-language explanation
6. User lands in their updated Care Plan
```

Step 5 is a new dedicated screen — not the document view. The document view remains
available as the full detail/reference layer.

---

## Empty State — Potential UX

When no documents have been imported:

- Profile shows Care Plan section with **frosted/shaded placeholder items**
- Structure is visible (condition name shape, task rows, goal bar) but content is unreadable
- Subtle pulse animation — the placeholders feel alive, not static
- Label: "Your Care Plan takes shape with each document you add"
- Single CTA: "Import your first document"

The shaded bars are a promise of value, not an absence of it.
They show what categories will appear: conditions, tasks, goals, care team.

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

Tasks explicitly recommended by the doctor → **"Recommended" badge**
Tasks inferred by the AI from pattern matching → **"Suggested" badge**

This distinction matters — users trust their doctor; the AI earns trust separately.

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
│  History (collapsed — resolved + low certainty)     │
└─────────────────────────────────────────────────────┘
```

### Care Journey Timeline detail

The Gantt uses weeks as the unit (not hours like ClyHealth). It tells the clinical story:

```
Jan          Feb          Mar          Apr
 │            │            │            │
 ●            ●      ✓     ◎            ◎
[Lab report] [GP visit]  [Blood test  [Cardiology
 imported     imported    completed]   appt due]
```

Event types:
- `●` Document imported — blue, filled
- `✓` Task completed — green, filled
- `◎` Upcoming task / appointment — outlined, certainty-faded opacity
- `○` Snoozed — grey, outlined

Ports from `MilestoneProgress.svelte` in aouros — same concept, clinical time scale.

### Item card anatomy

- Condition name + type badge (chronic / monitoring / wellness / acute)
- Certainty-faded opacity (not color alarm)
- Body part icon → tapping highlights region on 3D model
- Task count with impact tag: "2 things — staying ahead of this"
- Signal trend if monitoring: sparkline + trend phrase
- Provenance: "From your [document title] — [date]"
- "Ask AI about this" → opens chat with item as context

### No urgency filters
Sorting by computed relevance surfaces what matters. Urgency filters reintroduce
the stress framing. The system orders; the user browses.

---

## 3D Model Integration

`bodyParts[].identification` already uses the same enum as the 3D model mesh names.
The link exists in the data — it needs to be surfaced in the UI.

### Behavior
- Care Plan items with `bodyParts[]` cast highlights onto the 3D model
- Highlight opacity maps to item certainty (high certainty = brighter)
- Highlight color encodes condition type — not urgency:
  - `chronic` → steady blue
  - `monitoring` → soft amber
  - `acute` / recovering → warm green (healing direction)
  - `exploratory` → soft purple
- Clicking a highlighted region → opens Care Plan items for that anatomy
- The 3D model becomes a **spatial index** into the Care Plan

This is the differentiating UX layer. No other consumer health product
navigates a care plan through an interactive anatomy model.

---

## Missing Features — Build List

### Logic layer (no UI dependency)

| # | Feature | New file |
|---|---|---|
| 1 | Timeframe parser — `"in 2 weeks"` + date → ISO date | `src/lib/careplan/timeframe.ts` |
| 2 | Care Plan types | `src/lib/careplan/types.d.ts` |
| 3 | Care Plan store (singleton doc load/save) | `src/lib/careplan/store.ts` |
| 4 | Assembly service (document → Care Plan, bidirectional) | `src/lib/careplan/assembly.ts` |
| 5 | Certainty computation (load-time, not stored) | `src/lib/careplan/certainty.ts` |
| 6 | Deduplication (ICD code primary, fuzzy description fallback) | `src/lib/careplan/dedup.ts` |
| 7a | Schema: add link annotation fields (`linkedCarePlanItemId`, `progressionFrom`, `linkedCarePlanTaskId`, `resolves`) to diagnosis & recommendation schemas | `src/lib/configurations/core.diagnosis.ts`, `core.recommendations.ts` |
| 7b | Care Plan context blob builder (client) — builds `CarePlanExtractionContext` from current plan | `src/lib/careplan/context.ts` |
| 7c | Wire context blob into import request envelope (encrypt with per-job key, same as document) | `src/lib/import/`, `src/routes/v1/import/jobs/+server.ts` |
| 7d | Extend LangGraph extraction nodes to consume context + emit link annotations | `src/lib/langgraph/nodes/*` |
| 7e | Deterministic client merge function (`mergeCarePlan`) | `src/lib/careplan/merge.ts` |
| 7f | Hook merge into client import flow after `decryptJobResults()` | `src/lib/import/finalizer.ts` + `src/components/import/ImportView.svelte` |

### UI layer

| # | Feature | New file |
|---|---|---|
| 8 | Empty / potential state component | `src/components/careplan/CarePlanPotential.svelte` |
| 9 | Care Plan item card | `src/components/careplan/CarePlanItem.svelte` |
| 10 | Care Plan page | `src/routes/med/p/[profile]/care-plan/+page.svelte` |
| 11 | Profile homepage Care Plan section | modify `src/components/profile/ProfileDashboard.svelte` |
| 12 | Nav item | modify `src/components/layout/NavBar.svelte` |
| 13 | 3D model highlight integration | modify `src/components/anatomy/Body.svelte` |
| 14 | Post-import summary screen | `src/components/careplan/CarePlanUpdate.svelte` |

Steps 1–7 before steps 8–14. Real data must flow before UI is built against it.

---

## What Does Not Change

- All 47 extraction schemas — data quality is not the problem
- The document import pipeline — it works, we hook into it after save
- The signal history store — already saves to health profile correctly
- The medication store — exists, reconciliation bridges to it
- The document view — remains as the full detail/reference layer
- The 3D model mesh names / body part enum — already aligned with extraction output

---

## Deferred

- Session-based Care Plan augmentation (QOM session analysis → Care Plan)
  Deferred until document-import path is validated.

- Push notifications / local notifications for task reminders
  Requires `@capacitor/local-notifications` integration.

- Calendar integration for follow-up appointments
  Requires Capacitor calendar plugin.

- Second-opinion workflow (share Care Plan with another doctor)
  Existing share system extended — future phase.

---

## Success Indicators

- % of imports where user opens the post-import Care Plan summary
- % of tasks completed before their due date
- % of medication changes that result in an automatic medication list update
- % of users who import a second document within 7 days of first
- Care Plan items per profile (tracks data richness over time)
- AI chat messages initiated from Care Plan context vs. raw document view
