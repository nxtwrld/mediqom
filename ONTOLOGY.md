# Ontology Architecture

Mediqom's semantic architecture — where it currently sits, the primary path
toward formal ontological grounding, and the migration constraints imposed by
the client-side encryption model.

This document is the home for decisions that transcend any single feature.
Care Plan-specific implementation detail lives in `CAREPLAN.md` and
`CAREPLAN_REVISION.md`.

---

## Honest Positioning

### What formal ontology actually means

A formal ontology provides:

- **Explicit axioms** — assertions about what is true, in a machine-readable logic
- **Description logic** — a fragment of first-order logic used to express class
  hierarchies, property constraints, and relations
- **A reasoner** — a system that derives what has not been explicitly asserted,
  within a bounded and decidable fragment
- **Open World Assumption** — absence of a statement does not mean it is false;
  a closed database is not an ontology

### Where Mediqom currently sits

**Mediqom is a well-governed conceptual map.** More structured than a flat data
model, less than a formal ontology. The honest comparison is Palantir's Ontology:
rich object types, typed links, governed structure — no description logic
underneath, no formal inference.

What Mediqom has that earns "well-governed":

| Capability | Implementation |
|---|---|
| External code standards | ICD-10 as dedup anchor; LOINC on signals |
| Typed graph edges | `relatedItems[{ reason: laterality/progression/comorbidity }]` |
| Internal rollup taxonomy | `anatomy-regions.ts`: R_patella → R_knee → R_leg → lower_limb |
| Temporal semantics | Certainty decay per condition type, computed at load time |
| Explicit conflict resolution | Precedence rule: User edit > Document extraction > AI inference |
| Provenance tracking | `confirmingDocuments[]`, `contradictingDocuments[]`, `sourceQuote` |
| Anti-hallucination guards | CRITICAL constraints on body parts, medications, goal targets |

What Mediqom does not have:

| Gap | What formal ontology would provide |
|---|---|
| No description logic | OWL reasoner derives: "T2DM → monitor HbA1c" from axioms |
| LLM as "reasoner" | Phase 1 semantic matching: probabilistic, non-auditable, non-decidable |
| ICD-10 as flat string | Not linked to hierarchy; cannot traverse parent/child codes |
| Body parts not FMA-grounded | Hand-curated rollup; no formal completeness guarantee |
| No OWA | Closed-world assumption; absence is not modeled |

---

## The LLM-as-Reasoner Gap

The current architecture gives Phase 1 two jobs and uses the LLM for both:

1. **Translation** — clinical text → structured representation
2. **Reasoning** — "is this the same condition as that?"

The LLM is genuinely good at (1). It is a statistical workaround for (2).
Ontological systems separate these cleanly: a translation layer converts natural
language to formal codes; a reasoning layer operates on codes using defined axioms.

| Property | LLM entity resolution | Code-based lookup |
|---|---|---|
| Auditable | No — black box | Yes — derivation is a tree traversal |
| Decidable | No — probabilistic | Yes — hierarchy is a DAG |
| Handles natural language | Yes — natively | No — requires formal input |
| Cross-language | Yes | No — codes are language-neutral, input is not |
| Requires external dependencies | No | Yes — terminology data |

The LLM is the right tool for the translation problem. The reasoning problem
should be handled by code operating on formal codes.

---

## Primary Path: FHIR as the Ontological Substrate

### The core shift

> **LLM translates text → codes. Codes carry the semantics. The system
> assembles from codes, not from LLM inferences about strings.**

Mediqom claims FHIR compliance but stores FHIR-*inspired* custom JSON. Actually
committing to FHIR resources gives the ontological layer without building it:

- **FHIR `Condition`** references SNOMED CT → formal disease hierarchy
- **FHIR `Observation`** references LOINC → already present on signals
- **FHIR `MedicationRequest`** references RxNorm → medication dedup becomes code-based
- **FHIR `BodyStructure`** references SNOMED anatomy → anatomy grounded in formal standard
- **FHIR `CarePlan` + `Goal` + `ServiceRequest`** → Care Plan items *are* standard resources

Under this model:

- The LLM's job during import is: translate clinical text → FHIR resources with
  proper terminology codes (SNOMED, LOINC, RxNorm). This is a well-defined NLP
  problem the LLM handles well.
- Phase 1 entity resolution becomes: look up whether two SNOMED codes share a
  parent. A hierarchy lookup, not an LLM call.
