<script lang="ts">
    import { createBubbler } from 'svelte/legacy';
    import type { ActionNode } from '../types/visualization';
    import { t } from '$lib/i18n';

    interface Props {
        alert: ActionNode;
        compact?: boolean;
        onalertAcknowledge?: (alertId: string) => void;
    }

    let { 
        alert, 
        compact = false,
        onalertAcknowledge
    }: Props = $props();

    const bubble = createBubbler() as any;

    function handleAcknowledge() {
        if (alert.status !== 'acknowledged') {
            onalertAcknowledge?.(alert.id);
        }
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

    function getPriorityLabel(priority: number): string {
        if (priority <= 2) return $t('session.priority.critical');
        if (priority <= 4) return $t('session.priority.high');
        if (priority <= 6) return $t('session.priority.medium');
        return $t('session.priority.low');
    }

    function getCategoryClass(category: string): string {
        switch (category) {
            case 'red_flag':
            case 'warning':
                return 'category-red-flag';
            case 'drug_interaction':
            case 'contraindication':
                return 'category-warning';
            case 'allergy':
                return 'category-allergy';
            default:
                return 'category-default';
        }
    }
</script>

<div class="alert-card {getPriorityClass(alert.priority || 5)}" class:compact use:bubble>
    <div class="alert-header">
        <div class="alert-content">
            <div class="alert-text">{alert.text}</div>
            <div class="alert-meta">
                <span class="category {getCategoryClass(alert.category)}">{$t(`session.action-categories.${alert.category}`)}</span>
                <span class="priority">{getPriorityLabel(alert.priority || 5)}</span>
            </div>
            {#if alert.recommendation}
                <div class="recommendation">
                    <strong>{$t('session.labels.recommendation')}:</strong> {alert.recommendation}
                </div>
            {/if}
        </div>
        {#if !compact}
            <button 
                class="button -small {alert.status === 'acknowledged' ? '-acknowledged' : ''}" 
                disabled={alert.status === 'acknowledged'}
                onclick={handleAcknowledge}
            >
                {alert.status === 'acknowledged' ? '✓' : $t('session.actions.acknowledge')}
            </button>
        {/if}
    </div>
</div>

<style>
    .alert-card {
        background: var(--color-surface-2, #f8fafc);
        border: 0px;
        border-left: .5rem solid var(--priority-color, #dc2626);
        margin-bottom: 0.75rem;
        overflow: hidden;
        transition: box-shadow 0.2s ease;
    }

    .alert-card.compact {
        margin-bottom: 0.5rem;
    }

    .alert-card:hover {
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    .alert-header {
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;
        padding: 1rem;
    }

    .alert-card.compact .alert-header {
        padding: 0.75rem;
    }

    .priority-indicator {
        width: 4px;
        height: 24px;
        border-radius: 2px;
        flex-shrink: 0;
        margin-top: 2px;
    }

    .alert-content {
        flex: 1;
        min-width: 0;
    }

    .alert-text {
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--color-text-primary, #1f2937);
        line-height: 1.4;
        margin-bottom: 0.5rem;
    }

    .alert-meta {
        display: flex;
        gap: 0.75rem;
        margin-bottom: 0.75rem;
        flex-wrap: wrap;
    }

    .category,
    .priority {
        font-size: 0.75rem;
        font-weight: 500;
        padding: 0.125rem 0.5rem;
        border-radius: 12px;
    }

    .priority {
        background: var(--color-primary-bg, #dbeafe);
        color: var(--color-primary, #3b82f6);
    }

    .category-red-flag {
        background: var(--color-error-bg, #fee2e2);
        color: var(--color-error, #dc2626);
    }

    .category-warning {
        background: var(--color-warning-bg, #fef3c7);
        color: var(--color-warning, #d97706);
    }

    .category-allergy {
        background: rgba(239, 68, 68, 0.1);
        color: var(--color-error, #dc2626);
    }

    .category-default {
        background: var(--color-surface, #fff);
        color: var(--color-text-secondary, #6b7280);
        border: 1px solid var(--color-border, #e2e8f0);
    }

    .recommendation {
        font-size: 0.875rem;
        color: var(--color-text-primary, #1f2937);
        line-height: 1.4;
        background: var(--color-info-bg, #dbeafe);
        padding: 0.5rem;
        border-radius: 4px;
        border-left: 3px solid var(--color-info, #3b82f6);
    }

    .alert-header .button {
        flex-shrink: 0;
        align-self: flex-start;
    }
    
    .alert-header .button:not(.-acknowledged):not(:disabled):hover {
        --color-hover: var(--color-primary-bg, #dbeafe);
        --color-text-hover: var(--color-primary, #3b82f6);
        --color-border-hover: var(--color-primary, #3b82f6);
    }

    /* Mobile optimizations */
    @media (max-width: 640px) {
        .alert-header {
            padding: 0.75rem;
        }

        .alert-meta {
            gap: 0.5rem;
        }

        .alert-header .button {
            padding: 0.375rem 0.5rem;
            font-size: 0.8125rem;
        }
    }
</style>