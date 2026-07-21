<script lang="ts">
  import { t } from "$lib/i18n";
  import { goto } from "$app/navigation";
  import {
    getActivePlan,
    daysSinceLastDocument,
    CAREPLAN_RECENCY_NUDGE_DAYS,
  } from "$lib/careplan/store";
  import { computeItemCertainty } from "$lib/careplan/certainty";
  import CarePlanPotential from "./CarePlanPotential.svelte";
  import type { CarePlanItem, FollowUpTask } from "$lib/careplan/types";

  interface Props {
    profileId: string;
  }
  let { profileId }: Props = $props();

  let items = $state<CarePlanItem[]>([]);
  let loaded = $state(false);

  $effect(() => {
    if (!profileId) return;
    getActivePlan(profileId).then((plan) => {
      items = plan.items;
      loaded = true;
    });
  });

  const PRIORITY_ORDER: Record<string, number> = {
    immediate: 0,
    urgent: 1,
    routine: 2,
    as_needed: 3,
  };

  let topTasks = $derived(
    items
      .flatMap((i) =>
        i.tasks
          .filter((tk) => tk.status === "pending")
          .map((tk) => ({ item: i, task: tk })),
      )
      .sort(
        (a, b) =>
          (PRIORITY_ORDER[a.task.priority] ?? 2) -
          (PRIORITY_ORDER[b.task.priority] ?? 2),
      )
      .slice(0, 3),
  );

  let doneThisMonth = $derived(
    items
      .flatMap((i) => i.tasks)
      .filter((tk) => {
        if (tk.status !== "done" || !tk.completedAt) return false;
        return (
          Date.now() - new Date(tk.completedAt).getTime() <= 30 * 86_400_000
        );
      }).length,
  );
  let totalThisMonth = $derived(doneThisMonth + topTasks.length);

  let daysSince = $derived(loaded ? daysSinceLastDocument({ items }) : null);
  let isEmpty = $derived(loaded && items.length === 0);
  let isStale = $derived(
    daysSince !== null && daysSince >= CAREPLAN_RECENCY_NUDGE_DAYS,
  );

  function viewCarePlan() {
    goto(`/med/p/${profileId}/care-plan`);
  }
</script>

{#if isEmpty}
  <CarePlanPotential daysSinceLastDocument={null} />
{:else if loaded}
  <section class="careplan-dash">
    <div class="dash-head">
      <h3 class="h3">{$t("careplan.title")}</h3>
      <button class="button -text" onclick={viewCarePlan}
        >{$t("careplan.view-care-plan")} →</button
      >
    </div>

    {#if isStale}
      <CarePlanPotential daysSinceLastDocument={daysSince} />
    {/if}

    <div class="dash-grid">
      <div class="progress-dial">
        <span class="dial-count"
          >{doneThisMonth}/{Math.max(totalThisMonth, 1)}</span
        >
        <span class="dial-label">{$t("careplan.task-state.completed")}</span>
      </div>
      <ul class="top-tasks">
        {#each topTasks as { task }}
          <li>{task.text}</li>
        {/each}
        {#if topTasks.length === 0}
          <li class="muted">{$t("careplan.no-changes-redirect")}</li>
        {/if}
      </ul>
    </div>
  </section>
{/if}

<style>
  .careplan-dash {
    display: flex;
    flex-direction: column;
    gap: var(--ui-pad-medium);
    padding: var(--ui-pad-medium) 0;
  }
  .dash-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .dash-grid {
    display: flex;
    gap: var(--ui-pad-large);
    align-items: center;
    flex-wrap: wrap;
  }
  .progress-dial {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 6rem;
    height: 6rem;
    border-radius: 50%;
    border: 4px solid var(--color-positive);
    flex-shrink: 0;
  }
  .dial-count {
    font-size: 1.4rem;
    font-weight: 700;
    color: var(--color-text-primary);
  }
  .dial-label {
    font-size: 0.65rem;
    color: var(--color-text-secondary);
    text-align: center;
  }
  .top-tasks {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--ui-pad-small);
    flex: 1;
    min-width: 12rem;
  }
  .top-tasks li {
    padding: var(--ui-pad-small);
    background: var(--color-surface);
    border-radius: var(--ui-radius-small);
  }
  .top-tasks li.muted {
    color: var(--color-text-secondary);
    background: none;
  }
</style>
