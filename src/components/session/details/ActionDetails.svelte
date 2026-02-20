<script lang="ts">
    import { t } from '$lib/i18n';
    import InfoGrid from '../shared/InfoGrid.svelte';
    import RelationshipsSection from '../shared/RelationshipsSection.svelte';
    import NodeActions from '../shared/NodeActions.svelte';
    import type { ActionNode } from '../types/visualization';

    interface Props {
        action: ActionNode;
        allNodes: any;
        onnodeAction?: (action: string, targetId: string, reason?: string) => void;
        onrelationshipNodeClick?: (nodeId: string) => void;
    }

    let { action, allNodes, onnodeAction, onrelationshipNodeClick }: Props = $props();

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
        { label: $t('session.labels.priority'), value: '', type: 'priority' as const, priority: action.priority || 5 },
        { label: $t('session.labels.category'), value: $t(`session.action-categories.${action.category}`) },
        { label: $t('session.labels.status'), value: $t(`session.status.${action.status}`), className: `status-${action.status}` }
    ]);
</script>

<div class="node-details">
    <header class="details-header">
        <div class="node-type">
            <span class="type-label">{$t(`session.action-types.${action.actionType}`)}</span>
            <span 
                class="priority-badge"
                style="background-color: {getPriorityColor(action.priority || 5)}"
            >
                {getPriorityLabel(action.priority || 5)}
            </span>
        </div>
        <h3 class="node-title">{action.text}</h3>
    </header>

    <div class="details-content">
        <!-- Basic Information -->
        <InfoGrid items={basicInfoItems} title={$t('session.headers.action-details')} />

        <!-- Description -->
        {#if action.description}
            <section class="info-section">
                <span class="info-section-label">{$t('session.labels.description')}:</span>
                <p class="description-text">{action.description}</p>
            </section>
        {/if}

        <!-- Question-specific content -->
        {#if action.actionType === 'question'}
            <!-- Expected Answer Type -->
            {#if action.expectedAnswerType}
                <section class="info-section">
                    <span class="info-section-label">{$t('session.labels.expected-answer-type')}:</span>
                    <span class="answer-type-badge">{action.expectedAnswerType}</span>
                </section>
            {/if}

            <!-- Answer -->
            {#if action.answer}
                <section class="info-section">
                    <span class="info-section-label">{$t('session.labels.answer')}:</span>
                    <p class="answer-text">{action.answer}</p>
                </section>
            {/if}

            <!-- Answer Context -->
            {#if action.answerContext}
                <section class="info-section">
                    <span class="info-section-label">{$t('session.labels.answer-context')}:</span>
                    <p class="context-text">{action.answerContext}</p>
                </section>
            {/if}
        {/if}

        <!-- Alert-specific content -->
        {#if action.actionType === 'alert'}
            <!-- Severity -->
            {#if action.severity}
                <section class="info-section">
                    <span class="info-section-label">{$t('session.labels.severity')}:</span>
                    <span class="severity-badge severity-{action.severity}">{$t(`session.severity.${action.severity}`)}</span>
                </section>
            {/if}

            <!-- Alert Message -->
            {#if action.alertMessage}
                <section class="info-section">
                    <span class="info-section-label">{$t('session.labels.alert-message')}:</span>
                    <p class="alert-message">{action.alertMessage}</p>
                </section>
            {/if}
        {/if}

        <!-- Reasoning -->
        {#if action.reasoning}
            <section class="info-section">
                <span class="info-section-label">{$t('session.labels.reasoning')}:</span>
                <p class="reasoning-text">{action.reasoning}</p>
            </section>
        {/if}

        <!-- Clinical Context -->
        {#if action.clinicalContext}
            <section class="info-section">
                <span class="info-section-label">{$t('session.labels.clinical-context')}:</span>
                <p class="clinical-context-text">{action.clinicalContext}</p>
            </section>
        {/if}

        <!-- Follow-up Actions -->
        {#if action.followUpActions && action.followUpActions.length > 0}
            <section class="info-section">
                <h4>{$t('session.labels.follow-up-actions')}</h4>
                <ul class="follow-up-list">
                    {#each action.followUpActions as followUpAction}
                        <li>{followUpAction}</li>
                    {/each}
                </ul>
            </section>
        {/if}

        <!-- Relationships -->
        <RelationshipsSection 
            relationships={action.relationships || []} 
            {allNodes}
            {onrelationshipNodeClick}
        />
    </div>

    <!-- Actions -->
    <NodeActions nodeId={action.id} {onnodeAction} />
</div>

<style>
    .node-details {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--color-surface, #fff);
    }

    .details-header {
        padding: 1rem;
        border-bottom: 1px solid var(--color-border, #e2e8f0);
    }

    .node-type {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.5rem;
    }

    .type-label {
        font-size: 0.875rem;
        color: var(--color-text-secondary, #6b7280);
        font-weight: 500;
        text-transform: capitalize;
    }

    .priority-badge {
        font-size: 0.75rem;
        padding: 0.125rem 0.5rem;
        border-radius: 12px;
        color: white;
        font-weight: 600;
    }

    .node-title {
        margin: 0;
        font-size: 1.125rem;
        font-weight: 600;
        color: var(--color-text-primary, #1f2937);
        line-height: 1.4;
    }

    .details-content {
        flex: 1;
        padding: 1rem;
        overflow-y: auto;
    }

    .info-section {
        margin-bottom: 1.5rem;
    }

    .info-section h4 {
        margin: 0 0 0.75rem;
        font-size: 1rem;
        font-weight: 600;
        color: var(--color-text-primary, #1f2937);
    }

    .info-section-label {
        display: block;
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--color-text-secondary, #6b7280);
        margin-bottom: 0.5rem;
    }

    .description-text,
    .answer-text,
    .context-text,
    .reasoning-text,
    .clinical-context-text {
        margin: 0;
        padding: 0.75rem;
        background: var(--color-surface-2, #f8fafc);
        border-radius: 6px;
        font-size: 0.875rem;
        color: var(--color-text-primary, #1f2937);
        line-height: 1.5;
    }

    .alert-message {
        margin: 0;
        padding: 0.75rem;
        background: var(--color-error-bg, #fee2e2);
        border-radius: 6px;
        border-left: 3px solid var(--color-error, #dc2626);
        font-size: 0.875rem;
        color: var(--color-text-primary, #1f2937);
        line-height: 1.5;
        font-weight: 500;
    }

    .answer-type-badge {
        font-size: 0.75rem;
        padding: 0.25rem 0.75rem;
        background: var(--color-info-bg, #dbeafe);
        color: var(--color-info, #3b82f6);
        border-radius: 12px;
        font-weight: 600;
        text-transform: uppercase;
    }

    .severity-badge {
        font-size: 0.75rem;
        padding: 0.25rem 0.75rem;
        border-radius: 12px;
        font-weight: 600;
        text-transform: uppercase;
    }

    .severity-badge.severity-low {
        background: var(--color-success-bg, #dcfce7);
        color: var(--color-success, #16a34a);
    }

    .severity-badge.severity-medium {
        background: var(--color-warning-bg, #fef3c7);
        color: var(--color-warning, #d97706);
    }

    .severity-badge.severity-high {
        background: var(--color-error-bg, #fee2e2);
        color: var(--color-error, #dc2626);
    }

    .severity-badge.severity-critical {
        background: var(--color-error, #dc2626);
        color: white;
    }

    .follow-up-list {
        margin: 0;
        padding: 0.75rem 0.75rem 0.75rem 2rem;
        background: var(--color-surface-2, #f8fafc);
        border-radius: 6px;
        border-left: 3px solid var(--color-primary, #3b82f6);
        font-size: 0.875rem;
        color: var(--color-text-primary, #1f2937);
        line-height: 1.5;
    }

    .follow-up-list li {
        margin-bottom: 0.25rem;
    }

    .follow-up-list li:last-child {
        margin-bottom: 0;
    }
</style>