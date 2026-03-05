<script lang="ts">
    import NavBar from '$components/layout/NavBar.svelte';
    import NavPanelProfiles from '$components/layout/NavPanelProfiles.svelte';
    import DropFiles from '$components/import/DropFiles.svelte';
    import Modal from '$components/ui/Modal.svelte';
    import HealthForm from '../profile/HealthForm.svelte';
    import HealthProperty from '../healthProperty/Overview.svelte';
    import Import from '$components/import/Index.svelte';
    import ui from '$lib/ui';
    import { onMount } from 'svelte';
    import { fade } from 'svelte/transition';
    import { afterNavigate, goto } from '$app/navigation';
    import { Overlay, state as uiState } from '$lib/ui';
    import shortcuts from '$lib/shortcuts';
    import Sounds from '$components/ui/Sounds.svelte';
    import Viewer from './Viewer.svelte';
    import { logger } from '$lib/logging/logger';
    import AIChatSidebar from '$components/chat/AIChatSidebar.svelte';
    import { profile } from '$lib/profiles';
    import { page } from '$app/stores';
    import { chatManager } from '$lib/chat/chat-manager';
    import type { Profile } from '$lib/types.d';
    import { isOpen as chatIsOpen } from '$lib/chat/store';
    import { device } from '$lib/device';
    import { saveHealthProfile } from '$lib/health/save';
    import user from '$lib/user';
    import { App } from '@capacitor/app';
    import { isNativePlatform } from '$lib/config/platform';

    async function handleHealthFormClose() {
        logger.ui.debug('Health form modal close event fired');
        if (dialogs.healthFormData && $profile?.id) {
            await saveHealthProfile({
                profileId: $profile.id,
                formData: dialogs.healthFormData
            });
        }
        dialogs.healthForm = false;
        dialogs.healthFormData = null;
    }

    function handleHealthPropertyClose() {
        logger.ui.debug('Health property modal close event fired');
        dialogs.healthProperty = false;
    }

    interface Props {
        children?: import('svelte').Snippet;
    }

    let { children }: Props = $props();

    let dialogs = $state({
        healthForm: false,
        healthProperty: false,
        healthFormData: null as any
    });

    // Import overlay state
    let importJobId: string | undefined = $state(undefined);
    let importAutoOpen = $state(false);

    // Chat state
    let currentProfile: Profile | null = $state(null);
    let isOwnProfile = $state(false);
    let userLanguage = $state('en');

    // Desktop viewer resize state
    let viewerWidth = $state(33);
    let isResizingViewer = $state(false);
    let minViewerWidth = 20;
    let maxViewerWidth = 50;

    // Mobile bottom sheet resize state (for anatomy viewer in layout, kept for compatibility)
    let mobileViewerHeight = $state(60);
    let isMobileResizing = $state(false);
    let mobileResizeTouchStartY = 0;
    let mobileResizeStartHeight = 0;

    // ── Mobile panel / bottom-sheet ──────────────────────────────────────────
    type PanelView = 'profiles' | 'anatomy' | 'import';
    let panelView = $state<PanelView>('profiles');
    let panelHeight = $state(0);
    let isSnappingPanel = $state(false);
    let panelEl: HTMLElement | undefined = $state(undefined);

    const MAX_PANEL_HEIGHT: Record<PanelView, () => number> = {
        profiles: () => Math.round(Math.min(window.innerHeight * 0.55, 380)),
        anatomy:  () => Math.round(window.innerHeight * 0.82),
        import:   () => Math.round(window.innerHeight * 0.88),
    };

    let panelOpen = $derived(panelHeight > 0);

    // Touch drag tracking (plain vars, not reactive)
    let panelTouchStartY = 0;
    let panelStartHeight = 0;
    let isDraggingPanel = false;

    function openPanel(view?: PanelView) {
        if (view) panelView = view;
        isSnappingPanel = true;
        panelHeight = MAX_PANEL_HEIGHT[panelView]();
    }

    function closePanel() {
        isSnappingPanel = true;
        panelHeight = 0;
    }

    function onPanelTouchStart(e: TouchEvent) {
        const target = e.target as HTMLElement;
        if (target.closest('.panel-content')) return;
        panelTouchStartY = e.touches[0].clientY;
        panelStartHeight = panelHeight;
        isDraggingPanel = false;
        isSnappingPanel = false;
    }

    function onPanelTouchMove(e: TouchEvent) {
        const deltaY = panelTouchStartY - e.touches[0].clientY;
        if (!isDraggingPanel && Math.abs(deltaY) < 6) return;
        isDraggingPanel = true;
        e.preventDefault();
        const maxH = MAX_PANEL_HEIGHT[panelView]();
        panelHeight = Math.max(0, Math.min(maxH, panelStartHeight + deltaY));
    }

    function onPanelTouchEnd() {
        if (!isDraggingPanel) return;
        isDraggingPanel = false;
        isSnappingPanel = true;
        const maxH = MAX_PANEL_HEIGHT[panelView]();
        panelHeight = panelHeight > maxH * 0.3 ? maxH : 0;
    }

    // Register touch handlers on panel element whenever it mounts/unmounts
    $effect(() => {
        const el = panelEl;
        if (!el) return;
        el.addEventListener('touchstart', onPanelTouchStart, { passive: true });
        el.addEventListener('touchmove', onPanelTouchMove, { passive: false });
        el.addEventListener('touchend', onPanelTouchEnd);
        return () => {
            el.removeEventListener('touchstart', onPanelTouchStart);
            el.removeEventListener('touchmove', onPanelTouchMove);
            el.removeEventListener('touchend', onPanelTouchEnd);
        };
    });

    // Update CSS variables for viewer
    $effect(() => {
        if ($uiState.viewer) {
            document.documentElement.style.setProperty('--viewer-width', `${viewerWidth}vw`);
            if ($device.isMobile) {
                document.documentElement.style.setProperty('--mobile-viewer-height', `${mobileViewerHeight}vh`);
            }
        }
    });

    // Desktop viewer resize
    function startViewerResize(event: MouseEvent) {
        isResizingViewer = true;
        document.addEventListener('mousemove', handleViewerResize);
        document.addEventListener('mouseup', stopViewerResize);
        event.preventDefault();
    }

    function handleViewerResize(event: MouseEvent) {
        if (!isResizingViewer) return;
        const vwWidth = (event.clientX / window.innerWidth) * 100;
        viewerWidth = Math.max(minViewerWidth, Math.min(maxViewerWidth, vwWidth));
    }

    function stopViewerResize() {
        isResizingViewer = false;
        document.removeEventListener('mousemove', handleViewerResize);
        document.removeEventListener('mouseup', stopViewerResize);
    }

    // Mobile viewer resize (layout-embedded viewer)
    function handleMobileResizeStart(event: TouchEvent) {
        if (!$device.isMobile) return;
        event.preventDefault();
        isMobileResizing = true;
        mobileResizeTouchStartY = event.touches[0].clientY;
        mobileResizeStartHeight = mobileViewerHeight;
    }

    function handleMobileResizeMove(event: TouchEvent) {
        if (!isMobileResizing || !$device.isMobile) return;
        event.preventDefault();
        const deltaY = mobileResizeTouchStartY - event.touches[0].clientY;
        const deltaPercent = (deltaY / window.innerHeight) * 100;
        mobileViewerHeight = Math.max(25, Math.min(90, mobileResizeStartHeight + deltaPercent));
    }

    function handleMobileResizeEnd() {
        isMobileResizing = false;
    }

    // close all dialogs on navigation
    afterNavigate(() => {
        manageOverlay();
    });

    function manageOverlay() {
        if (location.hash.indexOf('#overlay-') == 0) {
            const overlay = location.hash.replace('#overlay-', '');
            if (Object.values(Overlay).includes(overlay as Overlay)) $uiState.overlay = overlay as Overlay;
        } else {
            $uiState.overlay = Overlay.none;
        }
    }

    // Subscribe to profile changes for chat
    $effect(() => {
        const unsubscribe = profile.subscribe((p) => {
            currentProfile = p;
            if (p) {
                isOwnProfile = p.owner_id === user.getId();
                userLanguage = p.language || 'en';
                if ($page.url.pathname.startsWith('/med')) {
                    ui.emit('chat:navigation', {
                        route: $page.route.id || '/',
                        profileId: p.id,
                        profileName: p.fullName || 'Unknown'
                    });
                }
            }
        });
        return unsubscribe;
    });

    onMount(() => {
        logger.ui.info('UI mounted');
        device.init();

        // Android hardware back button: close overlay instead of exiting app
        let backButtonHandle: Promise<{ remove: () => void }> | null = null;
        if (isNativePlatform()) {
            backButtonHandle = App.addListener('backButton', () => {
                if ($uiState.overlay !== null && $uiState.overlay !== 'none') {
                    location.hash = '';
                }
            });
        }

        document.addEventListener('touchmove', handleMobileResizeMove, { passive: false });
        document.addEventListener('touchend', handleMobileResizeEnd);

        const offs = [
            ui.listen('modal.healthProperty', (config: any) => {
                logger.ui.debug('modal.healthProperty event received with config:', config);
                dialogs.healthProperty = config === false ? false : (config || true);
            }),
            ui.listen('modal.healthForm', (config: any) => {
                logger.ui.debug('modal.healthForm event received with config:', config);
                dialogs.healthForm = config === false ? false : (config || true);
                dialogs.healthFormData = config?.data || $profile?.health || {};
            }),
            ui.listen('overlay.import', (state: any = true) => {
                logger.ui.debug('import');
                if (state && typeof state === 'object' && state.jobId) {
                    importJobId = state.jobId;
                    importAutoOpen = false;
                } else {
                    importJobId = undefined;
                    importAutoOpen = !!(state && typeof state === 'object' && state.autoOpen);
                }
                if (state) location.hash = '#overlay-import';
                else {
                    importJobId = undefined;
                    importAutoOpen = false;
                    if (location.hash.indexOf('#overlay-') == 0) {
                        history.back();
                    }
                }
            }),
            ui.listen('viewer', () => {
                $uiState.viewer = true;
            }),
            // Nav events: mobile opens panel, desktop uses existing behaviour
            ui.listen('nav:profiles', () => {
                if ($device.isMobile) openPanel('profiles');
                else goto('/med/p/');
            }),
            ui.listen('nav:anatomy', () => {
                if ($device.isMobile) openPanel('anatomy');
                else $uiState.viewer = true;
            }),
            ui.listen('nav:import', () => {
                if ($device.isMobile) openPanel('import');
                else ui.emit('overlay.import', true);
            }),
            shortcuts.listen('Escape', () => {
                if (location.hash.indexOf('#overlay-') == 0) {
                    history.back();
                }
            })
        ];

        const handleBeforeUnload = () => {
            chatManager.saveCurrentConversation();
        };
        window.addEventListener('beforeunload', handleBeforeUnload);

        manageOverlay();

        return () => {
            offs.forEach(off => off());
            device.destroy();
            window.removeEventListener('beforeunload', handleBeforeUnload);
            document.removeEventListener('touchmove', handleMobileResizeMove);
            document.removeEventListener('touchend', handleMobileResizeEnd);
            if (backButtonHandle) backButtonHandle.then(h => h.remove());
        };
    });
