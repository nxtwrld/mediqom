<script lang="ts">
  import { t } from "$lib/i18n";
  import ui from "$lib/ui";

  interface Props {
    /** Days since the last document, or null when the profile has none. */
    daysSinceLastDocument?: number | null;
    lastUpdateMonth?: string;
  }

  let { daysSinceLastDocument = null, lastUpdateMonth = "" }: Props = $props();

  // First-time: never imported. Time-aware: has docs but none recent.
  let isFirstTime = $derived(daysSinceLastDocument === null);

  function importFirst() {
    ui.emit("overlay.import");
    location.hash = "#overlay-import";
  }
</script>

<div class="careplan-potential" class:-first={isFirstTime}>
  {#if isFirstTime}
    <div class="placeholder-stack" aria-hidden="true">
      <div class="ph-bar ph-condition"></div>
      <div class="ph-bar ph-task"></div>
      <div class="ph-bar ph-task -short"></div>
      <div class="ph-bar ph-goal"></div>
    </div>
    <p class="potential-title">{$t("careplan.potential.first-time-title")}</p>
    <p class="potential-share">{$t("careplan.potential.first-time-share")}</p>
    <button class="button -primary" onclick={importFirst}>
      {$t("careplan.potential.cta")}
    </button>
  {:else}
    <p class="potential-nudge">
      {$t("careplan.potential.time-aware", {
        values: { month: lastUpdateMonth },
      })}
    </p>
    <button class="button -secondary" onclick={importFirst}>
      {$t("careplan.potential.cta")}
    </button>
  {/if}
</div>

<style>
  .careplan-potential {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--ui-pad-medium);
    padding: var(--ui-pad-xlarge) var(--ui-pad-large);
    text-align: center;
  }
  .placeholder-stack {
    width: 100%;
    max-width: 28rem;
    display: flex;
    flex-direction: column;
    gap: var(--ui-pad-small);
  }
  .ph-bar {
    height: 1.25rem;
    border-radius: var(--ui-radius-small);
    background: linear-gradient(
      90deg,
      var(--color-surface) 0%,
      var(--color-border) 50%,
      var(--color-surface) 100%
    );
    background-size: 200% 100%;
    animation: cp-pulse 2.4s ease-in-out infinite;
    opacity: 0.6;
  }
  .ph-condition {
    height: 1.75rem;
    width: 70%;
  }
  .ph-task {
    width: 90%;
  }
  .ph-task.-short {
    width: 60%;
  }
  .ph-goal {
    height: 1.5rem;
    width: 80%;
  }
  @keyframes cp-pulse {
    0%,
    100% {
      background-position: 200% 0;
      opacity: 0.45;
    }
    50% {
      background-position: 0 0;
      opacity: 0.7;
    }
  }
  .potential-title {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--color-text-primary);
    max-width: 28rem;
  }
  .potential-share,
  .potential-nudge {
    color: var(--color-text-secondary);
    max-width: 28rem;
  }
</style>
