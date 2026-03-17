<script lang="ts">
    import { profile, profileDocumentsLoading } from '$lib/profiles';
    import userStore from '$lib/user';
    import { byUser } from '$lib/documents';
    import { type Document } from '$lib/documents/types.d';
    import DocumentTile from './DocumentTile.svelte';
    import Loading from '$components/ui/Loading.svelte';
    import { onMount } from 'svelte';
    import { t } from '$lib/i18n';
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
</script>

{#if $profileDocumentsLoading}
<Loading type="line" />
{:else if documents}
<div class="tiles">
{#each $documents.filter(matchesFilter).sort(sortByDate) as document}
  <DocumentTile document={document as Document} shareCount={shareCountMap.get(document.id) ?? 0} />
{/each}
</div>
{/if}
