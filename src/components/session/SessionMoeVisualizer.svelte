<script lang="ts">
    import { onMount } from 'svelte';
    import SankeyDiagram from './SankeyDiagram.svelte';
    import QOMVisualizer from './QOMVisualizer.svelte';
    import SessionSidebar from './SessionSidebar.svelte';
    import SessionToolbar from './SessionToolbar.svelte';
    import SessionSymptomsTab from './SessionSymptomsTab.svelte';
    import SessionDiagnosisTab from './SessionDiagnosisTab.svelte';
    import SessionTreatmentsTab from './SessionTreatmentsTab.svelte';
    import shortcuts from '$lib/shortcuts';
    import type { SessionAnalysis, NodeSelectEvent, LinkSelectEvent } from './types/visualization';
    import type { D3QOMNode, D3QOMLink } from './types/qom';
    import { t } from '$lib/i18n';
    import { selectedItem, sidebarOpen, activeTab, sessionViewerActions } from '$lib/session/stores/session-viewer-store';
    import { sessionDataActions } from '$lib/session/stores/session-data-store';
    import { qomActions } from '$lib/session/stores/qom-execution-store';
    import type { DocumentStoreInstance } from '$lib/session/stores/session-store-manager';


    interface Props {
        sessionData: SessionAnalysis;
        isRealTime?: boolean;
        showLegend?: boolean;
        enableInteractions?: boolean;
        transcript?: any[];
        storeInstance?: DocumentStoreInstance; // Optional isolated store instance for document viewing
        onnodeAction?: (detail: { action: string; targetId: string; reason?: string }) => void;
    }

    let { 
        sessionData, 
        isRealTime = true, 
        showLegend = true, 
        enableInteractions = true,
        transcript = [],
        storeInstance = undefined,
        onnodeAction
    }: Props = $props();

    let selectedNodeId = $state<string | null>(null);
    let selectedLink = $state<any | null>(null);
    let focusedNodeIndex = $state<number>(-1);
    let isMobile = $state(false);
    let sidebarWidth = $state(400);
    let isResizing = $state(false);
    let tabsRef = $state<any>();
    let activeMainView = $state<string>('diagram'); // Track main area view
    
    // Store values are already reactive - no need for $derived
    // We'll use $sidebarOpen and $activeTab directly in the template
    
    // Responsive breakpoints
    const MOBILE_BREAKPOINT = 640;
    const TABLET_BREAKPOINT = 1024;
    
    // Helper function to get viewer actions (isolated or global)
    const getViewerActions = () => storeInstance?.viewerStore.actions || sessionViewerActions;
    
    // Helper function to get data actions (isolated or global)
    const getDataActions = () => storeInstance?.dataStore.actions || sessionDataActions;

    onMount(() => {
        checkViewport();
        window.addEventListener('resize', checkViewport);
        
        // Set interactivity mode in store
        getViewerActions().setInteractive(enableInteractions);
        
        // Data loading is handled by store manager when storeInstance is created
        // No additional loading needed here since isolated stores are pre-populated
        console.log("📊 SessionMoeVisualizer - using store:", storeInstance ? "isolated" : "global");
        
        // Initialize QOM for session
        if (sessionData?.sessionId) {
            qomActions.initialize(sessionData.sessionId);
            
            // QOM initialization only - no automatic simulation
        }

        // Setup keyboard shortcuts
        const off = [
            shortcuts.listen('Escape', handleClearSelection),
            shortcuts.listen('Tab', handleFocusNext),
            shortcuts.listen('Shift+Tab', handleFocusPrevious),
            shortcuts.listen('Enter', handleSelectFocused),
            shortcuts.listen('Space', handleSelectFocused)
        ];
        
        return () => {
            window.removeEventListener('resize', checkViewport);
            off.forEach(f => f());
        };
    });

    function checkViewport() {
        const width = window.innerWidth;
        const newIsMobile = width < MOBILE_BREAKPOINT;
        const newShowSidebar = width >= TABLET_BREAKPOINT;
        
        // Only update if values actually changed to prevent unnecessary re-renders
        if (newIsMobile !== isMobile) {
            isMobile = newIsMobile;
        }
        
        if (newShowSidebar !== currentSidebarOpen && !newIsMobile) {
            getViewerActions().setSidebarOpen(newShowSidebar);
        }
        
        // Auto-hide sidebar on mobile (only if changed to mobile)
        if (newIsMobile && currentSidebarOpen) {
            getViewerActions().setSidebarOpen(false);
        }
    }

    function handleNodeSelect(event: CustomEvent<NodeSelectEvent>) {
        selectedNodeId = event.detail.nodeId;
        selectedLink = null; // Clear link selection when node is selected
        
        // Use store action to atomically open sidebar and select details tab
        getViewerActions().selectDetailsTab();
    }

    function handleLinkSelect(event: CustomEvent<LinkSelectEvent>) {
        selectedLink = event.detail.link;
        selectedNodeId = null; // Clear node selection when link is selected
        
        // Use store action to atomically open sidebar and select details tab
        getViewerActions().selectDetailsTab();
    }

    // QOM event handlers
    function handleQOMNodeSelect(node: D3QOMNode) {
        selectedNodeId = node.id;
        selectedLink = null;
        
        // Use store action to atomically open sidebar and select details tab
        getViewerActions().selectDetailsTab();
    }

    function handleQOMLinkSelect(link: D3QOMLink) {
        selectedLink = {
            id: link.id,
            type: link.type,
            source: link.source,
            target: link.target,
            strength: link.strength
        };
        selectedNodeId = null;
        
        // Use store action to atomically open sidebar and select details tab
        getViewerActions().selectDetailsTab();
    }

    function handleNodeAction(detail: { action: string; targetId: string; reason?: string }) {
        onnodeAction?.(detail);
    }

    function handleRelationshipNodeClick(detail: { nodeId: string }) {
        // Find the node data and select it properly using store actions
        const node = getDataActions().findNodeById(detail.nodeId);
        if (node) {
            getViewerActions().selectItem('node', detail.nodeId, node);
        }
        selectedNodeId = detail.nodeId;
        
        // Use store action to atomically open sidebar and select details tab
        getViewerActions().selectDetailsTab();
    }

    function handleClearSelection() {
        const hadNodeSelection = selectedNodeId !== null;
        const hadLinkSelection = selectedLink !== null;
        const hadFocus = focusedNodeIndex !== -1;
        
        selectedNodeId = null;
        selectedLink = null;
        focusedNodeIndex = -1;
        
        // Also clear the unified selection system via SankeyDiagram
        const navFunctions = (window as any).sankeyNavigationFunctions;
        if (navFunctions?.clearSelection) {
            navFunctions.clearSelection();
        }
        
        // console.log('🎹 Selection and focus cleared via Escape key');
    }

    function handleSelectionClear() {
        const hadNodeSelection = selectedNodeId !== null;
        const hadLinkSelection = selectedLink !== null;
        
        selectedNodeId = null;
        selectedLink = null;
        
        // Also clear the unified selection system (SankeyDiagram handles this internally)
        
        // console.log('🖱️ Selection cleared via canvas click');
    }

    function handleFocusNext() {
        const navFunctions = (window as any).sankeyNavigationFunctions;
        if (navFunctions?.focusNext) {
            navFunctions.focusNext();
        } else {
            console.warn('🎹 Tab navigation not available - navFunctions not found');
        }
    }

    function handleFocusPrevious() {
        const navFunctions = (window as any).sankeyNavigationFunctions;
        if (navFunctions?.focusPrevious) {
            navFunctions.focusPrevious();
        } else {
            console.warn('🎹 Shift+Tab navigation not available - navFunctions not found');
        }
    }

    function handleSelectFocused() {
        const navFunctions = (window as any).sankeyNavigationFunctions;
        if (navFunctions?.selectFocused) {
            navFunctions.selectFocused();
        } else {
            console.warn('🎹 Enter/Space selection not available - navFunctions not found');
        }
    }

    function handleFocusChange(event: CustomEvent<{ index: number }>) {
        focusedNodeIndex = event.detail.index;
        // focus index updated
    }

    function toggleSidebar() {
        getViewerActions().toggleSidebar();
    }
    
    function handleTabSelect(tabId: string) {
        getViewerActions().setActiveTab(tabId);
        // TabPanel components automatically react to store changes via $effect
    }
    
    function handleMainViewSelect(viewId: string) {
        activeMainView = viewId;
        // Future: Handle switching between different main views
        // For now, we only have 'diagram'
    }

    // Handlers for list tab selections
    function handleSymptomSelect(symptomId: string) {
        selectedNodeId = symptomId;
        selectedLink = null;
        getViewerActions().selectDetailsTab();
    }

    function handleDiagnosisSelect(diagnosisId: string) {
        selectedNodeId = diagnosisId;
        selectedLink = null;
        getViewerActions().selectDetailsTab();
    }

    function handleTreatmentSelect(treatmentId: string) {
        selectedNodeId = treatmentId;
        selectedLink = null;
        getViewerActions().selectDetailsTab();
    }
    

    // Handle sidebar resize
    function startResize(event: MouseEvent) {
        if (isMobile) return;
        isResizing = true;
        document.addEventListener('mousemove', handleResize);
        document.addEventListener('mouseup', stopResize);
        event.preventDefault();
    }

    function handleResize(event: MouseEvent) {
        if (!isResizing) return;
        
        const newWidth = window.innerWidth - event.clientX;
        sidebarWidth = Math.max(320, Math.min(600, newWidth));
    }

    function stopResize() {
        isResizing = false;
        document.removeEventListener('mousemove', handleResize);
        document.removeEventListener('mouseup', stopResize);
    }

    // Get counts for mobile header display only
    const questionCount = $derived(sessionData.nodes.actions?.filter(a => a.actionType === 'question')?.length || 0);
    const pendingQuestions = $derived(sessionData.nodes.actions?.filter(a => a.actionType === 'question' && a.status === 'pending')?.length || 0);
    // Use the correct store instance (isolated or global)
    const selectedItemStore = $derived(storeInstance ? storeInstance.viewerStore.selectedItem : selectedItem);
    const sidebarOpenStore = $derived(storeInstance ? storeInstance.viewerStore.sidebarOpen : sidebarOpen);
    const activeTabStore = $derived(storeInstance ? storeInstance.viewerStore.activeTab : activeTab);
    
    const currentSidebarOpen = $derived($sidebarOpenStore);
    const currentSelectedItem = $derived($selectedItemStore);
    const currentActiveTab = $derived($activeTabStore);
    
    // Get selected node from viewer store (no reactive sessionData reads!)
    const selectedNode = $derived(currentSelectedItem?.type === 'node' ? currentSelectedItem.item : null);
    
    // Debug logging for selected item
    $effect(() => {
        if (currentSelectedItem) {
            console.log('📍 Selected item changed:', {
                type: currentSelectedItem.type,
                id: currentSelectedItem.id,
                hasItem: !!currentSelectedItem.item,
                itemKeys: currentSelectedItem.item ? Object.keys(currentSelectedItem.item) : [],
                storeType: storeInstance ? 'isolated' : 'global'
            });
        } else {
            console.log('📍 Selection cleared');
        }
    });

    // Note: Tab selection is now handled directly in event handlers to ensure
    // it works even when clicking the same node/link multiple times

    // Tab selection is now handled through store actions and automatic reactivity
    
    // No reactive effects needed - path calculation is handled by the store
    
    // Tab state is now managed by the SessionTabs component via store reactivity
