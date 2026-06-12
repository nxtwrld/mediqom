<script lang="ts">
  import { t } from "$lib/i18n";
  import { locale } from "svelte-i18n";
  import AskButton from "$components/chat/AskButton.svelte";
  import {
    computeItemCertainty,
    certaintyBucket,
  } from "$lib/careplan/certainty";
  import { applyUserTaskAction } from "$lib/careplan/store";
  import { resolvePlainLanguage } from "$lib/careplan/plain-language";
  import type { CarePlanItem, FollowUpTask } from "$lib/careplan/types";

  interface Props {
    item: CarePlanItem;
    profileId: string;
    onBodyPartFocus?: (identification: string) => void;
    onChanged?: () => void;
  }

  let { item, profileId, onBodyPartFocus, onChanged }: Props = $props();

  let certainty = $derived(computeItemCertainty(item));
  let bucket = $derived(certaintyBucket(certainty));

  let showProvenance = $state(false);
  let plainMode = $state(false);
  let plainText = $state<string | null>(null);
  let plainLoading = $state(false);

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

  function toggleProvenance() {
    showProvenance = !showProvenance;
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

  async function snooze(task: FollowUpTask) {
    const until = new Date(Date.now() + 14 * 86_400_000).toISOString();
    await applyUserTaskAction(profileId, item.id, task.id, {
      kind: "snooze",
      until,
      reason: "other",
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
        onclick={toggleProvenance}
        aria-expanded={showProvenance}
        title={$t("careplan.why-here")}
      >
        <svg width="16" height="16"><use href="/icons.svg#report"></use></svg>
      </button>
    </div>
  </header>

  {#if showProvenance}
    <div class="provenance-reveal">
      <!-- Minimal inline fallback (Phase 4 ProvenanceReveal panel replaces this). -->
      <p>
        {$t("careplan.provenance.document", {
          values: {
            title: item.confirmingDocuments[0] ?? "",
            date: item.lastSeenInDocumentDate,
          },
        })}
      </p>
    </div>
  {/if}

  {#if sortedTasks.length}
    <ul class="task-list">
      {#each sortedTasks as task (task.id)}
        <li class="task-row" class:-snoozed={task.status === "snoozed"}>
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
              class="button -small -secondary"
              onclick={() => markDone(task)}>{$t("careplan.task.done")}</button
            >
            <button class="button -small" onclick={() => snooze(task)}
              >{$t("careplan.task.snooze")}</button
            >
          </div>
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
  .provenance-reveal {
    margin-top: var(--ui-pad-small);
    padding: var(--ui-pad-small);
    font-size: 0.85rem;
    color: var(--color-text-secondary);
    background: color-mix(in srgb, var(--color-border) 40%, transparent);
    border-radius: var(--ui-radius-small);
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
