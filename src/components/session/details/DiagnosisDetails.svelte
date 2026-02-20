<script lang="ts">
    import { t } from '$lib/i18n';
    import InfoGrid from '../shared/InfoGrid.svelte';
    import RelationshipsSection from '../shared/RelationshipsSection.svelte';
    import QuestionsSection from '../shared/QuestionsSection.svelte';
    import AlertsSection from '../shared/AlertsSection.svelte';
    import NodeActions from '../shared/NodeActions.svelte';
    import SymptomNodeComponent from '../nodes/SymptomNode.svelte';
    import type { DiagnosisNode, ActionNode } from '../types/visualization';
    import { questionsForNode, alertsForNode, sessionDataActions } from '$lib/session/stores/session-data-store';
    import { sessionViewerActions } from '$lib/session/stores/session-viewer-store';

    interface Props {
        diagnosis: DiagnosisNode;
        allNodes: any;
        onnodeAction?: (action: string, targetId: string, reason?: string) => void;
        onrelationshipNodeClick?: (nodeId: string) => void;
    }

    let { diagnosis, allNodes, onnodeAction, onrelationshipNodeClick }: Props = $props();

    // Use store actions for alerts

    function handleAlertAcknowledge(alertId: string) {
        sessionDataActions.acknowledgeAlert(alertId);
    }

    function getPriorityLabel(priority: number): string {
        if (priority <= 2) return $t('session.priority.critical');
        if (priority <= 4) return $t('session.priority.high');
        if (priority <= 6) return $t('session.priority.medium');
        return $t('session.priority.low');
    }

    function getPriorityColor(priority: number): string {
        if (priority <= 2) return 'var(--color-error, #dc2626)';
        if (priority <= 4) return 'var(--color-warning, #f59e0b)';
        if (priority <= 6) return 'var(--color-info, #3b82f6)';
        return 'var(--color-success, #10b981)';
    }

    function getPriorityClass(priority: number): string {
        if (priority <= 2) return 'priority-critical';
        if (priority <= 4) return 'priority-high';
        if (priority <= 6) return 'priority-medium';
        return 'priority-low';
    }

    function getSupportingSymptoms(diagnosisId: string): any[] {
        if (!allNodes?.symptoms) return [];
        
        // Find all symptoms that have a relationship supporting this diagnosis
        return allNodes.symptoms.filter((symptom: any) =>
            symptom.relationships?.some((rel: any) =>
                rel.nodeId === diagnosisId &&
                ['supports', 'suggests', 'indicates'].includes(rel.relationship.toLowerCase())
            )
        );
    }

    function handleSupportingSymptomClick(symptomId: string) {
        onrelationshipNodeClick?.(symptomId);
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


    const basicInfoItems = $derived([
        { label: $t('session.labels.priority'), value: '', type: 'priority' as const, priority: diagnosis.priority || 5 },
        { label: $t('session.labels.probability'), value: `${Math.round(diagnosis.probability * 100)}${$t('session.units.percent')}` }
    ]);

    const diagnosisDetailsItems = $derived([
        ...(diagnosis.icd10 ? [{ label: $t('session.labels.icd10'), value: diagnosis.icd10 }] : [])
    ]);

    const supportingSymptoms = $derived(getSupportingSymptoms(diagnosis.id));
    
    // Use store factory functions to get related questions and alerts
    const questionsStore = $derived(questionsForNode(diagnosis.id));
    const alertsStore = $derived(alertsForNode(diagnosis.id));
    const relatedQuestions = $derived($questionsStore);
    const relatedAlerts = $derived($alertsStore);
</script>

<div class="session-details-panel">
    <header class="session-details-header">
        <div class="session-node-type">
            <span class="session-type-label">{$t('session.node-types.diagnosis')}</span>
            <span 
                class="session-priority-badge {getPriorityClass(diagnosis.priority || 5)} dynamic-bg"
            >
                {getPriorityLabel(diagnosis.priority || 5)}
            </span>
        </div>
        <h3 class="session-node-title">{diagnosis.name}</h3>
    </header>

    <div class="session-details-content">
      <!-- Clinical Reasoning -->
      {#if diagnosis.reasoning}
        <section class="session-info-section">
            <span class="session-info-label">{$t('session.labels.clinical-reasoning')}:</span>
            <p class="session-reasoning-text">{diagnosis.reasoning}</p>
        </section>
        {/if}


        <!-- Basic Information -->
        <InfoGrid items={basicInfoItems} title={$t('session.headers.information')} />

        <!-- Diagnosis Specific Details -->
        {#if diagnosisDetailsItems.length > 0}
            <InfoGrid items={diagnosisDetailsItems} title={$t('session.headers.diagnosis-details')} />
        {/if}


        <!-- Related Questions -->
        {#if relatedQuestions.length > 0}
            <QuestionsSection 
                questions={relatedQuestions}
                title={$t('session.headers.related-questions')}
                compact={true}
            />
        {/if}

        <!-- Related Alerts -->
        {#if relatedAlerts.length > 0}
            <AlertsSection 
                alerts={relatedAlerts}
                title={$t('session.headers.related-alerts')}
                compact={true}
                onalertAcknowledge={handleAlertAcknowledge}
            />
        {/if}
  
        <!-- Supporting Symptoms -->
        {#if supportingSymptoms.length > 0}
            <section class="session-info-section">
                <h4>{$t('session.headers.supporting-symptoms')} ({supportingSymptoms.length})</h4>
                <div class="supporting-symptoms">
                    {#each supportingSymptoms as symptom}
                        <div 
                            class="supporting-symptom-wrapper session-relationship-wrapper"
                            role="button"
                            tabindex="0"
                            onclick={() => handleSupportingSymptomClick(symptom.id)}
                            onkeydown={(e) => e.key === 'Enter' && handleSupportingSymptomClick(symptom.id)}
                            onmouseenter={() => handleNodeHover(symptom.id, true)}
                            onmouseleave={() => handleNodeHover(symptom.id, false)}
                        >
                            <SymptomNodeComponent
                                node={{ id: symptom.id, x0: 0, x1: 120, y0: 0, y1: 50 } as any}
                                {symptom}
                                isSelected={false}
                                isMobile={false}
                            />
                        </div>
                    {/each}
                </div>
            </section>
        {/if}


        <!-- Relationships -->
        <RelationshipsSection 
            relationships={diagnosis.relationships || []} 
            {allNodes}
            {onrelationshipNodeClick}
        />
    </div>

    <!-- Actions -->
    <NodeActions nodeId={diagnosis.id} {onnodeAction} />
</div>

<style>
    /* Most styles now use shared session-* classes */

    /* Supporting Symptoms Styling */
    .supporting-symptoms {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 0.75rem;
        margin-top: 0.75rem;
    }

    /* supporting-symptom-wrapper now uses session-relationship-wrapper class */

    /* Mobile responsive adjustments */
    @media (max-width: 768px) {
        .supporting-symptoms {
            grid-template-columns: 1fr;
            gap: 0.5rem;
        }
        
        .supporting-symptom-wrapper {
            padding: 1px;
        }
    }
</style>