<script lang="ts">
    import type { SymptomNode, DiagnosisNode, TreatmentNode, ActionNode } from './types/visualization';
    import SymptomDetails from './details/SymptomDetails.svelte';
    import DiagnosisDetails from './details/DiagnosisDetails.svelte';
    import TreatmentDetails from './details/TreatmentDetails.svelte';
    import ActionDetails from './details/ActionDetails.svelte';
    import { t } from '$lib/i18n';

    interface Props {
        node: SymptomNode | DiagnosisNode | TreatmentNode | ActionNode;
        allNodes: any;
        onnodeAction?: (detail: { action: string; targetId: string; reason?: string }) => void;
        onrelationshipNodeClick?: (detail: { nodeId: string }) => void;
    }

    let { node, allNodes, onnodeAction, onrelationshipNodeClick }: Props = $props();

    function handleNodeAction(action: string, targetId: string, reason?: string) {
        onnodeAction?.({
            action,
            targetId,
            reason
        });
    }

    function handleRelationshipNodeClick(nodeId: string) {
        onrelationshipNodeClick?.({ nodeId });
    }

    function getNodeType(node: any): string {
        if ('severity' in node) return 'symptom';
        if ('probability' in node) return 'diagnosis';
        if ('type' in node && ['medication', 'procedure', 'therapy', 'lifestyle', 'investigation', 'immediate', 'referral', 'supportive'].includes(node.type)) return 'treatment';
        if ('actionType' in node) return 'action';
        return 'unknown';
    }

    const nodeType = $derived(getNodeType(node));
</script>

{#if nodeType === 'symptom'}
    <SymptomDetails 
        symptom={node as SymptomNode}
        {allNodes}
        onnodeAction={handleNodeAction}
        onrelationshipNodeClick={handleRelationshipNodeClick}
    />
{:else if nodeType === 'diagnosis'}
    <DiagnosisDetails 
        diagnosis={node as DiagnosisNode}
        {allNodes}
        onnodeAction={handleNodeAction}
        onrelationshipNodeClick={handleRelationshipNodeClick}
    />
{:else if nodeType === 'treatment'}
    <TreatmentDetails 
        treatment={node as TreatmentNode}
        {allNodes}
        onnodeAction={handleNodeAction}
        onrelationshipNodeClick={handleRelationshipNodeClick}
    />
{:else if nodeType === 'action'}
    <ActionDetails 
        action={node as ActionNode}
        {allNodes}
        onnodeAction={handleNodeAction}
        onrelationshipNodeClick={handleRelationshipNodeClick}
    />
{:else}
    <div class="unknown-node">
        <p>{$t('session.empty-states.no-data')}: {nodeType}</p>
        <pre>{JSON.stringify({
            id: node?.id,
            name: (node as any)?.name,
            type: (node as any)?.type,
            value: (node as any)?.value,
            // Avoid circular references from D3 Sankey
            data: (node as any)?.data
        }, null, 2)}</pre>
    </div>
{/if}

<style>
    .unknown-node {
        padding: 1rem;
        background: var(--color-surface, #fff);
        color: var(--color-text-primary, #1f2937);
    }

    .unknown-node p {
        margin-bottom: 1rem;
        font-weight: 600;
        color: var(--color-error, #dc2626);
    }

    .unknown-node pre {
        background: var(--color-surface-2, #f8fafc);
        padding: 1rem;
        border-radius: 6px;
        border: 1px solid var(--color-border, #e2e8f0);
        overflow: auto;
        font-size: 0.875rem;
        line-height: 1.4;
    }
</style>