<script lang="ts">
    import { t } from '$lib/i18n';
    import { 
        sidebarOpen, 
        activeTab, 
        sessionViewerStore,
        sessionViewerActions
    } from '$lib/session/stores/session-viewer-store';
    import { 
        SESSION_TAB_DEFINITIONS, 
        type SessionTabDefinition 
    } from './SessionTabs.svelte';
    import type { DocumentStoreInstance } from '$lib/session/stores/session-store-manager';
    
    interface Props {
        activeMainView?: string; // Track which view is active in main area
        onToggleSidebar: () => void;
        onTabSelect?: (tab: string) => void;
        onMainViewSelect?: (view: string) => void;
        storeInstance?: DocumentStoreInstance; // Optional isolated store instance for document viewing
    }
    
    let {
        activeMainView = 'diagram',
        onToggleSidebar,
        onTabSelect,
        onMainViewSelect,
        storeInstance = undefined
    }: Props = $props();
    
    // Helper function to get viewer actions (isolated or global)
    const getViewerActions = () => storeInstance?.viewerStore.actions || sessionViewerActions;
    
    // Use isolated stores when provided, otherwise fall back to global stores
    const sidebarOpenStore = storeInstance ? storeInstance.viewerStore.sidebarOpen : sidebarOpen;
    const activeTabStore = storeInstance ? storeInstance.viewerStore.activeTab : activeTab;
    const viewerStore = storeInstance ? storeInstance.viewerStore.sessionViewerStore : sessionViewerStore;
    
    const currentSidebarOpen = $derived($sidebarOpenStore);
    const currentActiveTab = $derived($activeTabStore);
    
    // Main area view tabs (left side)
    const mainViewTabs = $derived([
        { id: 'diagnosis', label: $t('session.tabs.diagnosis') },
        { id: 'treatments', label: $t('session.tabs.treatments') },
        { id: 'symptoms', label: $t('session.tabs.symptoms') },
        { id: 'diagram', label: $t('session.diagram') },
        { id: 'qom', label: $t('session.qom') }
    ]);
    
    // Sidebar content tabs (right side) - use shared definitions and store context
    const sidebarTabs = $derived(() => {
        const context = $viewerStore.tabContext;
        return SESSION_TAB_DEFINITIONS
            .filter(tab => !tab.condition || tab.condition(context))
            .map(tab => ({
                id: tab.id,
                label: $t(tab.labelKey),
                hasBadge: tab.hasBadge || false,
                badgeCount: tab.getBadgeCount ? tab.getBadgeCount(context) : 0
            }));
    });
    
    function handleMainViewClick(viewId: string) {
        onMainViewSelect?.(viewId);
        // Optionally close sidebar when switching main views
        // if (showSidebar) {
        //     onToggleSidebar();
        // }
    }
    
    function handleSidebarTabClick(tabId: string) {
        const viewerActions = getViewerActions();
        
        // If clicking the already active tab while sidebar is open, close the sidebar
        if (currentSidebarOpen && currentActiveTab === tabId) {
            viewerActions.toggleSidebar();
        } 
        // If sidebar is closed, open it and select the tab
        else if (!currentSidebarOpen) {
            viewerActions.setSidebarOpen(true);
            viewerActions.setActiveTab(tabId);
        } 
        // Sidebar is open but clicking a different tab, just switch tabs
        else {
            viewerActions.setActiveTab(tabId);
        }
    }
</script>

<div class="session-toolbar-tabs">
    <!-- Main View Tabs (controls main area content) -->
    <div class="tab-group-main">
        {#each mainViewTabs as tab}
            <button 
                class="tab-head main-view-tab"
                class:-active={activeMainView === tab.id}
                onclick={() => handleMainViewClick(tab.id)}
                title={tab.label}
            >
                {tab.label}
            </button>
        {/each}
    </div>
    
    <div class="tab-spacer"></div>
    
    <!-- Sidebar Tabs (controls sidebar content) -->
    <div class="tab-group-sidebar">
        {#each sidebarTabs() as tab (tab.id)}
            <button 
                class="tab-head sidebar-tab"
                class:-active={currentSidebarOpen && currentActiveTab === tab.id}
                onclick={() => handleSidebarTabClick(tab.id)}
                title={currentSidebarOpen && currentActiveTab === tab.id ? `${$t('session.actions.hide-panel')} (${tab.label})` : tab.label}
            >
                {tab.label}
                {#if tab.hasBadge && tab.badgeCount > 0}
                    <span class="badge">{tab.badgeCount}</span>
                {/if}
            </button>
        {/each}
    </div>
</div>

<style>
    .session-toolbar-tabs {
        display: flex;
        align-items: stretch;
        height: var(--toolbar-height, 48px);
        border-bottom: 1px solid var(--color-border, #e2e8f0);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        z-index: 1;
    }
    
    .tab-group-main {
        display: flex;
        align-items: stretch;
        border-right: 2px solid var(--color-border-strong, #cbd5e1);
    }
    
    .tab-spacer {
        flex: 1;
        min-width: 1rem;
        background: var(--color-surface, #fff);
    }
    
    .tab-group-sidebar {
        display: flex;
        align-items: stretch;
        gap: 0;
    }
    
    /* Visual distinction for main view tabs */
    .main-view-tab {
        background-color: var(--color-surface-alt, #f8fafc);
    }
    
    .main-view-tab.-active {
        background-color: var(--color-surface, #fff);
        border-top-color: var(--color-primary, #3b82f6);
    }
    
    .tab-head {
        position: relative;
        flex-grow: 0;
        padding: 0.5rem 1rem;
        background-color: var(--color-white);
        border: none;
        border-top: 3px solid var(--color-border);
        border-right: 1px solid var(--color-border);
        height: 100%;
        color: var(--color-text-secondary);
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        transition:
            background-color 0.3s,
            color 0.3s,
            border-color 0.3s;
        white-space: nowrap;
        min-width: 100px;
    }
    
    .tab-head:first-child {
        border-left: none;
    }
    
    .tab-head:last-child {
        border-right: 1px solid var(--color-border);
    }
    
    .tab-head:hover {
        background-color: var(--color-surface-hover);
        color: var(--color-text-primary);
    }
    
    .tab-head.-active {
        font-weight: 700;
        border-top-color: var(--color-highlight, var(--color-primary));
        color: var(--color-highlight, var(--color-primary));
        background-color: var(--color-surface);
    }
    
    .badge {
        position: absolute;
        top: 0.25rem;
        right: 0.25rem;
        background: var(--color-error, #dc2626);
        color: white;
        font-size: 0.625rem;
        font-weight: 700;
        padding: 0.125rem 0.25rem;
        border-radius: 10px;
        min-width: 1rem;
        text-align: center;
        line-height: 1;
    }
    
    
    /* Mobile adjustments */
    @media (max-width: 768px) {
        .tab-head {
            min-width: auto;
            padding: 0.5rem 0.75rem;
            font-size: 0.8125rem;
        }
        
        .session-toolbar-tabs {
            padding-right: 0.25rem;
        }
    }
    
    /* Very small screens - show only active tabs */
    @media (max-width: 480px) {
        .tab-spacer {
            min-width: 0.5rem;
        }
    
        
        .tab-group-sidebar .tab-head:not(.-active) {
            display: none;
        }
        
        .tab-group-sidebar .tab-head.-active {
            flex-grow: 1;
        }
    }
</style>