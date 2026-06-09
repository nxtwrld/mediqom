<script lang="ts">
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';
    import { get } from 'svelte/store';
    import { t } from '$lib/i18n';
    import { apiGet, apiPost } from '$lib/api/client';
    import userStore, { type User } from '$lib/user';
    import { decryptString } from '$lib/encryption/passphrase';
    import { wrapKey } from '$lib/encryption/keys';

    type Status = 'loading' | 'processing' | 'done' | 'error' | 'needs-keys';
    let status: Status = $state('loading');
    let errorMsg = $state('');
    let processedCount = $state(0);

    onMount(async () => {
        const shareToken = get(page).url.searchParams.get('t');
        if (!shareToken) {
            status = 'error';
            errorMsg = $t('share.accept.no-token');
            return;
        }

        // Persist token across redirects (onboarding, key setup, etc.)
        // Include timestamp so the account page can reject stale tokens (10 min TTL)
        sessionStorage.setItem('pending_share_token', JSON.stringify({ token: shareToken, ts: Date.now() }));

        // Check if the user is logged in
        const currentUser = userStore.get() as User | null;
        if (!currentUser || !currentUser.publicKey) {
            // Not authenticated — redirect to auth with this page as next destination
            const next = encodeURIComponent(get(page).url.pathname + get(page).url.search);
            goto(`/auth?next=${next}`);
            return;
        }

        // Check if user has encryption keys set up
        if (!userStore.keyPair?.isReady()) {
            status = 'needs-keys';
            return;
        }

        await processPendingShares(shareToken, currentUser);
    });

    async function processPendingShares(shareToken: string, currentUser: User) {
        status = 'processing';
        errorMsg = '';

        try {
            // Fetch pending shares addressed to the current user
            const pendingShares = await apiGet<Array<{
                id: string;
                pending_encrypted_key: string;
                document_id: string;
                owner_id: string;
            }>>('/v1/share/pending');

            if (!pendingShares || pendingShares.length === 0) {
                // No pending shares — just go to /med
                goto('/med');
                return;
            }

            for (const share of pendingShares) {
                try {
                    // Decrypt the AES key using the share token (which is the share_secret)
                    const rawAesKey = await decryptString(share.pending_encrypted_key, shareToken);

                    // Re-encrypt with recipient's keys (hybrid if KEM available)
                    const encryptedKeyForMe = await wrapKey(
                        currentUser.publicKey,
                        (currentUser as any).kem_public_key ?? null,
                        rawAesKey,
                    );

                    // Accept the share
                    await apiPost('/v1/share/accept', {
                        share_id: share.id,
                        encrypted_key_for_me: encryptedKeyForMe,
                    });

                    processedCount++;
                } catch (e) {
                    console.warn('[ShareAccept] Failed to process share', share.id, e);
                    // Continue processing other shares even if one fails
                }
            }

            status = 'done';
        } catch (e: any) {
            status = 'error';
            errorMsg = e?.message || $t('share.accept.error-generic');
        }
    }

    function goToApp() {
        goto('/med');
    }

    function goToAccountSetup() {
        const currentUser = userStore.get();
        if (currentUser) {
            goto('/med/account');  // Existing user — just needs to unlock keys
        } else {
            goto('/account');     // New user — needs full onboarding
        }
    }
</script>

<div class="share-accept-page">
    {#if status === 'loading'}
        <div class="spinner-wrap" role="status" aria-label={$t('app.auth.setting-up-session')}>
            <div class="spinner"></div>
        </div>

    {:else if status === 'needs-keys'}
        <div class="accept-card">
            <h1 class="h2">{$t('share.accept.setup-keys-title')}</h1>
            <p class="p">{$t('share.accept.setup-keys-description')}</p>
            <button class="button -primary" onclick={goToAccountSetup}>
                {$t('share.accept.setup-keys-button')}
            </button>
        </div>

    {:else if status === 'processing'}
        <div class="spinner-wrap" role="status">
            <div class="spinner"></div>
            <p class="p">{$t('share.accept.processing')}</p>
        </div>

    {:else if status === 'done'}
        <div class="accept-card">
            <h1 class="h2">{$t('share.accept.done-title')}</h1>
            <p class="p">{$t('share.accept.done-description', { values: { count: processedCount } })}</p>
            <button class="button -primary" onclick={goToApp}>
                {$t('share.accept.go-to-app')}
            </button>
        </div>

    {:else if status === 'error'}
        <div class="accept-card">
            <h1 class="h2">{$t('share.accept.error-title')}</h1>
            <p class="p" style="color: var(--color-negative)">{errorMsg}</p>
            <button class="button -primary" onclick={goToApp}>
                {$t('share.accept.go-to-app')}
            </button>
        </div>
    {/if}
</div>

<style>
    .share-accept-page {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        padding: var(--ui-pad-xlarge);
    }

    .accept-card {
        max-width: 28rem;
        width: 100%;
        text-align: center;
        display: flex;
        flex-direction: column;
        gap: var(--ui-pad-medium);
    }

    .spinner-wrap {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--ui-pad-medium);
    }

    .spinner {
        width: 3rem;
        height: 3rem;
        border: 3px solid var(--color-border);
        border-top-color: var(--color-interactivity, #3182ce);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }
</style>
