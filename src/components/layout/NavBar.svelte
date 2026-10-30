<script lang="ts">
    import { profile } from '$lib/profiles';
    import { page } from '$app/stores';
    import user, { type User } from '$lib/user';
    import ui, { state as uiState } from '$lib/ui';
    import { isOpen as chatIsOpen } from '$lib/chat/store';
    import ProfileImage from '$components/profile/ProfileImage.svelte';
    import { t } from '$lib/i18n';
    import { isFeatureEnabled } from '$lib/config/feature-flags';

    // ── Helpers ─────────────────────────────────────────────────────────────
    function isFullUser(u: unknown): u is User {
        return !!u && typeof (u as User).subscription === 'string';
    }

    function isActive(path: string): boolean {
        return $page.url.pathname.startsWith(path);
    }

    // ── Action handlers ─────────────────────────────────────────────────────
    function handleChatToggle() { ui.emit('chat:toggle'); }

    // Explore opens the viewer in the left panel; the same button closes it
    function handleExploreToggle() {
        if ($uiState.viewer) ui.emit('viewer:close');
        else ui.emit('viewer:anatomy', true);
    }
</script>

<!-- DESKTOP: full-width top bar — hidden on mobile -->
<header class="navbar-desktop">
    <nav class="toolbar" aria-label="Main navigation">
        {#if $user && isFullUser($user) && $user.subscription !== 'individual'}
            <a href="/med/p/" class:-active={$page.url.pathname === '/med/p/'}>
                {$t('app.nav.profiles')}
            </a>
            {#if $profile?.id}
                <span class="crumb-sep" aria-hidden="true">›</span>
            {/if}
        {/if}
        {#if $profile?.id}
            <a class="profile-avatar-link" href="/med/p/{$profile.id}" aria-label={$profile.fullName}>
                <ProfileImage profile={$profile} size={2.5} />
            </a>
            <a href="/med/p/{$profile.id}" aria-label={$profile.fullName} class="profile-name">{$profile.fullName}</a>

            {#if isFeatureEnabled('CARE_PLAN')}
            <a
                href="/med/p/{$profile.id}/care-plan"
                class:-active={isActive(`/med/p/${$profile.id}/care-plan`)}
            >
                {$t('careplan.nav')}
            </a>
            {/if}
            {#if isFeatureEnabled('MEDICATIONS')}
            <a
                href="/med/p/{$profile.id}/medications"
                class:-active={isActive(`/med/p/${$profile.id}/medications`)}
            >
                {$t('medications.title')}
            </a>
            {/if}
            <a
                href="/med/p/{$profile.id}/documents"
                class:-active={isActive(`/med/p/${$profile.id}/documents`)}
            >
                {$t('app.nav.documents')}
            </a>
            <a
                href="/med/p/{$profile.id}/contacts"
                class:-active={isActive(`/med/p/${$profile.id}/contacts`)}
            >
                {$t('contacts.nav')}
            </a>
            <a
                href="/med/p/{$profile.id}/appointments"
                class:-active={isActive(`/med/p/${$profile.id}/appointments`)}
            >
                {$t('appointments.nav')}
            </a>
        {:else}
            <div class="profile-spacer"></div>
        {/if}
            <button
                class:-active={$uiState.viewer}
                onclick={handleExploreToggle}
                aria-label={$t('app.nav.explore')}
                aria-pressed={$uiState.viewer}
            >
                <svg aria-hidden="true"><use href="/icons.svg#medical-tools"></use></svg>
            </button>

        <button class:-active={$chatIsOpen} onclick={handleChatToggle} aria-label="AI Chat">
            <svg aria-hidden="true"><use href="/icons.svg#ai-chat"></use></svg>
        </button>
    </nav>
</header>

<style>
    /* ═══════════════════════════════════════════════════════════
       DESKTOP: full-width top bar
    ═══════════════════════════════════════════════════════════ */
    .navbar-desktop {
        display: none;
    }

    @media (min-width: 769px) {
        .navbar-desktop {
            display: block;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            height: calc(var(--toolbar-height) + var(--safe-area-top, 0px));
            padding-top: var(--safe-area-top, 0px);
            background: var(--color-gray-300);
            border-bottom: 1px solid var(--color-border);
            z-index: 1000;
        }

        .navbar-desktop .toolbar {
            height: var(--toolbar-height);
            width: 100%;
        }
    }

    /* ── Desktop profile avatar link ────────────────────────── */
    .profile-avatar-link {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0.4rem;
        flex-shrink: 0;
        flex: 0;
    }

    /* ── Desktop profile name ────────────────────────────────── */
    .profile-name {
        display: flex;
        align-items: center;
        padding: 0 1.2rem;
        font-size: 1.4rem;
        color: var(--color-black);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex: 3;
    }
    .profile-spacer {
        flex: 3;
    }

    /* ── Breadcrumb separator: PROFILES › current profile ───── */
    .crumb-sep {
        display: flex;
        align-items: center;
        flex: 0;
        color: var(--color-text-secondary);
    }
</style>
