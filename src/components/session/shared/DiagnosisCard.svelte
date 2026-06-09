<script lang="ts">
    import type { DiagnosisNode } from '../types/visualization';
    import { t } from '$lib/i18n';

    interface Props {
        diagnosis: DiagnosisNode;
        ondiagnosisClick?: () => void;
    }

    let { diagnosis, ondiagnosisClick }: Props = $props();

    function getPriorityColor(priority: number): string {
        if (priority <= 2) return '#dc2626'; // Red for critical
        if (priority <= 4) return '#ea580c'; // Orange for high  
        if (priority <= 6) return '#3b82f6'; // Blue for medium
        return '#10b981'; // Green for low
    }

    function getProbabilityColor(probability: number): string {
        if (probability >= 0.8) return '#10b981'; // Green for high probability
        if (probability >= 0.6) return '#3b82f6'; // Blue for medium
        if (probability >= 0.4) return '#f59e0b'; // Orange for low
        return '#6b7280'; // Gray for very low
    }

    function truncateText(text: string, maxLength: number): string {
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }
</script>

<button 
    class="diagnosis-card"
    class:suppressed={diagnosis.suppressed}
    onclick={ondiagnosisClick}
    style="--priority-color: {getPriorityColor(diagnosis.priority)}; --probability-color: {getProbabilityColor(diagnosis.probability)}"
>
    <div class="card-header">
        <div class="priority-badge">P{diagnosis.priority}</div>
        <div class="probability">
            {Math.round(diagnosis.probability * 100)}%
        </div>
    </div>

    <div class="card-content">
        <h4 class="diagnosis-name">{truncateText(diagnosis.name, 60)}</h4>
        
        {#if diagnosis.icd10}
            <div class="meta-info">
                <span class="icd-code">ICD-10: {diagnosis.icd10}</span>
            </div>
        {/if}

        {#if diagnosis.reasoning}
            <p class="reasoning">{truncateText(diagnosis.reasoning, 100)}</p>
        {/if}

        {#if diagnosis.redFlags && diagnosis.redFlags.length > 0}
            <div class="red-flags">
                <div class="red-flag-indicator">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                        <line x1="12" y1="9" x2="12" y2="13"></line>
                        <line x1="12" y1="17" x2="12.01" y2="17"></line>
                    </svg>
                    Red Flags ({diagnosis.redFlags.length})
                </div>
            </div>
        {/if}
    </div>

    <div class="card-footer">
        <div class="status-indicators">
            {#if diagnosis.requiresInvestigation}
                <span class="status-tag investigation">Investigation Required</span>
            {/if}
            {#if diagnosis.suppressed}
                <span class="status-tag suppressed">Suppressed</span>
            {/if}
        </div>
        
        {#if diagnosis.relationships && diagnosis.relationships.length > 0}
            <span class="relationship-count">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2L2 7L12 12L22 7L12 2Z"></path>
                    <path d="M2 17L12 22L22 17"></path>
                    <path d="M2 12L12 17L22 12"></path>
                </svg>
                {diagnosis.relationships.length}
            </span>
        {/if}
    </div>
</button>

<style>
    .diagnosis-card {
        display: flex;
        flex-direction: column;
        padding: 1rem;
        background: white;
        border: 1px solid var(--color-border, #e2e8f0);
        border-left: 4px solid var(--priority-color);
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s ease;
        text-align: left;
        width: 100%;
        min-height: 160px;
    }

    .diagnosis-card:hover {
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        transform: translateY(-2px);
    }

    .diagnosis-card.suppressed {
        opacity: 0.7;
        background: var(--color-surface, #f8fafc);
    }

    .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.75rem;
    }

    .priority-badge {
        background: var(--priority-color);
        color: white;
        padding: 0.25rem 0.5rem;
        border-radius: 12px;
        font-size: 0.75rem;
        font-weight: 700;
    }

    .probability {
        background: var(--probability-color);
        color: white;
        padding: 0.25rem 0.5rem;
        border-radius: 12px;
        font-size: 0.75rem;
        font-weight: 700;
    }

    .card-content {
        flex: 1;
        margin-bottom: 0.75rem;
    }

    .diagnosis-name {
        margin: 0 0 0.5rem 0;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--color-text-primary, #1f2937);
        line-height: 1.4;
    }

    .meta-info {
        margin-bottom: 0.5rem;
    }

    .icd-code {
        font-size: 0.625rem;
        color: var(--color-text-secondary, #6b7280);
        font-weight: 600;
        background: var(--color-surface, #f8fafc);
        padding: 0.125rem 0.375rem;
        border-radius: 4px;
        border: 1px solid var(--color-border, #e2e8f0);
    }

    .reasoning {
        margin: 0.5rem 0 0 0;
        font-size: 0.75rem;
        color: var(--color-text-secondary, #6b7280);
        line-height: 1.3;
    }

    .red-flags {
        margin-top: 0.5rem;
    }

    .red-flag-indicator {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        font-size: 0.625rem;
        color: var(--color-negative, #dc2626);
        font-weight: 600;
        padding: 0.125rem 0.375rem;
        background: rgba(220, 38, 38, 0.1);
        border-radius: 4px;
        border: 1px solid rgba(220, 38, 38, 0.2);
    }

    .card-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-top: 0.5rem;
        border-top: 1px solid var(--color-border, #e2e8f0);
    }

    .status-indicators {
        display: flex;
        gap: 0.25rem;
        flex-wrap: wrap;
    }

    .status-tag {
        font-size: 0.625rem;
        padding: 0.125rem 0.375rem;
        border-radius: 4px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .status-tag.investigation {
        background: rgba(59, 130, 246, 0.1);
        color: var(--color-info, #3b82f6);
        border: 1px solid rgba(59, 130, 246, 0.2);
    }

    .status-tag.suppressed {
        background: rgba(107, 114, 128, 0.1);
        color: var(--color-text-secondary, #6b7280);
        border: 1px solid rgba(107, 114, 128, 0.2);
    }

    .relationship-count {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        font-size: 0.75rem;
        color: var(--color-text-secondary, #6b7280);
    }

    svg {
        opacity: 0.6;
    }
</style>