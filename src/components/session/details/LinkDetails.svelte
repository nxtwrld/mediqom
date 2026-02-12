<script lang="ts">
    import { t } from '$lib/i18n';
    import InfoGrid from '../shared/InfoGrid.svelte';
    import NodeActions from '../shared/NodeActions.svelte';
    import QuestionsSection from '../shared/QuestionsSection.svelte';
    import AlertsSection from '../shared/AlertsSection.svelte';
    import { 
        sessionDataActions, 
        questionsForLink, 
        alertsForLink 
    } from '$lib/session/stores/session-data-store';
    import SymptomNodeComponent from '../nodes/SymptomNode.svelte';
    import DiagnosisNodeComponent from '../nodes/DiagnosisNode.svelte';
    import TreatmentNodeComponent from '../nodes/TreatmentNode.svelte';
    import type { SankeyLink, ActionNode } from '../types/visualization';

    interface Props {
        link: SankeyLink;
        allNodes: any;
        relatedActions?: ActionNode[];
        onnodeSelect?: (nodeId: string) => void;
        onnodeAction?: (action: string, targetId: string, reason?: string) => void;
        onalertAcknowledge?: (alertId: string) => void;
    }

    let { 
        link, 
        allNodes, 
        relatedActions = [], // Keep for backward compatibility
        onnodeSelect, 
        onnodeAction,
        onalertAcknowledge
    }: Props = $props();

    // Create derived stores for this specific link
    const linkQuestions = $derived(questionsForLink(link));
    const linkAlerts = $derived(alertsForLink(link));
    const relatedQuestions = $derived($linkQuestions);
    const relatedAlerts = $derived($linkAlerts);

    // Reactive stores auto-update without debug logs

    // Use reactive stores for questions and alerts - these will update automatically
    // when the selected link changes in the store

    function getRelationshipTypeLabel(type: string): string {
        return $t(`session.relationships.${type}`) || type.charAt(0).toUpperCase() + type.slice(1);
    }

    function getStrengthLabel(strength: number): string {
        if (strength >= 0.8) return $t('session.effectiveness.very-strong');
        if (strength >= 0.6) return $t('session.effectiveness.strong');
        if (strength >= 0.4) return $t('session.effectiveness.moderate');
        if (strength >= 0.2) return $t('session.effectiveness.weak');
        return $t('session.effectiveness.very-weak');
    }

    function getStrengthColor(strength: number): string {
        if (strength >= 0.8) return 'var(--color-positive, #29cc97)';
        if (strength >= 0.6) return 'var(--color-info, #a989ee)';
        if (strength >= 0.4) return 'var(--color-neutral, #3571ff)';
        if (strength >= 0.2) return 'var(--color-warning, #fec400)';
        return 'var(--color-negative, #fb104a)';
    }

    function getDirectionIcon(direction: string): string {
        switch (direction) {
            case 'bidirectional': return '↔';
            case 'incoming': return '←';
            case 'outgoing': return '→';
            default: return '→';
        }
    }

    function findNodeById(nodeId: string) {
        if (!allNodes) return null;
        
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
        if ('type' in nodeData && ['medication', 'procedure', 'therapy', 'lifestyle', 'investigation', 'immediate'].includes(nodeData.type)) return 'treatment';
        if ('actionType' in nodeData) return 'action';
        return 'unknown';
    }

    function handleNodeClick(nodeId: string) {
        onnodeSelect?.(nodeId);
    }

    function handleLinkAction(action: string) {
        const linkId = `${typeof link.source === 'object' ? link.source.id : link.source}-${typeof link.target === 'object' ? link.target.id : link.target}`;
        onnodeAction?.(action, linkId, `${action} relationship from link details`);
    }

    const sourceNode = $derived(typeof link.source === 'object' ? link.source : findNodeById(String(link.source)));
    const targetNode = $derived(typeof link.target === 'object' ? link.target : findNodeById(String(link.target)));
    const sourceData = $derived(sourceNode ? findNodeById(sourceNode.id) : null);
    const targetData = $derived(targetNode ? findNodeById(targetNode.id) : null);

    const basicInfoItems = $derived([
        { label: $t('session.labels.relationship'), value: getRelationshipTypeLabel(link.type) },
        { label: $t('session.labels.strength'), value: `${Math.round(link.strength * 100)}${$t('session.units.percent')} (${getStrengthLabel(link.strength)})` }
    ]);
</script>

