<script lang="ts">
    import { createBubbler } from 'svelte/legacy';
    import QuestionCard from './QuestionCard.svelte';
    import type { ActionNode } from '../types/visualization';
    import { t } from '$lib/i18n';

    interface Props {
        questions: ActionNode[];
        title?: string;
        compact?: boolean;
        showFilters?: boolean;
    }

    let { 
        questions = [],
        title = '',
        compact = false,
        showFilters = false
    }: Props = $props();

    const bubble = createBubbler() as any;

    let expandedItems = $state(new Set<string>());
    let questionFilter: 'all' | 'pending' | 'answered' = $state('pending');

    const filteredQuestions = $derived(questions.filter(q => {
        if (questionFilter === 'all') return true;
        if (questionFilter === 'pending') return q.status === 'pending';
        if (questionFilter === 'answered') return q.status === 'answered';
        return true;
    }));

    const pendingQuestions = $derived(questions.filter(q => q.status === 'pending').length);

    // Sorting is now handled by the sortedQuestions store in session-data-store
    // which considers urgency, diagnosis probability, and question priority

    function toggleExpanded(questionId: string) {
        if (expandedItems.has(questionId)) {
            expandedItems.delete(questionId);
        } else {
            expandedItems.add(questionId);
        }
        // Create a new Set to trigger reactivity in Svelte 5
        expandedItems = new Set(expandedItems);
    }

</script>

<div class="questions-section" class:compact use:bubble>
    {#if title || showFilters}
        <header class="section-header">
            {#if title}
                <h4 class="section-title">
                    {title} <!--({questions.length})-->
                    {#if pendingQuestions > 0}
                        <span class="badge">{pendingQuestions}</span>
                    {/if}
                </h4>
            {/if}

            {#if showFilters && !compact}
                <div class="filters">
                    <select bind:value={questionFilter} class="filter-select">
                        <option value="all">{$t('session.filters.all-questions')}</option>
                        <option value="pending">{$t('session.status.pending')}</option>
                        <option value="answered">{$t('session.status.answered')}</option>
                    </select>
                </div>
            {/if}
        </header>
    {/if}

    <div class="questions-list">
        {#if filteredQuestions.length === 0}
            <div class="empty-state">
                <p>{$t('session.empty-states.no-questions')}</p>
            </div>
        {:else}
            {#each filteredQuestions as question (question.id)}
                <QuestionCard 
                    {question}
                    {compact}
                    expanded={expandedItems.has(question.id)}
                    ontoggleExpanded={toggleExpanded}
                />
            {/each}
        {/if}
    </div>
</div>

<style>
    .questions-section {
        display: flex;
        flex-direction: column;
    }

    .questions-section.compact {
        gap: 0.8rem;
    }

    .section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1.6rem;
        margin-bottom: 1.6rem;
    }

    .questions-section.compact .section-header {
        margin-bottom: 1.2rem;
    }

    .section-title {
        position: relative;
        margin: 0;
        font-size: 1.6rem;
        font-weight: 600;
        color: var(--color-text-primary, #1f2937);
        display: flex;
        align-items: center;
        gap: 0.8rem;
    }

    .badge {
        background: var(--color-negative, #dc2626);
        color: white;
        font-size: 1.2rem;
        padding: 0.2rem 0.6rem;
        border-radius: 1rem;
        min-width: 1.6rem;
        text-align: center;
        font-weight: 500;
    }

    .filters {
        display: flex;
        gap: 0.8rem;
    }

    .filter-select {
        padding: 0.6rem 1.2rem;
        border: 1px solid var(--color-border, #e2e8f0);
        border-radius: 0.4rem;
        background: var(--color-surface, #fff);
        font-size: 1.4rem;
        color: var(--color-text-primary, #1f2937);
    }

    .questions-list {
        display: flex;
        flex-direction: column;
    }

    .empty-state {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 12rem;
        color: var(--color-text-secondary, #6b7280);
        font-size: 1.4rem;
        text-align: center;
        background: var(--color-surface, #f8fafc);
        border: 1px dashed var(--color-border, #e2e8f0);
        border-radius: 0.8rem;
    }

    .questions-section.compact .empty-state {
        height: 8rem;
        font-size: 1.4rem;
    }

    /* Mobile optimizations */
    @media (max-width: 768px) {
        .section-header {
            flex-direction: column;
            align-items: stretch;
            gap: 1.2rem;
        }

        .filters {
            justify-content: flex-end;
        }
    }
</style>