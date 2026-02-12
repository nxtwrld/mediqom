<script lang="ts">
    import type { TreatmentNode as TreatmentData, SankeyNode } from '../types/visualization';
    import { t } from '$lib/i18n';
    
    interface Props {
        node: SankeyNode;
        treatment: TreatmentData;
        isMobile: boolean;
        isSelected?: boolean;
    }

    let { node, treatment, isMobile, isSelected = false }: Props = $props();
    
    function truncateText(text: string, maxLength: number): string {
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }
    
    function getUrgencyColor(urgency: string): string {
        switch (urgency) {
            case 'immediate': return '#dc2626';
            case 'urgent': return '#ea580c';
            case 'routine': return '#10b981';
            default: return '#6b7280';
        }
    }
    
    function getTreatmentTypeIcon(type: string): string {
        switch (type) {
            case 'medication': return '💊';
            case 'procedure': return '🏥';
            case 'therapy': return '🩺';
            case 'lifestyle': return '🏃';
            case 'investigation': return '🔬';
            case 'immediate': return '⚡';
            case 'referral': return '👨‍⚕️';
            case 'supportive': return '🤝';
            default: return '📋';
        }
    }
    
    function getEffectivenessLevel(effectiveness?: number): string {
        if (!effectiveness) return 'unknown';
        if (effectiveness >= 0.8) return 'high';
        if (effectiveness >= 0.6) return 'medium';
        if (effectiveness >= 0.4) return 'low';
        return 'very-low';
    }
    
    function getOpacityForEffectiveness(effectiveness?: number): number {
        if (!effectiveness) return 0.5;  // Unknown - lower opacity
        if (effectiveness >= 0.8) return 1.0;   // High - full opacity
        if (effectiveness >= 0.6) return 0.9;   // Medium - high opacity
        if (effectiveness >= 0.4) return 0.7;   // Low - medium opacity
        return 0.5;                              // Very low - lower opacity
    }
</script>

<div 
    class="treatment-node treatment-type-{treatment.type} urgency-{treatment.urgency || 'routine'}" 
    class:mobile={isMobile}
    style="--color-opacity: {getOpacityForEffectiveness(treatment.effectiveness)};"
>

