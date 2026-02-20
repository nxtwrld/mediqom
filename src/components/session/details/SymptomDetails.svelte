<script lang="ts">
    import { t } from '$lib/i18n';
    import InfoGrid from '../shared/InfoGrid.svelte';
    import RelationshipsSection from '../shared/RelationshipsSection.svelte';
    import QuestionsSection from '../shared/QuestionsSection.svelte';
    import AlertsSection from '../shared/AlertsSection.svelte';
    import NodeActions from '../shared/NodeActions.svelte';
    import type { SymptomNode, ActionNode } from '../types/visualization';
    import { questionsForNode, alertsForNode, sessionDataActions } from '$lib/session/stores/session-data-store';

    interface Props {
        symptom: SymptomNode;
        allNodes: any;
        onnodeAction?: (action: string, targetId: string, reason?: string) => void;
        onrelationshipNodeClick?: (nodeId: string) => void;
    }

    let { symptom, allNodes, onnodeAction, onrelationshipNodeClick }: Props = $props();

    // Use store actions for alerts

    function handleAlertAcknowledge(alertId: string) {
        sessionDataActions.acknowledgeAlert(alertId);
    }

    function getConfidenceLabel(confidence: number): string {
        if (confidence >= 0.8) return $t('session.effectiveness.high');
        if (confidence >= 0.6) return $t('session.effectiveness.medium');
        if (confidence >= 0.4) return $t('session.effectiveness.low');
        return $t('session.effectiveness.very-low');
    }

    function getConfidenceColor(confidence: number): string {
        if (confidence >= 0.8) return 'var(--color-success, #10b981)';
        if (confidence >= 0.6) return 'var(--color-info, #3b82f6)';
        if (confidence >= 0.4) return 'var(--color-warning, #f59e0b)';
        return 'var(--color-error, #dc2626)';
    }

    const basicInfoItems = $derived([
        { label: $t('session.labels.confidence'), value: `${Math.round(symptom.confidence * 100)}${$t('session.units.percent')}` }
    ]);

    const symptomDetailsItems = $derived([
        { label: $t('session.labels.severity'), value: `${symptom.severity}/10` },
        ...(symptom.duration ? [{ label: $t('session.labels.duration'), value: `${symptom.duration} ${$t('session.units.days')}` }] : []),
        { label: $t('session.labels.source'), value: $t(`session.sources.${symptom.source}`), className: `source-${symptom.source}` }
    ]);

    // Use store factory functions to get related questions and alerts
    const questionsStore = $derived(questionsForNode(symptom.id));
    const alertsStore = $derived(alertsForNode(symptom.id));
    const relatedQuestions = $derived($questionsStore);
    const relatedAlerts = $derived($alertsStore);
</script>

<div class="session-details-panel">
    <header class="session-details-header">
        <div class="session-node-type">
            <span class="session-type-label">{$t('session.node-types.symptom')}</span>
            <span 
                class="session-priority-badge"
                style="background-color: {getConfidenceColor(symptom.confidence)}"
            >
                {getConfidenceLabel(symptom.confidence)}
            </span>
        </div>
        <h3 class="session-node-title">{symptom.text}</h3>
    </header>

    <div class="session-details-content">
        <!-- Basic Information -->
        <InfoGrid items={basicInfoItems} title={$t('session.headers.information')} />

        <!-- Symptom Specific Details -->
        <InfoGrid items={symptomDetailsItems} title={$t('session.headers.symptom-details')} />

        <!-- Quote Section -->
        {#if symptom.quote}
            <section class="session-info-section">
                <span class="session-info-label">{$t('session.labels.quote')}:</span>
                <p class="session-quote-text">"{symptom.quote}"</p>
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
            relationships={symptom.relationships || []} 
            {allNodes}
            {onrelationshipNodeClick}
        />
    </div>

    <!-- Actions -->
    <NodeActions nodeId={symptom.id} {onnodeAction} />
</div>

<style>
    /* All styles now use shared session-* classes */
</style>