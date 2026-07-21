<script lang="ts">
    import type { TreatmentNode } from '../types/visualization';
    import { t } from '$lib/i18n';

    interface Props {
        treatment: TreatmentNode;
        ontreatmentClick?: () => void;
    }

    let { treatment, ontreatmentClick }: Props = $props();

    function getPriorityColor(priority: number): string {
        if (priority <= 2) return '#dc2626'; // Red for critical
        if (priority <= 4) return '#ea580c'; // Orange for high  
        if (priority <= 6) return '#3b82f6'; // Blue for medium
        return '#10b981'; // Green for low
    }

    function getUrgencyColor(urgency?: string): string {
        switch (urgency) {
            case 'immediate': return '#dc2626'; // Red
            case 'urgent': return '#ea580c'; // Orange
            case 'routine': return '#10b981'; // Green
            default: return '#6b7280'; // Gray
        }
    }

    function getTypeColor(type: string): string {
        switch (type) {
            case 'medication': return '#8b5cf6'; // Purple
            case 'procedure': return '#dc2626'; // Red
            case 'therapy': return '#10b981'; // Green
            case 'lifestyle': return '#3b82f6'; // Blue
            case 'investigation': return '#f59e0b'; // Orange
            case 'immediate': return '#dc2626'; // Red
            case 'referral': return '#06b6d4'; // Cyan
            default: return '#6b7280'; // Gray
        }
    }

    function truncateText(text: string, maxLength: number): string {
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    function getTypeIcon(type: string): string {
        switch (type) {
            case 'medication': return '💊';
            case 'procedure': return '🔧';
            case 'therapy': return '🗣️';
            case 'lifestyle': return '🏃';
            case 'investigation': return '🔍';
            case 'immediate': return '🚨';
            case 'referral': return '👨‍⚕️';
            default: return '📋';
        }
    }
</script>

<button 
    class="treatment-card"
    onclick={ontreatmentClick}
    style="--priority-color: {getPriorityColor(treatment.priority)}; --urgency-color: {getUrgencyColor(treatment.urgency)}; --type-color: {getTypeColor(treatment.type)}"
>
    <div class="card-header">
        <div class="priority-badge">P{treatment.priority}</div>
        <div class="badges">
            {#if treatment.urgency}
                <div class="urgency-badge">{treatment.urgency}</div>
            {/if}
            {#if treatment.confidence}
                <div class="confidence">
                    {Math.round(treatment.confidence * 100)}%
                </div>
            {/if}
        </div>
    </div>

    <div class="card-content">
        <div class="treatment-header">
            <span class="type-icon">{getTypeIcon(treatment.type)}</span>
            <h4 class="treatment-name">{truncateText(treatment.name, 50)}</h4>
        </div>
        
        <div class="type-indicator" style="color: {getTypeColor(treatment.type)}">
            {$t(`session.treatment-types.${treatment.type}`)}
        </div>

        {#if treatment.dosage}
            <div class="meta-info">
                <span class="dosage">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14,2 14,8 20,8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10,9 9,9 8,9"></polyline>
                    </svg>
                    {treatment.dosage}
                </span>
            </div>
        {/if}

        {#if treatment.duration}
            <div class="meta-info">
                <span class="duration">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    {treatment.duration}
                </span>
            </div>
        {/if}

        {#if treatment.description}
            <p class="description">{truncateText(treatment.description, 80)}</p>
        {/if}

        {#if treatment.effectiveness}
            <div class="effectiveness">
                <span class="effectiveness-label">Effectiveness:</span>
                <div class="effectiveness-bar">
                    <div 
                        class="effectiveness-fill" 
                        style="width: {treatment.effectiveness * 100}%"
                    ></div>
                </div>
            </div>
        {/if}
    </div>

    <div class="card-footer">
        <div class="status-indicators">
            {#if treatment.requiresFollowUp}
                <span class="status-tag followup">Follow-up Required</span>
            {/if}
            {#if treatment.sideEffects && treatment.sideEffects.length > 0}
                <span class="status-tag side-effects">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                        <line x1="12" y1="9" x2="12" y2="13"></line>
                        <line x1="12" y1="17" x2="12.01" y2="17"></line>
                    </svg>
                    Side Effects
                </span>
            {/if}
        </div>
        
        {#if treatment.relationships && treatment.relationships.length > 0}
            <span class="relationship-count">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2L2 7L12 12L22 7L12 2Z"></path>
                    <path d="M2 17L12 22L22 17"></path>
                    <path d="M2 12L12 17L22 12"></path>
                </svg>
                {treatment.relationships.length}
            </span>
        {/if}
    </div>
</button>

<style>
    .treatment-card {
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
        min-height: 180px;
    }

    .treatment-card:hover {
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        transform: translateY(-2px);
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

    .badges {
        display: flex;
        gap: 0.25rem;
        align-items: center;
    }

    .urgency-badge {
        background: var(--urgency-color);
        color: white;
        padding: 0.125rem 0.375rem;
        border-radius: 8px;
        font-size: 0.625rem;
        font-weight: 700;
        text-transform: uppercase;
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

    .treatment-header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.5rem;
    }

    .type-icon {
        font-size: 1.25rem;
        line-height: 1;
    }

    .treatment-name {
        margin: 0;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--color-text-primary, #1f2937);
        line-height: 1.4;
        flex: 1;
    }

    .type-indicator {
        font-size: 0.625rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 0.5rem;
    }

    .meta-info {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 0.25rem;
    }

    .dosage,
    .duration {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        font-size: 0.75rem;
        color: var(--color-text-secondary, #6b7280);
    }

    .description {
        margin: 0.5rem 0 0 0;
        font-size: 0.75rem;
        color: var(--color-text-secondary, #6b7280);
        line-height: 1.3;
    }

    .effectiveness {
        margin-top: 0.5rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .effectiveness-label {
        font-size: 0.625rem;
        color: var(--color-text-secondary, #6b7280);
        font-weight: 600;
    }

    .effectiveness-bar {
        flex: 1;
        height: 6px;
        background: var(--color-surface, #f8fafc);
        border-radius: 3px;
        overflow: hidden;
    }

    .effectiveness-fill {
        height: 100%;
        background: var(--color-positive, #10b981);
        transition: width 0.3s ease;
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
        display: flex;
        align-items: center;
        gap: 0.125rem;
    }

    .status-tag.followup {
        background: rgba(59, 130, 246, 0.1);
        color: var(--color-info, #3b82f6);
        border: 1px solid rgba(59, 130, 246, 0.2);
    }

    .status-tag.side-effects {
        background: rgba(245, 158, 11, 0.1);
        color: var(--color-warning, #f59e0b);
        border: 1px solid rgba(245, 158, 11, 0.2);
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