<script lang="ts">
  import { t } from "$lib/i18n";
  import ui from "$lib/ui";
  import {
    resolveProvenance,
    type ProvenanceSource,
  } from "$lib/careplan/provenance";

  interface Props {
    source: ProvenanceSource;
    /** Opens the source document; defaults to a documents-route navigation hook. */
    onOpenDocument?: (documentId: string) => void;
  }

  let { source, onOpenDocument }: Props = $props();

  let resolved = $derived(resolveProvenance(source));

  function openLink() {
    if (!resolved.link) return;
    if (resolved.link.kind === "document") {
      onOpenDocument?.(resolved.link.id);
    } else {
      // Chat deep-link to a specific message isn't supported yet — open the sidebar.
      ui.emit("chat:toggle");
    }
  }

  function reviewConflict() {
    // v1: the disagreement is surfaced; the dedicated review flow is out of scope.
    ui.emit("chat:toggle");
  }
</script>

<div class="provenance-reveal" role="note">
  <p class="prov-copy">
    {$t(resolved.copyKey, { values: resolved.values } as any)}
  </p>

  {#if resolved.link}
    <button class="prov-link" onclick={openLink}>
      {resolved.link.kind === "document"
        ? $t("careplan.provenance.open-document")
        : $t("careplan.provenance.open-chat")}
    </button>
  {/if}

  {#if resolved.conflict}
    <button class="prov-conflict" onclick={reviewConflict}>
      {$t("careplan.provenance.conflict")}
    </button>
  {/if}
</div>

<style>
  .provenance-reveal {
    margin-top: var(--ui-pad-small);
    padding: var(--ui-pad-small);
    font-size: 0.85rem;
    color: var(--color-text-secondary);
    background: color-mix(in srgb, var(--color-border) 40%, transparent);
    border-radius: var(--ui-radius-small);
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .prov-copy {
    margin: 0;
  }
  .prov-link,
  .prov-conflict {
    align-self: flex-start;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font-size: 0.8rem;
    text-decoration: underline;
  }
  .prov-link {
    color: var(--color-primary);
  }
  .prov-conflict {
    color: var(--color-warning);
  }
</style>
