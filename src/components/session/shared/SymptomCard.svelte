<script lang="ts">
    import type { SymptomNode } from '../types/visualization';
    import PriorityIndicator from './PriorityIndicator.svelte';
    import { t } from '$lib/i18n';

    interface Props {
        symptom: SymptomNode;
        onsymptomClick?: () => void;
    }

    let { symptom, onsymptomClick }: Props = $props();

    function getSourceColor(source: string): string {
        switch (source) {
            case 'transcript': return '#10b981';
            case 'medical_history': return '#3b82f6';
            case 'family_history': return '#8b5cf6'; 
            case 'social_history': return '#f59e0b';
            case 'medication_history': return '#06b6d4';
            case 'suspected': return '#f97316';
            default: return '#6b7280';
        }
    }

    function getSeverityColor(severity: number): string {
        if (severity <= 2) return '#dc2626'; // Red for critical
        if (severity <= 4) return '#ea580c'; // Orange for high  
        if (severity <= 6) return '#3b82f6'; // Blue for medium
        return '#10b981'; // Green for low
    }

    function truncateText(text: string, maxLength: number): string {
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }
</script>

<button 
    class="symptom-card"
    onclick={onsymptomClick}
    style="--source-color: {getSourceColor(symptom.source)}; --severity-color: {getSeverityColor(symptom.severity)}"
>
    <div class="card-header">
        <div class="severity-badge">S{symptom.severity}</div>
        <div class="confidence">
            {Math.round(symptom.confidence * 100)}%
        </div>
    </div>

    <div class="card-content">
        <h4 class="symptom-text">{truncateText(symptom.text, 60)}</h4>
        
        {#if symptom.duration}
            <div class="meta-info">
                <span class="duration">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    {symptom.duration} {$t('session.units.days')}
                </span>
            </div>
        {/if}

        {#if symptom.characteristics && symptom.characteristics.length > 0}
            <div class="characteristics">
                {#each symptom.characteristics.slice(0, 3) as characteristic}
                    <span class="characteristic-tag">{characteristic}</span>
                {/each}
                {#if symptom.characteristics.length > 3}
                    <span class="more-tag">+{symptom.characteristics.length - 3}</span>
                {/if}
            </div>
        {/if}
    </div>

    <div class="card-footer">
        <span class="source-indicator">{$t(`session.sources.${symptom.source}`)}</span>
        {#if symptom.relationships && symptom.relationships.length > 0}
            <span class="relationship-count">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2L2 7L12 12L22 7L12 2Z"></path>
                    <path d="M2 17L12 22L22 17"></path>
                    <path d="M2 12L12 17L22 12"></path>
                </svg>
                {symptom.relationships.length}
            </span>
        {/if}
    </div>
</button>

<style>
    .symptom-card {
        display: flex;
        flex-direction: column;
        padding: 1rem;
        background: white;
        border: 1px solid var(--color-border, #e2e8f0);
        border-left: 4px solid var(--source-color);
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s ease;
        text-align: left;
        width: 100%;
        min-height: 140px;
    }

    .symptom-card:hover {
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        transform: translateY(-2px);
    }

    .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.75rem;
    }

    .severity-badge {
        background: var(--severity-color);
        color: white;
        padding: 0.25rem 0.5rem;
        border-radius: 12px;
        font-size: 0.75rem;
        font-weight: 700;
    }

    .confidence {
        font-size: 0.75rem;
        color: var(--color-text-secondary, #6b7280);
        font-weight: 600;
    }

    .card-content {
        flex: 1;
        margin-bottom: 0.75rem;
    }

    .symptom-text {
        margin: 0 0 0.5rem 0;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--color-text-primary, #1f2937);
        line-height: 1.4;
    }

    .meta-info {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 0.5rem;
    }

    .duration {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        font-size: 0.75rem;
        color: var(--color-text-secondary, #6b7280);
    }

    .characteristics {
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem;
    }

    .characteristic-tag,
    .more-tag {
        padding: 0.125rem 0.375rem;
        background: var(--color-surface, #f8fafc);
        border: 1px solid var(--color-border, #e2e8f0);
        border-radius: 4px;
        font-size: 0.625rem;
        color: var(--color-text-secondary, #6b7280);
    }

    .more-tag {
        background: var(--color-interactivity-light, #dbeafe);
        color: var(--color-interactivity, #3b82f6);
        border-color: var(--color-interactivity, #3b82f6);
    }

    .card-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-top: 0.5rem;
        border-top: 1px solid var(--color-border, #e2e8f0);
    }

    .source-indicator {
        font-size: 0.625rem;
        color: var(--source-color);
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
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