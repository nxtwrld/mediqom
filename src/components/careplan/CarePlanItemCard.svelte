<script lang="ts">
  import { t } from "$lib/i18n";
  import { locale } from "svelte-i18n";
  import user from "$lib/user";
  import AskButton from "$components/chat/AskButton.svelte";
  import ProvenanceReveal from "./ProvenanceReveal.svelte";
  import SnoozeDialog from "./SnoozeDialog.svelte";
  import {
    computeItemCertainty,
    certaintyBucket,
  } from "$lib/careplan/certainty";
  import { applyUserTaskAction } from "$lib/careplan/store";
  import { resolvePlainLanguage } from "$lib/careplan/plain-language";
  import type { ProvenanceSource } from "$lib/careplan/provenance";
  import type { CarePlanItem, FollowUpTask } from "$lib/careplan/types";

  interface Props {
    item: CarePlanItem;
    profileId: string;
    /** docId → title, for provenance copy. */
    docTitles?: Map<string, string>;
    onBodyPartFocus?: (identification: string) => void;
    onOpenDocument?: (documentId: string) => void;
    onChanged?: () => void;
  }

  let {
    item,
    profileId,
    docTitles,
    onBodyPartFocus,
    onOpenDocument,
    onChanged,
  }: Props = $props();

  let certainty = $derived(computeItemCertainty(item));
  let bucket = $derived(certaintyBucket(certainty));

  // Optional inline certainty label — user-level reading preference (row 18).
  let showInlineCertainty = $derived(
    Boolean(($user as any)?.settings?.showCertaintyLabelsInline),
  );

  // Provenance reveal: null = closed, "item", or a task id (row 15).
  let openProvenance = $state<string | null>(null);
  // Task currently being snoozed (row 16).
  let snoozingTask = $state<FollowUpTask | null>(null);

  let plainMode = $state(false);
  let plainText = $state<string | null>(null);
  let plainLoading = $state(false);

  function docTitle(id: string | undefined): string {
    return (id && docTitles?.get(id)) || "";
  }

  let itemProvenance = $derived<ProvenanceSource>({
    sourceDocumentId: item.confirmingDocuments[0],
    date: item.lastSeenInDocumentDate,
    documentTitle: docTitle(item.confirmingDocuments[0]),
    contradicting: item.contradictingDocuments.length > 0,
  });

  function taskProvenance(task: FollowUpTask): ProvenanceSource {
    return {
      sourceDocumentId: task.sourceDocumentId,
      sourceQuote: task.sourceQuote,
      sourceProvider: task.sourceProvider,
      sourceMessageId: task.sourceMessageId,
      date: task.sourceDocumentDate,
      documentTitle: docTitle(task.sourceDocumentId),
      contradicting: item.contradictingDocuments.length > 0,
    };
  }

  const TYPE_BADGE: Record<string, string> = {
    chronic: "-chronic",
    monitoring: "-monitoring",
    acute: "-acute",
    exploratory: "-exploratory",
    wellness: "-wellness",
  };

  let sortedTasks = $derived(
    [...item.tasks]
      .filter((tk) => tk.status === "pending" || tk.status === "snoozed")
      .sort((a, b) => priorityRank(a) - priorityRank(b)),
  );

  const PRIORITY_ORDER: Record<string, number> = {
    immediate: 0,
    urgent: 1,
    routine: 2,
    as_needed: 3,
  };
  function priorityRank(task: FollowUpTask): number {
    return PRIORITY_ORDER[task.priority] ?? 2;
  }

  let displayDescription = $derived(
    plainMode && plainText ? plainText : item.diagnosisDescription,
  );

  function toggleProvenance(key: string) {
    openProvenance = openProvenance === key ? null : key;
  }

  async function togglePlain() {
    if (plainMode) {
      plainMode = false;
      return;
    }
    plainMode = true;
    if (plainText || plainLoading) return;
    plainLoading = true;
    try {
      const res = await resolvePlainLanguage({
        item,
        field: "diagnosisDescription",
        source: item.diagnosisDescription,
        language: ($locale ?? "en").slice(0, 2),
        t: $t as unknown as (k: string) => string,
      });
      plainText = res.text;
    } finally {
      plainLoading = false;
    }
  }

  async function markDone(task: FollowUpTask) {
    await applyUserTaskAction(profileId, item.id, task.id, { kind: "done" });
    onChanged?.();
  }

  function openSnooze(task: FollowUpTask) {
    snoozingTask = task;
  }

  async function confirmSnooze(result: {
    until: string;
    reason: NonNullable<FollowUpTask["snoozeReason"]>;
    note?: string;
  }) {
    const task = snoozingTask;
    snoozingTask = null;
    if (!task) return;
    await applyUserTaskAction(profileId, item.id, task.id, {
      kind: "snooze",
      until: result.until,
      reason: result.reason,
      note: result.note,
    });
    onChanged?.();
  }

  function focusBodyPart() {
    const first = item.bodyParts[0];
    if (first) onBodyPartFocus?.(first.part || first.identification);
  }
</script>

