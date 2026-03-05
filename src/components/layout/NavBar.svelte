<script lang="ts">
    import { profile } from '$lib/profiles';
    import { page } from '$app/stores';
    import user, { type User } from '$lib/user';
    import ui, { state as uiState, Overlay } from '$lib/ui';
    import { isOpen as chatIsOpen } from '$lib/chat/store';
    import ProfileImage from '$components/profile/ProfileImage.svelte';
    import { t } from '$lib/i18n';

    // ── Other UI state ──────────────────────────────────────────────────────
    let toolsPopupOpen = $state(false);

    // ── Helpers ─────────────────────────────────────────────────────────────
    function isFullUser(u: unknown): u is User {
        return !!u && typeof (u as User).subscription === 'string';
    }

    function isActive(path: string): boolean {
        if ($uiState.overlay !== Overlay.none) return false;
        return $page.url.pathname.startsWith(path);
    }

    // ── Action handlers ─────────────────────────────────────────────────────
    function handleChatToggle() { ui.emit('chat:toggle'); }

    function handleImport(e: MouseEvent) {
        e.stopPropagation();
        ui.emit('overlay.import', true);
    }

    function handleToolsClick(e: MouseEvent) {
        e.stopPropagation();
        toolsPopupOpen = !toolsPopupOpen;
    }

    function handleOpenAnatomy(e: MouseEvent) {
        e.stopPropagation();
        ui.emit('viewer:anatomy', true);
        toolsPopupOpen = false;
    }

    function handleOpenTimeline(e: MouseEvent) {
        e.stopPropagation();
        ui.emit('viewer:timeline', null);
        toolsPopupOpen = false;
    }

    function handleWindowClick() { toolsPopupOpen = false; }
</script>

<!-- DESKTOP: full-width top bar — hidden on mobile -->
<header class="navbar-desktop">
    <nav class="toolbar" aria-label="Main navigation">
        {#if $user && isFullUser($user) && $user.subscription !== 'individual'}
            <a href="/med/p/" class:-active={$page.url.pathname === '/med/p/'}>
                {$t('app.nav.profiles')}
            </a>
        {/if}
        {#if $profile?.id}
            <a class="profile-avatar-link" href="/med/p/{$profile.id}" aria-label={$profile.fullName}>
                <ProfileImage profile={$profile} size={2.5} />
            </a>
            <a href="/med/p/{$profile.id}" aria-label={$profile.fullName} class="profile-name">{$profile.fullName}</a>

            <a
                href="/med/p/{$profile.id}/documents"
                class:-active={isActive(`/med/p/${$profile.id}/documents`)}
            >
                {$t('app.nav.documents')}
            </a>
        {:else}
            <div class="profile-spacer"></div>
        {/if}
            <div class={toolsPopupOpen ? 'tools-wrapper -open' : 'tools-wrapper'}>
                <button onclick={handleToolsClick} aria-label={$t('app.nav.anatomy-model')}>
                    <svg aria-hidden="true"><use href="/icons.svg#medical-tools"></use></svg>
                </button>
                <div class="tools-popup">
                    <button onclick={handleOpenAnatomy}>
                        <svg aria-hidden="true"><use href="/icons.svg#anatomy"></use></svg>
                        {$t('viewer.panels.anatomy')}
                    </button>
                    <button onclick={handleOpenTimeline}>
                        <svg aria-hidden="true"><use href="/icons.svg#chart-line"></use></svg>
                        {$t('viewer.panels.timeline')}
                    </button>
                </div>
            </div>

        <button class:-active={$chatIsOpen} onclick={handleChatToggle} aria-label="AI Chat">
            <svg aria-hidden="true"><use href="/icons.svg#ai-chat"></use></svg>
        </button>
        <button onclick={handleImport} aria-label="Import">
            <svg aria-hidden="true"><use href="/icons.svg#plus"></use></svg>
        </button>
    </nav>
</header>

<svelte:window onclick={handleWindowClick} />

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
        padding: 0.25rem;
        flex-shrink: 0;
        flex: 0;
    }

    /* ── Desktop profile name ────────────────────────────────── */
    .profile-name {
        display: flex;
        align-items: center;
        padding: 0 0.75rem;
        font-size: 0.875rem;
        color: var(--color-black);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex: 3;
    }
    .profile-spacer {
        flex: 3;
    }

    /* ── Desktop tools dropdown ──────────────────────────────── */
    .tools-wrapper {
        position: relative;
        padding: 0;
    }

    .tools-wrapper > button {
        height: 100%;
        padding: 0 1rem;
        min-width: var(--toolbar-height);
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .tools-popup {
        position: absolute;
        top: calc(100% + 2px);
        right: 0;
        background: var(--color-white);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-8, 0.5rem);
        box-shadow: var(--shadow-modal);
        max-height: 0;
        overflow: hidden;
        transition: max-height 0.25s ease;
        min-width: 10rem;
        white-space: nowrap;
    }

    .tools-wrapper.-open .tools-popup {
        max-height: 20rem;
    }

    .tools-popup button {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        width: 100%;
        padding: 0.65rem 1rem;
        text-align: left;
        background: none;
        border: none;
        cursor: pointer;
        color: var(--color-black);
        font-size: 0.875rem;
    }

    .tools-popup button > svg {
        width: 1.5rem;
        height: 1.5rem;
        flex-shrink: 0;
        fill: currentColor;
    }

    .tools-popup button:hover {
        background: var(--color-gray-300);
    }
</style>
