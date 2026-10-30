<script lang="ts">
    import type { DiagnosisNode as DiagnosisData, SankeyNode } from '../types/visualization';
    import { t } from '$lib/i18n';
    
    interface Props {
        node: SankeyNode;
        diagnosis: DiagnosisData;
        isMobile: boolean;
        isSelected?: boolean;
    }

    let { node, diagnosis, isMobile, isSelected = false }: Props = $props();
    
    function truncateText(text: string, maxLength: number): string {
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }
    function getPriorityColorLocal(priority: number): string {
        if (priority <= 2) return '#dc2626'; // Red for critical
        if (priority <= 4) return '#ea580c'; // Orange for high  
        if (priority <= 6) return '#3b82f6'; // Blue for medium
        return ''; // Green for low
    }
    function getPrioritylevel(priority: number): string {
        if (priority <= 2) return 'critical';
        if (priority <= 4) return 'high'; 
        if (priority <= 6) return 'medium';
        return 'low'; 
    }
    

    
    function getProbabilityLevel(probability: number): string {
        if (probability >= 0.8) return 'high';
        if (probability >= 0.6) return 'medium';
        if (probability >= 0.4) return 'low';
        return 'very-low';
    }
    
    function getOpacityForPriority(priority: number): number {
        if (priority <= 2) return 1.0;   // Critical - full opacity
        if (priority <= 4) return 0.9;   // High - high opacity
        if (priority <= 6) return 0.7;   // Medium - medium opacity
        return 0.5;                      // Low - lower opacity
    }
</script>

<div 
    class="diagnosis-node priority-{getPrioritylevel(diagnosis.priority)}" 
    class:mobile={isMobile}
    style="--color-opacity: {getOpacityForPriority(diagnosis.priority)};"
