<script lang="ts">
    import { createBubbler } from 'svelte/legacy';
    import { slide } from 'svelte/transition';
    import type { ActionNode } from '../types/visualization';
    import { t } from '$lib/i18n';
    import { sessionDataActions } from '$lib/session/stores/session-data-store';
    import { sessionViewerActions } from '$lib/session/stores/session-viewer-store';

    interface Props {
        question: ActionNode;
        expanded?: boolean;
        compact?: boolean;
        ontoggleExpanded?: (questionId: string) => void;
    }

    let { 
        question, 
        expanded = false, 
        compact = false,
        ontoggleExpanded
    }: Props = $props();

    const bubble = createBubbler() as any;


    function handleToggleExpanded() {
        ontoggleExpanded?.(question.id);
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

    // Interactive handlers using new store actions
    function handleNodeHover(nodeId: string, isEntering: boolean) {
        const node = sessionDataActions.findNodeById(nodeId);
        if (node && isEntering) {
            sessionViewerActions.setHoveredItem('node', nodeId, node);
        } else if (!isEntering) {
            sessionViewerActions.setHoveredItem(null);
        }
    }

    function handleNodeClick(nodeId: string) {
        const node = sessionDataActions.findNodeById(nodeId);
        if (node) {
            sessionViewerActions.selectItem('node', nodeId, node);
            sessionViewerActions.selectDetailsTab();
        }
    }
</script>

<div class="question-card  {getPriorityClass(question.priority || 5)} " class:compact use:bubble>
    <button 
        class="question-header"
        onclick={handleToggleExpanded}
    >
        <div class="header-content">
            <div class="question-info">
                <span class="question-text">{question.text}</span>
                <div class="question-meta">
                    <span class="priority">{getPriorityLabel(question.priority || 5)}</span>
                    <span class="category">{$t(`session.action-categories.${question.category}`)}</span>
                </div>
            </div>
        </div>
        <div class="header-actions">
            {#if !compact}
                <span class="status status-{question.status}">{question.status}</span>
            {/if}
            <span class="expand-icon" class:expanded>
                ▼
            </span>
        </div>
    </button>

    {#if expanded}
        <div class="question-details" class:compact transition:slide={{ duration: 200 }}>
            {#if question.answer}
                <div class="answer-display">
                    <h5>{$t('session.labels.answer')}:</h5>
                    <p class="answer">{question.answer}</p>
                </div>
            {:else if question.status === 'pending'}
                <div class="pending-note">
                    <p class="note-text">{$t('session.labels.awaiting-clinical-input')}</p>
                </div>
            {/if}

            {#if question.impact}
                <div class="impact-info">
                    <h5>{$t('session.labels.expected-impact')}:</h5>
                    {#if question.impact.yes}
                        <div class="impact-scenario">
                            <span class="scenario-label">{$t('session.labels.if-yes')}:</span>
                            <ul>
                                {#each Object.entries(question.impact.yes) as [diagId, impact]}
                                    <li class="impact-item" class:positive={impact > 0} class:negative={impact < 0}>
                                        <span 
                                            class="node-reference clickable"
                                            role="button"
                                            tabindex="0"
                                            onmouseenter={() => handleNodeHover(diagId, true)}
                                            onmouseleave={() => handleNodeHover(diagId, false)}
                                            onclick={() => handleNodeClick(diagId)}
                                            onkeydown={(e) => e.key === 'Enter' && handleNodeClick(diagId)}
                                        >
                                            {sessionDataActions.getNodeDisplayText(diagId)}
                                        </span>: {impact > 0 ? '+' : ''}{Math.round(impact * 100)}%
                                    </li>
                                {/each}
                            </ul>
                        </div>
                    {/if}
                    {#if question.impact.no}
                        <div class="impact-scenario">
                            <span class="scenario-label">{$t('session.labels.if-no')}:</span>
                            <ul>
                                {#each Object.entries(question.impact.no) as [diagId, impact]}
                                    <li class="impact-item" class:positive={impact > 0} class:negative={impact < 0}>
                                        <span 
                                            class="node-reference clickable"
                                            role="button"
                                            tabindex="0"
                                            onmouseenter={() => handleNodeHover(diagId, true)}
                                            onmouseleave={() => handleNodeHover(diagId, false)}
                                            onclick={() => handleNodeClick(diagId)}
                                            onkeydown={(e) => e.key === 'Enter' && handleNodeClick(diagId)}
                                        >
                                            {sessionDataActions.getNodeDisplayText(diagId)}
                                        </span>: {impact > 0 ? '+' : ''}{Math.round(impact * 100)}%
                                    </li>
                                {/each}
                            </ul>
                        </div>
                    {/if}
                </div>
            {/if}

            {#if question.relationships && question.relationships.length > 0}
                <div class="relationships-info">
                    <h5>{$t('session.labels.related-to')}:</h5>
                    <ul class="relationships-list">
                        {#each question.relationships as rel}
                            <li class="relationship">
                                <span class="rel-type">{$t(`session.relationships.${rel.relationship}`)}</span>
                                <span 
                                    class="rel-target node-reference clickable"
                                    role="button"
                                    tabindex="0"
                                    onmouseenter={() => handleNodeHover(rel.nodeId, true)}
                                    onmouseleave={() => handleNodeHover(rel.nodeId, false)}
                                    onclick={() => handleNodeClick(rel.nodeId)}
                                    onkeydown={(e) => e.key === 'Enter' && handleNodeClick(rel.nodeId)}
                                >
                                    {sessionDataActions.getNodeDisplayText(rel.nodeId)}
                                </span>
                                <span class="rel-strength">{Math.round(rel.strength * 100)}%</span>
                            </li>
                        {/each}
                    </ul>
                </div>
            {/if}
        </div>
    {/if}
</div>

<style>
    .question-card {
        background: var(--color-surface-2, #f8fafc);
        border: 0;
        border-left: .5rem solid var(--priority-color, #e2e8f0);
        margin-bottom: 0.75rem;
        overflow: hidden;
        transition: box-shadow 0.2s ease;
    }

    .question-card.compact {
        margin-bottom: 0.5rem;
    }

    .question-card:hover {
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    .question-header {
        width: 100%;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        padding: 1rem;
        background: transparent;
        border: none;
        text-align: left;
        cursor: pointer;
        gap: 1rem;
    }

    .question-card.compact .question-header {
        padding: 0.75rem;
        cursor: default;
    }

    .header-content {
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;
        flex: 1;
    }

    .priority-indicator {
        width: 4px;
        height: 24px;
        border-radius: 2px;
        flex-shrink: 0;
        margin-top: 2px;
    }

    .question-info {
        flex: 1;
        min-width: 0;
    }

    .question-text {
        display: block;
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--color-text-primary, #1f2937);
        line-height: 1.4;
        margin-bottom: 0.5rem;
    }

    .question-meta {
        display: flex;
        gap: 0.75rem;
        font-size: 0.75rem;
        flex-wrap: wrap;
    }

    .priority,
    .category {
        padding: 0.125rem 0.5rem;
        border-radius: 12px;
        font-weight: 500;
    }

    .priority {
        background: var(--color-primary-bg, #dbeafe);
        color: var(--color-primary, #3b82f6);
    }

    .category {
        background: var(--color-surface, #fff);
        color: var(--color-text-secondary, #6b7280);
        border: 1px solid var(--color-border, #e2e8f0);
    }

    .header-actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-shrink: 0;
    }

    .status {
        font-size: 0.75rem;
        padding: 0.25rem 0.5rem;
        border-radius: 12px;
        font-weight: 500;
    }

    .status-pending {
        background: var(--color-warning-bg, #fef3c7);
        color: var(--color-warning, #d97706);
    }

    .status-answered {
        background: var(--color-success-bg, #dcfce7);
        color: var(--color-success, #16a34a);
    }

    .expand-icon {
        transition: transform 0.2s ease;
        color: var(--color-text-secondary, #6b7280);
        font-size: 0.75rem;
    }

    .expand-icon.expanded {
        transform: rotate(180deg);
    }

    .question-details {
        padding: 0 1rem 1rem;
        background: var(--color-surface, #fff);
    }

    .question-details.compact {
        padding: 0 0.75rem 0.75rem;
    }

    .question-details h5 {
        margin: 0 0 0.5rem;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--color-text-primary, #1f2937);
    }


    .pending-note {
        margin-bottom: 1rem;
    }
    
    .note-text {
        font-style: italic;
        color: var(--color-text-secondary, #6b7280);
        background: var(--color-surface-2, #f8fafc);
        padding: 0.75rem;
        border-radius: 6px;
        border: 1px dashed var(--color-border, #e2e8f0);
        margin: 0;
    }

    .answer-display .answer {
        background: var(--color-success-bg, #dcfce7);
        color: var(--color-success, #16a34a);
        padding: 0.5rem;
        border-radius: 4px;
        font-weight: 500;
        margin: 0;
    }

    .impact-info,
    .relationships-info {
        margin-top: 1rem;
    }

    .impact-scenario {
        margin-bottom: 0.75rem;
    }

    .scenario-label {
        font-weight: 500;
        color: var(--color-text-primary, #1f2937);
        display: block;
        margin-bottom: 0.25rem;
    }

    .impact-item {
        font-size: 0.875rem;
        padding: 0.25rem 0;
    }

    .impact-item.positive {
        color: var(--color-success, #16a34a);
    }

    .impact-item.negative {
        color: var(--color-error, #dc2626);
    }

    .relationships-list {
        list-style: none;
        padding: 0;
        margin: 0;
    }

    .relationship {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.25rem 0;
        font-size: 0.875rem;
    }

    .rel-type {
        font-weight: 500;
        color: var(--color-primary, #3b82f6);
    }

    .rel-target {
        font-family: monospace;
        color: var(--color-text-secondary, #6b7280);
    }

    .rel-strength {
        font-size: 0.75rem;
        color: var(--color-success, #16a34a);
        margin-left: auto;
    }

    /* Interactive node references */
    .node-reference {
        color: var(--color-primary, #3b82f6);
        border-bottom: 1px dashed currentColor;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .node-reference:hover,
    .node-reference:focus {
        background: var(--color-primary-bg, #dbeafe);
        border-bottom: 1px solid currentColor;
        padding: 0.125rem 0.25rem;
        margin: -0.125rem -0.25rem;
        border-radius: 3px;
        outline: none;
    }

    .node-reference:focus {
        box-shadow: 0 0 0 2px var(--color-primary, #3b82f6);
    }

    /* Remove monospace styling for clickable node references */
    .rel-target.node-reference {
        font-family: inherit;
    }

    /* Mobile optimizations */
    @media (max-width: 640px) {
        .question-header {
            padding: 0.75rem;
        }


        .question-meta {
            gap: 0.5rem;
        }
    }
</style>