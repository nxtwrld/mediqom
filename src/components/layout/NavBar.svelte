<script lang="ts">
    import { onMount } from 'svelte';
    import { profile, profiles } from '$lib/profiles';
    import { page } from '$app/stores';
    import user, { type User } from '$lib/user';
    import ui, { state as uiState, Overlay } from '$lib/ui';
    import { isOpen as chatIsOpen } from '$lib/chat/store';
    import { goto } from '$app/navigation';
    import ProfileImage from '$components/profile/ProfileImage.svelte';
    import { t } from '$lib/i18n';
    import NavPanelProfiles from '$components/layout/NavPanelProfiles.svelte';
    import Viewer from '$components/layout/Viewer.svelte';
    import Import from '$components/import/Index.svelte';

    // ── Panel view state ─────────────────────────────────────────────────────
    type PanelView = 'profiles' | 'anatomy' | 'import';
    let panelView = $state<PanelView>('profiles');

    const MAX_HEIGHT: Record<PanelView, () => number> = {
        profiles: () => Math.round(Math.min(window.innerHeight * 0.55, 380)),
        anatomy:  () => Math.round(window.innerHeight * 0.82),
        import:   () => Math.round(window.innerHeight * 0.88),
    };

    // ── Panel expand state ──────────────────────────────────────────────────
    // panelHeight = extra px above toolbar (0 = closed, maxPanelHeight = fully open)
    let panelHeight = $state(0);
    let isSnapping = $state(false);    // when true, CSS transition is active (snap animation)

    // ── Other UI state ──────────────────────────────────────────────────────
    let toolsPopupOpen = $state(false);

    // ── DOM ref for touch listeners ─────────────────────────────────────────
    let wrapEl: HTMLElement;

    // ── Drag tracking (plain vars, not reactive) ────────────────────────────
    let touchStartY = 0;
    let startPanelHeight = 0;
    let isDragging = false;

    // ── Derived ─────────────────────────────────────────────────────────────
    let panelOpen = $derived(panelHeight > 0);

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

    function handleImportMobile(e: MouseEvent) {
        e.stopPropagation();
        openPanel('import');
    }

    function handleAnatomyMobile(e: MouseEvent) {
        e.stopPropagation();
        openPanel('anatomy');
    }

    function handleToolsClick(e: MouseEvent) {
        e.stopPropagation();
        toolsPopupOpen = !toolsPopupOpen;
    }

    function handleOpenViewer(e: MouseEvent) {
        e.stopPropagation();
        ui.emit('viewer', true);
        toolsPopupOpen = false;
    }

    function handleWindowClick() { toolsPopupOpen = false; }

    function selectProfile(id: string) {
        closePanel();
        goto(`/med/p/${id}`);
    }

    function openPanel(view?: PanelView) {
        if (view) panelView = view;
        isSnapping = true;
        panelHeight = MAX_HEIGHT[panelView]();
    }

    function closePanel() {
        isSnapping = true;
        panelHeight = 0;
    }

    function togglePanel() {
        if (panelOpen) {
            closePanel();
        } else {
            panelView = 'profiles';
            openPanel();
        }
    }

    // ── Touch drag (registered manually for passive:false) ──────────────────
    function onTouchStart(e: TouchEvent) {
        // Don't initiate drag if touching panel content (allow it to scroll)
        const target = e.target as HTMLElement;
        if (target.closest('.panel-section')) return;

        touchStartY = e.touches[0].clientY;
        startPanelHeight = panelHeight;
        isDragging = false;
        isSnapping = false;  // kill transition while dragging
    }

    function onTouchMove(e: TouchEvent) {
        const deltaY = touchStartY - e.touches[0].clientY;  // positive = dragging up
        if (!isDragging && Math.abs(deltaY) < 6) return;
        isDragging = true;
        e.preventDefault();
        const maxH = MAX_HEIGHT[panelView]();
        panelHeight = Math.max(0, Math.min(maxH, startPanelHeight + deltaY));
    }

    function onTouchEnd() {
        if (!isDragging) return;
        isDragging = false;
        isSnapping = true;
        const maxH = MAX_HEIGHT[panelView]();
        // Snap: open if past 30%, close otherwise
        panelHeight = panelHeight > maxH * 0.3 ? maxH : 0;
    }

    onMount(() => {
        wrapEl.addEventListener('touchstart', onTouchStart, { passive: true });
        wrapEl.addEventListener('touchmove', onTouchMove, { passive: false });
        wrapEl.addEventListener('touchend', onTouchEnd);

        return () => {
            wrapEl.removeEventListener('touchstart', onTouchStart);
            wrapEl.removeEventListener('touchmove', onTouchMove);
            wrapEl.removeEventListener('touchend', onTouchEnd);
        };
    });
</script>