>
    <div class="diagnosis-meta">
        {#if diagnosis.icd10}
            <div class="icd10-code">{diagnosis.icd10}</div>
        {/if}
        {#if diagnosis.subtype}
            <div class="subtype">{truncateText(diagnosis.subtype, isMobile ? 12 : 16)}</div>
        {/if}
        {#if diagnosis.redFlags && diagnosis.redFlags.length > 0}
            <div class="red-flags">🚩 {diagnosis.redFlags.length}</div>
        {/if}
        <div class="node-indicators">
            {#if diagnosis.requiresInvestigation}
                <div class="investigation-flag">!</div>
            {/if}
        </div>
        <div class="probability-badge probability-{getProbabilityLevel(diagnosis.probability)}">
            {Math.round(diagnosis.probability * 100)}%
        </div>
    </div>
    
    <div class="diagnosis-content">
        <div class="diagnosis-name">{truncateText(diagnosis.name, isMobile ? 18 : 60)}</div>

        {#if diagnosis.suppressed}
            <div class="suppressed-indicator">{$t('session.labels.suppressed')}</div>
        {/if}
    </div>
</div>

<style>
    .diagnosis-node {
        position: relative;
        width: 100%;
        height: 100%;
        /*min-height: 3rem;
        border-radius: 6px;*/
        padding: 0.6rem;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        font-family: system-ui, sans-serif;
        border: 0px solid transparent;
        
        /* Color with opacity control */
        --base-color-rgb: 167, 209, 255;  /* Light blue */
        --color-opacity: 0.8;             /* Default opacity */
        background-color: rgba(var(--base-color-rgb), var(--color-opacity));
        
        border-left-color: #ffffff;
        border-left-width: 0.8rem;
        /*border: 2px solid rgba(255, 255, 255, 0.3);
        backdrop-filter: blur(4px);*/
    }

    .diagnosis-node.priority-critical {
        border-color: #dc2626;
    }
    .diagnosis-node.priority-high {
        border-color: #ed6700;
    }
    .diagnosis-node.priority-medium {
        border-color: #fba91b;
    }
    .diagnosis-node.selected {
        box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
    }
    
   
    
    .node-indicators {
        display: flex;
        gap: 0.3rem;
        align-items: center;
    }
    
    .priority-indicator {
        width: 1rem;
        height: 1rem;
        border-radius: 50%;
        border: 2px solid rgba(255, 255, 255, 0.8);
        flex-shrink: 0;
    }
    
    .investigation-flag {
        width: 1.4rem;
        height: 1.4rem;
        border-radius: 0.3rem;
        background: rgba(245, 158, 11, 0.9);
        color: white;
        font-size: 1rem;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
        text-shadow: 0 1px 1px rgba(0, 0, 0, 0.3);
    }
    
    .probability-badge {
        font-size: 1rem;
        font-weight: 700;
        color: white;
        padding: 0.2rem 0.6rem;
        border-radius: 0.4rem;
        line-height: 1;
        text-shadow: 0 1px 1px rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.3);
    }
    
    .probability-badge.probability-high {
        background: rgba(16, 185, 129, 0.9); /* Green for high probability */
    }
    
    .probability-badge.probability-medium {
        background: rgba(59, 130, 246, 0.9); /* Blue for medium probability */
    }
    
    .probability-badge.probability-low {
        background: rgba(245, 158, 11, 0.9); /* Orange for low probability */
    }
    
    .probability-badge.probability-very-low {
        background: rgba(107, 114, 128, 0.9); /* Gray for very low probability */
    }
    
    .diagnosis-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        text-align: center;
        gap: 0.3rem;
        margin-top: 0.3rem;
    }
    
    .diagnosis-name {
        font-weight: 700;
        line-height: 1.1;
        text-align: center;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    
    .diagnosis-meta {
        position: absolute;
        right: 0;
        top: 0;
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 0.3rem;
        align-items: center;
    }
    
    .icd10-code {
        font-size: 0.6em;
        color: #4338ca;
        font-weight: 600;
        background: rgba(67, 56, 202, 0.1);
        padding: 1px 0.4rem;
        border-radius: 0.2rem;
        line-height: 1;
        border: 1px solid rgba(67, 56, 202, 0.2);
    }
    
    .subtype {
        font-size: 0.6em;
        color: #6b7280;
        font-style: italic;
        background: rgba(255, 255, 255, 0.7);
        padding: 1px 0.3rem;
        border-radius: 0.2rem;
        line-height: 1;
    }
    
    .red-flags {
        font-size: 0.6em;
        color: #dc2626;
        font-weight: 600;
        background: rgba(220, 38, 38, 0.1);
        padding: 1px 0.3rem;
        border-radius: 0.2rem;
        line-height: 1;
        border: 1px solid rgba(220, 38, 38, 0.2);
    }
    
    .suppressed-indicator {
        position: absolute;
        bottom: 0.2rem;
        right: 0.2rem;
        font-size: 0.55em;
        color: #6b7280;
        font-weight: 600;
        background: rgba(107, 114, 128, 0.1);
        padding: 1px 0.3rem;
        border-radius: 0.2rem;
        line-height: 1;
        opacity: 0.8;
    }
    
    /* Mobile responsive adjustments */
    .diagnosis-node.mobile {
        padding: 0.4rem;
    }
    
    .diagnosis-node.mobile .diagnosis-name {
        font-size: 1rem;
    }
    
    .diagnosis-node.mobile .probability-badge {
        font-size: 0.8rem;
        padding: 1px 0.3rem;
    }
    
    .diagnosis-node.mobile .investigation-flag {
        width: 1.2rem;
        height: 1.2rem;
        font-size: 1rem;
    }
    
    .diagnosis-node.mobile .priority-indicator {
        width: 0.8rem;
        height: 0.8rem;
    }
    
    .diagnosis-node.mobile .icd10-code,
    .diagnosis-node.mobile .subtype,
    .diagnosis-node.mobile .red-flags {
        font-size: 0.55em;
    }
    
    .diagnosis-node.mobile .suppressed-indicator {
        font-size: 0.5em;
    }
    
    /* Desktop styling */
    .diagnosis-node:not(.mobile) .diagnosis-name {
        font-size: 1.2rem;
    }
    
    .diagnosis-node:not(.mobile) .probability-badge {
        font-size: 1rem;
    }
</style>