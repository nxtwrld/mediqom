<script module lang="ts">
    export interface SessionTabDefinition {
        id: string;
        labelKey: string;
        condition?: (context: SessionTabContext) => boolean;
        hasBadge?: boolean;
        getBadgeCount?: (context: SessionTabContext) => number;
    }

    export interface SessionTabContext {
        hasTranscript: boolean;
        isMobile: boolean;
        questionCount: number;
        alertCount: number;
    }

    export const SESSION_TAB_DEFINITIONS: SessionTabDefinition[] = [
        { 
            id: 'questions', 
            labelKey: 'session.tabs.questions',
            hasBadge: true,
            getBadgeCount: (ctx) => ctx.questionCount + ctx.alertCount
        },
        { 
            id: 'transcript', 
            labelKey: 'session.tabs.transcript',
            condition: (ctx) => ctx.hasTranscript
        },
        { 
            id: 'details', 
            labelKey: 'session.tabs.details'
        },
        { 
            id: 'legend', 
            labelKey: 'session.tabs.legend',
            condition: (ctx) => !ctx.isMobile
        }
    ];
</script>

<script lang="ts">
    import Tabs from '../ui/Tabs.svelte';
    import TabPanel from '../ui/TabPanel.svelte';
    import SessionQuestionsTab from './SessionQuestionsTab.svelte';
    import SessionTranscriptTab from './SessionTranscriptTab.svelte';
    import SessionDetailsTab from './SessionDetailsTab.svelte';
    import SessionLegendTab from './SessionLegendTab.svelte';
    import type { SessionAnalysis } from './types/visualization';
    import { t } from '$lib/i18n';
    import { 
        activeTab, 
        sessionViewerStore
    } from '$lib/session/stores/session-viewer-store';
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
        isMobile?: boolean;
        tabsRef?: any;
        storeInstance?: DocumentStoreInstance; // Optional isolated store instance for document viewing
        onnodeAction?: (detail: { action: string; targetId: string; reason?: string }) => void;
        onrelationshipNodeClick?: (detail: { nodeId: string }) => void;
    }

    let { 
        sessionData, 
        transcript = [], 
        selectedNode,
        selectedLink, 
        isMobile = false,
        tabsRef = $bindable(),
        storeInstance = undefined,
        onnodeAction,
        onrelationshipNodeClick 
    }: Props = $props();

    // Use isolated stores when provided, otherwise fall back to global stores
    const activeTabStore = $derived(storeInstance ? storeInstance.viewerStore.activeTab : activeTab);
    const currentActiveTab = $derived($activeTabStore);
    
    
    // Filter questions and alerts
    const questions = $derived(sessionData.nodes.actions?.filter(a => a.actionType === 'question') || []);
    const alerts = $derived(sessionData.nodes.actions?.filter(a => a.actionType === 'alert') || []);
    const hasTranscript = $derived(transcript && transcript.length > 0);
    
    // Update tab context in store when derived values change
    $effect(() => {
        const context = {
            hasTranscript,
            isMobile,
            questionCount: questions.length,
            alertCount: alerts.length
        };
        // Update the store directly to avoid TypeScript issues
        sessionViewerStore.update((state) => ({
            ...state,
            tabContext: context,
        }));
    });

    // Get visible tabs based on context from store
    const visibleTabs = $derived(() => {
        const context = $sessionViewerStore.tabContext;
        return SESSION_TAB_DEFINITIONS.filter(tab => 
            !tab.condition || tab.condition(context)
        );
    });
    
</script>

<Tabs fixedHeight={false} selectedTabId={currentActiveTab}>
    {#each visibleTabs() as tab (tab.id)}
        <TabPanel 
            id={tab.id}
            containerHeight={true}
            scrollable={true}
            layout="flex"
        >
            {#if tab.id === 'questions'}
                <SessionQuestionsTab 
                    {questions}
                    {alerts}
                />
            {:else if tab.id === 'transcript'}
                <SessionTranscriptTab conversation={transcript} />
            {:else if tab.id === 'details'}
                <SessionDetailsTab 
                    {selectedNode}
                    {selectedLink}
                    allNodes={sessionData.nodes}
                    {onnodeAction}
                    {onrelationshipNodeClick}
                    {isMobile}
                />
            {:else if tab.id === 'legend'}
                <SessionLegendTab />
            {/if}
        </TabPanel>
    {/each}
</Tabs>

<style>
    /* Tab panels inherit height and overflow from parent Tabs component */
</style>