<article class="careplan-item" style="opacity: {bucket.opacity}">
  <header class="item-head">
    <div class="item-title-row">
      <h3 class="item-title">
        {displayDescription}
        <span class="sr-only">— {$t(bucket.labelKey)}</span>
        {#if showInlineCertainty}
          <span class="certainty-inline">{$t(bucket.labelKey)}</span>
        {/if}
      </h3>
      <span class="type-badge {TYPE_BADGE[item.conditionType] ?? ''}">
        {item.conditionType}
      </span>
    </div>
    <div class="item-actions">
      {#if item.bodyParts.length}
        <button
          class="icon-btn"
          onclick={focusBodyPart}
          aria-label={$t("anatomy.focus")}
        >
          <svg width="16" height="16"><use href="/icons.svg#anatomy"></use></svg
          >
        </button>
      {/if}
      <button
        class="icon-btn"
        onclick={togglePlain}
        aria-pressed={plainMode}
        title={$t("careplan.explain-plain")}
      >
        <svg width="16" height="16"><use href="/icons.svg#message"></use></svg>
      </button>
      <button
        class="icon-btn"
        onclick={() => toggleProvenance("item")}
        aria-expanded={openProvenance === "item"}
        title={$t("careplan.why-here")}
      >
        <svg width="16" height="16"><use href="/icons.svg#report"></use></svg>
      </button>
    </div>
  </header>

  {#if openProvenance === "item"}
    <ProvenanceReveal source={itemProvenance} {onOpenDocument} />
  {/if}

  {#if sortedTasks.length}
    <ul class="task-list">
      {#each sortedTasks as task (task.id)}
        <li class="task-row" class:-snoozed={task.status === "snoozed"}>
          <div class="task-line">
            <div class="task-text">
              <span>{task.text}</span>
              {#if task.previouslyCompleted}
                <span class="task-hint">
                  {$t("careplan.task.previously-completed", {
                    values: {
                      date: task.previouslyCompleted.completedAt.slice(0, 10),
                    },
                  })}
                </span>
              {/if}
            </div>
            <div class="task-actions">
              <button
                class="icon-btn"
                onclick={() => toggleProvenance(task.id)}
                aria-expanded={openProvenance === task.id}
                title={$t("careplan.why-here")}
              >
                <svg width="14" height="14"><use href="/icons.svg#report"></use></svg>
              </button>
              <button
                class="button -small -secondary"
                onclick={() => markDone(task)}>{$t("careplan.task.done")}</button
              >
              <button class="button -small" onclick={() => openSnooze(task)}
                >{$t("careplan.task.snooze")}</button
              >
            </div>
          </div>
          {#if openProvenance === task.id}
            <ProvenanceReveal source={taskProvenance(task)} {onOpenDocument} />
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  <footer class="item-foot">
    <AskButton
      type="carePlanItem"
      label={item.diagnosisDescription}
      data={{
        id: item.id,
        description: item.diagnosisDescription,
        status: item.status,
        conditionType: item.conditionType,
      }}
    />
  </footer>
</article>

{#if snoozingTask}
  <SnoozeDialog
    taskText={snoozingTask.text}
    onConfirm={confirmSnooze}
    onCancel={() => (snoozingTask = null)}
  />
{/if}

<style>
  .careplan-item {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--ui-radius-medium);
    padding: var(--ui-pad-medium);
    transition: opacity 0.2s ease;
  }
  .careplan-item:hover {
    opacity: 1 !important;
  }
  .item-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--ui-pad-small);
  }
  .item-title-row {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .item-title {
    margin: 0;
    font-size: 1rem;
    color: var(--color-text-primary);
  }
  .type-badge {
    align-self: flex-start;
    font-size: 0.7rem;
    text-transform: capitalize;
    padding: 0.1rem 0.5rem;
    border-radius: var(--ui-radius-small);
    background: var(--color-border);
    color: var(--color-text-secondary);
  }
  .type-badge.-chronic {
    background: color-mix(in srgb, var(--color-primary) 18%, transparent);
  }
  .type-badge.-monitoring {
    background: color-mix(in srgb, var(--color-warning) 22%, transparent);
  }
  .type-badge.-acute {
    background: color-mix(in srgb, var(--color-positive) 20%, transparent);
  }
  .item-actions {
    display: flex;
    gap: 0.25rem;
  }
  .icon-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.25rem;
    border-radius: var(--ui-radius-small);
    fill: var(--color-text-secondary);
  }
  .icon-btn:hover {
    background: var(--color-border);
  }
  .certainty-inline {
    font-size: 0.75rem;
    font-weight: 400;
    color: var(--color-text-secondary);
    margin-left: 0.4rem;
  }
  .task-list {
    list-style: none;
    padding: 0;
    margin: var(--ui-pad-small) 0 0;
    display: flex;
    flex-direction: column;
    gap: var(--ui-pad-small);
  }
  .task-row {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .task-line {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--ui-pad-small);
  }
  .task-row.-snoozed {
    opacity: 0.6;
  }
  .task-text {
    display: flex;
    flex-direction: column;
  }
  .task-hint {
    font-size: 0.75rem;
    color: var(--color-text-secondary);
  }
  .task-actions {
    display: flex;
    gap: 0.25rem;
    flex-shrink: 0;
  }
  .item-foot {
    margin-top: var(--ui-pad-small);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
