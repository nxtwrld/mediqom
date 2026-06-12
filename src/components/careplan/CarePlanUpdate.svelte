<script lang="ts">
  import { t } from "$lib/i18n";
  import { goto } from "$app/navigation";
  import { getActivePlan, applyUserTaskAction } from "$lib/careplan/store";
  import type { CarePlanDeltaEntry } from "$lib/careplan/import-hook";
  import type { CarePlanItem } from "$lib/careplan/types";

  interface Props {
    profileId: string;
    deltas: CarePlanDeltaEntry[];
    onClose?: () => void;
  }
  let { profileId, deltas, onClose }: Props = $props();

  // Aggregate the per-document deltas into one screen.
  let merged = $derived.by(() => {
    const acc = {
      newItems: [] as CarePlanItem[],
      updatedItems: [] as { id: string; changedFields: string[] }[],
      newTasks: [] as {
        id: string;
        text: string;
        itemId: string;
        dueDate?: string;
      }[],
      resolvedTasks: [] as { id: string; resolvedByDocumentId: string }[],
      conflicts: [] as { itemId: string; kind: string }[],
      progressions: [] as { from: string; to: string }[],
    };
    for (const { delta } of deltas) {
      acc.newItems.push(...delta.newItems);
      acc.updatedItems.push(...delta.updatedItems);
      acc.newTasks.push(
        ...delta.newTasks.map((tk) => ({
          id: tk.id,
          text: tk.text,
          itemId: tk.diagnosisItemId,
          dueDate: tk.dueDate,
        })),
      );
      acc.resolvedTasks.push(...delta.resolvedTasks);
      acc.conflicts.push(...delta.conflicts);
      acc.progressions.push(...delta.progressions);
    }
    return acc;
  });

  let itemsById = $state<Record<string, CarePlanItem>>({});
  $effect(() => {
    if (!profileId) return;
    getActivePlan(profileId).then((plan) => {
      itemsById = Object.fromEntries(plan.items.map((i) => [i.id, i]));
    });
  });

  let headlineParts = $derived(
    [
      merged.newItems.length
        ? $t("careplan.update.headline-new", {
            values: { count: merged.newItems.length },
          })
        : null,
      merged.newTasks.length
        ? $t("careplan.update.headline-task", {
            values: { count: merged.newTasks.length },
          })
        : null,
    ].filter(Boolean),
  );

  function itemName(id: string): string {
    return itemsById[id]?.diagnosisDescription ?? "";
  }

  async function markResolvedDone(taskId: string) {
    const item = Object.values(itemsById).find((i) =>
      i.tasks.some((tk) => tk.id === taskId),
    );
    if (item)
      await applyUserTaskAction(profileId, item.id, taskId, { kind: "done" });
  }

  function viewPlan() {
    onClose?.();
    goto(`/med/p/${profileId}/care-plan`);
  }
</script>

<div class="careplan-update">
  <h2 class="h2 headline">
    {headlineParts.join(" · ") || $t("careplan.no-changes-redirect")}
  </h2>

  {#if merged.newItems.length}
    <section class="delta-group">
      <h3 class="h3">{$t("careplan.update.new-items")}</h3>
      {#each merged.newItems as item (item.id)}
        <div class="delta-card">
          <strong>{item.diagnosisDescription}</strong>
          {#if item.tasks[0]?.sourceQuote}
            <p class="quote">"{item.tasks[0].sourceQuote}"</p>
          {/if}
        </div>
      {/each}
    </section>
  {/if}

  {#if merged.updatedItems.length}
    <section class="delta-group">
      <h3 class="h3">{$t("careplan.update.updated-items")}</h3>
      {#each merged.updatedItems as u (u.id)}
        <div class="delta-card">
          <strong>{itemName(u.id)}</strong>
          <span class="muted">{$t("careplan.update.confirmed-again")}</span>
        </div>
      {/each}
    </section>
  {/if}

  {#if merged.resolvedTasks.length}
    <section class="delta-group">
      <h3 class="h3">{$t("careplan.update.resolved-tasks")}</h3>
      {#each merged.resolvedTasks as r (r.id)}
        <div class="delta-card -action">
          <span>{$t("careplan.update.resolved-tasks")}</span>
          <button
            class="button -small -secondary"
            onclick={() => markResolvedDone(r.id)}
            >{$t("careplan.task.done")}</button
          >
        </div>
      {/each}
    </section>
  {/if}

  {#if merged.newTasks.length}
    <section class="delta-group">
      <h3 class="h3">{$t("careplan.update.new-tasks")}</h3>
      {#each merged.newTasks as task (task.id)}
        <div class="delta-card">
          <span>{task.text}</span>
          {#if task.dueDate}<span class="muted">{task.dueDate}</span>{/if}
        </div>
      {/each}
    </section>
  {/if}

  {#if merged.conflicts.length}
    <section class="delta-group">
      <h3 class="h3">{$t("careplan.update.conflicts")}</h3>
      {#each merged.conflicts as c (c.itemId + c.kind)}
        <div class="delta-card -conflict">{itemName(c.itemId)}</div>
      {/each}
    </section>
  {/if}

  <div class="update-actions">
    <button class="button -primary" onclick={viewPlan}
      >{$t("careplan.view-care-plan")} →</button
    >
  </div>
</div>

<style>
  .careplan-update {
    display: flex;
    flex-direction: column;
    gap: var(--ui-pad-large);
    padding: var(--ui-pad-large);
    max-width: 40rem;
    margin: 0 auto;
  }
  .headline {
    text-align: center;
    color: var(--color-text-primary);
  }
  .delta-group {
    display: flex;
    flex-direction: column;
    gap: var(--ui-pad-small);
  }
  .delta-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--ui-pad-small);
    padding: var(--ui-pad-medium);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--ui-radius-medium);
  }
  .delta-card.-conflict {
    border-color: var(--color-warning);
  }
  .delta-card .quote {
    margin: 0.25rem 0 0;
    font-style: italic;
    color: var(--color-text-secondary);
  }
  .muted {
    color: var(--color-text-secondary);
    font-size: 0.85rem;
  }
  .update-actions {
    display: flex;
    justify-content: center;
  }
</style>
