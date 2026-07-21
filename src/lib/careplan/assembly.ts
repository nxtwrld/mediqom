/**
 * Document → Care Plan input normalisation (Care Plan build row 4).
 *
 * Reads the saved document content and produces a single `AnnotatedExtraction`
 * the merge function can consume. It normalises across the FOUR places a
 * recommendation can live (the universal `recommendationsDetailed` node, the
 * specialised treatment-plan and assessment nodes, and the legacy
 * urgency/description shape), plus diagnoses, body parts, and treatment goals.
 *
 * When `hadContext` is false (no Care Plan context was sent during extraction),
 * the LLM link annotations are stripped so the merge falls back to deterministic
 * dedup — the annotations would be untrustworthy without the context they
 * reference.
 */
import { normalizeTreatmentGoals } from "./normalize";
import type {
  AnnotatedExtraction,
  ExtractedBodyPart,
  ExtractedDiagnosis,
  ExtractedGoal,
  ExtractedRecommendation,
  PerformerRef,
} from "./types";

const URGENCY_TO_PRIORITY: Record<number, ExtractedRecommendation["priority"]> =
  {
    5: "immediate",
    4: "urgent",
    3: "routine",
    2: "routine",
    1: "as_needed",
  };

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeDiagnoses(content: any): ExtractedDiagnosis[] {
  return asArray<any>(content?.diagnosis).map((d) => ({
    code: d.code,
    description: d.description ?? "",
    type: d.type,
    confidence: d.confidence,
    date: d.date,
    snomedCode: d.snomedCode,
    linkedCarePlanItemId: d.linkedCarePlanItemId,
    isNewCondition: d.isNewCondition,
    progressionFrom: d.progressionFrom,
    linkReason: d.linkReason,
    relatedTo: Array.isArray(d.relatedTo) ? d.relatedTo : undefined,
  }));
}

function fromDetailed(items: any[]): ExtractedRecommendation[] {
  return items.map((r) => ({
    text: r.recommendation ?? r.text ?? "",
    category: r.category,
    priority: r.priority,
    timeframeText: r.timeframe,
    timeframeNormalized: r.timeframeNormalized,
    sourceQuote: r.sourceQuote,
    sourceProvider: r.sourceProvider as PerformerRef | undefined,
    monitoringSignals: extractSignalNames(r.monitoringSignals),
    relatedDiagnosisCode: r.relatedDiagnosis?.code,
    linkedCarePlanTaskId: r.linkedCarePlanTaskId,
    isNewTask: r.isNewTask,
    resolves: Array.isArray(r.resolves) ? r.resolves : undefined,
  }));
}

function fromLegacy(items: any[]): ExtractedRecommendation[] {
  // report.core recommendations: { urgency, description }
  const out: ExtractedRecommendation[] = [];
  for (const r of items) {
    const text =
      typeof r === "string" ? r : (r.description ?? r.recommendation ?? "");
    if (!text) continue;
    const priority: ExtractedRecommendation["priority"] =
      typeof r === "object" && typeof r.urgency === "number"
        ? (URGENCY_TO_PRIORITY[r.urgency] ?? "routine")
        : "routine";
    out.push({ text, priority, category: "follow_up" });
  }
  return out;
}

function extractSignalNames(value: unknown): string[] {
  return asArray<any>(value)
    .map((s) => (typeof s === "string" ? s : (s?.signal ?? s?.name)))
    .filter((s): s is string => typeof s === "string" && s.length > 0);
}

function normalizeRecommendations(content: any): ExtractedRecommendation[] {
  const out: ExtractedRecommendation[] = [];
  // 1. Universal recommendations node (richest shape).
  out.push(
    ...fromDetailed(
      asArray<any>(content?.recommendationsDetailed?.recommendations),
    ),
  );
  // 2. Specialised treatment-plan node.
  out.push(
    ...fromDetailed(asArray<any>(content?.treatmentPlan?.recommendations)),
  );
  // 3. Specialised assessment node.
  out.push(...fromDetailed(asArray<any>(content?.assessment?.recommendations)));
  // 4. Legacy report.core recommendations (urgency/description or strings).
  out.push(...fromLegacy(asArray<any>(content?.recommendations)));
  return out;
}

function normalizeGoals(content: any): ExtractedGoal[] {
  const raw = [
    ...asArray<any>(content?.recommendationsDetailed?.carePlan?.goals),
    ...asArray<any>(content?.treatmentPlan?.treatmentGoals),
    ...asArray<any>(content?.treatmentGoals),
    ...asArray<any>(content?.carePlan?.goals),
  ];
  return normalizeTreatmentGoals(raw).map((g, i) => {
    const source = raw[i] && typeof raw[i] === "object" ? raw[i] : {};
    return {
      ...g,
      sourceQuote: source.sourceQuote,
      sourceProvider: source.sourceProvider as PerformerRef | undefined,
    };
  });
}

function normalizeBodyParts(content: any): ExtractedBodyPart[] {
  return asArray<any>(content?.bodyParts).map((b) => ({
    identification: b.identification,
    part: b.part,
    status: b.status,
    treatment: b.treatment,
    urgency: typeof b.urgency === "number" ? b.urgency : undefined,
  }));
}

function stripAnnotations(
  extraction: AnnotatedExtraction,
): AnnotatedExtraction {
  return {
    ...extraction,
    diagnoses: extraction.diagnoses.map((d) => ({
      ...d,
      linkedCarePlanItemId: undefined,
      isNewCondition: undefined,
      progressionFrom: undefined,
      linkReason: undefined,
      relatedTo: undefined,
    })),
    recommendations: extraction.recommendations.map((r) => ({
      ...r,
      linkedCarePlanTaskId: undefined,
      isNewTask: undefined,
      resolves: undefined,
    })),
  };
}

/**
 * Build the normalised, annotated extraction from a saved document's content.
 */
export function extractCarePlanInputs(
  content: any,
  documentId: string,
  documentDate: string,
  hadContext: boolean,
): AnnotatedExtraction {
  const recommendations = normalizeRecommendations(content);
  const extraction: AnnotatedExtraction = {
    documentId,
    documentDate,
    hadContext,
    diagnoses: normalizeDiagnoses(content),
    recommendations,
    goals: normalizeGoals(content),
    bodyParts: normalizeBodyParts(content),
    monitoringSignals: dedupeStrings(
      recommendations.flatMap((r) => r.monitoringSignals ?? []),
    ),
    medicationIds: asArray<any>(content?.medications?.documentIds).filter(
      (id): id is string => typeof id === "string",
    ),
    provider: content?.performer as PerformerRef | undefined,
  };
  return hadContext ? extraction : stripAnnotations(extraction);
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values)];
}
