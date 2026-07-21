<script lang="ts">
    import NavBar from "$components/layout/NavBar.svelte";
    import NavPanelProfiles from "$components/layout/NavPanelProfiles.svelte";
    import ProfileImage from "$components/profile/ProfileImage.svelte";
    import DropFiles from "$components/import/DropFiles.svelte";
    import Modal from "$components/ui/Modal.svelte";
    import HealthForm from "../profile/HealthForm.svelte";
    import HealthProperty from "../healthProperty/Overview.svelte";
    import ImportView from "$components/import/ImportView.svelte";
    import ui from "$lib/ui";
    import { t } from "$lib/i18n";
    import { isFeatureEnabled } from "$lib/config/feature-flags";
    import { onMount } from "svelte";
    import { fade } from "svelte/transition";
    import { afterNavigate, beforeNavigate, goto } from "$app/navigation";
    import { Overlay, state as uiState } from "$lib/ui";
    import shortcuts from "$lib/shortcuts";
    import Sounds from "$components/ui/Sounds.svelte";
    import Viewer from "./Viewer.svelte";
    import { logger } from "$lib/logging/logger";
    import AIChatSidebar from "$components/chat/AIChatSidebar.svelte";
    import { profile } from "$lib/profiles";
    import { page } from "$app/stores";
    import { chatManager } from "$lib/chat/chat-manager";
    import type { Profile } from "$lib/types.d";
    import { isOpen as chatIsOpen } from "$lib/chat/store";
    import { device } from "$lib/device";
    import { initTheme } from "$lib/theme/store";
    import { saveHealthProfile } from "$lib/health/save";
    import user from "$lib/user";
    import { pendingJobs, activeJobs } from "$lib/import/job-store";
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

    // Import overlay state
    let importJobId: string | undefined = $state(undefined);
    let importAutoOpen = $state(false);
    // importHasFiles removed — ImportView handles file state internally

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
            (panelOpen && panelView === "anatomy") ||
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
    type PanelView = "profiles" | "anatomy" | "import";
    let panelView = $state<PanelView>("profiles");
    let panelHeight = $state(0);
    let panelOpen = $derived(panelHeight > 0);
    let isSnappingPanel = $state(false);
    let navbarWrapEl = $state<HTMLElement | undefined>(undefined);
    let navbarBarEl = $state<HTMLElement | undefined>(undefined);

    function handleAvatarClick() {
        ui.emit("nav:profiles");
    }

    // ── Mobile toolbar handlers ──────────────────────────────────────────────
    function isActive(path: string): boolean {
        if ($uiState.overlay !== Overlay.none) return false;
        return $page.url.pathname.startsWith(path);
    }

    let mobileToolsOpen = $state(false);
    let mobileDocsOpen = $state(false);

    // Either popup can contribute to the bottom offset
    let anyPopupOpen = $derived(mobileToolsOpen || mobileDocsOpen);
    let toolsExtraHeight = $derived(!anyPopupOpen || panelOpen ? 0 : mobileDocsOpen ? 160 : 80);

    function closeMobilePopups() {
        mobileToolsOpen = false;
        mobileDocsOpen = false;
    }

    function handleAnatomyMobile(e: MouseEvent) {
        e.stopPropagation();
        isSnappingPanel = true;
        mobileDocsOpen = false;
        const opening = !mobileToolsOpen;
        mobileToolsOpen = opening;
        if (opening && panelOpen && panelView !== "anatomy") {
            closePanel();
        }
    }

    function handleDocsMobile(e: MouseEvent) {
        e.stopPropagation();
        isSnappingPanel = true;
        mobileToolsOpen = false;
        const opening = !mobileDocsOpen;
        mobileDocsOpen = opening;
        if (opening && panelOpen && panelView !== "anatomy") {
            closePanel();
        }
    }

    function handleMobileOpenAnatomy(e: MouseEvent) {
        e.stopPropagation();
        closeMobilePopups();
        ui.emit("viewer:anatomy", true);
        openPanel("anatomy");
    }

    function handleMobileOpenTimeline(e: MouseEvent) {
        e.stopPropagation();
        closeMobilePopups();
        ui.emit("viewer:timeline", null);
        openPanel("anatomy");
    }

    let importBadge = $derived($pendingJobs.length + $activeJobs.length);

    function handleImportMobile(e: MouseEvent) {
        e.stopPropagation();
        ui.emit("nav:import");
    }
    function handleMobileChatToggle() {
        ui.emit("chat:toggle");
    }

    const MAX_PANEL_HEIGHT: Record<PanelView, () => number> = {
        profiles: () => Math.round(Math.min(window.innerHeight * 0.65, 380)),
        anatomy: () => Math.round(window.innerHeight * 0.82),
        import: () => Math.round(window.innerHeight * 0.88),
    };

    // Fullscreen anatomy canvas
    let panelSectionEl = $state<HTMLElement | undefined>(undefined);
    let anatomyViewportRect = $state<{ x: number; y: number; width: number; height: number } | null>(null);
    let anatomyFullscreen = $derived($device.isMobile && panelView === 'anatomy');

    // Compute viewportRect: area above the floating pill (navbar-outer).
    // Use window.innerHeight minus safe-area-top, pill height, and bottom gap
    // rather than getBoundingClientRect() which can be unreliable during layout.
    /*
    function computeAnatomyViewportRect() {
        if (!navbarBarEl) return null;
        const style = getComputedStyle(document.documentElement);
        const safeTop = parseFloat(style.getPropertyValue('--safe-area-top')) || 0;
        const safeBottom = parseFloat(style.getPropertyValue('--safe-area-bottom')) || 0;
        const rem = parseFloat(style.fontSize);
        // Use only the toolbar row height (excludes expanded panel content)
        const toolbarH = navbarBarEl.offsetHeight;
        // bottom inset: native uses safe-area-bottom, web uses 0.5rem
        const bottomGap = safeBottom > 0 ? safeBottom : 0.5 * rem;
        const height = window.innerHeight - safeTop - toolbarH - bottomGap;
        const rect = { x: 0, y: safeTop, width: window.innerWidth, height };

        return rect;
    }

    $effect(() => {
        
        const el = panelSectionEl;
        void panelHeight; // track drag changes
        if (!el || !anatomyFullscreen) {
            anatomyViewportRect = null;
            return;
        }

        function updateRect() {
            anatomyViewportRect = computeAnatomyViewportRect();
        }

        //updateRect();
        
        const ro = new ResizeObserver(updateRect);
        ro.observe(el);
        return () => ro.disconnect();
    });
    */

    // Touch drag tracking (plain vars, not reactive)
    let panelTouchStartY = 0;
    let panelStartHeight = 0;
    let isDraggingPanel = false;
    let panelTouchActive = false; // true only when touch started outside .panel-section

    function openPanel(view?: PanelView) {
        if (view) panelView = view;
        closeMobilePopups();
        isSnappingPanel = true;
        panelHeight = MAX_PANEL_HEIGHT[panelView]();
    }

    function closePanel() {
        isSnappingPanel = true;
        panelHeight = 0;
    }

    function onPanelTouchStart(e: TouchEvent) {
        const target = e.target as HTMLElement;
        // Only block drag when panel is open and touch is inside panel content.
        // When panel is closed, allow drag from anywhere on the pill (including .panel-section itself).
        if (panelHeight > 0 && target.closest(".panel-section")) {
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
        isSnappingPanel = true;
        const maxH = MAX_PANEL_HEIGHT[panelView]();
        const willClose = panelHeight <= maxH * 0.3;
        panelHeight = willClose ? 0 : maxH;
        // Swipe-down on anatomy panel — destroy viewer immediately (no grace period)
        if (willClose && panelView === 'anatomy') {
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
            if ($device.isMobile) {
                document.documentElement.style.setProperty(
                    "--mobile-viewer-height",
                    `${mobileViewerHeight}vh`,
                );
            }
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
        mobileViewerHeight = Math.max(
            25,
            Math.min(90, mobileResizeStartHeight + deltaPercent),
        );
    }

    function handleMobileResizeEnd() {
        isMobileResizing = false;
    }

    // Close panel immediately when navigation starts (no delay waiting for load)
    beforeNavigate(() => {
        if ($device.isMobile && panelOpen) {
            closePanel();
        }
    });

    // Manage overlay state after navigation completes
    afterNavigate(() => {
        manageOverlay();
    });

    function manageOverlay() {
        // Only close overlay when hash is cleared (back button / escape)
        if (location.hash.indexOf("#overlay-") !== 0 && $uiState.overlay !== Overlay.none) {
            $uiState.overlay = Overlay.none;
        }
    }

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

        // Android hardware back button: close overlay instead of exiting app
        let backButtonHandle: Promise<{ remove: () => void }> | null = null;
        if (isNativePlatform()) {
            backButtonHandle = App.addListener("backButton", () => {
                if ($uiState.overlay !== null && $uiState.overlay !== "none") {
                    location.hash = "";
                }
            });
        }

        document.addEventListener("touchmove", handleMobileResizeMove, {
            passive: false,
        });
        document.addEventListener("touchend", handleMobileResizeEnd);

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
            ui.listen("overlay.import", (state: any = true) => {
                logger.ui.debug("import");
                if (state && typeof state === "object" && state.jobId) {
                    importJobId = state.jobId;
                    importAutoOpen = false;
                } else {
                    importJobId = undefined;
                    importAutoOpen = !!(
                        state &&
                        typeof state === "object" &&
                        state.autoOpen
                    );
                }
                if (state) {
                    location.hash = "#overlay-import";
                    $uiState.overlay = Overlay.import;
                } else {
                    importJobId = undefined;
                    importAutoOpen = false;
                    $uiState.overlay = Overlay.none;
                    if (location.hash.indexOf("#overlay-") == 0) {
                        history.back();
                    }
                }
            }),
            ui.listen("viewer:close", () => {
                if ($device.isMobile) closePanel();
                else $uiState.viewer = false;
                // Explicit close — bypass the 5s grace period, destroy Viewer immediately
                if (viewerMountTimer !== null) {
                    clearTimeout(viewerMountTimer);
                    viewerMountTimer = null;
                }
                if (viewerUnloadTimer !== null) {
                    clearTimeout(viewerUnloadTimer);
                    viewerUnloadTimer = null;
                }
                viewerAlive = false;
            }),
            ui.listen("viewer:anatomy", () => {
                if ($device.isMobile) openPanel("anatomy");
                else $uiState.viewer = true;
            }),
            ui.listen("viewer:timeline", (highlight: any) => {
                viewerSignalHighlight = highlight;
                if ($device.isMobile) openPanel("anatomy");
                else $uiState.viewer = true;
            }),
            // Nav events: mobile opens/toggles panel, desktop uses existing behaviour
            ui.listen("nav:profiles", () => {
                if ($device.isMobile) {
                    if (panelOpen && panelView === "profiles") closePanel();
                    else openPanel("profiles");
                } else goto("/med/p/");
            }),
            ui.listen("nav:anatomy", () => {
                if ($device.isMobile) openPanel("anatomy");
                else $uiState.viewer = true;
            }),
            ui.listen("nav:import", () => {
                if ($device.isMobile) openPanel("import");
                else ui.emit("overlay.import", true);
            }),
            shortcuts.listen("Escape", () => {
                if (location.hash.indexOf("#overlay-") == 0) {
                    history.back();
                }
            }),
        ];

        const handleWindowClick = () => {
            closeMobilePopups();
        };
        window.addEventListener("click", handleWindowClick);

        const handleBeforeUnload = () => {
            chatManager.saveCurrentConversation();
        };
        window.addEventListener("beforeunload", handleBeforeUnload);

        manageOverlay();

        return () => {
            offs.forEach((off) => off());
            device.destroy();
            window.removeEventListener("click", handleWindowClick);
            window.removeEventListener("beforeunload", handleBeforeUnload);
            document.removeEventListener("touchmove", handleMobileResizeMove);
            document.removeEventListener("touchend", handleMobileResizeEnd);
            if (backButtonHandle) backButtonHandle.then((h) => h.remove());
        };
    });
