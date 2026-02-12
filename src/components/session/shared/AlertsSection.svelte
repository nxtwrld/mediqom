<script lang="ts">
    import { createBubbler } from 'svelte/legacy';
    import AlertCard from './AlertCard.svelte';
    import type { ActionNode } from '../types/visualization';
    import { t } from '$lib/i18n';

    interface Props {
        alerts: ActionNode[];
        title?: string;
        compact?: boolean;
        showFilters?: boolean;
        onalertAcknowledge?: (alertId: string) => void;
    }

    let { 
        alerts = [],
        title = '',
        compact = false,
        showFilters = false,
        onalertAcknowledge
    }: Props = $props();

    const bubble = createBubbler() as any;

    let alertFilter: 'all' | 'pending' | 'acknowledged' = $state('all');

    const filteredAlerts = $derived(alerts.filter(a => {
        if (alertFilter === 'all') return true;
        if (alertFilter === 'pending') return a.status === 'pending';
        if (alertFilter === 'acknowledged') return a.status === 'acknowledged';
        return true;
    }));

    const pendingAlerts = $derived(alerts.filter(a => a.status === 'pending').length);

    function sortByPriority(items: ActionNode[]): ActionNode[] {
        return [...items].sort((a, b) => (a.priority || 5) - (b.priority || 5));
    }

    function handleAlertAcknowledge(alertId: string) {
        onalertAcknowledge?.(alertId);
    }
</script>

<div class="alerts-section" class:compact use:bubble>
    {#if title || showFilters}
        <header class="section-header">
            {#if title}
                <h4 class="section-title">
                    {title} <!--({alerts.length})-->
                    {#if pendingAlerts > 0}
                        <span class="badge">{pendingAlerts}</span>
                    {/if}
                </h4>
            {/if}

            {#if showFilters && !compact}
                <div class="filters">
                    <select bind:value={alertFilter} class="filter-select">
                        <option value="all">{$t('session.filters.all-alerts')}</option>
                        <option value="pending">{$t('session.status.pending')}</option>
                        <option value="acknowledged">{$t('session.status.acknowledged')}</option>
                    </select>
                </div>
            {/if}
        </header>
    {/if}

    <div class="alerts-list">
        {#if filteredAlerts.length === 0}
            <div class="empty-state">
                <p>{$t('session.empty-states.no-alerts')}</p>
            </div>
        {:else}
            {#each sortByPriority(filteredAlerts) as alert (alert.id)}
                <AlertCard 
                    {alert}
                    {compact}
                    onalertAcknowledge={handleAlertAcknowledge}
                />
            {/each}
        {/if}
    </div>
</div>

<style>
    .alerts-section {
        display: flex;
        flex-direction: column;
    }

    .alerts-section.compact {
        gap: 0.5rem;
    }

    .section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1rem;
    }

    .alerts-section.compact .section-header {
        margin-bottom: 0.75rem;
    }

    .section-title {
        position: relative;
        margin: 0;
        font-size: 1rem;
        font-weight: 600;
        color: var(--color-text-primary, #1f2937);
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .badge {
        background: var(--color-error, #dc2626);
        color: white;
        font-size: 0.75rem;
        padding: 0.125rem 0.375rem;
        border-radius: 10px;
        min-width: 16px;
        text-align: center;
        font-weight: 500;
    }

    .filters {
        display: flex;
        gap: 0.5rem;
    }

    .filter-select {
        padding: 0.375rem 0.75rem;
        border: 1px solid var(--color-border, #e2e8f0);
        border-radius: 4px;
        background: var(--color-surface, #fff);
        font-size: 0.875rem;
        color: var(--color-text-primary, #1f2937);
    }

    .alerts-list {
        display: flex;
        flex-direction: column;
    }

    .empty-state {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 120px;
        color: var(--color-text-secondary, #6b7280);
        font-size: 0.875rem;
        text-align: center;
        background: var(--color-surface-2, #f8fafc);
        border: 1px dashed var(--color-border, #e2e8f0);
        border-radius: 8px;
    }

    .alerts-section.compact .empty-state {
        height: 80px;
        font-size: 0.8125rem;
    }

    /* Mobile optimizations */
    @media (max-width: 640px) {
        .section-header {
            flex-direction: column;
            align-items: stretch;
            gap: 0.75rem;
        }

        .filters {
            justify-content: flex-end;
        }
    }
</style>