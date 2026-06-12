/**
 * Deterministic Care Plan merge (Care Plan build rows 7e, 7h).
 *
 * Pure, deterministic, idempotent. Takes the existing plan plus an annotated
 * extraction and returns the next plan and a structured delta describing what
 * changed. Re-running with the same documentId is a no-op (guards on
 * confirmingDocuments membership and source-tagged task/goal creation).
 *
 * Precedence rule (CAREPLAN.md §Conflict resolution):
 *   User edit > Document extraction > AI inference.
 * A field listed in an item/task `userEdited` map is never overwritten by a
 * subsequent document; the disagreement surfaces in `delta.conflicts` instead.
 */
import { matchDiagnosis } from "./dedup";
import { computeDueDate, parseTimeframeFallback } from "./timeframe";
import { certaintyCycleInDays, computeTaskCertaintyCycle } from "./certainty";
import { unionMergeBodyParts } from "./bodyparts";
import type {
  AnnotatedExtraction,
  CarePlanDelta,
  CarePlanDocument,
  CarePlanGoal,
  CarePlanItem,
  ExtractedDiagnosis,
  ExtractedRecommendation,
  FollowUpTask,
} from "./types";

export interface MergeOptions {
  documentId: string;
  documentDate: string;
  now?: string;
  locale?: string;
  idgen?: () => string;
}

const CONFIDENCE_RANK: Record<string, number> = {
  suspected: 1,
  possible: 2,
  probable: 3,
  confirmed: 4,
};
const RULED_OUT_TYPES = new Set(["rule_out"]);
const EXPLORATORY_TYPES = new Set(["differential", "rule_out", "provisional"]);

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function makeIdgen(provided?: () => string): () => string {
  if (provided) return provided;
  let n = 0;
  return () =>
    `cp_${(n++).toString(36)}_${Math.round(Math.abs(Math.sin(n)) * 1e6)}`;
}

function inferConditionType(
  dx: ExtractedDiagnosis,
  monitoringSignals: string[],
): CarePlanItem["conditionType"] {
  if (dx.type && EXPLORATORY_TYPES.has(dx.type)) return "exploratory";
  if (monitoringSignals.length) return "monitoring";
  return "acute";
}