- Monitoring rules become deterministic: `Condition SNOMED:73211009 → monitor
  LOINC:4548-4` (HbA1c for T2DM). No inference needed.

### The permanent dual-layer requirement for anatomy

This cannot be fully FHIR-normalised: the 3D body viewer renders by **mesh name**
(`R_patella`, `L_femur`). SNOMED anatomy codes (`49647007` for patella) cannot
address a Three.js mesh. Body parts will always need both:

- **Rendering address** — mesh name, local to Mediqom's 3D model (`objects.json`)
- **Semantic address** — SNOMED anatomy code, universal

These are parallel coordinate systems for the same anatomical location. Migration
does not eliminate mesh names; it adds a formal code alongside them. Every
`CarePlanBodyPartRef` will carry both fields permanently.

### Incremental adoption (no big-bang rewrite required)

**Step 1 — Additive code fields (no migration, no data loss):**
Add `snomedCode?: string` to extracted diagnoses, `rxnormCode?: string` to
medications. New imports receive formal codes; old imports do not. The merge
function uses codes when available, falls back to the current string-matching
logic. Zero disruption to existing data.

**Step 2 — FHIR resource envelopes for new documents:**
New imports are stored as FHIR bundles (`Bundle.type: 'collection'`) instead
of the current custom JSON payload, while legacy payloads remain readable via
a normalizer. The encryption envelope is unchanged — only the decrypted payload
structure changes.

**Step 3 — Opt-in re-extraction for existing documents:**
Offer a "Upgrade my medical records" flow. For each stored source document
(original PDF/image, still in Vercel Blob), re-run extraction with the FHIR
schema and replace the legacy extracted payload. This is the only path to full
FHIR grounding for existing documents without data loss. It costs LLM tokens
and requires source documents to still be in storage. Opt-in, not automatic.

---

## Migration Architecture

### The encryption constraint

All extracted health data is encrypted client-side (AES-GCM, RSA-wrapped key).
The server never sees plaintext. This means:

> **Every schema migration must run on the client. There is no server-side
> migration path.**

A migration is: decrypt (existing AES key) → transform payload → re-encrypt
(same AES key, new payload structure) → save. The encryption envelope is
unchanged; only what it wraps changes. The key is not rotated by a migration.

This has two implications:

1. **Migration can only happen when the user opens the app.** Background server
   jobs cannot migrate data on behalf of the user.
2. **A failed migration does not corrupt data.** If a migration aborts (crash,
   network loss), the original encrypted payload is still intact — the save
   only commits when the full re-encryption succeeds.

### Schema versioning

`schemaVersion` lives inside the encrypted `metadata` JSON — it is document
data, not infrastructure. The field is discovered during normal decrypt-and-use,
which is the only code path that reads a document. Lazy migration (read-on-write)
only needs the version after decryption anyway, so external visibility provides
no practical benefit.

```typescript
// Inside doc.metadata after decryption:
interface DocumentMetadata {
  title: string;
  tags: string[];
  schemaVersion?: number;  // absent → treat as 1 (legacy documents pre-versioning)
  [key: string]: any;
}
```

`schemaVersion` is set to `1` on every new document created after this change
(`src/lib/import/finalizer.ts`). Legacy documents that lack the field are treated
as `schemaVersion === 1` by `normalizeDocument()`.

Current schema version: **1** (custom JSON extraction payload).
Next planned: **2** (FHIR resource bundle payload).

### Migration strategies

**Lazy migration (read-on-write):**
When the user opens a document, if `schemaVersion < current`, decrypt →
transform → re-encrypt → save → return upgraded data. The document is migrated
the first time it is accessed after an app upgrade.

- Pro: no upfront cost; migration distributes naturally over usage
- Con: documents not accessed in years stay on old schema indefinitely; code
  must support all old schemas until all user documents are migrated

**Eager migration on app launch:**
After authentication, enumerate documents by `schemaVersion` and migrate in
a background queue. User continues normally; migration runs in idle time.

- Pro: system converges to a single schema after first launch post-upgrade
- Con: expensive for users with large document collections on mobile (battery,
  network); requires a resumable queue (migration can be interrupted)

**Re-extraction (highest fidelity, not a replacement for migration):**
Re-run LLM extraction on source documents with the FHIR schema. Produces
proper SNOMED/LOINC/RxNorm codes from scratch — not inferred from legacy strings.
This is the only way to get formal terminology codes on existing documents without
accepting term-mapping approximations.

