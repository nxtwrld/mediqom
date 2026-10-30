<script lang="ts">
    import NavBar from "$components/layout/NavBar.svelte";
    import NavPanelProfiles from "$components/layout/NavPanelProfiles.svelte";
    import ProfileImage from "$components/profile/ProfileImage.svelte";
    import DropFiles from "$components/import/DropFiles.svelte";
    import Modal from "$components/ui/Modal.svelte";
    import HealthForm from "../profile/HealthForm.svelte";
    import HealthProperty from "../healthProperty/Overview.svelte";
    import ui from "$lib/ui";
    import { t } from "$lib/i18n";
    import { onMount } from "svelte";
    import { beforeNavigate, goto } from "$app/navigation";
    import { state as uiState } from "$lib/ui";
    import shortcuts from "$lib/shortcuts";
    import Sounds from "$components/ui/Sounds.svelte";
    import Viewer from "./Viewer.svelte";
    import { logger } from "$lib/logging/logger";
    import AIChatSidebar from "$components/chat/AIChatSidebar.svelte";
    import { profile } from "$lib/profiles";
    import { page } from "$app/stores";
    import { chatManager } from "$lib/chat/chat-manager";
    import type { Profile } from "$lib/types.d";
    import { isOpen as chatIsOpen, chatActions } from "$lib/chat/store";
    import { device } from "$lib/device";
    import { initTheme } from "$lib/theme/store";
    import { saveHealthProfile } from "$lib/health/save";
    import user from "$lib/user";
    import { pendingJobs, activeJobs } from "$lib/import/job-store";
    import { keyboardHeight } from "$lib/capacitor/keyboard-store";
    import { App } from "@capacitor/app";
    import { isNativePlatform } from "$lib/config/platform";

    async function handleHealthFormClose() {
        logger.ui.debug("Health form modal close event fired");
        if (dialogs.healthFormData && $profile?.id) {
            await saveHealthProfile({
                profileId: $profile.id,
                formData: dialogs.healthFormData,
            });
        }
        dialogs.healthForm = false;
        dialogs.healthFormData = null;
    }

    function handleHealthPropertyClose() {
        logger.ui.debug("Health property modal close event fired");
        dialogs.healthProperty = false;
    }

    interface Props {
        children?: import("svelte").Snippet;
    }

    let { children }: Props = $props();

    let dialogs = $state({
        healthForm: false,
        healthProperty: false,
        healthFormData: null as any,
    });

    // Chat state
    let currentProfile: Profile | null = $state(null);
    let isOwnProfile = $state(false);
    let isProfileActive = $derived(
        isOwnProfile || $profile?.status === "approved",
    );
    let userLanguage = $state("en");

    // Viewer signal highlight state
    let viewerSignalHighlight = $state<{
        signalName: string;
        value: number;
        documentId?: string;
    } | null>(null);

    // Keep Viewer mounted for 5s after panel/sidebar closes to avoid thrashing
    let viewerAlive = $state(false);
    let viewerUnloadTimer: ReturnType<typeof setTimeout> | null = null;
    let viewerMountTimer: ReturnType<typeof setTimeout> | null = null;

    $effect(() => {
        const isActive =
            (panelOpen && panelView === "explore") ||
            ($uiState.viewer && !$device.isMobile);
        if (isActive) {
            // Cancel any pending unload
            if (viewerUnloadTimer !== null) {
                clearTimeout(viewerUnloadTimer);
                viewerUnloadTimer = null;
            }
            // Delay mount so panel transition finishes first
            if (!viewerAlive && viewerMountTimer === null) {
                viewerMountTimer = setTimeout(() => {
                    viewerAlive = true;
                    viewerMountTimer = null;
                }, 700);
            }
        } else {
            // Cancel pending mount
            if (viewerMountTimer !== null) {
                clearTimeout(viewerMountTimer);
                viewerMountTimer = null;
            }
            // Start unload grace period
            if (viewerAlive && viewerUnloadTimer === null) {
                viewerUnloadTimer = setTimeout(() => {
                    viewerAlive = false;
                    viewerUnloadTimer = null;
                }, 5000);
            }
        }
        return () => {
            if (viewerUnloadTimer !== null) {
                clearTimeout(viewerUnloadTimer);
                viewerUnloadTimer = null;
            }
            if (viewerMountTimer !== null) {
                clearTimeout(viewerMountTimer);
                viewerMountTimer = null;
            }
        };
    });

    function destroyViewerNow() {
        if (viewerMountTimer !== null) {
            clearTimeout(viewerMountTimer);
            viewerMountTimer = null;
        }
        if (viewerUnloadTimer !== null) {
            clearTimeout(viewerUnloadTimer);
            viewerUnloadTimer = null;
        }
        viewerAlive = false;
    }

    // Desktop viewer resize state
    let viewerWidth = $state(33);
    let isResizingViewer = $state(false);
    let minViewerWidth = 20;
    let maxViewerWidth = 50;

    // ── Mobile living bar ────────────────────────────────────────────────────
    // The bar rides on top of whichever layer is open; the layer's own button
    // turns into its Close. One layer at a time on mobile.
    type PanelView = "profiles" | "explore" | "chat";
    let panelView = $state<PanelView>("profiles");
    let panelHeight = $state(0);
    let panelOpen = $derived(panelHeight > 0);
    let isSnappingPanel = $state(false);
    let navbarWrapEl = $state<HTMLElement | undefined>(undefined);
    let exploreView = $state<"anatomy" | "timeline">("anatomy");

    let exploreOpen = $derived(panelOpen && panelView === "explore");
    let chatSheetOpen = $derived(panelOpen && panelView === "chat");
    let profilesOpen = $derived(panelOpen && panelView === "profiles");
    // Not tied to panelOpen: Body resizes its canvas whenever this flips, and the Viewer
    // stays mounted for 5s after closing — flipping it on close left a 0-height canvas on reopen
    let anatomyFullscreen = $derived($device.isMobile && panelView === "explore" && exploreView === "anatomy");

    function isActive(path: string): boolean {
        return $page.url.pathname.startsWith(path);
    }

    let profileBase = $derived($profile?.id ? `/med/p/${$profile.id}` : "/med/p");
    let docsActive = $derived(
        !!$profile?.id && (isActive(`${profileBase}/documents`) || isActive(`${profileBase}/medications`)),
    );
    let doctorsActive = $derived(
        !!$profile?.id && (isActive(`${profileBase}/contacts`) || isActive(`${profileBase}/appointments`)),
    );

    // Import progress on the Docs icon: ring while running, dot when ready to review
    const RING_CIRCUMFERENCE = 2 * Math.PI * 15;
    let importProgress = $derived(
        $activeJobs.length
            ? $activeJobs.reduce((sum, job) => sum + (job.progress ?? 0), 0) / $activeJobs.length
            : null,
    );

    function handleAvatarClick() {
        if (!$profile?.id) return ui.emit("nav:profiles");
        if ($page.url.pathname === `${profileBase}` || $page.url.pathname === `${profileBase}/`) {
            window.scrollTo({ top: 0, behavior: "smooth" });
        } else {
            goto(`${profileBase}`);
        }
    }

    function handleNameClick() {
        ui.emit("nav:profiles");
    }

    // Same rule Viewer.svelte uses on mount: the most recently requested view wins
    function latestExploreView(): "anatomy" | "timeline" {
        const timeline = ui.getLatest("viewer:timeline");
        const anatomy = ui.getLatest("viewer:anatomy");
        return timeline && (!anatomy || timeline.timestamp > anatomy.timestamp) ? "timeline" : "anatomy";
    }

    function handleExplore() {
        if (exploreOpen) {
            closePanel();
            return;
        }
        exploreView = latestExploreView();
        openPanel("explore");
    }

    function handleAsk() {
        if (chatSheetOpen) closePanel();
        else ui.emit("chat:toggle");
    }

    function showAnatomy() {
        ui.emit("viewer:anatomy", true);
    }

    function showTimeline() {
        ui.emit("viewer:timeline", null);
    }

    const MAX_PANEL_HEIGHT: Record<PanelView, () => number> = {
        profiles: () => Math.round(Math.min(window.innerHeight * 0.65, 380)),
        explore: () => Math.round(window.innerHeight * 0.82),
        // Capped to the screen by .navbar-outer max-height
        chat: () => window.innerHeight,
    };

    // Touch drag tracking (plain vars, not reactive)
    let panelTouchStartY = 0;
    let panelStartHeight = 0;
    let isDraggingPanel = false;
    let panelTouchActive = false; // true only when touch started outside .panel-section

    function openPanel(view?: PanelView) {
        if (view) panelView = view;
        // One layer at a time: leaving the chat sheet closes the chat
        if (panelView !== "chat" && $chatIsOpen) chatActions.close();
        isSnappingPanel = true;
        panelHeight = MAX_PANEL_HEIGHT[panelView]();
    }

    function closePanel() {
        isSnappingPanel = true;
        panelHeight = 0;
        if (panelView === "chat" && $chatIsOpen) chatActions.close();
    }

    function onPanelTouchStart(e: TouchEvent) {
        const target = e.target as HTMLElement;
        // Only block drag when panel is open and touch is inside panel content.
        // When panel is closed, allow drag from anywhere on the pill (including .panel-section itself).
        if (panelHeight > 0 && target.closest(".panel-section, .explore-switch")) {
            panelTouchActive = false;
            return;
        }
        panelTouchActive = true;
        panelTouchStartY = e.touches[0].clientY;
        panelStartHeight = panelHeight;
        isDraggingPanel = false;
        isSnappingPanel = false;
    }

    function onPanelTouchMove(e: TouchEvent) {
        if (!panelTouchActive) return;
        const deltaY = panelTouchStartY - e.touches[0].clientY;
        if (!isDraggingPanel && Math.abs(deltaY) < 6) return;
        isDraggingPanel = true;
        if (e.cancelable) e.preventDefault();
        const maxH = MAX_PANEL_HEIGHT[panelView]();
        panelHeight = Math.max(0, Math.min(maxH, panelStartHeight + deltaY));
    }

    function onPanelTouchEnd() {
        panelTouchActive = false;
        if (!isDraggingPanel) return;
        isDraggingPanel = false;
        const maxH = MAX_PANEL_HEIGHT[panelView]();
        const willClose = panelHeight <= maxH * 0.3;
        if (willClose) {
            closePanel();
            // Swipe-down on explore panel — destroy viewer immediately (no grace period)
            if (panelView === "explore") destroyViewerNow();
        } else {
            isSnappingPanel = true;
            panelHeight = maxH;
        }
    }

    // Register touch handlers on NavBar's wrapEl whenever it becomes available
    $effect(() => {
        const el = navbarWrapEl;
        if (!el) return;
        el.addEventListener("touchstart", onPanelTouchStart, { passive: true });
        el.addEventListener("touchmove", onPanelTouchMove, { passive: false });
        el.addEventListener("touchend", onPanelTouchEnd);
        return () => {
            el.removeEventListener("touchstart", onPanelTouchStart);
            el.removeEventListener("touchmove", onPanelTouchMove);
            el.removeEventListener("touchend", onPanelTouchEnd);
        };
    });

    // Update CSS variables for viewer
    $effect(() => {
        if ($uiState.viewer) {
            document.documentElement.style.setProperty(
                "--viewer-width",
                `${viewerWidth}vw`,
            );
        }
    });

    // Desktop viewer resize
    function startViewerResize(event: MouseEvent) {
        isResizingViewer = true;
        document.addEventListener("mousemove", handleViewerResize);
        document.addEventListener("mouseup", stopViewerResize);
        event.preventDefault();
    }

    function handleViewerResize(event: MouseEvent) {
        if (!isResizingViewer) return;
        const vwWidth = (event.clientX / window.innerWidth) * 100;
        viewerWidth = Math.max(
            minViewerWidth,
            Math.min(maxViewerWidth, vwWidth),
        );
    }

    function stopViewerResize() {
        isResizingViewer = false;
        document.removeEventListener("mousemove", handleViewerResize);
        document.removeEventListener("mouseup", stopViewerResize);
    }

    // Close panel immediately when navigation starts (no delay waiting for load)
    beforeNavigate(() => {
        if ($device.isMobile && panelOpen) {
            closePanel();
        }
    });

    // Subscribe to profile changes for chat
    $effect(() => {
        const unsubscribe = profile.subscribe((p) => {
            currentProfile = p;
            if (p) {
                isOwnProfile = p.owner_id === user.getId();
                userLanguage = p.language || "en";
                if ($page.url.pathname.startsWith("/med")) {
                    ui.emit("chat:navigation", {
                        route: $page.route.id || "/",
                        profileId: p.id,
                        profileName: p.fullName || "Unknown",
                    });
                }
            }
        });
        return unsubscribe;
    });

    onMount(() => {
        logger.ui.info("UI mounted");
        device.init();
        initTheme();

        // Android hardware back button: lower the open layer instead of exiting the app
        let backButtonHandle: Promise<{ remove: () => void }> | null = null;
        if (isNativePlatform()) {
            backButtonHandle = App.addListener("backButton", () => {
                if (panelOpen) closePanel();
                else if ($chatIsOpen) chatActions.close();
                else history.back();
            });
        }

        // Mobile: the chat is a layer of the living bar — keep the sheet and the chat store in sync
        const offChat = chatIsOpen.subscribe((open) => {
            if (!$device.isMobile) return;
            if (open && !chatSheetOpen) openPanel("chat");
            else if (!open && chatSheetOpen) closePanel();
        });

        const offs = [
            ui.listen("modal.healthProperty", (config: any) => {
                logger.ui.debug(
                    "modal.healthProperty event received with config:",
                    config,
                );
                dialogs.healthProperty =
                    config === false ? false : config || true;
            }),
            ui.listen("modal.healthForm", (config: any) => {
                logger.ui.debug(
                    "modal.healthForm event received with config:",
                    config,
                );
                dialogs.healthForm = config === false ? false : config || true;
                dialogs.healthFormData = config?.data || $profile?.health || {};
            }),
            // Import lives inline on the Documents page; every entry point lands there
            ui.listen("overlay.import", (request: any = true) => {
                if (!request) return;
                logger.ui.debug("import");
                const params = new URLSearchParams({ import: "1" });
                if (typeof request === "object" && request.jobId) params.set("job", request.jobId);
                if (typeof request === "object" && request.autoOpen) params.set("autoOpen", "1");
                goto($profile?.id ? `${profileBase}/documents?${params}` : "/med/p/");
            }),
            ui.listen("viewer:close", () => {
                if ($device.isMobile) closePanel();
                else $uiState.viewer = false;
                // Explicit close — bypass the 5s grace period, destroy Viewer immediately
                destroyViewerNow();
            }),
            ui.listen("viewer:anatomy", () => {
                exploreView = "anatomy";
                if ($device.isMobile) openPanel("explore");
                else $uiState.viewer = true;
            }),
            ui.listen("viewer:timeline", (highlight: any) => {
                exploreView = "timeline";
                viewerSignalHighlight = highlight;
                if ($device.isMobile) openPanel("explore");
                else $uiState.viewer = true;
            }),
            // Nav events: mobile opens/toggles panel, desktop uses existing behaviour
            ui.listen("nav:profiles", () => {
                if ($device.isMobile) {
                    if (profilesOpen) closePanel();
                    else openPanel("profiles");
                } else goto("/med/p/");
            }),
            ui.listen("nav:anatomy", () => {
                if ($device.isMobile) openPanel("explore");
                else $uiState.viewer = true;
            }),
            shortcuts.listen("Escape", () => {
                if (panelOpen) closePanel();
            }),
        ];

        const handleBeforeUnload = () => {
            chatManager.saveCurrentConversation();
        };
        window.addEventListener("beforeunload", handleBeforeUnload);

        return () => {
            offChat();
            offs.forEach((off) => off());
            device.destroy();
            window.removeEventListener("beforeunload", handleBeforeUnload);
            if (backButtonHandle) backButtonHandle.then((h) => h.remove());
        };
    });
