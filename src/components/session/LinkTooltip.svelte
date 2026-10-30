<script lang="ts">
    import type { ActionNode } from './types/visualization';
    import { t } from '$lib/i18n';
    
    interface Props {
        relationshipType: string;
        relationshipLabel: string;
        actions: ActionNode[];
        isMobile: boolean;
    }
    
    let { relationshipType, relationshipLabel, actions, isMobile }: Props = $props();
    
    function truncateText(text: string, maxLength: number): string {
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }
</script>

<div class="unified-tooltip">
    <div class="relationship-header" class:with-actions={actions.length > 0}>
        <span class="relationship-label">{relationshipLabel}</span>
    </div>
    
    {#if actions.length > 0}
        <div class="actions-section">
            <div class="actions-title">{$t('session.labels.related-actions')}:</div>
            {#each actions as action}
                <div class="action-item {action.priority <= 2 ? 'high-priority' : 'normal-priority'} {action.actionType === 'alert' ? 'action-alert' : 'action-question'}">
                    <div class="action-text">{truncateText(action.text, isMobile ? 30 : 45)}</div>
                    <div class="action-meta">
                        <span class="action-type">{action.actionType}</span>
                        <span class="action-priority">P{action.priority || 5}</span>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>

<style>
    /* Unified Tooltip Styles */
    .unified-tooltip {
        background: rgba(255, 255, 255, 0.3);
        border-radius: var(--radius-16);
        padding: 0.3rem;;
        backdrop-filter: blur(4px);
        font-family: system-ui, sans-serif;
        overflow-y: auto;
    }

    .relationship-header {
        text-align: center;
    }

    .relationship-header.with-actions {
        border-bottom: 1px solid #e2e8f0;
        margin-bottom: 0.8rem;
    }

    .relationship-label {
        color: #374151;
        white-space: nowrap;
    }

    .actions-section {
        margin-top: 0.8rem;
    }

    .actions-title {
        font-size: 1rem;
        font-weight: 600;
        color: #6b7280;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 0.6rem;
    }

    .action-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.4rem 0.6rem;
        margin-bottom: 0.4rem;
        border-radius: 0.3rem;
        font-size: 1.2rem;
        line-height: 1.3;
    }

    .action-item.high-priority {
        background: rgba(239, 68, 68, 0.1);
        border-left: 3px solid #ef4444;
    }

    .action-item.normal-priority {
        background: rgba(107, 114, 128, 0.05);
        border-left: 3px solid #6b7280;
    }

    .action-item.action-question {
        border-left-color: #3b82f6;
    }

    .action-item.action-alert {
        border-left-color: #ef4444;
    }

    .action-text {
        flex: 1;
        color: #374151;
        margin-right: 0.8rem;
    }

    .action-meta {
        display: flex;
        gap: 0.4rem;
        flex-shrink: 0;
    }

    .action-type, .action-priority {
        font-size: 1rem;
        font-weight: 600;
        padding: 1px 0.4rem;
        border-radius: 0.2rem;
        background: rgba(0, 0, 0, 0.05);
        color: #6b7280;
        text-transform: uppercase;
    }

    .action-priority {
        background: rgba(59, 130, 246, 0.1);
        color: #3b82f6;
    }

    /* Mobile adjustments */
    @media (max-width: 768px) {
        .unified-tooltip {
            padding: 0.6rem;
            max-height: 18rem;
        }

        .relationship-label {
            font-size: 1.2rem;
        }

        .actions-title {
            font-size: 1rem;
            margin-bottom: 0.4rem;
        }

        .action-item {
            font-size: 1rem;
            padding: 0.3rem 0.4rem;
        }

        .action-type, .action-priority {
            font-size: 0.8rem;
        }
    }
</style>