<!--
    MOBILE: floating pill, bottom-anchored.
    Two-layer approach:
    - .navbar-outer: overflow:visible so avatar can protrude above pill
    - .navbar-inner: overflow:hidden clips the panel; owns bg/shadow/radius
    - button.nav-avatar: absolute, centered, floats above .navbar-inner
-->
<div
    class="panel-backdrop"
    class:-open={panelOpen}
    onclick={closePanel}
    aria-hidden="true"
></div>

<div
    class="navbar-outer"
    class:-snapping={isSnapping}
    style="height: calc(var(--toolbar-height) + 1.25rem + {panelHeight}px)"
    bind:this={wrapEl}
>
    <!-- Avatar floats above the pill — outside overflow:hidden boundary -->
    <button class="nav-avatar" onclick={togglePanel} aria-label={$profile?.fullName ?? 'Profile'}>
        <ProfileImage profile={$profile} size={5} />
    </button>

    <!-- Inner pill: clips the panel -->
    <div class="navbar-inner">
        <!-- Toolbar row — always visible, acts as drag handle -->
        <nav class="navbar-bar toolbar" aria-label="Main navigation">
            <a
                class="nav-icon"
                href={$profile?.id ? `/med/p/${$profile.id}/documents` : '/med'}
                class:-active={!!$profile?.id && isActive(`/med/p/${$profile.id}/documents`)}
                aria-label={$t('app.nav.documents')}
            >
                <svg aria-hidden="true"><use href="/icons.svg#report"></use></svg>
            </a>
            <button class="nav-icon" onclick={handleAnatomyMobile} aria-label={$t('app.nav.anatomy-model')}>
                <svg aria-hidden="true"><use href="/icons.svg#anatomy"></use></svg>
            </button>

            <!-- Empty spacer preserves flex layout where avatar was -->
            <div class="nav-avatar-slot"></div>

            <button class="nav-icon" class:-active={$chatIsOpen} onclick={handleChatToggle} aria-label="AI Chat">
                <svg aria-hidden="true"><use href="/icons.svg#doctor"></use></svg>
            </button>
            <button class="nav-icon" onclick={handleImportMobile} aria-label="Import">
                <svg aria-hidden="true"><use href="/icons.svg#plus"></use></svg>
            </button>
        </nav>

        <!-- Profile name row — always visible below icons -->
        <div class="navbar-name">{$profile?.fullName ?? ''}</div>

        <!-- Panel section — below the toolbar, revealed by expanding container -->
        <div class="panel-section">
            {#if panelView !== 'profiles'}
                <div class="panel-header">
                    <button onclick={() => openPanel('profiles')} aria-label="Back" class="panel-back">
                        <svg aria-hidden="true"><use href="/icons.svg#arrow-nav-left"></use></svg>
                    </button>
                </div>
            {/if}
            {#if panelView === 'profiles'}
                <NavPanelProfiles onSelectProfile={selectProfile} onClose={closePanel} />
            {:else if panelView === 'anatomy'}
                <Viewer />
            {:else if panelView === 'import'}
                <Import oncomplete={closePanel} />
            {/if}
        </div>
    </div>
</div>

<!-- DESKTOP: full-width top bar — hidden on mobile -->
<header class="navbar-desktop">
    <nav class="toolbar" aria-label="Main navigation">
        {#if $user && isFullUser($user) && $user.subscription !== 'individual'}
            <a href="/med/p/" class:-active={$page.url.pathname === '/med/p/'}>
                {$t('app.nav.profiles')}
            </a>
        {/if}
        {#if $profile?.id}
            <a class="nav-icon" href="/med/p/{$profile.id}" aria-label={$profile.fullName}>
                <ProfileImage profile={$profile} size={1.5} />
            </a>
            <span class="profile-name">{$profile.fullName}</span>
        {/if}
        {#if $profile?.id}
            <a
                href="/med/p/{$profile.id}/documents"
                class:-active={isActive(`/med/p/${$profile.id}/documents`)}
            >
                {$t('app.nav.documents')}
            </a>
        {/if}
            <button onclick={handleOpenViewer} aria-label={$t('app.nav.anatomy-model')}>
                <svg aria-hidden="true"><use href="/icons.svg#anatomy"></use></svg>
            </button>

        <button class:-active={$chatIsOpen} onclick={handleChatToggle} aria-label="AI Chat">
            <svg aria-hidden="true"><use href="/icons.svg#doctor"></use></svg>
        </button>
        <button onclick={handleImport} aria-label="Import">
            <svg aria-hidden="true"><use href="/icons.svg#plus"></use></svg>
        </button>
    </nav>
</header>

<svelte:window onclick={handleWindowClick} />

<style>
    /* ═══════════════════════════════════════════════════════════
       MOBILE: floating pill
       Bottom-anchored; grows UPWARD when panel opens.
       Two-layer: outer (overflow:visible) + inner (overflow:hidden).
    ═══════════════════════════════════════════════════════════ */

    /* Outer: positioning context, overflow visible so avatar can protrude */
    .navbar-outer {
        position: fixed;
        left: 1rem;
        right: 1rem;
        bottom: calc(1rem + var(--safe-area-bottom, 0px));
        /* height is set via inline style (toolbar + panelHeight) */
        overflow: visible;
        z-index: 1000;
        /* No transition by default (during drag); added by .-snapping */
    }

    .navbar-outer.-snapping {
        transition: height 0.32s cubic-bezier(0.4, 0, 0.2, 1);
    }

    /* Hide mobile pill on desktop */
    @media (min-width: 769px) {
        .navbar-outer {
            display: none;
        }
    }

    /* Inner: the visible pill — owns overflow:hidden for panel clipping */
    .navbar-inner {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;

    }

    /* ── Toolbar row ─────────────────────────────────────────── */
    .navbar-bar {
        width: 100%;
        height: var(--toolbar-height);
        flex-shrink: 0;
        border-radius: var(--radius-16, 1rem);
        overflow: hidden;
        /* No border on the floating pill */
        --button-color: var(--color-gray-300);
        background: var(--color-gray-300);
        box-shadow: 0 0.25rem 1.5rem rgba(0, 0, 0, 0.18);
    }

    /* ── Nav icons ───────────────────────────────────────────── */
    .nav-icon {
        flex: 1;
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 0.4rem;
        min-width: var(--toolbar-height);
    }

    /* Empty spacer preserving flex layout where avatar was */
    .nav-avatar-slot {
        flex: 1;
        min-width: var(--toolbar-height);
    }

    /* Avatar: absolute, centered, protrudes above pill
       --toolbar-height ≈ 3rem. Avatar = 5rem (2.5rem radius).
       We want avatar center aligned with toolbar center (1.5rem from top of inner).
       avatar.top = 1.5rem - 2.5rem = -1rem → protrudes 1rem above the pill. */
    .nav-avatar {
        position: absolute;
        left: 50%;
        top: calc(var(--toolbar-height) / 2 - 3rem);
        transform: translateX(-50%);
        width: 5rem;
        height: 5rem;
        padding: 0;
        border: none;
        background: none;
        cursor: pointer;
        z-index: 2;
        border-radius: 50%;
    }

    .nav-avatar :global(.avatar) {
        width: 4rem !important;
        height: 4rem !important;
        max-width: 5rem;
        max-height: 5rem;
        border-radius: 50%;
    }

    /* ── Profile name row ────────────────────────────────────── */
    .navbar-name {
        height: 1.5rem;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        padding: .2rem 0.75rem;
        background-color: var(--color-gray-600);
        margin: 0 1rem;
        border-bottom-left-radius: var(--radius-16, 1rem);
        border-bottom-right-radius: var(--radius-16, 1rem);
    }

    /* ── Panel section ───────────────────────────────────────── */
    .panel-section {
        flex: 1;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        margin: 0 1rem;
    }

    /* ── Panel header (back button row) ──────────────────────── */
    .panel-header {
        display: flex;
        align-items: center;
        padding: 0.5rem 0;
        flex-shrink: 0;
    }

    .panel-back {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 2rem;
        height: 2rem;
        background: none;
        border: none;
        cursor: pointer;
        color: var(--color-gray-800);
        border-radius: var(--radius-8, 0.5rem);
    }

    .panel-back:hover {
        background: var(--color-gray-300);
    }

    .panel-back svg {
        width: 1.25rem;
        height: 1.25rem;
    }

    /* ── Panel backdrop overlay (mobile only) ────────────────── */
    .panel-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(255, 255, 255, 0);
        backdrop-filter: blur(0px);
        -webkit-backdrop-filter: blur(0px);
        z-index: 999;
        pointer-events: none;
        transition:
            background 0.32s ease,
            backdrop-filter 0.32s ease,
            -webkit-backdrop-filter 0.32s ease;
    }

    .panel-backdrop.-open {
        background: rgba(255, 255, 255, 0.4);
        backdrop-filter: blur(15px);
        -webkit-backdrop-filter: blur(15px);
        pointer-events: auto;
    }

    @media (min-width: 769px) {
        .panel-backdrop { display: none; }
    }

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
        flex: 2;
    }

    /* ── Desktop tools dropdown ──────────────────────────────── */
    .tools-wrapper {
        position: relative;
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
        display: block;
        width: 100%;
        padding: 0.65rem 1rem;
        text-align: left;
        background: none;
        border: none;
        cursor: pointer;
        color: var(--color-black);
        font-size: 0.875rem;
    }

    .tools-popup button:hover {
        background: var(--color-gray-300);
    }
</style>
