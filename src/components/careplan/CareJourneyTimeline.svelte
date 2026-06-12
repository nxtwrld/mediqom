<script lang="ts">
  import { tooltip } from "$lib/tooltips";
  import { goto } from "$app/navigation";
  import type {
    MilestoneConfig,
    MilestonePosition,
  } from "$lib/careplan/journey";

  interface Props {
    config: MilestoneConfig;
  }

  let { config }: Props = $props();

  let minStartDate = $derived(config.minStartDate);
  let maxEndDate = $derived(config.maxEndDate);
  let milestonePositions = $derived(config.milestonePositions);
  let currentDatePosition = $derived(config.currentDatePosition);

  function clickMilestone(m: MilestonePosition) {
    if (m.link) goto(m.link);
  }

  function groupProgress(group: MilestonePosition[]): number {
    return group.reduce((a, b) => a + b.progress, 0) / group.length;
  }
</script>

{#if milestonePositions.length > 0}
  <div class="milestones">
    {#if currentDatePosition !== 0}
      <div class="dates start-date">{minStartDate}</div>
    {/if}
    {#if currentDatePosition < 1}
      <div
        class="dates current-date"
        style="left: {currentDatePosition * 100}%"
      >
        Now
      </div>
    {/if}
    <div class="dates end-date">{maxEndDate}</div>

    {#each milestonePositions as group}
      {@const progress = groupProgress(group)}
      {@const startOffsetRatio = group[0].startOffsetRatio}
      {@const lastOffsetRatio = group[group.length - 1].startOffsetRatio}
      <div class="milestone-row">
        <div class="milestone-padding">
          {#each group as sub}
            <button
              class="milestone"
              class:-progress={sub.progress > 0 && sub.progress < 100}
              class:-done={sub.progress === 100}
              class:-waiting={sub.progress === 0}
              onclick={() => clickMilestone(sub)}
              use:tooltip={{ text: sub.title }}
              style="left: {sub.startOffsetRatio *
                100}%; width: {sub.anticipatedDurationRatio *
                100}%; background-image: linear-gradient(to right, var(--cp-done) 0%, var(--cp-done) {sub.progress}%, var(--cp-future) {sub.progress}%, var(--cp-future) 100%)"
            >
              {#if group.length === 1}
                <div class="milestone-title">{sub.title}</div>
              {/if}
            </button>
          {/each}
        </div>
        <div class="milestone-achieved">
          {#if progress === 100}
            <svg class="-done"><use href="/icons.svg#star"></use></svg>
          {:else if progress > 0 || (startOffsetRatio < currentDatePosition && lastOffsetRatio > currentDatePosition)}
            <svg class="-progress"><use href="/icons.svg#time-line"></use></svg>
          {:else if startOffsetRatio > currentDatePosition}
            <svg class="-waiting"><use href="/icons.svg#time-line"></use></svg>
          {/if}
        </div>
      </div>
    {/each}
  </div>
{/if}

<style>
  .milestones {
    position: relative;
    margin-top: var(--ui-pad-medium);
    margin-right: 2.5em;
    padding-top: 1em;
  }
  .dates {
    position: absolute;
    top: 0;
    height: 100%;
    font-size: 0.8em;
    padding: 0 var(--ui-pad-small);
    z-index: 2;
    pointer-events: none;
    color: var(--color-text-secondary);
  }
  .dates.start-date {
    left: 0;
  }
  .dates.current-date {
    font-weight: bold;
    border-left: 1px solid var(--color-border);
    color: var(--color-text-primary);
  }
  .dates.end-date {
    right: 0;
  }
  .milestone-row {
    position: relative;
    height: 2em;
    padding: 0.1rem 0.2rem;
    margin: var(--ui-pad-small) 0;
    color: var(--color-text-primary);
    background-color: var(--color-surface);
    border-radius: var(--ui-radius-small);
  }
  .milestone-padding {
    position: relative;
    height: 100%;
    width: 100%;
    overflow: hidden;
  }
  .milestone {
    position: absolute;
    top: 0.1rem;
    height: 1.5em;
    border-radius: var(--ui-radius-small);
    min-width: 0.5rem;
    border: none;
    cursor: pointer;
    --cp-done: var(--color-positive);
    --cp-future: var(--color-border);
  }
  .milestone.-progress {
    --cp-done: var(--color-warning);
  }
  .milestone-title {
    position: absolute;
    inset: 0;
    padding: 0.2rem 0.5rem;
    display: flex;
    align-items: center;
    font-size: 0.85em;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    pointer-events: none;
  }
  .milestone-achieved {
    position: absolute;
    top: 0;
    right: -2.5em;
    bottom: 0;
    display: flex;
    align-items: center;
  }
  .milestone-achieved svg {
    width: 1.5em;
    height: 1.5em;
    fill: var(--color-text-secondary);
  }
  .milestone-achieved svg.-done {
    fill: var(--color-positive);
  }
  .milestone-achieved svg.-progress {
    fill: var(--color-warning);
  }
</style>
