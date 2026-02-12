<script lang="ts">
    import { t } from '$lib/i18n';
    import SymptomNodeComponent from '../nodes/SymptomNode.svelte';
    import DiagnosisNodeComponent from '../nodes/DiagnosisNode.svelte';
    import TreatmentNodeComponent from '../nodes/TreatmentNode.svelte';
    import { sessionDataActions } from '$lib/session/stores/session-data-store';
    import { sessionViewerActions } from '$lib/session/stores/session-viewer-store';

    interface Props {
        relationships: any[];
        allNodes: any;
        onrelationshipNodeClick?: (nodeId: string) => void;
    }

    let { 
        relationships = [], 
        allNodes,
        onrelationshipNodeClick 
    }: Props = $props();

    function findNodeById(nodeId: string) {
        if (!allNodes) return null;
        
        // Search through all node arrays
        const allNodeArrays = [
            allNodes.symptoms || [],
            allNodes.diagnoses || [],
            allNodes.treatments || [],
            allNodes.actions || []
        ].flat();
        
        return allNodeArrays.find(n => n.id === nodeId) || null;
    }

    function getNodeTypeFromData(nodeData: any): string {
        if ('severity' in nodeData) return 'symptom';
        if ('probability' in nodeData) return 'diagnosis';
        if ('type' in nodeData && ['medication', 'procedure', 'therapy', 'lifestyle', 'investigation', 'immediate', 'referral', 'supportive'].includes(nodeData.type)) return 'treatment';
        if ('actionType' in nodeData) return nodeData.actionType === 'question' ? 'question' : 'alert';
        return 'unknown';
    }

    function handleRelationshipNodeClick(nodeId: string) {
        onrelationshipNodeClick?.(nodeId);
    }

    // Interactive handlers for hover functionality  
    function handleNodeHover(nodeId: string, isEntering: boolean) {
        const node = sessionDataActions.findNodeById(nodeId);
        if (node && isEntering) {
            sessionViewerActions.setHoveredItem('node', nodeId, node);
        } else if (!isEntering) {
            sessionViewerActions.setHoveredItem(null);
        }
    }
</script>

{#if relationships && relationships.length > 0}
    <section class="info-section">
        <h4>{$t('session.headers.relationships')} ({relationships.length})</h4>
        <div class="relationships">
            {#each relationships as rel}
                <div class="relationship-item">
                    <div class="relationship-header">
                        <span class="relationship-type">{$t(`session.relationships.${rel.relationship}`)}</span>
                        <span class="relationship-strength">{Math.round(rel.strength * 100)}%</span>
                        <span class="relationship-direction">{rel.direction}</span>
                    </div>
                    {#if rel.reasoning}
                        <p class="relationship-reasoning">{rel.reasoning}</p>
                    {/if}
                    <div class="relationship-target">
                        {#if findNodeById(rel.nodeId)}
                            {@const relatedNode = findNodeById(rel.nodeId)}
                            {@const nodeType = getNodeTypeFromData(relatedNode)}
                            <div 
                                class="relationship-node-wrapper"
                                role="button"
                                tabindex="0"
                                onclick={() => handleRelationshipNodeClick(rel.nodeId)}
                                onkeydown={(e) => e.key === 'Enter' && handleRelationshipNodeClick(rel.nodeId)}
                                onmouseenter={() => handleNodeHover(rel.nodeId, true)}
                                onmouseleave={() => handleNodeHover(rel.nodeId, false)}
                            >
                                {#if nodeType === 'symptom'}
                                    <SymptomNodeComponent
                                        node={{ id: relatedNode.id, x0: 0, x1: 100, y0: 0, y1: 40 } as any}
                                        symptom={relatedNode}
                                        isSelected={false}
                                        isMobile={false}
                                    />
                                {:else if nodeType === 'diagnosis'}
                                    <DiagnosisNodeComponent
                                        node={{ id: relatedNode.id, x0: 0, x1: 100, y0: 0, y1: 40 } as any}
                                        diagnosis={relatedNode}
                                        isSelected={false}
                                        isMobile={false}
                                    />
                                {:else if nodeType === 'treatment'}
                                    <TreatmentNodeComponent
                                        node={{ id: relatedNode.id, x0: 0, x1: 100, y0: 0, y1: 40 } as any}
                                        treatment={relatedNode}
                                        isSelected={false}
                                        isMobile={false}
                                    />
                                {:else}
                                    <div class="relationship-fallback">→ {relatedNode.name || relatedNode.text || rel.nodeId}</div>
                                {/if}
                            </div>
                        {:else}
                            <div class="relationship-fallback">→ {rel.nodeId} (not found)</div>
                        {/if}
                    </div>
                </div>
            {/each}
        </div>
    </section>
{/if}

<style>
    .info-section {
        margin-bottom: 1.5rem;
    }

    .info-section h4 {
        margin: 0 0 0.75rem;
        font-size: 1rem;
        font-weight: 600;
        color: var(--color-text-primary, #1f2937);
    }

    .relationships {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .relationship-item {

        display: flex;
        flex-direction: column;
        gap: var(--gap);
    }

    .relationship-header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem;
        background: var(--color-surface-2, #f8fafc);
    }

    .relationship-type {
        font-weight: 600;
        color: var(--color-primary, #3b82f6);
    }

    .relationship-strength {
        font-size: 0.875rem;
        color: var(--color-success, #10b981);
        font-weight: 500;
    }

    .relationship-direction {
        font-size: 0.75rem;
        padding: 0.125rem 0.375rem;
        background: var(--color-info-bg, #dbeafe);
        color: var(--color-info, #3b82f6);
        border-radius: 10px;
    }


    .relationship-node-wrapper {
        cursor: pointer;
        transition: all 0.2s ease;
        border-radius: 6px;
        padding: 2px;
    }

    .relationship-node-wrapper:hover {
        background-color: var(--color-primary-bg, #dbeafe);
        transform: translateX(2px);
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .relationship-node-wrapper:focus {
        outline: 2px solid var(--color-primary, #3b82f6);
        outline-offset: 2px;
    }

    .relationship-fallback {
        font-family: monospace;
        font-size: 0.875rem;
        color: var(--color-text-secondary, #6b7280);
        padding: 0.5rem;
        background: var(--color-surface-2, #f8fafc);
        border-radius: 4px;
        border: 1px dashed var(--color-border, #e2e8f0);
    }

    .relationship-reasoning {
        background: var(--color-surface-2, #f8fafc);
        padding: .5rem;
        font-size: 0.875rem;
        color: var(--color-text-primary, #1f2937);
        line-height: 1.4;
    }
</style>