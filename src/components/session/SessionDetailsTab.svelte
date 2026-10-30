<script lang="ts">
    import NodeDetails from './NodeDetails.svelte';
    import LinkDetails from './details/LinkDetails.svelte';
    import type { SessionAnalysis } from './types/visualization';
    import { t } from '$lib/i18n';
    import { createAnalysisManager } from '$lib/session/analysis-manager';

    interface Props {
        selectedNode: any | null;
        selectedLink: any | null;
        allNodes: SessionAnalysis['nodes'];
        onnodeAction?: (detail: { action: string; targetId: string; reason?: string }) => void;
        onrelationshipNodeClick?: (detail: { nodeId: string }) => void;
        isMobile?: boolean;
    }

    let { selectedNode, selectedLink, allNodes, onnodeAction, onrelationshipNodeClick, isMobile = false }: Props = $props();

    function handleNodeAction(detail: { action: string; targetId: string; reason?: string }) {
        onnodeAction?.(detail);
    }

    function handleRelationshipNodeClick(detail: { nodeId: string }) {
        onrelationshipNodeClick?.(detail);
    }

    // Effect retained without debug logs
</script>

{#if selectedNode}
    <NodeDetails 
        node={selectedNode}
        {allNodes}
        onnodeAction={handleNodeAction}
        onrelationshipNodeClick={handleRelationshipNodeClick}
    />
{:else if selectedLink}
    <LinkDetails 
        link={selectedLink}
        {allNodes}
        onnodeSelect={(nodeId) => onrelationshipNodeClick?.({ nodeId })}
        onnodeAction={(action, targetId, reason) => onnodeAction?.({ action, targetId, reason })}
    />
{:else}
    <div class="empty-state">
        <p>{isMobile ? $t('session.empty-states.select-node') : $t('session.empty-states.select-node-diagram')}</p>
    </div>
{/if}

<style>
    .empty-state {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: var(--color-text-secondary, #6b7280);
        text-align: center;
        padding: 3.2rem;
    }

    .empty-state p {
        margin: 0;
    }
</style>