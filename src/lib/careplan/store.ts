/**
 * Care Plan singleton document store (Care Plan build row 3).
 *
 * Mirrors the encrypted-singleton pattern of `src/lib/health/signals.ts`:
 * the plan lives in one per-profile encrypted document referenced by
 * `profile.carePlanDocumentId`. Unlike the health document, the Care Plan doc
 * is created lazily — only on the first merge or user-task write — so profiles
 * that never accrue a plan carry no empty document.
 *
 * The active view (`items[]`) and the archived view (`historicalItems[]`) share
 * one encrypted envelope; the lazy win is JSON-parse + render cost, not a second
 * decrypt. Items older than the archive threshold are swept into
 * `historicalItems[]` on save.
 */
import {
  getDocument,
  loadDocument,
  updateDocument,
  addDocument,
} from "$lib/documents";
import { DocumentType, type Document } from "$lib/documents/types.d";
import profiles from "$lib/profiles/profiles";
import { updateProfile } from "$lib/profiles";
import { type Profile } from "$lib/types.d";
import { durationFromFormatted } from "$lib/datetime";
import { normalizeAnatomyId } from "$data/anatomy-aliases";
import { nearestRegion } from "$data/anatomy-regions";
import { buildCarePlanExtractionContext } from "./context";
import type {
  CarePlanDocument,
  CarePlanExtractionContext,
  CarePlanItem,
  FollowUpTask,
} from "./types";

export const CAREPLAN_ARCHIVE_THRESHOLD_DAYS = 1095; // 3 years
export const CAREPLAN_RECENCY_NUDGE_DAYS = 90;

const EMPTY_PLAN = (): CarePlanDocument => ({
  items: [],
  historicalItems: [],
  updatedAt: new Date().toISOString(),
});

function planFromDocument(doc: Document): CarePlanDocument {
  const content = (doc.content ?? {}) as Partial<CarePlanDocument>;
  return {
    items: normalizeAnatomyIds(content.items ?? []),
    historicalItems: content.historicalItems ?? [],
    updatedAt: content.updatedAt ?? doc.created_at ?? new Date().toISOString(),
  };
}

/** Load-time mesh-name durability sweep (CAREPLAN.md §Mesh name durability). */
function normalizeAnatomyIds(items: CarePlanItem[]): CarePlanItem[] {
  for (const item of items) {
    for (const bp of item.bodyParts ?? []) {
      const { id, resolved } = normalizeAnatomyId(bp.identification);
      if (resolved && id !== bp.identification) {
        bp.identification = id;
        bp.part = nearestRegion(id) ?? bp.part;
      }
    }
  }
  return items;
}

/**
 * Load the raw Care Plan document for a profile. Creates it lazily when
 * `createIfMissing` is set and the profile has no `carePlanDocumentId`.
 */
export async function getCarePlanDocument(
  profileId: string,
  opts: { createIfMissing?: boolean } = {},
): Promise<Document | null> {
  const profile = profiles.get(profileId) as Profile;
  if (!profile) return null;

  if (!profile.carePlanDocumentId) {
    if (!opts.createIfMissing) return null;
    const created = await addDocument({
      user_id: profileId,
      type: DocumentType.careplan,
      content: {
        title: "Care Plan",
        tags: ["careplan"],
        items: [],
        historicalItems: [],
        updatedAt: new Date().toISOString(),
      } as any,
    });
    profile.carePlanDocumentId = created.id;
    updateProfile(profile);
    return created;
  }

  try {
    return (await getDocument(profile.carePlanDocumentId)) as Document;
  } catch {
    return await loadDocument(profile.carePlanDocumentId, profileId);
  }
}

/** Active plan only — `items[]` + `updatedAt`. */
export async function getActivePlan(
  profileId: string,
): Promise<{ items: CarePlanItem[]; updatedAt: string }> {
  const doc = await getCarePlanDocument(profileId);
  if (!doc) return { items: [], updatedAt: new Date().toISOString() };
  const plan = planFromDocument(doc);
  return { items: plan.items, updatedAt: plan.updatedAt };
}

/** Full plan including archived items. Used by the merge and resurrection. */
export async function getFullPlan(
  profileId: string,
): Promise<CarePlanDocument> {
  const doc = await getCarePlanDocument(profileId);
  return doc ? planFromDocument(doc) : EMPTY_PLAN();
}

/** Archived items only — lazy-loaded when the History section expands. */
export async function getHistoricalItems(
  profileId: string,
): Promise<CarePlanItem[]> {
  const doc = await getCarePlanDocument(profileId);
  return doc ? planFromDocument(doc).historicalItems : [];
}

