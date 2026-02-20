<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import SessionMoeVisualizer from '$components/session/SessionMoeVisualizer.svelte';
    import type { Document } from '$lib/documents/types.d';
    import { t } from '$lib/i18n';
    import { date, time } from '$lib/datetime';
    import { createDocumentStoreInstance } from '$lib/session/stores/session-store-manager';
    import type { DocumentStoreInstance } from '$lib/session/stores/session-store-manager';
    
    interface Props {
        data: any; // Session analysis data
        document: Document;
        key?: string;
    }
    
    let { data, document, key }: Props = $props();
    
    // Extract session analysis and metadata from new structure
    let sessionContainer = $derived(data || document?.content?.sessionAnalysis);
    let sessionAnalysis = $derived(sessionContainer?.analysis);
    let transcript = $derived(sessionContainer?.transcript || []);
    let metadata = $derived(document?.metadata || {});
    
    // Create isolated store instance for this document
    let documentStoreInstance = $state<DocumentStoreInstance | null>(null);
    
    onMount(() => {
        // Create isolated store instance for this document viewing session
        console.log("🔍 SectionSession onMount - sessionAnalysis:", !!sessionAnalysis, sessionAnalysis);
        if (sessionAnalysis) {
            documentStoreInstance = createDocumentStoreInstance(sessionAnalysis);
            console.log("📄 Document store instance created:", documentStoreInstance.id);
            
            // Debug: Check if isolated store has data
            setTimeout(() => {
                const storeData = documentStoreInstance?.dataStore.actions.getCurrentSessionData();
                console.log("🔍 Isolated store data check:", {
                    hasData: !!storeData,
                    nodeCount: storeData?.nodes ? Object.keys(storeData.nodes).length : 0,
                    symptoms: storeData?.nodes?.symptoms?.length || 0,
                    diagnoses: storeData?.nodes?.diagnoses?.length || 0
                });
            }, 100);
        } else {
            console.warn("❌ No sessionAnalysis data available for store creation");
        }
    });
    
    onDestroy(() => {
        // Clean up the store instance when component unmounts
        if (documentStoreInstance) {
            console.log("🧹 Cleaning up document store instance:", documentStoreInstance.id);
            documentStoreInstance.cleanup();
            documentStoreInstance = null;
        }
    });
    
    /*
    let duration = $derived(() => {
        const seconds = metadata.duration || 0;
        const minutes = Math.floor(seconds / 60000); // Convert from milliseconds
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        
        if (hours > 0) {
            return `${hours}h ${remainingMinutes}m`;
        }
        return `${minutes}m`;
    });*/
    
    // Check if we have valid session data
    let hasSessionData = $derived(!!sessionAnalysis?.nodes);
    
    // Debug reactive state
    $effect(() => {
        console.log("🔄 Reactive state:", {
            hasSessionData,
            hasStoreInstance: !!documentStoreInstance,
            storeInstanceId: documentStoreInstance?.id
        });
    });
</script>

<h3 class="h3 heading -sticky">{$t('documents.session.title')} - {date(metadata.sessionDate)} - {time(metadata.sessionDate)}</h3>

<div class="section-session">
    <!--div class="session-header">
        <h2 class="session-title">{$t('documents.session.title')}</h2>
        
        {#if sessionDate()}
            <div class="session-meta">
                <div class="meta-item">
                    <span class="meta-label">{$t('documents.session.date')}:</span>
                    <span class="meta-value">{sessionDate().date}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">{$t('documents.session.time')}:</span>
                    <span class="meta-value">{sessionDate().time}</span>
                </div>
                {#if metadata.duration}
                    <div class="meta-item">
                        <span class="meta-label">{$t('documents.session.duration')}:</span>
                        <span class="meta-value">{duration()}</span>
                    </div>
                {/if}
                {#if metadata.performerName}
                    <div class="meta-item">
                        <span class="meta-label">{$t('documents.session.performer')}:</span>
                        <span class="meta-value">{metadata.performerName}</span>
                    </div>
                {/if}
                {#if metadata.analysisVersion}
                    <div class="meta-item">
                        <span class="meta-label">{$t('documents.session.version')}:</span>
                        <span class="meta-value">v{metadata.analysisVersion}</span>
                    </div>
                {/if}
            </div>
        {/if}
    </div-->
    
    {#if hasSessionData && documentStoreInstance}
        <div class="session-visualization">
            <SessionMoeVisualizer 
                sessionData={sessionAnalysis}
                isRealTime={false}
                showLegend={true}
                enableInteractions={false}
                transcript={transcript}
                storeInstance={documentStoreInstance}
            />
        </div>
    {:else if hasSessionData}
        <div class="session-visualization loading-visualization">
            <div class="loading-state">
                <div class="loading-spinner"></div>
                <p class="loading-text">Loading analysis...</p>
            </div>
        </div>
    {:else}
        <div class="no-session-data">
            <p>{$t('documents.session.noData')}</p>
        </div>
    {/if}
</div>

<style>
    .section-session {
        min-height: 600px;
        display: flex;
        flex-direction: column;
        background: var(--color-surface, #fff);
    }
    
    .session-visualization {
        flex: 1;
        position: relative;
        overflow: hidden;
        min-height: 500px;
    }
    
    .loading-visualization {
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .loading-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
        padding: 3rem;
        text-align: center;
    }
    
    .loading-spinner {
        width: 2rem;
        height: 2rem;
        border: 2px solid var(--color-border, #e2e8f0);
        border-top: 2px solid var(--color-primary, #3b82f6);
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }
    
    .loading-text {
        margin: 0;
        color: var(--color-text-secondary, #6b7280);
        font-size: 0.875rem;
    }
    
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    
    .no-session-data {
        padding: 3rem;
        text-align: center;
        color: var(--color-text-secondary, #6b7280);
    }
    
    /* Mobile responsive */
    @media (max-width: 640px) {
        .session-visualization {
            min-height: 400px;
        }
    }
</style>