<script lang="ts">
  import { t } from "$lib/i18n";
  import Modal from "$components/ui/Modal.svelte";
  import type { FollowUpTask } from "$lib/careplan/types";

  interface Props {
    taskText: string;
    onConfirm: (result: {
      until: string;
      reason: NonNullable<FollowUpTask["snoozeReason"]>;
      note?: string;
    }) => void;
    onCancel: () => void;
  }

  let { taskText, onConfirm, onCancel }: Props = $props();

  const REASONS: NonNullable<FollowUpTask["snoozeReason"]>[] = [
    "cost",
    "time",
    "unsure",
    "other",
  ];
  const DURATIONS: { key: string; days: number }[] = [
    { key: "1w", days: 7 },
    { key: "2w", days: 14 },
    { key: "1m", days: 30 },
    { key: "3m", days: 90 },
  ];

  let reason = $state<NonNullable<FollowUpTask["snoozeReason"]>>("other");
  let days = $state(14);
  let note = $state("");

  function confirm() {
    const until = new Date(Date.now() + days * 86_400_000).toISOString();
    onConfirm({ until, reason, note: note.trim() || undefined });
  }
</script>

<Modal onclose={onCancel}>
  <div class="snooze-dialog">
    <h3 class="h3">{$t("careplan.snooze.title")}</h3>
    <p class="snooze-task">{taskText}</p>

    <fieldset class="snooze-group">
      <legend>{$t("careplan.snooze.reason-legend")}</legend>
      <div class="option-row">
        {#each REASONS as r}
          <button
            type="button"
            class="option"
            class:-active={reason === r}
            onclick={() => (reason = r)}
          >
            {$t(`careplan.snooze.reason.${r}`)}
          </button>
        {/each}
      </div>
    </fieldset>

    <fieldset class="snooze-group">
      <legend>{$t("careplan.snooze.duration-legend")}</legend>
      <div class="option-row">
        {#each DURATIONS as d}
          <button
            type="button"
            class="option"
            class:-active={days === d.days}
            onclick={() => (days = d.days)}
          >
            {$t(`careplan.snooze.duration.${d.key}`)}
          </button>
        {/each}
      </div>
    </fieldset>

    <label class="snooze-note">
      <span>{$t("careplan.snooze.note-label")}</span>
      <textarea
        bind:value={note}
        rows="2"
        placeholder={$t("careplan.snooze.note-placeholder")}
      ></textarea>
    </label>

    <div class="form-actions">
      <button class="button" onclick={onCancel}
        >{$t("careplan.snooze.cancel")}</button
      >
      <button class="button -primary" onclick={confirm}
        >{$t("careplan.snooze.confirm")}</button
      >
    </div>
  </div>
</Modal>

<style>
  .snooze-dialog {
    display: flex;
    flex-direction: column;
    gap: var(--ui-pad-medium);
    min-width: 18rem;
    max-width: 26rem;
  }
  .snooze-task {
    color: var(--color-text-secondary);
    margin: 0;
  }
  .snooze-group {
    border: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--ui-pad-small);
  }
  .snooze-group legend {
    font-size: 0.8rem;
    color: var(--color-text-secondary);
    padding: 0;
  }
  .option-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .option {
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    border-radius: var(--ui-radius-small);
    padding: 0.35rem 0.75rem;
    cursor: pointer;
    font-size: 0.85rem;
  }
  .option.-active {
    background: var(--color-primary);
    color: var(--color-primary-contrast, #fff);
    border-color: var(--color-primary);
  }
  .snooze-note {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.85rem;
    color: var(--color-text-secondary);
  }
  .snooze-note textarea {
    font-size: 16px;
    padding: var(--ui-pad-small);
    border: 1px solid var(--color-border);
    border-radius: var(--ui-radius-small);
    resize: vertical;
  }
  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--ui-pad-small);
  }
</style>
