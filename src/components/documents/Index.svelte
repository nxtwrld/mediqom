<script lang="ts">
    import { profile, profileDocumentsLoading } from '$lib/profiles';
    import userStore from '$lib/user';
    import { byUser } from '$lib/documents';
    import { type Document } from '$lib/documents/types.d';
    import DocumentTile from './DocumentTile.svelte';
    import Loading from '$components/ui/Loading.svelte';
    import { onMount } from 'svelte';
    import { t } from '$lib/i18n';
    import ui from '$lib/ui';
    import { apiGet } from '$lib/api/client';
    import type { DocumentShare } from '$lib/share/types.d';

  interface Props {
    user?: string;
    filterTags?: string[];
  }

  let { user = $profile?.id || $userStore?.id as string, filterTags = [] }: Props = $props();
    let documents = $derived(byUser(user));

    function normalize(s: string): string {
        return s.toLowerCase().replace(/[_\s]+/g, ' ').trim();
    }

    let normalizedFilterTags = $derived(filterTags.map(normalize).filter(Boolean));

    function matchesFilter(doc: any): boolean {
        if (normalizedFilterTags.length === 0) return true;
        const docTags: string[] = doc.metadata?.tags || [];
        return docTags.some((tag: string) => normalizedFilterTags.includes(normalize(tag)));
    }

    let shareCountMap: Map<string, number> = $state(new Map());

    onMount(async () => {
        // Fetch share counts for badge display
        try {
            const myShares = await apiGet<DocumentShare[]>('/v1/share/my-shares');
            const m = new Map<string, number>();
            for (const s of myShares ?? []) {
                if (s.status !== 'revoked') m.set(s.document_id, (m.get(s.document_id) ?? 0) + 1);
            }
            shareCountMap = m;
        } catch { /* non-critical */ }
    });

    function sortByDate(a: any, b: any) {
        if (!a.metadata.date) return 1;
        if (!b.metadata.date) return -1;
        return new Date(b.metadata.date).getTime() - new Date(a.metadata.date).getTime();
    }

    let visibleDocuments = $derived(($documents ?? []).filter(matchesFilter).sort(sortByDate));

    function openImport() {
        ui.emit('overlay.import');
    }
</script>

{#if $profileDocumentsLoading}
<Loading type="line" />
{:else if visibleDocuments.length > 0}
<div class="tiles">
{#each visibleDocuments as document}
  <DocumentTile document={document as Document} shareCount={shareCountMap.get(document.id) ?? 0} />
{/each}
</div>
{:else if ($documents?.length ?? 0) === 0}
<div class="documents-empty">
    <svg class="empty-icon"><use href="/icons-o.svg#report-general" /></svg>
    <h3 class="h3">{$t('app.documents.empty.title')}</h3>
    <p class="empty-subtitle">{$t('app.documents.empty.subtitle')}</p>
    <button class="button -primary -large" onclick={openImport}>
        {$t('app.documents.empty.import-cta')}
    </button>
</div>
{:else}
<p class="documents-no-match">{$t('app.documents.empty.no-match')}</p>
{/if}

<style>
    .documents-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: var(--ui-pad-medium);
        padding: var(--ui-pad-xlarge);
    }

    .documents-empty .empty-icon {
        width: 5rem;
        height: 5rem;
        fill: var(--color-text-secondary);
        opacity: 0.6;
    }

    .empty-subtitle {
        color: var(--color-text-secondary);
        max-width: 28rem;
    }

    .documents-no-match {
        color: var(--color-text-secondary);
        padding: var(--ui-pad-large);
        text-align: center;
    }
</style>
