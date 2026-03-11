<script lang="ts">
    import { onMount } from 'svelte';
    import { createEventDispatcher } from "svelte";
    import Input from '$components/forms/Input.svelte';
    import { t } from '$lib/i18n';
    import { date } from '$lib/datetime';
    import { apiGet, apiPost } from '$lib/api/client';
    import { decrypt } from '$lib/user';
    import { encrypt as rsaEncrypt, pemToKey } from '$lib/encryption/rsa';
    import { encryptString } from '$lib/encryption/passphrase';
    import type { RecipientInfo } from '$lib/share/types.d';
    import { decryptDocumentsNoStore } from '$lib/documents/index';

    const dispatch = createEventDispatcher();

    interface Props {
        items?: any[];
    }

    let { items = [] }: Props = $props();

    type Step = 0 | 1;
    let step: Step = $state(0);

    let email: string = $state('');
    let processing = $state(false);
    let done = $state(false);
    let errorMsg: string = $state('');
    let sharedEmail: string = $state('');
    let recipientExists: boolean = $state(false);
    let inviteWarning: string = $state('');

    // All documents available for this profile
    let availableDocuments: any[] = $state([]);
    let loadingDocs = $state(false);

    // IDs of documents selected for sharing — pre-seeded from items prop
    let selectedIds = $state<Set<string>>(new Set(items.map((i) => i.id).filter(Boolean)));

    // Map of id → full item (from prop) for docs already loaded
    const preloaded = new Map(items.map((i) => [i.id, i]));

    const ownerId: string | undefined = items[0]?.user_id;

    onMount(async () => {
        if (!ownerId) return;
        loadingDocs = true;
        try {
            const docs = await apiGet<any[]>(
                `/v1/med/profiles/${ownerId}/documents?types=document`
            );
            if (!docs?.length) {
                availableDocuments = items;
                return;
            }
            // Separate preloaded (already decrypted) from those needing decryption
            const toDecrypt = docs.filter((d) => !preloaded.has(d.id));
            const decrypted = toDecrypt.length
                ? await decryptDocumentsNoStore(toDecrypt as any)
                : [];
            const decryptedMap = new Map(decrypted.map((d) => [d.id, d]));

            availableDocuments = docs.map(
                (d) => preloaded.get(d.id) ?? decryptedMap.get(d.id) ?? d
            );
        } catch {
            // Fall back to just the passed-in items
            availableDocuments = items;
        } finally {
            loadingDocs = false;
        }
    });

    function toggleDoc(id: string) {
        const next = new Set(selectedIds);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        selectedIds = next;
    }

    function abort() {
        dispatch('abort');
    }

    async function handleShare() {
        if (!email.trim() || selectedIds.size === 0) return;

        processing = true;
        errorMsg = '';
        step = 1;

        // Build the list of items to share from availableDocuments filtered by selectedIds
        const toShare = availableDocuments.filter((d) => selectedIds.has(d.id));

        try {
            // 1. Lookup recipient
            const recipient = await apiGet<RecipientInfo & { auth_id?: string }>(
                `/v1/share/recipient-info?email=${encodeURIComponent(email.trim())}`
            );

            // 2. Generate a share secret for new users
            const shareSecret = recipient.exists
                ? undefined
                : Array.from(crypto.getRandomValues(new Uint8Array(32)))
                    .map((b) => b.toString(16).padStart(2, '0'))
                    .join('');

            // 3. Prepare per-document share entries
            const shares = [];
            for (const item of toShare) {
                const docOwnerId = item.user_id ?? ownerId;
                const docId = item.id;

                if (!docOwnerId || !docId) continue;

                // Fetch the document key (encrypted with our RSA public key)
                let encryptedDocKey: string | null = null;
                try {
                    const doc = await apiGet<{ keys: Array<{ key: string }> }>(
                        `/v1/med/profiles/${docOwnerId}/documents/${docId}`
                    );
                    encryptedDocKey = doc?.keys?.[0]?.key ?? null;
                } catch {
                    console.warn('[Share] Could not fetch key for document', docId);
                    continue;
                }

                if (!encryptedDocKey) continue;

                // Decrypt the AES key with our own RSA private key
                let rawAesKey: string;
                try {
                    rawAesKey = await decrypt(encryptedDocKey);
                } catch {
                    console.warn('[Share] Could not decrypt key for document', docId);
                    continue;
                }

                if (recipient.exists && recipient.publicKey) {
                    const recipientPubKey = await pemToKey(recipient.publicKey, false);
                    const encryptedForRecipient = await rsaEncrypt(recipientPubKey, rawAesKey);
                    shares.push({
                        document_id: docId,
                        owner_id: docOwnerId,
                        encrypted_key_for_recipient: encryptedForRecipient,
                        pending_encrypted_key: null,
                    });
                } else {
                    const pendingKey = await encryptString(rawAesKey, shareSecret!);
                    shares.push({
                        document_id: docId,
                        owner_id: docOwnerId,
                        encrypted_key_for_recipient: null,
                        pending_encrypted_key: pendingKey,
                    });
                }
            }

            if (shares.length === 0) {
                throw new Error($t('share.error-no-keys'));
            }

            const result = await apiPost<{ status: string; recipient_exists: boolean; invite_error?: string }>('/v1/share/create', {
                recipient_email: email.trim(),
                share_secret: shareSecret,
                shares,
            });

            sharedEmail = email.trim();
            recipientExists = result?.recipient_exists ?? false;
            if (result?.invite_error) inviteWarning = result.invite_error;
            done = true;
        } catch (e: any) {
            errorMsg = e?.message || $t('share.error-generic');
            step = 0;
        } finally {
            processing = false;
        }
    }

    function retry() {
        errorMsg = '';
        step = 0;
        done = false;
    }
