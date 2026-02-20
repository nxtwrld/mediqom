<script lang="ts">
    import SessionTabs from './SessionTabs.svelte';
    import type { SessionAnalysis } from './types/visualization';
    import { t } from '$lib/i18n';
    import { sidebarOpen } from '$lib/session/stores/session-viewer-store';
    import type { DocumentStoreInstance } from '$lib/session/stores/session-store-manager';

    interface Props {
        sessionData: SessionAnalysis;
        transcript: {
            speaker: string;
            text: string;
            stress: string;
            urgency: string;
        }[];
        selectedNode: any | null;
        selectedLink: any | null;
        isMobile: boolean;
        sidebarWidth: number;
        tabsRef?: any;
        storeInstance?: DocumentStoreInstance; // Optional isolated store instance for document viewing
        ontabSelect?: (tabId: string) => void; // Tab selection handler from parent
        onnodeAction?: (detail: { action: string; targetId: string; reason?: string }) => void;
        onrelationshipNodeClick?: (detail: { nodeId: string }) => void;
        onToggleSidebar: () => void;
        onStartResize: (event: MouseEvent) => void;
    }

    let { 
        sessionData,
        transcript,
        selectedNode,
        selectedLink,
        isMobile,
        sidebarWidth,
        tabsRef = $bindable(),
        storeInstance = undefined,
        onnodeAction,
        onrelationshipNodeClick,
        onToggleSidebar,
        onStartResize
    }: Props = $props();

    // Use isolated stores when provided, otherwise fall back to global stores
    const sidebarOpenStore = $derived(storeInstance ? storeInstance.viewerStore.sidebarOpen : sidebarOpen);
    
    const currentSidebarOpen = $derived($sidebarOpenStore);
</script>

{#if currentSidebarOpen}
    {#if !isMobile}
        <!-- Desktop Sidebar -->
        <aside class="sidebar desktop" style="width: {sidebarWidth}px">
            <!-- Resize Handle -->
            <div
                class="resize-handle"
                onmousedown={onStartResize}
                onkeydown={(e) => { if (e.key === 'ArrowLeft') onStartResize(e as any); if (e.key === 'ArrowRight') onStartResize(e as any); }}
                role="slider"
                aria-orientation="vertical"
                aria-label="Resize sidebar"
                aria-valuenow={sidebarWidth}
                aria-valuemin={200}
                aria-valuemax={600}
                tabindex="0"
            ></div>
            
            <!-- Sidebar Header -->
            <!--header class="sidebar-header">
                <h3>{$t('session.tabs.details')}</h3>
                <button class="close-btn" onclick={onToggleSidebar}>
                    <svg><use href="/icons.svg#close" /></svg>
                </button>
            </header-->

            <!-- Tabs Content -->
            <div class="sidebar-content">
                <SessionTabs
                    bind:tabsRef
                    {sessionData}
                    {transcript}
                    {selectedNode}
                    {selectedLink}
                    {isMobile}
                    {storeInstance}
                    {onnodeAction}
                    {onrelationshipNodeClick}
                />
            </div>
        </aside>
    {:else}
        <!-- Mobile Sidebar -->
        <aside class="sidebar mobile">
            <div class="mobile-sidebar-header">
                <button class="close-btn" aria-label="Close sidebar" onclick={onToggleSidebar}>
                    <svg><use href="/icons.svg#close" /></svg>
                </button>
            </div>
            <div class="sidebar-content">
                <SessionTabs
                    bind:tabsRef
                    {sessionData}
                    {transcript}
                    {selectedNode}
                    {selectedLink}
                    {isMobile}
                    {storeInstance}
                    {onnodeAction}
                    {onrelationshipNodeClick}
                />
            </div>
        </aside>
    {/if}
{/if}

<style>
    /* Desktop Sidebar */
    .sidebar.desktop {
        position: relative;
        flex-shrink: 0;
        height: 100%;
        border-left: 1px solid var(--color-border, #e2e8f0);
        display: flex;
        flex-direction: column;
        box-shadow: -2px 0 4px rgba(0,0,0,0.05);
    }

    /* Resize Handle */
    .resize-handle {
        position: absolute;
        top: 0;
        left: 0;
        width: 4px;
        height: 100%;
        background: transparent;
        cursor: col-resize;
        z-index: 10;
        transition: background-color 0.2s ease;
    }

    .resize-handle:hover {
        background: var(--color-primary, #3b82f6);
    }

    /* Mobile Sidebar */
    .sidebar.mobile {
        position: fixed;
        bottom: 0;
        right: 0;
        left: 0;
        height: 60vh;
        max-height: 400px;
        background: var(--color-surface, #fff);
        border-top: 1px solid var(--color-border, #e2e8f0);
        border-radius: 12px 12px 0 0;
        z-index: 50;
        display: flex;
        flex-direction: column;
        animation: slideUp 0.3s ease;
    }

    @keyframes slideUp {
        from {
            transform: translateY(100%);
        }
        to {
            transform: translateY(0);
        }
    }


    .mobile-sidebar-header {
        display: flex;
        justify-content: flex-end;
        padding: 0.75rem 1rem;
        border-bottom: 1px solid var(--color-border, #e2e8f0);
    }

    .close-btn {
        padding: 0.5rem;
        border: none;
        background: transparent;
        color: var(--color-text-secondary, #6b7280);
        cursor: pointer;
        border-radius: 4px;
        transition: background-color 0.2s ease;
        font-size: 1.25rem;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .close-btn svg {
        width: 1.25rem;
        height: 1.25rem;
        fill: currentColor;
    }

    .close-btn:hover {
        background: var(--color-surface-hover, #f1f5f9);
    }

    .sidebar-content {
        flex: 1;
        height: calc(100% - var(--toolbar-height));
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }
    .sidebar :global(.tabs) {
        height: 100%;
    }
    /* Tab customization */
</style>