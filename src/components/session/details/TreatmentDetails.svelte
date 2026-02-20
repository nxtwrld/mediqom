<script lang="ts">
    import { t } from '$lib/i18n';
    import InfoGrid from '../shared/InfoGrid.svelte';
    import RelationshipsSection from '../shared/RelationshipsSection.svelte';
    import QuestionsSection from '../shared/QuestionsSection.svelte';
    import AlertsSection from '../shared/AlertsSection.svelte';
    import NodeActions from '../shared/NodeActions.svelte';
    import type { TreatmentNode, ActionNode } from '../types/visualization';
    import { questionsForNode, alertsForNode, sessionDataActions } from '$lib/session/stores/session-data-store';

    interface Props {
        treatment: TreatmentNode;
        allNodes: any;
        onnodeAction?: (action: string, targetId: string, reason?: string) => void;
        onrelationshipNodeClick?: (nodeId: string) => void;
    }

    let { treatment, allNodes, onnodeAction, onrelationshipNodeClick }: Props = $props();

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


    const basicInfoItems = $derived([
        { label: $t('session.labels.priority'), value: '', type: 'priority' as const, priority: treatment.priority || 5 }
    ]);

    const treatmentDetailsItems = $derived([
        ...(treatment.dosage ? [{ label: $t('session.labels.dosage'), value: treatment.dosage }] : []),
        ...(treatment.urgency ? [{ label: $t('session.labels.urgency'), value: $t(`session.urgency.${treatment.urgency}`) }] : []),
        ...(treatment.effectiveness ? [{ label: $t('session.labels.effectiveness'), value: `${Math.round(treatment.effectiveness * 100)}${$t('session.units.percent')}` }] : []),
        ...(treatment.duration ? [{ label: $t('session.labels.duration'), value: treatment.duration }] : [])
    ]);

    // Use store factory functions to get related questions and alerts
    const questionsStore = $derived(questionsForNode(treatment.id));
    const alertsStore = $derived(alertsForNode(treatment.id));
    const relatedQuestions = $derived($questionsStore);
    const relatedAlerts = $derived($alertsStore);
</script>

<div class="session-details-panel">
    <header class="session-details-header">
        <div class="session-node-type">
            <span class="session-type-label">{$t(`session.treatment-types.${treatment.type}`)}</span>
            <span 
                class="session-priority-badge"
                style="background-color: {getPriorityColor(treatment.priority || 5)}"
            >
                {getPriorityLabel(treatment.priority || 5)}
            </span>
        </div>
        <h3 class="session-node-title">{treatment.name}</h3>
    </header>

    <div class="session-details-content">
        <!-- Description -->
        {#if treatment.description}
            <section class="session-info-section">
                <span class="session-info-label">{$t('session.labels.description')}:</span>
                <p class="session-reasoning-text">{treatment.description}</p>
            </section>
        {/if}

        <!-- Basic Information -->
        <InfoGrid items={basicInfoItems} title={$t('session.headers.information')} />

        <!-- Treatment Specific Details -->
        {#if treatmentDetailsItems.length > 0}
            <InfoGrid items={treatmentDetailsItems} title={$t('session.headers.treatment-details')} />
        {/if}



        <!-- Instructions -->
        {#if treatment.instructions}
            <section class="session-info-section">
                <span class="session-info-label">{$t('session.labels.instructions')}:</span>
                <p class="session-reasoning-text">{treatment.instructions}</p>
            </section>
        {/if}

        <!-- Side Effects -->
        {#if treatment.sideEffects && treatment.sideEffects.length > 0}
            <section class="session-info-section">
                <h4>{$t('session.headers.side-effects')}</h4>
                <ul class="side-effects-list">
                    {#each treatment.sideEffects as sideEffect}
                        <li>{sideEffect}</li>
                    {/each}
                </ul>
            </section>
        {/if}

        <!-- Contraindications -->
        {#if treatment.contraindications && treatment.contraindications.length > 0}
            <section class="session-info-section">
                <h4>{$t('session.headers.contraindications')}</h4>
                <ul class="contraindications-list">
                    {#each treatment.contraindications as contraindication}
                        <li>{contraindication}</li>
                    {/each}
                </ul>
            </section>
        {/if}

        <!-- Monitoring -->
        {#if treatment.monitoring}
            <section class="session-info-section">
                <span class="session-info-label">{$t('session.labels.monitoring')}:</span>
                <p class="session-reasoning-text">{treatment.monitoring}</p>
            </section>
        {/if}

        <!-- Notes -->
        {#if treatment.notes}
            <section class="session-info-section">
                <span class="session-info-label">{$t('session.labels.notes')}:</span>
                <p class="session-reasoning-text">{treatment.notes}</p>
            </section>
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

        <!-- Relationships -->
        <RelationshipsSection 
            relationships={treatment.relationships || []} 
            {allNodes}
            {onrelationshipNodeClick}
        />
    </div>

    <!-- Actions -->
    <NodeActions nodeId={treatment.id} {onnodeAction} />
</div>

<style>
    /* Most styles now use shared session-* classes */

    /* Treatment-specific list styles */
    .side-effects-list,
    .contraindications-list {
        margin: 0;
        padding: 0.75rem 0.75rem 0.75rem 2rem;
        background: var(--color-surface-2, #f8fafc);
        font-size: 0.875rem;
        color: var(--color-text-primary, #1f2937);
        line-height: 1.5;
    }

    .side-effects-list {
        border-left: .5rem solid var(--color-warning, #f59e0b);
    }

    .contraindications-list {
        border-left: .5rem solid var(--color-error, #dc2626);
    }

    .side-effects-list li,
    .contraindications-list li {
        margin-bottom: 0.25rem;
    }

    .side-effects-list li:last-child,
    .contraindications-list li:last-child {
        margin-bottom: 0;
    }
</style>