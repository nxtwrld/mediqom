<script lang="ts">
    import PriorityIndicator from './PriorityIndicator.svelte';
    
    interface InfoItem {
        label: string;
        value: string | number;
        className?: string;
        type?: 'priority' | 'default';
        priority?: number;
    }

    interface Props {
        items: InfoItem[];
        title?: string;
    }

    let { items = [], title }: Props = $props();
</script>

{#if items.length > 0}
    <section class="session-info-section">
        <!--
        {#if title}
            <h4>{title}</h4>
        {/if}
        -->
        <div class="session-info-grid">
            {#each items as item}
                <div class="session-info-item">
                    <span class="session-info-label">{item.label}:</span>
                    {#if item.type === 'priority' && item.priority}
                        <div class="priority-value">
                            <PriorityIndicator priority={item.priority} size="small" variant="dots" />
                        </div>
                    {:else}
                        <span class="value {item.className || ''}">{item.value}</span>
                    {/if}
                </div>
            {/each}
        </div>
    </section>
{/if}

<style>
    /* Most styles now use shared session-* classes */

    /* Source and status styling already in session.css */
    .priority-value {
        display: flex;
        align-items: center;
        min-height: 2.4rem;
    }
    
    /* Override session.css styles to make items horizontal instead of vertical */
    :global(.session-info-grid) .session-info-item {
        display: flex !important;
        flex-direction: row !important;
        align-items: center !important;
        gap: 1.2rem !important;
        min-height: 2.8rem !important;
    }
    
    :global(.session-info-grid) .session-info-item .session-info-label {
        font-weight: 500 !important;
        color: var(--color-text-secondary, #6b7280) !important;
        font-size: 1.4rem !important;
        flex-shrink: 0 !important;
        margin-bottom: 0 !important;
    }
    
    :global(.session-info-grid) .session-info-item .value {
        font-weight: 500 !important;
        color: var(--color-text-primary, #1f2937) !important;
    }
</style>