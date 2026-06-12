/**
 * Care Plan extraction context blob (Care Plan build row 7b).
 *
 * Builds the compact view of the current plan that travels to the server during
 * import so the extraction LLM can emit link annotations (linkedCarePlanItemId,
 * resolves, …). Returns null when the plan is empty so the caller can skip
 * sending anything. `renderContextForPrompt()` serialises it into the
 * deterministic text block the extraction nodes inject into their prompts.
 */
import { rollupChain } from "$data/anatomy-regions";
import type { CarePlanDocument, CarePlanExtractionContext } from "./types";

export interface MedicationSummary {
  id: string;
  name: string;
  dose?: string;
  status: "active" | "discontinued";
}

/** Build the context blob from the active plan. Null when there is nothing to send. */
export function buildCarePlanExtractionContext(
  plan: CarePlanDocument | null | undefined,
  medications: MedicationSummary[] = [],
): CarePlanExtractionContext | null {
  const items = plan?.items ?? [];
  const activeItems = items
    .filter((i) => i.status === "active" || i.status === "monitoring")
    .map((i) => ({
      id: i.id,
      icd10: i.diagnosisCode,
      description: i.diagnosisDescription,
      bodyParts: i.bodyParts.map((bp) => ({
        identification: bp.identification,
        rollup: rollupChain(bp.identification),
      })),
      conditionType: i.conditionType,
      lastSeenDate: i.lastSeenInDocumentDate,
    }));

  const activeTasks = items.flatMap((i) =>
    i.tasks
      .filter((t) => t.status === "pending" || t.status === "snoozed")
      .map((t) => ({
        id: t.id,
        text: t.text,
        category: t.category,
        diagnosisItemId: i.id,
      })),
  );

  if (
    activeItems.length === 0 &&
    activeTasks.length === 0 &&
    medications.length === 0
  ) {
    return null;
  }

  return {
    activeItems,
    activeTasks,
    recentMedications: medications.map((m) => ({
      id: m.id,
      name: m.name,
      dose: m.dose,
      status: m.status,
    })),
  };
}

/**
 * Deterministic text rendering of the context for prompt injection. The phrasing
 * carries the Phase-1 matching rules: ICD-10 is the hard anchor, rollup ancestry
 * is a soft signal, body-part disagreement alone is not decisive.
 */
export function renderContextForPrompt(ctx: CarePlanExtractionContext): string {
  const lines: string[] = [];
  lines.push("EXISTING CARE PLAN CONTEXT (for linking — do NOT invent ids):");
  lines.push(
    "Matching rules: an exact ICD-10 match is the hard anchor; body-part rollup overlap is a soft supporting signal; description similarity across languages counts. When a diagnosis matches an existing item, emit linkedCarePlanItemId with that id. Otherwise set isNewCondition: true. Only use ids that appear verbatim below.",
  );

  if (ctx.activeItems.length) {
    lines.push("\nActive items:");
    for (const i of ctx.activeItems) {
      const icd = i.icd10 ? ` [${i.icd10}]` : "";
      const parts = i.bodyParts.length
        ? ` (regions: ${i.bodyParts
            .map((b) => [b.identification, ...b.rollup].join("→"))
            .join("; ")})`
        : "";
      lines.push(
        `- id=${i.id}${icd} ${i.description} <${i.conditionType}>${parts}`,
      );
    }
  }

  if (ctx.activeTasks.length) {
    lines.push(
      "\nActive tasks (emit linkedCarePlanTaskId for duplicates, resolves[] for satisfied):",
    );
    for (const t of ctx.activeTasks) {
      lines.push(
        `- id=${t.id} [${t.category}] ${t.text} (item=${t.diagnosisItemId})`,
      );
    }
  }

  if (ctx.recentMedications.length) {
    lines.push("\nRecent medications:");
    for (const m of ctx.recentMedications) {
      const dose = m.dose ? ` ${m.dose}` : "";
      lines.push(`- id=${m.id} ${m.name}${dose} <${m.status}>`);
    }
  }

  return lines.join("\n");
}