function maxDate(a: string, b: string): string {
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

function isUserEdited(
  target: { userEdited?: Record<string, string> },
  field: string,
): boolean {
  return Boolean(target.userEdited && field in target.userEdited);
}

export function mergeCarePlan(
  existing: CarePlanDocument,
  extraction: AnnotatedExtraction,
  options: MergeOptions,
): { newPlan: CarePlanDocument; delta: CarePlanDelta } {
  const now = options.now ?? new Date().toISOString();
  const locale = options.locale ?? "en";
  const docId = options.documentId;
  const docDate = options.documentDate;
  const idgen = makeIdgen(options.idgen);

  const plan: CarePlanDocument = clone(
    existing ?? { items: [], historicalItems: [], updatedAt: now },
  );
  plan.items ??= [];
  plan.historicalItems ??= [];

  const delta: CarePlanDelta = {
    newItems: [],
    updatedItems: [],
    newTasks: [],
    resolvedTasks: [],
    resurrected: [],
    progressions: [],
    conflicts: [],
  };

  const itemById = new Map(plan.items.map((i) => [i.id, i] as const));
  const historicalById = new Map(
    plan.historicalItems.map((i) => [i.id, i] as const),
  );
  const changed = new Map<string, Set<string>>(); // itemId → changed fields

  function markChanged(itemId: string, field: string) {
    (changed.get(itemId) ?? changed.set(itemId, new Set()).get(itemId)!).add(
      field,
    );
  }

  // ── Resurrection: pull annotated historical items back into items[] ─────────
  function resurrect(itemId: string): CarePlanItem | undefined {
    const archived = historicalById.get(itemId);
    if (!archived) return undefined;
    plan.historicalItems = plan.historicalItems.filter((i) => i.id !== itemId);
    historicalById.delete(itemId);
    plan.items.push(archived);
    itemById.set(itemId, archived);
    delta.resurrected.push(itemId);
    return archived;
  }

  function resolveExistingItem(
    id: string | undefined,
  ): CarePlanItem | undefined {
    if (!id) return undefined;
    return itemById.get(id) ?? resurrect(id);
  }

  const touchedItemIds: string[] = [];
  let primaryItemId: string | undefined;

  function touch(itemId: string) {
    if (!touchedItemIds.includes(itemId)) touchedItemIds.push(itemId);
    primaryItemId ??= itemId;
  }

  // ── Diagnoses → items ───────────────────────────────────────────────────────
  for (const dx of extraction.diagnoses) {
    if (!dx.description && !dx.code) continue;

    let target: CarePlanItem | undefined;

    // Progression supersedes an existing item.
    if (extraction.hadContext && dx.progressionFrom) {
      const source = resolveExistingItem(dx.progressionFrom);
      if (source) {
        if (!isUserEdited(source, "status")) source.status = "historical";
        const created = createItem(dx, source.id);
        delta.progressions.push({ from: source.id, to: created.id });
        target = created;
      }
    }

    // Direct link annotation (validated against the real plan).
    if (!target && extraction.hadContext && dx.linkedCarePlanItemId) {
      target = resolveExistingItem(dx.linkedCarePlanItemId);
    }

    // Deterministic dedup (no/invalid annotation, or no-context import).
    if (!target) {
      const dxBodyPartIds = extraction.bodyParts
        .map((b) => b.identification)
        .filter(Boolean);
      const match = matchDiagnosis(dx, plan.items, dxBodyPartIds);
      if (match) target = itemById.get(match.itemId);
    }

    if (target) {
      updateItem(target, dx);
      touch(target.id);
    } else {
      const created = createItem(dx);
      touch(created.id);
    }

    // relatedTo graph edges (both endpoints keep independent state).
    if (extraction.hadContext && dx.relatedTo?.length && target) {
      for (const rel of dx.relatedTo) {
        const other = resolveExistingItem(rel.id);
        if (!other) continue;
        addRelated(target, other.id, rel.reason);
        addRelated(other, target.id, rel.reason);
        if (rel.reason === "laterality") {
          delta.conflicts.push({
            itemId: target.id,
            kind: "side_disagreement",
          });
        }
      }
    }
  }

  function createItem(
    dx: ExtractedDiagnosis,
    supersedes?: string,
  ): CarePlanItem {
    const conditionType = inferConditionType(dx, extraction.monitoringSignals);
    const item: CarePlanItem = {
      id: idgen(),
      diagnosisCode: dx.code,
      diagnosisDescription: dx.description || dx.code || "Condition",
      conditionType,
      certaintyCycleInDays: 0,
      firstSeenDate: docDate,
      lastSeenInDocumentDate: docDate,
      confirmingDocuments: [docId],
      contradictingDocuments: [],
      status: "active",
      diagnosis: {
        code: dx.code,
        description: dx.description || "",
        type: dx.type,
        confidence: dx.confidence,
        date: dx.date,
        snomedCode: dx.snomedCode,
      },
      provider: extraction.provider,
      tasks: [],
      goals: [],
      medicationIds: [...extraction.medicationIds],
      monitoringSignals: [...extraction.monitoringSignals],
      bodyParts: [],
      ...(supersedes ? { supersedes } : {}),
    };
    item.certaintyCycleInDays = certaintyCycleInDays(item);
    plan.items.push(item);
    itemById.set(item.id, item);
    delta.newItems.push(item);
    return item;
  }

  function updateItem(item: CarePlanItem, dx: ExtractedDiagnosis) {
    // lastSeen + confirming docs
    if (
      maxDate(item.lastSeenInDocumentDate, docDate) !==
      item.lastSeenInDocumentDate
    ) {
      item.lastSeenInDocumentDate = maxDate(
        item.lastSeenInDocumentDate,
        docDate,
      );
      markChanged(item.id, "lastSeenInDocumentDate");
    }
    if (!item.confirmingDocuments.includes(docId)) {
      item.confirmingDocuments.push(docId);
      markChanged(item.id, "confirmingDocuments");
    }

    // User-set historical vs an active document → surface, never auto-flip.
    if (item.status === "historical" && isUserEdited(item, "status")) {
      delta.conflicts.push({ itemId: item.id, kind: "historical_vs_active" });
    }

    // Confidence: higher wins; opposed direction → contradiction.
    if (dx.confidence) {
      const incomingRank = CONFIDENCE_RANK[dx.confidence] ?? 0;
      const currentRank = CONFIDENCE_RANK[item.diagnosis.confidence ?? ""] ?? 0;
      const opposed =
        (RULED_OUT_TYPES.has(dx.type ?? "") &&
          item.diagnosis.type === "confirmed") ||
        (dx.type === "confirmed" &&
          RULED_OUT_TYPES.has(item.diagnosis.type ?? ""));
      if (opposed) {
        if (!item.contradictingDocuments.includes(docId)) {
          item.contradictingDocuments.push(docId);
          markChanged(item.id, "contradictingDocuments");
        }
        delta.conflicts.push({ itemId: item.id, kind: "confidence_opposed" });
      } else if (
        incomingRank > currentRank &&
        !isUserEdited(item, "diagnosis")
      ) {
        item.diagnosis.confidence = dx.confidence;
        markChanged(item.id, "diagnosis");
      }
    }
    if (!item.diagnosisCode && dx.code) item.diagnosisCode = dx.code;
  }

  function addRelated(
    item: CarePlanItem,
    otherId: string,
    reason: "laterality" | "progression" | "comorbidity",
  ) {
    item.relatedItems ??= [];
    if (
      !item.relatedItems.some((r) => r.id === otherId && r.reason === reason)
    ) {
      item.relatedItems.push({ id: otherId, reason });
      markChanged(item.id, "relatedItems");
    }
  }

  // ── Recommendations → tasks ─────────────────────────────────────────────────
  const allTasks = () =>
    plan.items.flatMap((i) => i.tasks.map((t) => ({ item: i, task: t })));

  for (const rec of extraction.recommendations) {
    // resolves[]: satisfy existing tasks (respecting user ignore).
    if (extraction.hadContext && rec.resolves?.length) {
      for (const taskId of rec.resolves) {
        const found = allTasks().find(({ task }) => task.id === taskId);
        if (!found) continue;
        if (
          found.task.status === "ignored" &&
          isUserEdited(found.task, "status")
        )
          continue;
        if (found.task.status !== "done") {
          found.task.status = "done";
          found.task.completedAt = now;
          found.task.completedByDocumentId = docId;
          delta.resolvedTasks.push({ id: taskId, resolvedByDocumentId: docId });
          markChanged(found.item.id, "tasks");
        }
      }
    }
  }

  for (const rec of extraction.recommendations) {
    if (!rec.text) continue;
    if (rec.resolves?.length && !rec.text) continue;

    const targetItem = pickTargetItem(rec);
    if (!targetItem) continue;

    // Update an existing task by annotation.
    if (extraction.hadContext && rec.linkedCarePlanTaskId) {
      const existingTask = targetItem.tasks.find(
        (t) => t.id === rec.linkedCarePlanTaskId,
      );
      if (existingTask) {
        updateTask(existingTask, rec, targetItem.id);
        continue;
      }
    }

    // Idempotency guard: a task from this same document with this text already exists.
    const dup = targetItem.tasks.find(
      (t) => t.sourceDocumentId === docId && t.text === rec.text,
    );
    if (dup) continue;

    createTask(rec, targetItem);
  }

  function pickTargetItem(
    rec: ExtractedRecommendation,
  ): CarePlanItem | undefined {
    if (rec.relatedDiagnosisCode) {
      const byCode = touchedItemIds
        .map((id) => itemById.get(id))
        .find((i) => i && i.diagnosisCode === rec.relatedDiagnosisCode);
      if (byCode) return byCode;
    }
    return primaryItemId ? itemById.get(primaryItemId) : undefined;
  }

  function computeTaskDueDate(
    rec: ExtractedRecommendation,
  ): string | undefined {
    const tf =
      rec.timeframeNormalized ??
      parseTimeframeFallback(rec.timeframeText, locale);
    return computeDueDate(docDate, tf);
  }

  function createTask(rec: ExtractedRecommendation, item: CarePlanItem) {
    const priority = rec.priority ?? "routine";
    // Re-creation of a previously completed task → carry the hint.
    const prior = [...item.tasks]
      .filter(
        (t) => t.status === "done" && t.text === rec.text && t.completedAt,
      )
      .sort((a, b) => (b.completedAt! > a.completedAt! ? 1 : -1))[0];

    const task: FollowUpTask = {
      id: idgen(),
      text: rec.text,
      category: rec.category ?? "follow_up",
      priority,
      sourceDocumentDate: docDate,
      timeframeText: rec.timeframeText,
      timeframeNormalized: rec.timeframeNormalized,
      dueDate: computeTaskDueDate(rec),
      certaintyCycleInDays: computeTaskCertaintyCycle(priority),
      status: "pending",
      diagnosisItemId: item.id,
      sourceDocumentId: docId,
      sourceQuote: rec.sourceQuote,
      sourceProvider: rec.sourceProvider,
      ...(prior
        ? {
            previouslyCompleted: {
              taskId: prior.id,
              completedAt: prior.completedAt!,
            },
          }
        : {}),
    };
    item.tasks.push(task);
    delta.newTasks.push(task);
    markChanged(item.id, "tasks");
  }

  function updateTask(
    task: FollowUpTask,
    rec: ExtractedRecommendation,
    itemId: string,
  ) {
    if (isUserEdited(task, "status")) return; // don't disturb user-managed tasks
    const due = computeTaskDueDate(rec);
    if (due && due !== task.dueDate) {
      task.dueDate = due;
      task.timeframeNormalized =
        rec.timeframeNormalized ?? task.timeframeNormalized;
      markChanged(itemId, "tasks");
    }
  }

  // ── Goals → primary item ────────────────────────────────────────────────────
  if (extraction.goals.length && primaryItemId) {
    const item = itemById.get(primaryItemId)!;
    for (const g of extraction.goals) {
      const existing = item.goals.find((x) => x.goal === g.goal);
      if (existing) continue; // idempotent
      const goal: CarePlanGoal = { ...g, id: idgen() };
      item.goals.push(goal);
      markChanged(item.id, "goals");
    }
  }

  // ── Body parts → primary item (union-merge) ─────────────────────────────────
  if (extraction.bodyParts.length && primaryItemId) {
    const item = itemById.get(primaryItemId)!;
    const before = JSON.stringify(item.bodyParts);
    item.bodyParts = unionMergeBodyParts(
      item.bodyParts,
      extraction.bodyParts,
      docId,
    );
    if (JSON.stringify(item.bodyParts) !== before)
      markChanged(item.id, "bodyParts");
  }

  // ── Monitoring signals union + cycle recompute on touched items ─────────────
  for (const id of touchedItemIds) {
    const item = itemById.get(id);
    if (!item) continue;
    for (const s of extraction.monitoringSignals) {
      if (!item.monitoringSignals.includes(s)) {
        item.monitoringSignals.push(s);
        markChanged(item.id, "monitoringSignals");
      }
    }
    item.certaintyCycleInDays = certaintyCycleInDays(item);
  }

  // ── Finalise delta.updatedItems (exclude freshly-created items) ─────────────
  const newIds = new Set(delta.newItems.map((i) => i.id));
  for (const [itemId, fields] of changed) {
    if (newIds.has(itemId)) continue;
    delta.updatedItems.push({ id: itemId, changedFields: [...fields] });
  }

  plan.updatedAt = now;
  return { newPlan: plan, delta };
}
