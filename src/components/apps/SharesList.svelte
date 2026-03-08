<script lang="ts">
    import { onMount } from 'svelte';
    import { date } from '$lib/datetime';
    import { confirm } from '$lib/ui';
    import { t, _ } from '$lib/i18n';
    import { get } from 'svelte/store';
    import { apiGet, apiDelete } from '$lib/api/client';
    import type { DocumentShare } from '$lib/share/types.d';

    interface Props {
        profileId?: string;
        documentId?: string;
        hideIfEmpty?: boolean;
    }

    let { profileId = undefined, documentId = undefined, hideIfEmpty = false }: Props = $props();

    let shares: DocumentShare[] = $state([]);
    let loading = $state(true);
    let error: string = $state('');

    onMount(loadShares);

    async function loadShares() {
        loading = true;
        error = '';
        try {
            shares = await apiGet<DocumentShare[]>('/v1/share/my-shares');
        } catch (e: any) {
            error = e?.message || get(_)('share.error-generic');
        } finally {
            loading = false;
        }
    }

    async function revokeShare(share: DocumentShare) {
        const message = get(_)('app.apps.confirm-remove-share', {
            values: { name: share.recipient_email },
        });
        if (await confirm(message)) {
            try {
                await apiDelete(`/v1/share/${share.id}`);
                shares = shares.filter((s) => s.id !== share.id);
            } catch (e: any) {
                error = e?.message || get(_)('share.error-generic');
            }
        }
    }

    function getDocTitle(share: DocumentShare): string {
        return (share.document as any)?.metadata?.title || share.document_id;
    }

    let filtered = $derived(
        shares
            .filter((s) => !profileId || s.owner_id === profileId)
            .filter((s) => !documentId || s.document_id === documentId)
    );

    // Group by recipient email
    type Group = { email: string; shares: DocumentShare[] };
    let grouped: Group[] = $derived(
        filtered.reduce<Group[]>((acc, share) => {
            const existing = acc.find((g) => g.email === share.recipient_email);
            if (existing) {
                existing.shares.push(share);
            } else {
                acc.push({ email: share.recipient_email, shares: [share] });
            }
            return acc;
        }, [])
    );
</script>

{#if !hideIfEmpty || filtered.length > 0}
{#if loading}
    <p class="p">{$t('share.loading')}</p>
{:else if error}
    <p class="p" style="color: var(--color-negative)">{error}</p>
    <button class="button" onclick={loadShares}>{$t('share.retry')}</button>
{:else if grouped.length === 0}
    <p class="p">{$t('share.no-shares')}</p>
{:else}
    {#each grouped as group}
        <div class="share-group">
            <p class="share-recipient">{group.email}</p>
            <ul class="list-items">
                {#each group.shares as share}
                    <li>
                        <span class="share-doc-title">{getDocTitle(share)}</span>
                        <span class="share-meta">
                            {$t('app.apps.shared-on-date', { values: { date: date(share.created_at) } })}
                            {#if share.status === 'pending'}
                                <span class="badge -pending">{$t('share.status-pending')}</span>
                            {:else}
                                <span class="badge -active">{$t('share.status-active')}</span>
                            {/if}
                        </span>
                        <div class="tools">
                            <button
                                class="button -negative -small"
                                onclick={() => revokeShare(share)}
                            >
                                <svg>
                                    <use href="/icons.svg#remove"></use>
                                </svg>
                                {$t('share.revoke')}
                            </button>
                        </div>
                    </li>
                {/each}
            </ul>
        </div>
    {/each}
{/if}
{/if}

<style>
    .share-group {
        margin-bottom: var(--ui-pad-large);
    }

    .share-recipient {
        font-weight: 600;
        margin-bottom: var(--ui-pad-small);
        color: var(--color-text-primary);
    }

    .share-doc-title {
        flex: 1;
    }

    .share-meta {
        display: flex;
        align-items: center;
        gap: var(--ui-pad-small);
        font-size: 0.85em;
        color: var(--color-text-secondary);
    }

    .badge {
        display: inline-block;
        padding: 0.1em 0.5em;
        border-radius: var(--ui-radius-small);
        font-size: 0.8em;
    }

    .badge.-pending {
        background: var(--color-warning, #f6ad55);
        color: #7b4f00;
    }

    .badge.-active {
        background: var(--color-positive, #68d391);
        color: #1a4731;
    }
</style>