- Requires source documents to still be in Vercel Blob storage
- Costs LLM tokens per document
- Not applicable if source was deleted
- Should be opt-in, not silent

**Recommendation:** lazy migration for structural changes (field renames, type
changes), re-extraction (opt-in) for terminology upgrades (adding SNOMED codes).
These are different kinds of migration and should be treated as separate flows.

### Data loss audit by domain

Not all domains migrate cleanly. This table is an honest accounting.

| Domain | Current format | FHIR / formal equivalent | Loss risk | Notes |
|---|---|---|---|---|
| **Lab signals** | Signal catalog key + LOINC code | FHIR `Observation` with LOINC | **Low** | LOINC already present; structural migration only |
| **Diagnoses** | ICD-10 string + description | FHIR `Condition` with SNOMED CT | **Medium–High** | ICD-10 → SNOMED mapping is many-to-many; ~5% of ICD-10 codes have no clean SNOMED equivalent; free text description is preserved so re-extraction can recover |
| **Body parts** | Mesh name (`R_patella`) + rollup parent | FHIR `BodyStructure` + mesh name (permanent dual-layer) | **Medium** | Mapping scaffold at `src/data/anatomy-snomed.ts` — seed entries complete, ~200 muscular entries need authoring; mesh names cannot be dropped (3D rendering depends on them) |
| **Medications** | Custom 4-array schema | FHIR `MedicationRequest` / `MedicationStatement` with RxNorm | **Medium** | `changeType` maps to FHIR `status`; detailed change history (previousDose, newDose) doesn't map to standard FHIR without extensions; free-text fields preserved |
| **Recommendations / Tasks** | Custom `FollowUpTask` with priority/category enums | FHIR `ServiceRequest` or `Task` | **Low–Medium** | Priority maps to FHIR `priority`; custom categories need FHIR extensions or a coding system |
| **Goals** | `CarePlanGoal` with `monitoringSignal` + optional `targetValue` | FHIR `Goal` with `target.measure` (LOINC) | **Low** | LOINC already on signals; `targetValue` maps to FHIR `target.detailQuantity` |
| **Provenance** | `confirmingDocuments[]`, `sourceQuote`, `sourceProvider` | FHIR `Provenance` resource | **Low** | FHIR `Provenance` is flexible; verbatim quotes stored as extensions |

**The irreversible loss case:** a diagnosis extracted from a Czech-language document
as ICD-10 `M22.4` with description `"Chondromalacia patelly"` migrates cleanly.
An ambiguous code like `M79.3` ("Panniculitis") has multiple SNOMED descendants —
the migration must either preserve the ICD-10 code alongside the SNOMED code
(recommended) or accept approximation. The rule: **never discard the source code
during migration**; add the formal code, keep the original.

### Backwards compatibility guarantee

The normalizer pattern extends to schema migration: the client always runs
`normalizeDocument()` before using document data. This function is the single
branch point for all schema versions and returns a consistent internal
representation. Old documents remain readable. New code never branches on
`schemaVersion` outside this function.

```typescript
// src/lib/documents/normalize.ts — the only place schemaVersion is checked:
function normalizeDocument(doc: Document): Document {
  const version = doc.metadata?.schemaVersion ?? 1;
  if (version === 1) return doc;          // no-op for v1; structural transform runs here for v2+
  throw new Error(`Unknown schemaVersion: ${version}`);
}
```

`normalizeDocument()` is called at every decrypted-document return site in
`src/lib/documents/index.ts`. When v2 (FHIR envelopes) lands, only this
function changes — all callers are already wrapped.

Old documents and new documents are always usable simultaneously. There is no
flag day where old documents become unreadable.

---

## Relation Vocabulary

`CarePlanItem.relatedItems` carries typed graph edges between Care Plan items.
The current vocabulary is intentionally minimal and closed — no new reason types
are added without deliberate design.

### Current relations

| Reason | Meaning | Example |
|---|---|---|
| `laterality` | Same condition, different anatomical side | L_knee osteoarthritis vs. R_knee osteoarthritis |
| `progression` | One item supersedes or evolves from another | Stage 1 → Stage 2; provisional → confirmed |
| `comorbidity` | Distinct conditions that belong in proximity | Hypertension and Type 2 Diabetes |

