<script lang="ts">
  import { t } from "$lib/i18n";
  import { profile } from "$lib/profiles";
  import { byUser } from "$lib/documents";
  import {
    getActivePlan,
    getHistoricalItems,
    daysSinceLastDocument,
    CAREPLAN_RECENCY_NUDGE_DAYS,
  } from "$lib/careplan/store";
  import { computeItemCertainty } from "$lib/careplan/certainty";
  import { buildJourneyEvents, calculateMilestones, progressByPeriods } from "$lib/careplan/journey";
  import type { CarePlanItem } from "$lib/careplan/types";
  import type { Milestone } from "$lib/careplan/journey";
  import CarePlanItemCard from "$components/careplan/CarePlanItemCard.svelte";
  import CarePlanPotential from "$components/careplan/CarePlanPotential.svelte";
  import CareJourneyTimeline from "$components/careplan/CareJourneyTimeline.svelte";
  import Body from "$components/anatomy/Body.svelte";
  import { buildHighlightRegions } from "$lib/careplan/highlights";
  import { goto } from "$app/navigation";
  import ui from "$lib/ui";

  interface Props {
    data: { region: string | null };
  }
  let { data }: Props = $props();

  let profileId = $derived($profile.id);
  let docsStore = $derived(byUser(profileId));

  let items = $state<CarePlanItem[]>([]);
  let historical = $state<CarePlanItem[]>([]);
  let historyOpen = $state(false);
  let loaded = $state(false);

  async function reload() {
    const plan = await getActivePlan(profileId);
    items = plan.items;
    loaded = true;
  }

  $effect(() => {
    if (profileId) reload();
  });

  // Region filter from the 3D click-through (?region=).
  let visibleItems = $derived(
    data.region
      ? items.filter((i) => i.bodyParts.some((b) => b.identification === data.region || b.part === data.region))
      : items,
  );

  // Sort active items by certainty × recency.
  let sortedItems = $derived(
    [...visibleItems].sort((a, b) => {
      const ca = computeItemCertainty(a);
      const cb = computeItemCertainty(b);
      const ra = new Date(a.lastSeenInDocumentDate).getTime();
      const rb = new Date(b.lastSeenInDocumentDate).getTime();
      return cb * rb - ca * ra;
    }),
  );

  let periods = $derived(progressByPeriods({ items }));

  let milestoneConfig = $derived(
    calculateMilestones(
      buildJourneyEvents({ items }, ($docsStore as any[]) ?? []).map(
        (e): Milestone => ({
          title: e.label,
          startDate: e.date,
          endDate: e.date,
          achieved: e.type === "task_done" || e.type === "import" || e.type === "session",
        }),
      ),
    ),
  );

  let daysSince = $derived(loaded ? daysSinceLastDocument({ items }) : null);
  let showPotential = $derived(loaded && items.length === 0);
  let showNudge = $derived(daysSince !== null && daysSince >= CAREPLAN_RECENCY_NUDGE_DAYS);

  async function openHistory() {
    historyOpen = true;
    historical = await getHistoricalItems(profileId);
  }

  function focusBodyPart(identification: string) {
    ui.emit("viewer:anatomy", { focus: identification });
  }

  // 3D model painting (build row 13). Recomputed only when items change.
  let highlightRegions = $derived(buildHighlightRegions(items));

  function handleRegionClick(e: CustomEvent<{ mesh: string }>) {
    goto(`/med/p/${profileId}/care-plan?region=${encodeURIComponent(e.detail.mesh)}`);
  }
</script>

<div class="page care-plan-page">
  <div class="heading">
    <h1 class="h1">{$t("careplan.title")}</h1>
  </div>

  {#if showPotential}
    <CarePlanPotential daysSinceLastDocument={null} />
  {:else}
    {#if showNudge}
      <CarePlanPotential daysSinceLastDocument={daysSince} />
    {/if}

    <section class="anatomy-hero">
      <Body
        activeTools={["selection"]}
        carePlanRegions={highlightRegions}
        on:carePlanRegionClick={handleRegionClick}
      />
    </section>

    <section class="progress-periods">
      {#each periods as p}
        <div class="capsule" title={p.period}>
          <span class="capsule-label">{p.period}</span>
          <div class="capsule-bar">
            <span class="achieved" style="flex: {p.achieved}"></span>
            <span class="awaiting" style="flex: {p.awaiting}"></span>
          </div>
          <span class="capsule-count">{p.achieved}/{p.achieved + p.awaiting}</span>
        </div>
      {/each}
    </section>

    <section class="journey">
      <h2 class="h3">{$t("careplan.care-journey")}</h2>
      <CareJourneyTimeline config={milestoneConfig} />
    </section>

    <section class="active-items">
      <h2 class="h3">{$t("careplan.active-items")}</h2>
      <div class="item-grid">
        {#each sortedItems as item (item.id)}
          <CarePlanItemCard {item} {profileId} onBodyPartFocus={focusBodyPart} onChanged={reload} />
        {/each}
      </div>
    </section>

    <section class="history">
      {#if !historyOpen}
        <button class="button -text" onclick={openHistory}>{$t("careplan.history")}</button>
      {:else}
        <h2 class="h3">{$t("careplan.history")}</h2>
        <div class="item-grid">
          {#each historical as item (item.id)}
            <CarePlanItemCard {item} {profileId} onChanged={reload} />
          {/each}
        </div>
      {/if}
    </section>
  {/if}
</div>

<style>
  .care-plan-page {
    display: flex;
    flex-direction: column;
    gap: var(--ui-pad-large);
  }
  .anatomy-hero {
    position: relative;
    height: 24rem;
    background: var(--color-surface);
    border-radius: var(--ui-radius-large);
    overflow: hidden;
  }
  .progress-periods {
    display: flex;
    gap: var(--ui-pad-medium);
    flex-wrap: wrap;
  }
  .capsule {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 6rem;
    flex: 1;
  }
  .capsule-label {
    font-size: 0.75rem;
    text-transform: capitalize;
    color: var(--color-text-secondary);
  }
  .capsule-bar {
    display: flex;
    height: 0.5rem;
    border-radius: var(--ui-radius-small);
    overflow: hidden;
    background: var(--color-border);
  }
  .capsule-bar .achieved {
    background: var(--color-positive);
  }
  .capsule-bar .awaiting {
    background: color-mix(in srgb, var(--color-primary) 40%, transparent);
  }
  .capsule-count {
    font-size: 0.75rem;
    color: var(--color-text-secondary);
  }
  .item-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
    gap: var(--ui-pad-medium);
  }
</style>