</script>

{#snippet exploreSwitch()}
    <div class="explore-switch" role="group" aria-label={$t("app.nav.explore")}>
        <button class:-active={exploreView === "anatomy"} aria-pressed={exploreView === "anatomy"} onclick={showAnatomy}>
            {$t("viewer.panels.anatomy")}
        </button>
        <button class:-active={exploreView === "timeline"} aria-pressed={exploreView === "timeline"} onclick={showTimeline}>
            {$t("viewer.panels.timeline")}
        </button>
    </div>
{/snippet}

<DropFiles>
    <!--
        MOBILE: living bar — floating pill, bottom-anchored.
        The pill grows upward when a layer opens, so the bar rides on top of it.
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
        class:-snapping={isSnappingPanel}
        class:-native={isNativePlatform()}
        style="height: calc(var(--toolbar-height) + 2rem + {panelHeight}px); --kb: {chatSheetOpen ? $keyboardHeight : 0}px"
        bind:this={navbarWrapEl}
    >
        <!-- Avatar floats above the pill — outside overflow:hidden boundary -->
        <button
            class="nav-avatar"
            onclick={handleAvatarClick}
            aria-label={$t("app.nav.overview")}
        >
            <ProfileImage profile={$profile} size={5} />
        </button>

        <!-- Inner pill: clips the panel -->
        <div class="navbar-inner">
            <nav class="navbar-bar toolbar" aria-label="Main navigation">
                <!-- Left: pages -->
                <a
                    class="nav-icon"
                    class:-active={docsActive}
                    href={$profile?.id ? `${profileBase}/documents` : "/med/p/"}
                    aria-current={docsActive ? "page" : undefined}
                >
                    <span class="nav-glyph">
                        <svg aria-hidden="true"><use href="/icons.svg#report"></use></svg>
                        {#if importProgress !== null}
                            <svg class="import-ring" viewBox="0 0 34 34" aria-hidden="true">
                                <circle cx="17" cy="17" r="15" class="-track" />
                                <circle
                                    cx="17" cy="17" r="15" class="-fill"
                                    stroke-dasharray={RING_CIRCUMFERENCE}
                                    stroke-dashoffset={RING_CIRCUMFERENCE * (1 - importProgress / 100)}
                                />
                            </svg>
                        {:else if $pendingJobs.length > 0}
                            <span class="import-dot" aria-hidden="true"></span>
                        {/if}
                    </span>
                    <span class="nav-label">{$t("app.nav.docs")}</span>
                </a>
                <a
                    class="nav-icon"
                    class:-active={doctorsActive}
                    href={$profile?.id ? `${profileBase}/contacts` : "/med/p/"}
                    aria-current={doctorsActive ? "page" : undefined}
                >
                    <span class="nav-glyph">
                        <svg aria-hidden="true"><use href="/icons.svg#doctor"></use></svg>
                    </span>
                    <span class="nav-label">{$t("app.nav.doctors")}</span>
                </a>
                <div class="nav-avatar-slot"></div>
                <!-- Right: layers — the open layer's button becomes its Close -->
                <button
                    class="nav-icon -layer"
                    class:-open={exploreOpen}
                    class:-disabled={!isProfileActive}
                    onclick={isProfileActive ? handleExplore : undefined}
                    aria-label={exploreOpen ? `${$t("app.nav.close")} ${$t("app.nav.explore")}` : $t("app.nav.explore")}
                    aria-expanded={exploreOpen}
                >
                    <span class="nav-glyph">
                        <svg aria-hidden="true"><use href="/icons.svg#{exploreOpen ? 'close' : 'medical-tools'}"></use></svg>
                    </span>
                    <span class="nav-label">{exploreOpen ? $t("app.nav.close") : $t("app.nav.explore")}</span>
                </button>
                <button
                    class="nav-icon -layer"
                    class:-open={chatSheetOpen}
                    onclick={handleAsk}
                    aria-label={chatSheetOpen ? $t("app.chat.actions.close") : "AI Chat"}
                    aria-expanded={chatSheetOpen}
                >
                    <span class="nav-glyph">
                        <svg aria-hidden="true"><use href="/icons.svg#{chatSheetOpen ? 'close' : 'ai-chat'}"></use></svg>
                    </span>
                    <span class="nav-label">{chatSheetOpen ? $t("app.nav.close") : $t("app.nav.ask")}</span>
                </button>
            </nav>
            <button
                class="navbar-name"
                class:-open={profilesOpen}
                onclick={handleNameClick}
                aria-expanded={profilesOpen}
                title={$t("app.nav.switch-profile")}
            >
                {$profile?.fullName ?? ""}
                <svg aria-hidden="true"><use href="/icons.svg#arrow-nav-down"></use></svg>
            </button>

            <div
                class="panel-section"
                class:-anatomy={anatomyFullscreen}
                class:-chat={panelView === "chat"}
            >
                {#if panelView === "profiles"}
                    <NavPanelProfiles
                        onSelectProfile={(id) => {
                            closePanel();
                            goto(`/med/p/${id}`);
                        }}
                        onClose={closePanel}
                    />
                {:else if panelView === "explore"}
                    {#if viewerAlive}
                        <Viewer signalHighlight={viewerSignalHighlight} fullscreen={anatomyFullscreen} />
                    {/if}
                {/if}
                <!-- Mobile chat lives in the sheet; it stays mounted because it owns the chat listeners -->
                {#if $device.isMobile && $page.url.pathname.startsWith("/med")}
                    <AIChatSidebar variant="sheet" {currentProfile} {isOwnProfile} {userLanguage} />
                {/if}
            </div>

            {#if exploreOpen}
                {@render exploreSwitch()}
            {/if}
        </div>
    </div>

    <NavBar />

    <main
        class="layout"
        class:-viewer={$uiState.viewer && !$device.isMobile}
        class:chat-open={$chatIsOpen && $page.url.pathname.startsWith("/med")}
    >
        {#if viewerAlive && !$device.isMobile}
            <section
                class="layout-viewer"
                style="width: {$uiState.viewer ? viewerWidth : 0}vw"
            >
                {#if $uiState.viewer}
                    {@render exploreSwitch()}
                {/if}
                <div class="layout-viewer-body">
                    <Viewer signalHighlight={viewerSignalHighlight} />
                </div>
                {#if $uiState.viewer}
                    <button
                        class="viewer-resize-handle"
                        onmousedown={startViewerResize}
                        aria-label="Resize viewer sidebar"
                    ></button>
                {/if}
            </section>
        {/if}
        <section class="layout-content">{@render children?.()}</section>
    </main>

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

    {#if !$device.isMobile && $page.url.pathname.startsWith("/med")}
        <AIChatSidebar {currentProfile} {isOwnProfile} {userLanguage} />
    {/if}
</DropFiles>

<Sounds />

<style>
    /* ═══════════════════════════════════════════════════════════
       MOBILE: floating pill
       Bottom-anchored; grows UPWARD when panel opens.
       Two-layer: outer (overflow:visible) + inner (overflow:hidden).
    ═══════════════════════════════════════════════════════════ */

    /* Outer: positioning context, overflow visible so avatar can protrude */
    .navbar-outer {
        position: fixed;
        left: 1.6rem;
        right: 1.6rem;
        /* --kb lifts the chat sheet above the native keyboard (Keyboard.resize is "none") */
        bottom: calc(0.8rem + var(--kb, 0px));
        /* height is set via inline style (toolbar + panelHeight) */
        max-height: calc(
            100dvh - var(--safe-area-top, 0px) - var(--safe-area-bottom, 0px) -
                1.6rem - var(--kb, 0px)
        );
        overflow: visible;
        z-index: 1000;
        box-shadow: 0 0 3.2rem 1.6rem color-mix(in srgb, var(--color-background) 80%, transparent);
        background-color: color-mix(in srgb, var(--color-background) 60%, transparent);
        /* No transition by default (during drag); added by .-snapping */
    }

    /* On native Capacitor: respect safe-area-bottom (home indicator) */
    .navbar-outer.-native {
        bottom: calc(var(--safe-area-bottom, 0px) + var(--kb, 0px));
    }

    .navbar-outer.-snapping {
        transition: height 0.32s cubic-bezier(0.4, 0, 0.2, 1), bottom 0.25s cubic-bezier(0.4, 0, 0.2, 1);
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

    /* Avatar: absolute, centered, protrudes above pill */
    .nav-avatar {
        position: absolute;
        left: 50%;
        top: calc(var(--toolbar-height) / 2 - 4.4rem);
        transform: translateX(-50%);
        height: 8rem;
        padding: 0;
        border: none;
        background: none;
        cursor: pointer;
        z-index: 2;
        border-radius: 50%;
        z-index: 1002;
    }

    .nav-avatar :global(.avatar) {
        width: 6.4rem !important;
        height: 6.4rem !important;
        max-width: 8rem;
        max-height: 8rem;
        box-shadow: 0 0 1.6rem rgba(0, 0, 0, 0.4);
    }

    /* ── Mobile toolbar row ──────────────────────────────────── */
    .navbar-bar {
        width: 100%;
        height: var(--toolbar-height);
        flex-shrink: 0;
        border-radius: var(--radius-16, 1.6rem);
        overflow: hidden;
        --button-color: var(--color-gray-300);
        background: var(--color-gray-300);
        box-shadow:
            0 -5px 1.6rem rgba(0, 0, 0, 0.2),
            0 3px 0.3rem 0 rgba(0, 0, 0, 0.2);
        border: 1px solid rgba(255, 255, 255, 0.9);
        z-index: 1001;
    }
    .navbar-bar  > *:first-child {
        border-bottom-left-radius: var(--radius-16, 1.6rem);
    }
    .navbar-bar > *:last-child {
        border-bottom-right-radius: var(--radius-16, 1.6rem);
    }
    .nav-icon {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        gap: 0.2rem;
        padding: 0.4rem 0.2rem;
        min-width: var(--toolbar-height);
        color: var(--color-text-secondary);
        text-decoration: none;
    }

    .nav-glyph {
        position: relative;
        display: flex;
        width: 2.4rem;
        height: 2.4rem;
    }

    .nav-glyph > svg {
        width: 100%;
        height: 100%;
        fill: currentColor;
    }

    .nav-label {
        max-width: 100%;
        font-size: 1rem;
        font-weight: 700;
        line-height: 1.2;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    /* Pages: underline when current */
    .nav-icon.-active {
        color: var(--color-interactivity);
        box-shadow: inset 0 -0.3rem 0 var(--color-interactivity);
    }

    /* Layers: tinted; the open layer's button becomes a filled Close */
    .nav-icon.-layer {
        color: var(--color-highlight);
    }

    .nav-icon.-layer.-open {
        background: var(--color-highlight);
        color: var(--color-highlight-text);
    }

    /* Import progress on the Docs icon */
    .import-ring {
        position: absolute;
        inset: -0.5rem;
        width: 3.4rem;
        height: 3.4rem;
        transform: rotate(-90deg);
        pointer-events: none;
    }

    .import-ring circle {
        fill: none;
        stroke-width: 2.5;
    }

    .import-ring .-track {
        stroke: var(--color-border);
    }

    .import-ring .-fill {
        stroke: var(--color-interactivity);
        transition: stroke-dashoffset 0.4s;
    }

    .import-dot {
        position: absolute;
        top: -0.2rem;
        right: -0.4rem;
        width: 1rem;
        height: 1rem;
        border-radius: 50%;
        background: var(--color-negative);
    }

    .nav-icon.-disabled {
        opacity: 0.3;
        pointer-events: none;
    }

    .nav-avatar-slot {
        flex: 1;
        min-width: var(--toolbar-height);
    }

    .navbar-name {
        height: 2.4rem;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.4rem;
        border: none;
        color: inherit;
        cursor: pointer;
        font-size: 1.6rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        padding: 0.3rem 1.2rem;
        background-color: var(--color-gray-600);
        margin: 0 1.6rem;
        border-bottom-left-radius: var(--radius-16, 1.6rem);
        border-bottom-right-radius: var(--radius-16, 1.6rem);
        text-shadow: 0 1px 1px rgba(255, 255, 255, 0.8);
        z-index: 999;
    }

    .navbar-name > svg {
        flex-shrink: 0;
        width: 1.2rem;
        height: 1.2rem;
        fill: currentColor;
        transition: transform 0.25s;
    }

    .navbar-name.-open > svg {
        transform: rotate(180deg);
    }

    /* ── Panel section ───────────────────────────────────────── */
    .panel-section {
        flex: 1;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        padding: 0 1.6rem;
    }
    .panel-section.-anatomy {
        pointer-events: none;
        overflow: hidden;
    }
    .panel-section.-chat {
        padding: 0;
        overflow: hidden;
    }

    /* Anatomy | Timeline: segmented pill styled like the bar. In flow, so the
       view above ends where the switch starts instead of running under it. */
    .explore-switch {
        align-self: center;
        flex-shrink: 0;
        display: flex;
        gap: 0.2rem;
        margin: 0.8rem auto;
        padding: 0.3rem;
        border-radius: var(--radius-16, 1.6rem);
        background: var(--color-gray-300);
        border: 1px solid rgba(255, 255, 255, 0.9);
        box-shadow: 0 3px 0.3rem 0 rgba(0, 0, 0, 0.2);
        z-index: 1001;
    }

    .explore-switch > button {
        padding: 0.6rem 1.6rem;
        border: none;
        border-radius: var(--radius-16, 1.6rem);
        background: none;
        color: var(--color-text-secondary);
        font-size: 1.3rem;
        font-weight: 700;
        white-space: nowrap;
        cursor: pointer;
    }

    .explore-switch > button.-active {
        background: var(--color-highlight);
        color: var(--color-highlight-text);
    }

    /* Desktop viewer panel: switch on top, viewer fills the rest */
    .layout-viewer {
        display: flex;
        flex-direction: column;
    }

    .layout-viewer-body {
        position: relative;
        flex: 1;
        min-height: 0;
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
        .panel-backdrop {
            display: none;
        }
    }
</style>