Under the FHIR path, these map to SNOMED relationship types:
`laterality` → SNOMED `272741003` (laterality attribute),
`progression` → SNOMED `246454002` (occurrence), with formal SNOMED codes
on both items providing the verification layer.

### Candidate future relations

| Candidate | Meaning | Trigger to add |
|---|---|---|
| `causation` | Condition A caused by or complicating condition B | Enough comorbidity pairs where direction matters clinically |
| `manifestation` | Condition A is a manifestation of condition B | Diabetic retinopathy → T2DM |
| `monitoring-dependency` | Condition A requires tracking signal B | When rule-based monitoring ships (SNOMED → LOINC rule table) |
| `contraindication` | Condition A contraindicates medication B | When medication-condition checking ships (RxNorm + SNOMED) |

Under FHIR, these become verifiable: `causation` between two `Condition` resources
can be checked against SNOMED's `causative agent` relationship. The relation
vocabulary and the terminology layer reinforce each other.

---

## Anatomy

The 3D body viewer requires mesh names (`R_patella`, `L_femur`) as rendering
addresses. SNOMED anatomy codes (`64234005` for patella) are the semantic
addresses. Both layers must coexist permanently — SNOMED codes are additive,
not a replacement. See §Primary Path → The permanent dual-layer requirement
for anatomy for the rationale.

### Current state

- `src/data/objects.json` — 472 mesh names across 10 categories (the
  rendering address layer)
- `src/data/anatomy-snomed.ts` — mesh → SNOMED CT mapping scaffold (the
  semantic address layer); seed entries populated for major skeleton, organs,
  vascular, nervous, lymphatic, respiratory, digestive, and urogenital structures;
  ~200 muscular-system entries have empty `snomedCode` fields awaiting manual
  authoring
- `src/data/anatomy-regions.ts` — internal rollup taxonomy
  (`R_patella → R_knee → R_leg → lower_limb`); not linked to a formal standard

### Completing the anatomy-snomed table

**Source:** SNOMED CT Browser (browser.ihtsdotools.org), filtered to the
*Body structure* hierarchy (root `123037004`). For structures not in SNOMED CT
body structure, fall back to FMA concept ID with a note.

**Convention:** bilateral pairs share one SNOMED code with differing `laterality`
(`'left' | 'right'`). Midline structures (spine, sternum) omit laterality.
Empty `snomedCode: ''` marks entries that need authoring. Do not guess —
absent code is preferable to incorrect code.

**Scope remaining:** primarily muscular system (~200 entries, mostly hand/forearm
intrinsics and facial expression muscles). Estimated 2–3 days of data authoring.

### Consuming the table

```typescript
import { getSnomedForMesh } from '$data/anatomy-snomed';
const entry = getSnomedForMesh('R_femur');
// → { snomedCode: '71341001', label: 'Femur', laterality: 'right' }
```

Future: `CarePlanBodyPartRef` will carry `snomedCode` alongside `identification`
once the table is complete, enabling SNOMED-based body-part deduplication in
the Care Plan merge.

---

## Priority Sequence

| Phase | Work | Value |
|---|---|---|
| ✅ Done | `snomedCode?` on diagnoses, `rxnormCode?` on all four medication arrays; `schemaVersion: 1` on new saves; `normalizeDocument()` at all decrypt return sites | Formal codes on new imports; versioned metadata; normalizer pattern live |
| v2 — started | Complete mesh → SNOMED anatomy mapping — scaffold at `src/data/anatomy-snomed.ts` with seed entries; ~200 entries need manual authoring from SNOMED CT Browser (body structure hierarchy `123037004`) | Dual-layer anatomy grounding established; FMA-grounded body parts |
| v2 | FHIR resource envelopes for new imports; normalizer for legacy | System converges to FHIR for new data without touching existing |
| v2 | Explicit clinical rule table (SNOMED condition → LOINC signal) | Deterministic monitoring triggers; removes LLM inference for common cases |
| v3 | Opt-in re-extraction flow for existing documents | Full FHIR grounding retroactively; highest quality migration path |
| v3 | SNOMED CT subsumption for Phase 1 entity resolution | Replaces LLM string matching with hierarchy lookup for known codes |
| Future | FHIR full resource migration (lazy + eager) | Formal interop with EHR systems |
| Far future | OWL reasoning over full FHIR graph | Regulatory-grade clinical decision support |