</script>

<svelte:window onhashchange={manageOverlay} />

<DropFiles>
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
        class:-anatomy={anatomyFullscreen}
        onclick={closePanel}
        aria-hidden="true"
    ></div>

    <div
        class="navbar-outer"
        class:-snapping={isSnappingPanel}
        class:-native={isNativePlatform()}
        style="height: calc(var(--toolbar-height) + 1.25rem + {panelHeight}px); --tools-offset: {toolsExtraHeight}px"
        bind:this={navbarWrapEl}
    >
        <!-- Avatar floats above the pill — outside overflow:hidden boundary -->
        <button
            class="nav-avatar"
            onclick={handleAvatarClick}
            aria-label={$profile?.fullName ?? "Profile"}
        >
            <ProfileImage profile={$profile} size={5} />
        </button>

        <!-- Inner pill: clips the panel -->
        <div class="navbar-inner">
            <nav class="navbar-bar toolbar" aria-label="Main navigation" bind:this={navbarBarEl}>
                <button
                    class="nav-icon"
                    class:-active={!!$profile?.id && (
                        isActive(`/med/p/${$profile.id}/documents`) ||
                        isActive(`/med/p/${$profile.id}/medications`)
                    )}
                    onclick={handleDocsMobile}
                    aria-label={$t("app.nav.documents")}
                >
                    <svg aria-hidden="true"
                        ><use href="/icons.svg#report"></use></svg
                    >
                </button>
                <button
                    class="nav-icon"
                    class:-disabled={!isProfileActive}
                    onclick={isProfileActive ? handleAnatomyMobile : undefined}
                    aria-label={$t("app.nav.anatomy-model")}
                >
                    <svg aria-hidden="true"
                        ><use href="/icons.svg#medical-tools"></use></svg
                    >
                </button>
                <div class="nav-avatar-slot"></div>
                <button
                    class="nav-icon"
                    class:-active={$chatIsOpen}
                    onclick={handleMobileChatToggle}
                    aria-label="AI Chat"
                >
                    <svg aria-hidden="true"
                        ><use href="/icons.svg#doctor"></use></svg
                    >
                </button>
                <button
                    class="nav-icon import-btn"
                    onclick={handleImportMobile}
                    aria-label="Import"
                >
                    <svg aria-hidden="true"
                        ><use href="/icons.svg#plus"></use></svg
                    >
                    {#if importBadge > 0}
                        <span class="badge">{importBadge}</span>
                    {/if}
                </button>
            </nav>
            <!-- Mobile tools popup — slides down from toolbar, covers navbar-name -->
            <div class="mobile-tools-popup" class:-open={mobileToolsOpen}>
                <button onclick={handleMobileOpenAnatomy}>
                    <svg aria-hidden="true"
                        ><use href="/icons.svg#anatomy"></use></svg
                    >
                    {$t("viewer.panels.anatomy")}
                </button>
                <button onclick={handleMobileOpenTimeline}>
                    <svg aria-hidden="true"
                        ><use href="/icons.svg#chart-line"></use></svg
                    >
                    {$t("viewer.panels.timeline")}
                </button>
            </div>
            <!-- Mobile docs popup — slides down from toolbar, same pattern as tools -->
            <div class="mobile-tools-popup" class:-open={mobileDocsOpen}>
                <a
                    href={$profile?.id ? `/med/p/${$profile.id}/documents` : "/med"}
                    onclick={() => closeMobilePopups()}
                >
                    <svg aria-hidden="true"
                        ><use href="/icons.svg#report"></use></svg
                    >
                    {$t("app.nav.documents")}
                </a>
                {#if isFeatureEnabled('MEDICATIONS')}
                <a
                    href={$profile?.id ? `/med/p/${$profile.id}/medications` : "/med"}
                    onclick={() => closeMobilePopups()}
                >
                    <svg aria-hidden="true"
                        ><use href="/icons.svg#pills"></use></svg
                    >
                    {$t("medications.title")}
                </a>
                {/if}
                <a
                    href={$profile?.id ? `/med/p/${$profile.id}/contacts` : "/med"}
                    onclick={() => closeMobilePopups()}
                >
                    <svg aria-hidden="true"
                        ><use href="/icons.svg#user"></use></svg
                    >
                    {$t("contacts.nav")}
                </a>
                <a
                    href={$profile?.id ? `/med/p/${$profile.id}/appointments` : "/med"}
                    onclick={() => closeMobilePopups()}
                >
                    <svg aria-hidden="true"
                        ><use href="/icons-o.svg#calendar"></use></svg
                    >
                    {$t("appointments.nav")}
                </a>
            </div>
            <div class="navbar-name">{$profile?.fullName ?? ""}</div>

            <div class="panel-section" class:-anatomy={anatomyFullscreen} bind:this={panelSectionEl}>
                {#if panelView === "profiles"}
                    <NavPanelProfiles
                        onSelectProfile={(id) => {
                            closePanel();
                            goto(`/med/p/${id}`);
                        }}
                        onClose={closePanel}
                    />
                {:else if panelView === "anatomy"}
                    {#if viewerAlive}
                        <Viewer signalHighlight={viewerSignalHighlight} fullscreen={anatomyFullscreen} viewportRect={anatomyViewportRect} />
                    {/if}
                {:else if panelView === "import"}
                    <ImportView oncomplete={closePanel} />
                {/if}
            </div>
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
                <Viewer signalHighlight={viewerSignalHighlight} />
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

    {#if $uiState.overlay == Overlay.import}
        <div class="virtual-page" transition:fade>
            <ImportView
                expandedJobId={importJobId}
                autoOpen={importAutoOpen}
                oncomplete={() => {
                    importJobId = undefined;
                }}
            />
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

    {#if $page.url.pathname.startsWith("/med")}
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
        left: 1rem;
        right: 1rem;
        bottom: calc(0.5rem + var(--tools-offset, 0px));
        /* height is set via inline style (toolbar + panelHeight) */
        max-height: calc(
            100dvh - var(--safe-area-top, 0px) - var(--safe-area-bottom, 0px) -
                1rem
        );
        overflow: visible;
        z-index: 1000;
        box-shadow: 0 0 2rem 1rem color-mix(in srgb, var(--color-background) 80%, transparent);
        background-color: color-mix(in srgb, var(--color-background) 60%, transparent);
        /* No transition by default (during drag); added by .-snapping */
    }

    /* On native Capacitor: respect safe-area-bottom (home indicator) */
    .navbar-outer.-native {
        bottom: calc(var(--safe-area-bottom, 0px) + var(--tools-offset, 0px));
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
        top: calc(var(--toolbar-height) / 2 - 2.8rem);
        transform: translateX(-50%);
        height: 5rem;
        padding: 0;
        border: none;
        background: none;
        cursor: pointer;
        z-index: 2;
        border-radius: 50%;
        z-index: 1002;
    }

    .nav-avatar :global(.avatar) {
        width: 4rem !important;
        height: 4rem !important;
        max-width: 5rem;
        max-height: 5rem;
        box-shadow: 0 0 1rem rgba(0, 0, 0, 0.4);
    }

    /* ── Mobile toolbar row ──────────────────────────────────── */
    .navbar-bar {
        width: 100%;
        height: var(--toolbar-height);
        flex-shrink: 0;
        border-radius: var(--radius-16, 1rem);
        overflow: hidden;
        --button-color: var(--color-gray-300);
        background: var(--color-gray-300);
        box-shadow:
            0 -5px 1rem rgba(0, 0, 0, 0.2),
            0 3px 0.2rem 0 rgba(0, 0, 0, 0.2);
        border: 1px solid rgba(255, 255, 255, 0.9);
        z-index: 1001;
    }
    .navbar-bar  > *:first-child {
        border-bottom-left-radius: var(--radius-16, 1rem);
    }
    .navbar-bar > *:last-child {
        border-bottom-right-radius: var(--radius-16, 1rem);
    }
    .nav-icon {
        flex: 1;
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 0.4rem;
        min-width: var(--toolbar-height);
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
        height: 1.5rem;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        padding: 0.2rem 0.75rem;
        background-color: var(--color-gray-600);
        margin: 0 1rem;
        border-bottom-left-radius: var(--radius-16, 1rem);
        border-bottom-right-radius: var(--radius-16, 1rem);
        text-shadow: 0 1px 1px rgba(255, 255, 255, 0.8);
        z-index: 999;
    }

    /* ── Panel section ───────────────────────────────────────── */
    .panel-section {
        flex: 1;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        padding: 0 1rem;
    }
    .panel-section.-anatomy {
        pointer-events: none;
        overflow: hidden;
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

    /*.panel-backdrop.-open.-anatomy {
        background: transparent;
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
        pointer-events: none;
    }*/

    @media (min-width: 769px) {
        .panel-backdrop {
            display: none;
        }
    }

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

    /* ── Mobile tools popup ───────────────────────────────── */
    /* Absolutely positioned under the toolbar bar, overlays navbar-name.
       Slides down via max-height; z-index between bar (1001) and name (999). */
    .mobile-tools-popup {
        position: absolute;
        top: var(--toolbar-height);
        left: 0;
        right: 0;
        max-height: 0;
        overflow: hidden;
        background-color: var(--color-gray-300);
        margin: 0 1rem;
        border-bottom-left-radius: var(--radius-16, 1rem);
        border-bottom-right-radius: var(--radius-16, 1rem);
        box-shadow: 0 1px 15px rgba(0, 0, 0, 0.4);
        transition: max-height 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        z-index: 1000;
    }

    .mobile-tools-popup.-open {
        max-height: 90vh;
    }

    .mobile-tools-popup button,
    .mobile-tools-popup a {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        width: 100%;
        padding: 0.5rem 1rem;
        text-align: left;
        text-decoration: none;
        background: none;
        border: none;
        cursor: pointer;
        color: var(--color-black);
        font-size: 0.875rem;
    }
    .mobile-tools-popup button:last-child,
    .mobile-tools-popup a:last-child {
        padding-bottom: 1.5rem;
    }

    .mobile-tools-popup button > svg,
    .mobile-tools-popup a > svg {
        width: 1.25rem;
        height: 1.25rem;
        flex-shrink: 0;
        fill: currentColor;
    }

    .mobile-tools-popup button:active,
    .mobile-tools-popup a:active {
        background: rgba(0, 0, 0, 0.05);
    }

    /* ── Import button badge ─────────────────────────────────── */
    .import-btn {
        position: relative;
    }

    .badge {
        position: absolute;
        top: 0.15rem;
        right: 0.15rem;
        min-width: 1.1rem;
        height: 1.1rem;
        padding: 0 0.3rem;
        border-radius: 1rem;
        background: var(--color-negative);
        color: #fff;
        font-size: 0.65rem;
        font-weight: 700;
        line-height: 1.1rem;
        text-align: center;
        pointer-events: none;
    }
</style>
