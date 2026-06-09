<script lang="ts">
    import { t } from '$lib/i18n';
    
    interface Props {
        priority: number;
        showLabel?: boolean;
        size?: 'small' | 'medium' | 'large';
        variant?: 'dots' | 'stars' | 'text';
    }
    
    let { priority = 5, showLabel = true, size = 'medium', variant = 'dots' }: Props = $props();
    
    function getPriorityLevel(priority: number): { level: string; color: string; label: string } {
        if (priority <= 2) return { 
            level: 'critical', 
            color: 'var(--color-negative, #dc2626)', 
            label: $t('session.priority.critical') 
        };
        if (priority <= 4) return { 
            level: 'high', 
            color: 'var(--color-warning, #f59e0b)', 
            label: $t('session.priority.high') 
        };
        if (priority <= 6) return { 
            level: 'medium', 
            color: 'var(--color-info, #3b82f6)', 
            label: $t('session.priority.medium') 
        };
        return { 
            level: 'low', 
            color: 'var(--color-positive, #10b981)', 
            label: $t('session.priority.low') 
        };
    }
    
    function getVisualIndicators(priority: number, maxLevel: number = 10): { filled: number; total: number } {
        const normalizedPriority = Math.max(1, Math.min(10, priority));
        // Invert priority - lower number = higher priority = more indicators filled
        const filled = Math.ceil((11 - normalizedPriority) / 2); // Maps 1-2→5, 3-4→4, 5-6→3, 7-8→2, 9-10→1
        return { filled, total: 5 };
    }
    
    const priorityInfo = $derived(getPriorityLevel(priority));
    const indicators = $derived(getVisualIndicators(priority));
</script>

{#if variant === 'text'}
    <span 
        class="priority-text {size}" 
        style="color: {priorityInfo.color};"
    >
        {priorityInfo.label}
    </span>
{:else if variant === 'stars'}
    <div class="priority-indicator {size}">
        <div class="stars">
            {#each Array(indicators.total) as _, i}
                <span 
                    class="star" 
                    class:filled={i < indicators.filled}
                    style="color: {i < indicators.filled ? priorityInfo.color : 'var(--color-border, #e2e8f0)'};"
                >
                    ★
                </span>
            {/each}
        </div>
        {#if showLabel}
            <span class="priority-label">{priorityInfo.label}</span>
        {/if}
    </div>
{:else}
    <!-- Default dots variant -->
    <div class="priority-indicator {size}">
        <div class="dots">
            {#each Array(indicators.total) as _, i}
                <div 
                    class="dot" 
                    class:filled={i < indicators.filled}
                    style="background-color: {i < indicators.filled ? priorityInfo.color : 'var(--color-border, #e2e8f0)'};"
                ></div>
            {/each}
        </div>
        {#if showLabel}
            <span class="priority-label">{priorityInfo.label}</span>
        {/if}
    </div>
{/if}

<style>
    .priority-indicator {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    
    .priority-text {
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.025em;
    }
    
    .priority-text.small {
        font-size: 0.75rem;
    }
    
    .priority-text.medium {
        font-size: 0.875rem;
    }
    
    .priority-text.large {
        font-size: 1rem;
    }
    
    .dots, .stars {
        display: flex;
        gap: 0.25rem;
        align-items: center;
    }
    
    .dot {
        border-radius: 50%;
        transition: all 0.2s ease;
    }
    
    .dot.small {
        width: 6px;
        height: 6px;
    }
    
    .priority-indicator.small .dot {
        width: 6px;
        height: 6px;
    }
    
    .priority-indicator.medium .dot {
        width: 8px;
        height: 8px;
    }
    
    .priority-indicator.large .dot {
        width: 10px;
        height: 10px;
    }
    
    .star {
        transition: all 0.2s ease;
        font-weight: normal;
    }
    
    .priority-indicator.small .star {
        font-size: 0.875rem;
    }
    
    .priority-indicator.medium .star {
        font-size: 1rem;
    }
    
    .priority-indicator.large .star {
        font-size: 1.125rem;
    }
    
    .priority-label {
        font-size: 0.75rem;
        font-weight: 500;
        color: var(--color-text-secondary, #6b7280);
        text-transform: uppercase;
        letter-spacing: 0.025em;
    }
    
    .priority-indicator.small .priority-label {
        font-size: 0.6875rem;
    }
    
    .priority-indicator.large .priority-label {
        font-size: 0.8125rem;
    }
    
    /* Hover effects */
    .priority-indicator:hover .dot,
    .priority-indicator:hover .star {
        transform: scale(1.1);
    }
</style>