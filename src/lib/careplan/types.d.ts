/**
 * Care Plan data model (Care Plan build row 2, 7q, 7r).
 *
 * Canonical TypeScript shapes for the Care Plan singleton document and its
 * parts. Mirrors `CAREPLAN.md` §Data Model. Where a shape is isomorphic to a
 * FHIR resource the JSDoc notes the mapping (REVISION §7 — adopt FHIR shapes
 * "where practical" without diverging from the PRD interfaces).
 *
 * Certainty is NEVER stored — it is computed at load time from the stored dates
 * (see `certainty.ts`). Only dates, statuses, and provenance are persisted.
 */

import type { TreatmentGoal } from "./normalize";

/** ISO-8601 date or datetime string. */
type ISODate = string;

/** Map of field name → ISO timestamp of the last explicit user edit. Drives
 * the "User edit > Document extraction > AI inference" precedence rule. */
export type UserEditMap = Record<string, ISODate>;

/** Diagnosis-level clinical reference. Mirrors the extraction diagnosis item.
 * FHIR: Condition.code + Condition.verificationStatus. */
export interface DiagnosisRef {
  code?: string; // ICD-10
  description: string;
  type?:
    | "primary"
    | "secondary"
    | "differential"
    | "rule_out"
    | "provisional"
    | "confirmed";
  confidence?: "confirmed" | "probable" | "possible" | "suspected";
  date?: ISODate;
  snomedCode?: string;
}

/** Healthcare provider reference. Mirrors core.performer.
 * FHIR: CarePlan.author / Task.requester (PractitionerRole). */
export interface PerformerRef {
  role?: string;
  name?: string;
  title?: string;
  specialty?: string;
  institution?: {
    name?: string;
    department?: string;
    address?: string;
    phone?: string;
    email?: string;
  };
}

/** Anatomical locus with per-region status, urgency, and provenance.
 * Richer than a mesh-name array so the union-merge across years of documents
 * stays traceable (build rows 7q, G1/G6/G8). */
export interface CarePlanBodyPartRef {
  /** Mesh name or region id from the anatomy registry. */
  identification: string;
  /** Nearest rollup parent region (e.g. R_knee for R_patella). */
  part?: string;
  status?: "active" | "monitoring" | "recovering";
  /** Free-text, doctor-written. */
  treatment?: string;
  /** Doctor-written 1–5 severity; max across documents (drives 3D pulse). */
  urgency?: 1 | 2 | 3 | 4 | 5;
  /** docIds that contributed this region — union-merged on each import. */
  sources: string[];
}

/** A follow-up task. FHIR: Task. */
export interface FollowUpTask {
  id: string;
  text: string;
  category:
    | "follow_up"
    | "referral"
    | "diagnostic_test"
    | "monitoring"
    | "lifestyle"
    | "medication"
    | "treatment"
    | "prevention"
    | "education";
  priority: "immediate" | "urgent" | "routine" | "as_needed";

  // Temporal
  sourceDocumentDate: ISODate;
  timeframeText?: string;
  timeframeNormalized?: {
    unit: "days" | "weeks" | "months" | "years";
    value: number;
  };
  /** Computed: sourceDocumentDate + timeframeNormalized (or parsed fallback). */
  dueDate?: ISODate;
  /** immediate=3, urgent=14, routine=90, as_needed=180. */
  certaintyCycleInDays: number;

  // State
  status: "pending" | "done" | "snoozed" | "ignored";
  completedAt?: ISODate;
  completedByDocumentId?: string;
  snoozedUntil?: ISODate;
  snoozeReason?: "cost" | "time" | "unsure" | "other";
  snoozeNote?: string;

  // Links
  diagnosisItemId: string;
  sourceDocumentId?: string;

  // Provenance (rendered by "Why is this here?")
  sourceQuote?: string;
  sourceProvider?: PerformerRef;
  sourceMessageId?: string; // set when chat created the task

  /** Hint when a new recommendation re-creates a previously completed task. */
  previouslyCompleted?: { taskId: string; completedAt: ISODate };

  /** Per-field user-edit timestamps for precedence resolution. */
  userEdited?: UserEditMap;
}

/** A measurable care goal. FHIR: Goal (target.measure / detailQuantity / detailRange). */
export interface CarePlanGoal extends TreatmentGoal {
  id: string;
  // Provenance
  sourceQuote?: string;
  sourceProvider?: PerformerRef;
  userEdited?: UserEditMap;
  // trend is computed live from profile.health.signals — never stored.
}

/** Plain-language rewrite cache, keyed by field name (row 7k). */
export type PlainLanguageCache = Record<
  string,
  { text: string; sourceHash: string; language: string }
>;

/** One condition on the Care Plan. FHIR: CarePlan (one item ≈ one addresses[] Condition). */
export interface CarePlanItem {
  id: string;

  // Identity — deduplication anchor
  diagnosisCode?: string; // ICD-10
  diagnosisDescription: string;

  // Classification
  conditionType:
    | "acute"
    | "chronic"
    | "monitoring"
    | "wellness"
    | "exploratory";
  certaintyCycleInDays: number;