/** Move long-resolved/historical items out of the active list. */
export function archiveOldItems(
  plan: CarePlanDocument,
  now: Date = new Date(),
): CarePlanDocument {
  const keep: CarePlanItem[] = [];
  const archive: CarePlanItem[] = [...plan.historicalItems];
  for (const item of plan.items) {
    const archivable =
      item.status === "historical" || item.status === "resolved";
    const age = durationFromFormatted("days", item.lastSeenInDocumentDate, now);
    if (archivable && age > CAREPLAN_ARCHIVE_THRESHOLD_DAYS) {
      archive.push(item);
    } else {
      keep.push(item);
    }
  }
  return { items: keep, historicalItems: archive, updatedAt: plan.updatedAt };
}

/** Persist the plan back to its encrypted singleton document. */
export async function saveCarePlan(
  profileId: string,
  plan: CarePlanDocument,
): Promise<void> {
  const doc = await getCarePlanDocument(profileId, { createIfMissing: true });
  if (!doc) throw new Error(`No Care Plan document for profile ${profileId}`);
  const swept = archiveOldItems({
    ...plan,
    updatedAt: new Date().toISOString(),
  });
  doc.content = {
    ...(doc.content ?? {}),
    title: "Care Plan",
    tags: ["careplan"],
    items: swept.items,
    historicalItems: swept.historicalItems,
    updatedAt: swept.updatedAt,
  } as any;
  await updateDocument(doc);
}

type TaskAction =
  | { kind: "done" }
  | { kind: "ignore" }
  | {
      kind: "snooze";
      until: string;
      reason?: FollowUpTask["snoozeReason"];
      note?: string;
    };

/** Apply an explicit user action to a task, stamping the user-edit timestamp. */
export async function applyUserTaskAction(
  profileId: string,
  itemId: string,
  taskId: string,
  action: TaskAction,
): Promise<void> {
  const plan = await getFullPlan(profileId);
  const item = plan.items.find((i) => i.id === itemId);
  const task = item?.tasks.find((t) => t.id === taskId);
  if (!item || !task) return;
  const nowIso = new Date().toISOString();
  switch (action.kind) {
    case "done":
      task.status = "done";
      task.completedAt = nowIso;
      break;
    case "ignore":
      task.status = "ignored";
      break;
    case "snooze":
      task.status = "snoozed";
      task.snoozedUntil = action.until;
      task.snoozeReason = action.reason ?? "other";
      if (action.note) task.snoozeNote = action.note;
      break;
  }
  task.userEdited = { ...(task.userEdited ?? {}), status: nowIso };
  await saveCarePlan(profileId, plan);
}

export interface NewTaskInput {
  text: string;
  category: FollowUpTask["category"];
  priority: FollowUpTask["priority"];
  timeframeNormalized?: FollowUpTask["timeframeNormalized"];
  dueDate?: string;
}

/** Add a user- or chat-created task (paths 2 & 3). */
export async function addUserTask(
  profileId: string,
  itemId: string,
  input: NewTaskInput,
  provenance: { sourceMessageId?: string } = {},
): Promise<FollowUpTask | null> {
  const plan = await getFullPlan(profileId);
  const item = plan.items.find((i) => i.id === itemId);
  if (!item) return null;
  const nowIso = new Date().toISOString();
  const task: FollowUpTask = {
    id: `cp_user_${nowIso}_${item.tasks.length}`,
    text: input.text,
    category: input.category,
    priority: input.priority,
    sourceDocumentDate: nowIso.slice(0, 10),
    timeframeNormalized: input.timeframeNormalized,
    dueDate: input.dueDate,
    certaintyCycleInDays: 90,
    status: "pending",
    diagnosisItemId: itemId,
    sourceMessageId: provenance.sourceMessageId,
    userEdited: { created: nowIso },
  };
  item.tasks.push(task);
  await saveCarePlan(profileId, plan);
  return task;
}

/**
 * Build the extraction context blob for a profile's active plan (build row 7c,
 * client side). Returns null when the profile has no plan yet. Never throws —
 * import proceeds without annotations on any failure.
 */
export async function buildCarePlanContextForProfile(
  profileId: string,
): Promise<CarePlanExtractionContext | null> {
  try {
    const { items, updatedAt } = await getActivePlan(profileId);
    return buildCarePlanExtractionContext(
      { items, historicalItems: [], updatedAt },
      [],
    );
  } catch {
    return null;
  }
}

/** Days since the most recent confirming document across the plan. */
export function daysSinceLastDocument(
  plan: { items: CarePlanItem[] },
  now: Date = new Date(),
): number | null {
  let latest: string | null = null;
  for (const item of plan.items) {
    if (!latest || new Date(item.lastSeenInDocumentDate) > new Date(latest)) {
      latest = item.lastSeenInDocumentDate;
    }
  }
  return latest ? durationFromFormatted("days", latest, now) : null;
}