<div class="treatment-meta">
    {#if treatment.requiresFollowUp}
        <div class="follow-up">↻</div>
    {/if}
    <div class="treatment-type-label">{$t(`session.treatment-types.${treatment.type}`) || treatment.type}</div>
    {#if treatment.effectiveness}
        <div class="effectiveness-score effectiveness-{getEffectivenessLevel(treatment.effectiveness)}">
            {Math.round(treatment.effectiveness * 100)}%
        </div>
    {/if}
</div>

    <div class="treatment-content">
        <div class="treatment-name">{truncateText(treatment.name, isMobile ? 18 : 22)}</div>

        <!--
        {#if treatment.dosage}
        <div class="dosage">{truncateText(treatment.dosage, isMobile ? 10 : 14)}</div>
        {/if}
        {#if treatment.duration}
            <div class="duration">{treatment.duration}</div>
        {/if}

        {#if treatment.contraindications && treatment.contraindications.length > 0}
            <div class="contraindications">⚠️ {treatment.contraindications.length}</div>
        {/if}
        -->
    </div>
</div>

<style>
    .treatment-node {
        position: relative;
        width: 100%;
        height: 100%;
        /*min-height: 3rem;
        border-radius: 6px;*/
        padding: 6px;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        font-family: system-ui, sans-serif;
        
        /* Color with opacity control - now set by treatment type classes */
        --color-opacity: 0.8;             /* Default opacity */
        background-color: rgba(var(--base-color-rgb), var(--color-opacity));
        
        border: 0px solid transparent;
        border-left-width: .5rem;
        /*border: 2px solid rgba(255, 255, 255, 0.3);
        backdrop-filter: blur(4px);*/
    }

    .treatment-node.urgency-immediate {
        border-color: #dc2626;
    }
    .treatment-node.urgency-urgent {
        border-color: #ea580c;
    }
    .treatment-node.urgency-routine {
        border-color: #10b981;
    }


    .treatment-node.selected {
        /*border-width: 3px;
        border-color: var(--color-primary, #3b82f6);*/
        box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5);
    }
  
    .node-indicators {
        display: flex;
        gap: 3px;
        align-items: center;
    }
    
    .type-icon {
        font-size: 12px;
        line-height: 1;
        filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.2));
    }
    
    .urgency-badge {
        font-size: 8px;
        font-weight: 700;
        color: white;
        width: 14px;
        height: 14px;
        border-radius: 3px;
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
        text-shadow: 0 1px 1px rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.3);
    }
    
    .effectiveness-score {
        font-size: 9px;
        font-weight: 700;
        color: white;
        padding: 2px 5px;
        border-radius: 4px;
        line-height: 1;
        text-shadow: 0 1px 1px rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.3);
    }
    
    .effectiveness-score.effectiveness-high {
        background: rgba(16, 185, 129, 0.9); /* Green for high effectiveness */
    }
    
    .effectiveness-score.effectiveness-medium {
        background: rgba(59, 130, 246, 0.9); /* Blue for medium effectiveness */
    }
    
    .effectiveness-score.effectiveness-low {
        background: rgba(245, 158, 11, 0.9); /* Orange for low effectiveness */
    }
    
    .effectiveness-score.effectiveness-very-low,
    .effectiveness-score.effectiveness-unknown {
        background: rgba(107, 114, 128, 0.9); /* Gray for very low/unknown effectiveness */
    }
    
    .treatment-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        text-align: center;
        gap: 2px;
        margin-top: 14px;
    }
    
    .treatment-name {
        font-weight: 700;
        color: #1f2937;
        line-height: 1.1;
        text-align: center;
        overflow: hidden;
        text-overflow: ellipsis;
        text-shadow: 0 1px 2px rgba(255, 255, 255, 0.8);
        margin-bottom: 1px;
    }
    
    .treatment-type-label {
        font-size: 0.65em;
        color: #6b7280;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        background: rgba(255, 255, 255, 0.6);
        padding: 1px 3px;
        border-radius: 2px;
        line-height: 1;
        margin-bottom: 2px;
    }
    
    .treatment-meta {
        position: absolute;
        top: 0;
        right: 0;
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 3px;
        align-items: center;
        margin-bottom: 2px;
    }
    
    .dosage,
    .duration {
        font-size: 0.6em;
        color: #374151;
        font-weight: 500;
        background: rgba(255, 255, 255, 0.8);
        padding: 1px 3px;
        border-radius: 2px;
        line-height: 1;
        border: 1px solid rgba(107, 114, 128, 0.2);
    }
    
    .dosage {
        color: #7c3aed;
        background: rgba(124, 58, 237, 0.1);
        border-color: rgba(124, 58, 237, 0.2);
    }
    
    .duration {
        color: #059669;
        background: rgba(5, 150, 105, 0.1);
        border-color: rgba(5, 150, 105, 0.2);
    }
    
    .follow-up {
        font-size: 0.7em;
        color: #3b82f6;
        font-weight: 600;
        background: rgba(59, 130, 246, 0.1);
        padding: 1px 3px;
        border-radius: 2px;
        line-height: 1;
        border: 1px solid rgba(59, 130, 246, 0.2);
    }
    
    .contraindications {
        font-size: 0.6em;
        color: #dc2626;
        font-weight: 600;
        background: rgba(220, 38, 38, 0.1);
        padding: 1px 3px;
        border-radius: 2px;
        line-height: 1;
        border: 1px solid rgba(220, 38, 38, 0.2);
        position: absolute;
        bottom: 2px;
        right: 2px;
    }
    
    /* Mobile responsive adjustments */
    .treatment-node.mobile {
        padding: 4px;
    }
    
    .treatment-node.mobile .treatment-name {
        font-size: 9px;
    }
    
    .treatment-node.mobile .treatment-type-label {
        font-size: 0.6em;
    }
    
    .treatment-node.mobile .effectiveness-score {
        font-size: 8px;
        padding: 1px 3px;
    }
    
    .treatment-node.mobile .urgency-badge {
        width: 12px;
        height: 12px;
        font-size: 7px;
    }
    
    .treatment-node.mobile .type-icon {
        font-size: 10px;
    }
    
    .treatment-node.mobile .dosage,
    .treatment-node.mobile .duration,
    .treatment-node.mobile .follow-up {
        font-size: 0.55em;
    }
    
    .treatment-node.mobile .contraindications {
        font-size: 0.55em;
    }
    
    /* Desktop styling */
    .treatment-node:not(.mobile) .treatment-name {
        font-size: 11px;
    }
    
    .treatment-node:not(.mobile) .effectiveness-score {
        font-size: 10px;
    }
</style>