</script>

{#if step === 0}
    <h3 class="h3">{$t('share.title', { values: { title: items[0]?.metadata?.title || items[0]?.title || '' } })}</h3>

    {#if errorMsg}
        <p class="p -error">{errorMsg}</p>
    {/if}

    <p class="p">{$t('share.description')}</p>

    <div class="share-docs">
        {#if loadingDocs}
            <p class="p -muted">{$t('share.loading')}</p>
        {:else}
            {#each availableDocuments as doc (doc.id)}
                {@const category = doc.metadata?.category || 'other'}
                {@const title = doc.metadata?.title || doc.title || '—'}
                {@const docDate = doc.metadata?.date}
                <label class="share-doc category-{category}" class:-selected={selectedIds.has(doc.id)}>
                    <input
                        type="checkbox"
                        checked={selectedIds.has(doc.id)}
                        onchange={() => toggleDoc(doc.id)}
                    />
                    <div class="share-doc-icon-wrap">
                        <svg class="share-doc-icon" aria-hidden="true">
                            <use href="/icons-o.svg#report-{category}" />
                        </svg>
                    </div>
                    <span class="share-doc-title">{title}</span>
                    {#if docDate}
                        <span class="share-doc-date">{date(docDate, 'DD MMM YYYY')}</span>
                    {/if}
                </label>
            {/each}
        {/if}
    </div>

    <div class="form share-form">
        <Input
            type="email"
            bind:value={email}
            label={$t('share.recipient-email-label')}
            placeholder={$t('share.recipient-email-placeholder')}
            required
            autocomplete="email"
        />
    </div>

    <div class="buttons-row">
        <button class="button" onclick={abort}>{$t('share.cancel')}</button>
        <button
            class="button -primary"
            onclick={handleShare}
            disabled={!email.trim() || selectedIds.size === 0 || processing}
        >
            {$t('share.share-button')}
            {#if selectedIds.size > 0}
                ({selectedIds.size})
            {/if}
        </button>
    </div>

{:else}
    <h3 class="h3">{done ? $t('share.done-title') : $t('share.processing-title')}</h3>

    {#if done}
        <p class="p">
            {#if recipientExists}
                {$t('share.done-description-shared', { values: { email: sharedEmail } })}
            {:else}
                {$t('share.done-description-invited', { values: { email: sharedEmail } })}
            {/if}
        </p>
        {#if inviteWarning}
            <p class="p -warning">{$t('share.invite-warning', { values: { email: sharedEmail } })}</p>
        {/if}
        <div class="buttons-row">
            <button class="button -primary" onclick={abort}>{$t('share.done')}</button>
        </div>
    {:else if errorMsg}
        <p class="p -error">{errorMsg}</p>
        <div class="buttons-row">
            <button class="button" onclick={retry}>{$t('share.retry')}</button>
            <button class="button -primary" onclick={abort}>{$t('share.cancel')}</button>
        </div>
    {:else}
        <div class="share-spinner" aria-label={$t('share.processing-title')} role="status">
            <div class="spinner"></div>
        </div>
    {/if}
{/if}

<style>
    .share-form {
        margin: var(--ui-pad-medium) 0;
    }

    .share-docs {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        margin-bottom: var(--ui-pad-medium);
        max-height: 40vh;
        overflow-y: auto;
    }

    .share-doc {
        display: flex;
        align-items: center;
        gap: var(--ui-pad-small);
        padding: 0.4rem var(--ui-pad-small);
        border-radius: var(--ui-radius-small);
        border: 1px solid var(--color-border);
        cursor: pointer;
        user-select: none;
        transition: background 0.15s;
    }

    .share-doc:hover {
        background: var(--color-surface);
    }

    .share-doc.-selected {
        border-color: var(--color, var(--color-primary, #3182ce));
        background: color-mix(in srgb, var(--color, var(--color-primary, #3182ce)) 10%, transparent);
    }

    .share-doc input[type="checkbox"] {
        flex-shrink: 0;
        width: 1rem;
        height: 1rem;
        accent-color: var(--color, var(--color-primary, #3182ce));
        cursor: pointer;
    }

    .share-doc-icon-wrap {
        flex-shrink: 0;
        width: 1.6rem;
        height: 1.6rem;
        border-radius: 50%;
        background-color: var(--color, #546e7a);
        color: var(--color-text, #fff);
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .share-doc-icon {
        width: 65%;
        height: 65%;
        fill: currentColor;
        display: block;
    }

    .share-doc-title {
        flex: 1;
        font-size: 0.9em;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        min-width: 0;
    }

    .share-doc-date {
        flex-shrink: 0;
        font-size: 0.75em;
        color: var(--color-text-secondary);
        white-space: nowrap;
    }

    .p.-error {
        color: var(--color-negative);
    }

    .p.-warning {
        color: var(--color-warning);
    }

    .p.-muted {
        color: var(--color-text-secondary);
        font-size: 0.9em;
    }

    .share-spinner {
        display: flex;
        justify-content: center;
        align-items: center;
        padding: var(--ui-pad-xlarge) 0;
    }

    .spinner {
        width: 2.5rem;
        height: 2.5rem;
        border: 3px solid var(--color-border);
        border-top-color: var(--color-primary, #3182ce);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }
</style>