</script>

<div class="session-visualizer" class:mobile={isMobile}>
    <!-- Desktop Toolbar -->
    {#if !isMobile}
        <SessionToolbar
            {activeMainView}
            {storeInstance}
            onToggleSidebar={toggleSidebar}
            onTabSelect={handleTabSelect}
            onMainViewSelect={handleMainViewSelect}
        />
    {/if}
    
    <!-- Mobile Header -->
    {#if isMobile}
        <header class="mobile-header">
            <div class="header-info">
                <h2>Analysis v{sessionData.analysisVersion}</h2>
                <div class="stats">
                    <span class="stat">
                        <span class="count">{questionCount}</span> {$t('session.headers.questions')}
                    </span>
                    <span class="stat">
                        <span class="count urgent">{pendingQuestions}</span> {$t('session.status.pending')}
                    </span>
                </div>
            </div>
            <div class="header-actions">
                <button class="sidebar-toggle" onclick={toggleSidebar}>
                    {currentSidebarOpen ? $t('session.actions.hide-panel') : $t('session.actions.show-panel')}
                </button>
            </div>
        </header>
    {/if}

    <div class="visualization-container">
        <!-- Main Visualization Area -->
        <div class="diagram-area">
            {#if activeMainView === 'diagram'}
                <SankeyDiagram 
                    {isMobile}
                    {storeInstance}
                    onnodeSelect={handleNodeSelect}
                    onlinkSelect={handleLinkSelect}
                    onselectionClear={handleSelectionClear}
                    onfocusChange={handleFocusChange}
                />
            {:else if activeMainView === 'qom'}
                <QOMVisualizer 
                    sessionId={sessionData.sessionId}
                    enableZoom={true}
                    enableInteractions={true}
                    onnodeSelect={handleQOMNodeSelect}
                    onlinkSelect={handleQOMLinkSelect}
                />
            {:else if activeMainView === 'symptoms'}
                <SessionSymptomsTab 
                    symptoms={sessionData.nodes.symptoms || []}
                    onsymptomSelect={handleSymptomSelect}
                />
            {:else if activeMainView === 'diagnosis'}
                <SessionDiagnosisTab 
                    diagnoses={sessionData.nodes.diagnoses || []}
                    ondiagnosisSelect={handleDiagnosisSelect}
                />
            {:else if activeMainView === 'treatments'}
                <SessionTreatmentsTab 
                    treatments={sessionData.nodes.treatments || []}
                    ontreatmentSelect={handleTreatmentSelect}
                />
            {/if}
        </div>

        <!-- Sidebar -->
        <SessionSidebar
            {sessionData}
            {transcript}
            {selectedNode}
            {selectedLink}
            {isMobile}
            {sidebarWidth}
            {storeInstance}
            bind:tabsRef
            onnodeAction={handleNodeAction}
            onrelationshipNodeClick={handleRelationshipNodeClick}
            onToggleSidebar={toggleSidebar}
            onStartResize={startResize}
        />
    </div>


    <!-- Mobile sidebar overlay -->
    {#if isMobile && currentSidebarOpen}
        <div class="mobile-overlay" onclick={toggleSidebar} role="button" tabindex="0" onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleSidebar(); }}></div>
    {/if}
</div>

<style>
    .session-visualizer {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--color-background, #f8fafc);
        overflow: hidden;
    }

    /* Mobile Header */
    .mobile-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1rem;
        background: var(--color-surface, #fff);
        border-bottom: 1px solid var(--color-border, #e2e8f0);
        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }

    .header-info h2 {
        font-size: 1.125rem;
        font-weight: 600;
        margin: 0 0 0.25rem;
        color: var(--color-text-primary, #1f2937);
    }

    .stats {
        display: flex;
        gap: 1rem;
        font-size: 0.875rem;
        color: var(--color-text-secondary, #6b7280);
    }

    .stat .count {
        font-weight: 600;
        color: var(--color-text-primary, #1f2937);
    }

    .stat .count.urgent {
        color: var(--color-error, #dc2626);
    }

    .header-actions {
        display: flex;
        gap: 0.5rem;
        align-items: center;
    }

    .sidebar-toggle {
        padding: 0.5rem 0.75rem;
        font-size: 0.875rem;
        border: 1px solid var(--color-border, #e2e8f0);
        background: var(--color-surface, #fff);
        color: var(--color-text-secondary, #6b7280);
        cursor: pointer;
        border-radius: 6px;
        transition: all 0.2s ease;
    }

    .sidebar-toggle:hover {
        background: var(--color-surface-hover, #f1f5f9);
    }

    /* Main Layout */
    .visualization-container {
        flex: 1;
        display: flex;
        position: relative;
        overflow: hidden;
    }

    .diagram-area {
        flex: 1;
        position: relative;
        overflow: auto;
        min-width: 0;
    }


    /* Mobile Overlay */
    .mobile-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.3);
        z-index: 40;
    }

    /* Mobile-specific adjustments */
    .mobile .visualization-container {
        margin-bottom: 0;
    }

    .mobile .diagram-area {
        margin: 0.5rem;
    }

    /* Responsive breakpoints 
    @media (min-width: 1024px) {
        .session-visualizer {
            flex-direction: row;
        }

        .mobile-header {
            display: none;
        }

        .visualization-container {
            flex: 1;
        }
    }*/
</style>