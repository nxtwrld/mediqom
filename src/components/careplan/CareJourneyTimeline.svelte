<script lang="ts">
  import { tooltip } from "$lib/tooltips";
  import { goto } from "$app/navigation";
  import type {
    MilestoneConfig,
    MilestonePosition,
    JourneyEvent,
    JourneyEventType,
  } from "$lib/careplan/journey";

  interface Props {
    config: MilestoneConfig;
    /** Distinct-icon event markers on the same date axis (build row 17). */
    events?: JourneyEvent[];
  }

  let { config, events = [] }: Props = $props();

  let minStartDate = $derived(config.minStartDate);
  let maxEndDate = $derived(config.maxEndDate);
  let milestonePositions = $derived(config.milestonePositions);
  let currentDatePosition = $derived(config.currentDatePosition);

  // Position each event by its date within the timeline's range.
  let positionedEvents = $derived.by(() => {
    const min = new Date(config.minStartDate).getTime();
    const span = Math.max(1, new Date(config.maxEndDate).getTime() - min);
    return events.map((e) => ({
      ...e,
      left: Math.min(100, Math.max(0, ((new Date(e.date).getTime() - min) / span) * 100)),
    }));
  });

  // Per-type marker class — glyphs are CSS-drawn except session (mic sprite).
  const EVENT_CLASS: Record<JourneyEventType, string> = {
    import: "-import",
    session: "-session",
    task_done: "-done",
    task_upcoming: "-upcoming",
    task_snoozed: "-snoozed",
  };

  function clickMilestone(m: MilestonePosition) {
    if (m.link) goto(m.link);
  }

  function groupProgress(group: MilestonePosition[]): number {
    return group.reduce((a, b) => a + b.progress, 0) / group.length;
  }
</script>

{#if positionedEvents.length > 0}
  <div class="journey-events">
    {#each positionedEvents as evt}
      <span
        class="journey-marker {EVENT_CLASS[evt.type]}"
        style="left: {evt.left}%"
        use:tooltip={{ text: evt.label }}
      >
        {#if evt.type === "session"}
          <svg viewBox="0 0 24 24"><use href="/icons.svg#mic"></use></svg>
        {/if}
      </span>
    {/each}
  </div>
{/if}

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
  .journey-events {
    position: relative;
    height: 1.5rem;
    margin-right: 2.5em;
  }
  .journey-marker {
    position: absolute;
    top: 50%;
    width: 0.9rem;
    height: 0.9rem;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  /* import: filled blue dot ● */
  .journey-marker.-import {
    background: var(--color-primary);
  }
  /* session: mic glyph (amber) 🎙️ */
  .journey-marker.-session {
    background: var(--color-warning);
  }
  .journey-marker.-session svg {
    width: 0.6rem;
    height: 0.6rem;
    fill: var(--color-primary-contrast, #fff);
  }
  /* task done: green check ✓ */
  .journey-marker.-done {
    background: var(--color-positive);
  }
  .journey-marker.-done::after {
    content: "";
    width: 0.28rem;
    height: 0.48rem;
    border: solid var(--color-positive-text, #fff);
    border-width: 0 2px 2px 0;
    transform: rotate(45deg) translateY(-1px);
  }
  /* upcoming: outlined certainty-faded ◎ */
  .journey-marker.-upcoming {
    background: transparent;
    border: 2px solid var(--color-primary);
    opacity: 0.6;
  }
  /* snoozed: grey outline ○ */
  .journey-marker.-snoozed {
    background: transparent;
    border: 2px solid var(--color-border);
  }
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