<div class="session-details-panel">
    <header class="session-details-header">
        <div class="session-node-type">
            <span class="session-type-label">{$t('session.node-types.relationship')}</span>
            <span 
                class="session-priority-badge"
                style="background-color: {getStrengthColor(link.strength)}"
            >
                {getStrengthLabel(link.strength)}
            </span>
        </div>
        <h3 class="session-node-title">
            {getRelationshipTypeLabel(link.type)}
        </h3>
    </header>

    <div class="session-details-content">
      <!-- Clinical Reasoning -->
      {#if link.reasoning}
      <section class="session-info-section">
          <label>{$t('session.labels.clinical-reasoning')}:</label>
          <p class="session-reasoning-text">{link.reasoning}</p>
      </section>
  {/if}

        <!-- Basic Information -->
        <InfoGrid items={basicInfoItems} title={$t('session.headers.relationship-details')} />

        <!-- Questions -->
        {#if relatedQuestions.length > 0}
            <section class="session-info-section">
                <QuestionsSection 
                    questions={relatedQuestions}
                    title={$t('session.headers.questions')}
                    compact={true}
                />
            </section>
        {/if}

        <!-- Alerts -->
        {#if relatedAlerts.length > 0}
            <section class="session-info-section">
                <AlertsSection 
                    alerts={relatedAlerts}
                    title={$t('session.headers.alerts')}
                    compact={true}
                    onalertAcknowledge={onalertAcknowledge}
                />
            </section>
        {/if}
        <!-- Connection Information -->
        <section class="session-info-section">
            <h4>{$t('session.labels.connection')}</h4>
            <div class="connection-flow">
                <!-- Source Node -->
                {#if sourceData}
                    {@const nodeType = getNodeTypeFromData(sourceData)}
                    <div class="connection-node">
                        <span class="node-label">{$t('session.labels.from')}:</span>
                        <div 
                            class="session-relationship-wrapper"
                            role="button"
                            tabindex="0"
                            onclick={() => handleNodeClick(sourceData.id)}
                            onkeydown={(e) => e.key === 'Enter' && handleNodeClick(sourceData.id)}
                        >
                            {#if nodeType === 'symptom'}
                                <SymptomNodeComponent
                                    node={{ id: sourceData.id, x0: 0, x1: 120, y0: 0, y1: 50 } as any}
                                    symptom={sourceData}
                                    isSelected={false}
                                    isMobile={false}
                                />
                            {:else if nodeType === 'diagnosis'}
                                <DiagnosisNodeComponent
                                    node={{ id: sourceData.id, x0: 0, x1: 120, y0: 0, y1: 50 } as any}
                                    diagnosis={sourceData}
                                    isSelected={false}
                                    isMobile={false}
                                />
                            {:else if nodeType === 'treatment'}
                                <TreatmentNodeComponent
                                    node={{ id: sourceData.id, x0: 0, x1: 120, y0: 0, y1: 50 } as any}
                                    treatment={sourceData}
                                    isSelected={false}
                                    isMobile={false}
                                />
                            {:else}
                                <div class="connection-fallback">{sourceData.name || sourceData.text || sourceData.id}</div>
                            {/if}
                        </div>
                    </div>
                {:else}
                    <div class="connection-fallback">{$t('session.labels.source-node-not-found', { default: 'Source node not found' })}</div>
                {/if}

                <!-- Direction Arrow -->
                <div class="connection-arrow">
                    <span class="arrow-icon">{getDirectionIcon(link.direction)}</span>
                    <span class="relationship-label">{getRelationshipTypeLabel(link.type)}</span>
                </div>

                <!-- Target Node -->
                {#if targetData}
                    {@const nodeType = getNodeTypeFromData(targetData)}
                    <div class="connection-node">
                        <span class="node-label">{$t('session.labels.to')}:</span>
                        <div 
                            class="session-relationship-wrapper"
                            role="button"
                            tabindex="0"
                            onclick={() => handleNodeClick(targetData.id)}
                            onkeydown={(e) => e.key === 'Enter' && handleNodeClick(targetData.id)}
                        >
                            {#if nodeType === 'symptom'}
                                <SymptomNodeComponent
                                    node={{ id: targetData.id, x0: 0, x1: 120, y0: 0, y1: 50 } as any}
                                    symptom={targetData}
                                    isSelected={false}
                                    isMobile={false}
                                />
                            {:else if nodeType === 'diagnosis'}
                                <DiagnosisNodeComponent
                                    node={{ id: targetData.id, x0: 0, x1: 120, y0: 0, y1: 50 } as any}
                                    diagnosis={targetData}
                                    isSelected={false}
                                    isMobile={false}
                                />
                            {:else if nodeType === 'treatment'}
                                <TreatmentNodeComponent
                                    node={{ id: targetData.id, x0: 0, x1: 120, y0: 0, y1: 50 } as any}
                                    treatment={targetData}
                                    isSelected={false}
                                    isMobile={false}
                                />
                            {:else}
                                <div class="connection-fallback">{targetData.name || targetData.text || targetData.id}</div>
                            {/if}
                        </div>
                    </div>
                {:else}
                    <div class="connection-fallback">{$t('session.labels.target-node-not-found', { default: 'Target node not found' })}</div>
                {/if}
            </div>
        </section>

  

        <!-- Related Actions -->
        {#if relatedActions.length > 0}
            <section class="session-info-section">
                <h4>{$t('session.headers.related-actions')} ({relatedActions.length})</h4>
                <div class="related-actions">
                    {#each relatedActions as action}
                        <div class="action-item {action.priority <= 2 ? 'high-priority' : 'normal-priority'} {action.actionType}">
                            <div class="action-header">
                                <span class="action-text">{action.text}</span>
                                <div class="action-meta">
                                    <span class="action-type">{action.actionType}</span>
                                    <span class="action-priority">P{action.priority || 5}</span>
                                </div>
                            </div>
                            {#if action.category}
                                <div class="action-category">{$t(`session.action-categories.${action.category}`)}</div>
                            {/if}
                        </div>
                    {/each}
                </div>
            </section>
        {/if}


    </div>

    <!-- Actions -->
    <footer class="session-details-actions">
        <button class="button -accept" onclick={() => handleLinkAction('accept')}>
            {$t('session.actions.accept')}
        </button>
        <button class="button -highlight" onclick={() => handleLinkAction('highlight')}>
            {$t('session.actions.highlight')}
        </button>
        <button class="button -suppress" onclick={() => handleLinkAction('suppress')}>
            {$t('session.actions.suppress')}
        </button>
    </footer>
</div>

<style>
    /* Component-specific styles (most styles now shared via session-* classes) */
    .session-details-actions {
        display: flex;
        gap: 0.5rem;
        padding: 1rem;
        border-top: 1px solid var(--color-border, #e2e8f0);
        margin-top: auto;
    }
    
    .session-details-actions .button {
        flex: 1;
    }

    .connection-flow {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .connection-node {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .node-label {
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--color-text-secondary, #6b7280);
    }

    .connection-arrow {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.25rem;
        padding: 0.5rem;
        background: var(--color-surface-2, #f8fafc);
        border-radius: 6px;
        border: 1px solid var(--color-border, #e2e8f0);
    }

    .arrow-icon {
        font-size: 1.5rem;
        color: var(--color-primary, #3b82f6);
        font-weight: bold;
    }

    .relationship-label {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--color-primary, #3b82f6);
        text-align: center;
    }

    .connection-fallback {
        font-family: monospace;
        font-size: 0.875rem;
        color: var(--color-text-secondary, #6b7280);
        padding: 0.5rem;
        background: var(--color-surface-2, #f8fafc);
        border-radius: 4px;
        border: 1px dashed var(--color-border, #e2e8f0);
    }

    .related-actions {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .action-item {
        padding: 0.75rem;
        border-radius: 6px;
        border: 1px solid var(--color-border, #e2e8f0);
    }

    .action-item.high-priority {
        background: rgba(239, 68, 68, 0.05);
        border-left: 3px solid #ef4444;
    }

    .action-item.normal-priority {
        background: var(--color-surface-2, #f8fafc);
        border-left: 3px solid #6b7280;
    }

    .action-item.question {
        border-left-color: var(--color-info, #3b82f6);
    }

    .action-item.alert {
        border-left-color: var(--color-negative, #ef4444);
    }

    .action-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.5rem;
    }

    .action-text {
        flex: 1;
        font-size: 0.875rem;
        color: var(--color-text-primary, #1f2937);
        line-height: 1.4;
    }

    .action-meta {
        display: flex;
        gap: 0.25rem;
        flex-shrink: 0;
    }

    .action-type,
    .action-priority {
        font-size: 0.75rem;
        font-weight: 600;
        padding: 0.125rem 0.375rem;
        border-radius: 12px;
        text-transform: uppercase;
    }

    .action-type {
        background: var(--color-info-bg, #dbeafe);
        color: var(--color-info, #3b82f6);
    }

    .action-priority {
        background: var(--color-neutral-bg, #f1f5f9);
        color: var(--color-text-secondary, #6b7280);
    }

    .action-category {
        font-size: 0.75rem;
        color: var(--color-text-secondary, #6b7280);
        font-style: italic;
    }

    /* Mobile responsive adjustments */
    @media (max-width: 768px) {
        .connection-flow {
            gap: 0.75rem;
        }

        .action-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.5rem;
        }

        .action-meta {
            align-self: flex-end;
        }
    }
</style>