</script>

<svelte:window on:hashchange={manageOverlay} />

<DropFiles>
    <NavBar></NavBar>

    {#if $device.isMobile}
        <!-- Backdrop -->
        <div
            class="panel-backdrop"
            class:-open={panelOpen}
            onclick={closePanel}
            aria-hidden="true"
        ></div>

        <!-- Mobile bottom-sheet panel -->
        <div
            class="mobile-panel"
            class:-snapping={isSnappingPanel}
            style="height: {panelHeight}px"
            bind:this={panelEl}
        >
            <!-- Drag handle -->
            <div class="panel-drag-handle">
                <div class="panel-drag-bar"></div>
            </div>
            <!-- Back button for non-profiles views -->
            {#if panelView !== 'profiles'}
                <div class="panel-header">
                    <button onclick={() => openPanel('profiles')} class="panel-back" aria-label="Back">
                        <svg aria-hidden="true"><use href="/icons.svg#arrow-nav-left"></use></svg>
                    </button>
                </div>
            {/if}
            <!-- Panel content -->
            <div class="panel-content">
                {#if panelView === 'profiles'}
                    <NavPanelProfiles
                        onSelectProfile={(id) => { closePanel(); goto(`/med/p/${id}`); }}
                        onClose={closePanel}
                    />
                {:else if panelView === 'anatomy'}
                    <Viewer />
                {:else if panelView === 'import'}
                    <Import oncomplete={closePanel} />
                {/if}
            </div>
        </div>
    {/if}

    <main class="layout" class:-viewer={$uiState.viewer && !$device.isMobile} class:chat-open={$chatIsOpen && $page.url.pathname.startsWith('/med')}>
        {#if $uiState.viewer && !$device.isMobile}
            <section
                class="layout-viewer"
                style="width: {viewerWidth}vw"
                transition:fade
            >
                <Viewer />
                <button
                    class="viewer-resize-handle"
                    onmousedown={startViewerResize}
                    aria-label="Resize viewer sidebar"
                ></button>
            </section>
        {/if}
        <section class="layout-content">{@render children?.()}</section>
    </main>

    {#if $uiState.overlay == Overlay.import}
        <div class="virtual-page" transition:fade>
            <Import jobId={importJobId} autoOpen={importAutoOpen} oncomplete={() => { importJobId = undefined; }} />
        </div>
    {/if}

    {#if dialogs.healthForm}
        <Modal onclose={handleHealthFormClose}>
            <HealthForm
                config={dialogs.healthForm}
                bind:data={dialogs.healthFormData}
            />
        </Modal>
    {/if}
    {#if dialogs.healthProperty}
        <Modal onclose={handleHealthPropertyClose}>
            <HealthProperty property={dialogs.healthProperty as any} />
        </Modal>
    {/if}

    {#if $page.url.pathname.startsWith('/med')}
        <AIChatSidebar
            {currentProfile}
            {isOwnProfile}
            {userLanguage}
        />
    {/if}
</DropFiles>

<Sounds />

<style>
    .virtual-page {
        position: fixed;
        top: calc(var(--toolbar-height) + var(--gap) + var(--safe-area-top));
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 100000;
        background: var(--background);
    }

    @media (max-width: 768px) {
        .virtual-page {
            top: var(--safe-area-top);
            bottom: 0;
        }
    }

    /* ── Mobile backdrop ─────────────────────────────────────────────────── */
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

    /* ── Mobile bottom-sheet panel ───────────────────────────────────────── */
    .mobile-panel {
        position: fixed;
        left: 1rem;
        right: 1rem;
        /* Sit above the pill bar (toolbar-height + name row 1.25rem + margin 1rem) */
        bottom: calc(var(--toolbar-height) + 1.25rem + 1rem + var(--safe-area-bottom, 0px));
        height: 0;
        overflow: hidden;
        z-index: 1001;
        background: var(--color-white);
        border-radius: var(--radius-16, 1rem);
        box-shadow: 0 -0.25rem 1.5rem rgba(0, 0, 0, 0.15);
        display: flex;
        flex-direction: column;
    }

    .mobile-panel.-snapping {
        transition: height 0.32s cubic-bezier(0.4, 0, 0.2, 1);
    }

    /* ── Drag handle ─────────────────────────────────────────────────────── */
    .panel-drag-handle {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 1.5rem;
        flex-shrink: 0;
        cursor: grab;
        touch-action: none;
    }

    .panel-drag-bar {
        width: 2.5rem;
        height: 0.25rem;
        background: var(--color-gray-600);
        border-radius: 0.125rem;
    }

    /* ── Panel header (back button) ──────────────────────────────────────── */
    .panel-header {
        display: flex;
        align-items: center;
        padding: 0.5rem 1rem;
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

    /* ── Panel content ───────────────────────────────────────────────────── */
    .panel-content {
        flex: 1;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        padding: 0 1rem;
    }
</style>