  // Provenance — aggregated across confirmingDocuments[]
  firstSeenDate: ISODate;
  lastSeenInDocumentDate: ISODate;
  confirmingDocuments: string[];
  contradictingDocuments: string[];

  // Status (stored)
  status: "active" | "monitoring" | "resolved" | "historical";
  resolvedAt?: ISODate;
  resolvedByDocumentId?: string;
  lastViewedAt?: ISODate;
  userNotes?: string;

  // Clinical data
  diagnosis: DiagnosisRef;
  provider?: PerformerRef;

  // Linked items
  tasks: FollowUpTask[];
  goals: CarePlanGoal[];
  medicationIds: string[];
  monitoringSignals: string[];
  bodyParts: CarePlanBodyPartRef[];

  /** Graph edges to other items on the same plan (G4). Closed vocabulary in v1. */
  relatedItems?: Array<{
    id: string;
    reason: "laterality" | "progression" | "comorbidity";
  }>;
  /** Set on the new item when this supersedes a prior one (progression). */
  supersedes?: string;

  // Per-field user-edit timestamps for precedence resolution.
  userEdited?: UserEditMap;

  // Plain-language rewrite cache (row 7k).
  plainLanguage?: PlainLanguageCache;
}

/** The encrypted singleton Care Plan document content. */
export interface CarePlanDocument {
  items: CarePlanItem[];
  historicalItems: CarePlanItem[];
  updatedAt: ISODate;
}

// ── Assembly / merge types ───────────────────────────────────────────────────

/** Body part as it comes out of extraction (pre-normalisation). */
export interface ExtractedBodyPart {
  identification: string;
  part?: string;
  status?: string;
  treatment?: string;
  urgency?: number;
}

/** Diagnosis as it comes out of extraction, with optional LLM link annotations. */
export interface ExtractedDiagnosis extends DiagnosisRef {
  linkedCarePlanItemId?: string;
  isNewCondition?: boolean;
  progressionFrom?: string;
  linkReason?: string;
  relatedTo?: Array<{
    id: string;
    reason: "laterality" | "progression" | "comorbidity";
  }>;
}

/** Recommendation as it comes out of extraction, normalised by assembly. */
export interface ExtractedRecommendation {
  text: string;
  category?: FollowUpTask["category"];
  priority?: FollowUpTask["priority"];
  timeframeText?: string;
  timeframeNormalized?: FollowUpTask["timeframeNormalized"];
  sourceQuote?: string;
  sourceProvider?: PerformerRef;
  monitoringSignals?: string[];
  /** ICD-10 of the related diagnosis, if the recommendation named one — used to
   * attach the resulting task to the right item. */
  relatedDiagnosisCode?: string;
  // Link annotations
  linkedCarePlanTaskId?: string;
  isNewTask?: boolean;
  resolves?: string[];
}

/** A goal as it comes out of extraction — id is assigned by the merge. */
export type ExtractedGoal = Omit<CarePlanGoal, "id">;

/** The normalised, annotated extraction handed to `mergeCarePlan()`. */
export interface AnnotatedExtraction {
  documentId: string;
  documentDate: ISODate;
  /** Whether a Care Plan context block was sent during extraction. When false,
   * link annotations are stripped and the merge falls back to deterministic
   * dedup. */
  hadContext: boolean;
  diagnoses: ExtractedDiagnosis[];
  recommendations: ExtractedRecommendation[];
  goals: ExtractedGoal[];
  bodyParts: ExtractedBodyPart[];
  monitoringSignals: string[];
  medicationIds: string[];
  provider?: PerformerRef;
}

/** Structured description of what a merge changed. Powers the post-import
 * summary screen. Ephemeral — not persisted on the Care Plan document. */
export interface CarePlanDelta {
  newItems: CarePlanItem[];
  updatedItems: Array<{ id: string; changedFields: string[] }>;
  newTasks: FollowUpTask[];
  resolvedTasks: Array<{ id: string; resolvedByDocumentId: string }>;
  resurrected: string[];
  progressions: Array<{ from: string; to: string }>;
  conflicts: Array<{
    itemId: string;
    kind: "historical_vs_active" | "confidence_opposed" | "side_disagreement";
  }>;
}

// ── Extraction context blob (Phase 1, build row 7b) ──────────────────────────

/** Compact view of the current plan sent to the server during import so the
 * LLM can emit link annotations. Encrypted in transit; never persisted. */
export interface CarePlanExtractionContext {
  activeItems: Array<{
    id: string;
    icd10?: string;
    description: string;
    bodyParts: Array<{ identification: string; rollup: string[] }>;
    conditionType: CarePlanItem["conditionType"];
    lastSeenDate: ISODate;
  }>;
  activeTasks: Array<{
    id: string;
    text: string;
    category: string;
    diagnosisItemId: string;
  }>;
  recentMedications: Array<{
    id: string;
    name: string;
    dose?: string;
    status: "active" | "discontinued";
  }>;
}

/** Lightweight summary used to seed chat focus on a Care Plan item (row 7i). */
export interface CarePlanItemChatSummary {
  id: string;
  description: string;
  status: CarePlanItem["status"];
  conditionType: CarePlanItem["conditionType"];
  topTasks: Array<{
    text: string;
    status: FollowUpTask["status"];
    dueDate?: ISODate;
  }>;
}
