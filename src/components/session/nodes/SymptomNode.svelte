<script lang="ts">
    import type { SymptomNode as SymptomData, SankeyNode } from '../types/visualization';
    import { getSourceColor, getPriorityColor } from '../config/visual-config';
    import { t } from '$lib/i18n';
    
    interface Props {
        node: SankeyNode;
        symptom: SymptomData;
        isMobile: boolean;
        isSelected?: boolean;
    }

    let { node, symptom, isMobile, isSelected = false }: Props = $props();
    
    function truncateText(text: string, maxLength: number): string {
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }
    
    function getPriorityColorLocal(priority: number): string {
        if (priority <= 2) return '#dc2626'; // Red for critical
        if (priority <= 4) return '#ea580c'; // Orange for high  
        if (priority <= 6) return '#3b82f6'; // Blue for medium
        return '#10b981'; // Green for low
    }
    
    function getSourceColorLocal(source: string): string {
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
    
    function getOpacityForSeverity(severity: number): number {
        if (severity <= 2) return 1.0;   // Critical - full opacity
        if (severity <= 4) return 0.9;   // High - high opacity
        if (severity <= 6) return 0.7;   // Medium - medium opacity
        return 0.5;                      // Low - lower opacity
    }
</script>

<div 
    class="session-node symptom session-source-{symptom.source}" 
    class:mobile={isMobile}
    style="--color-opacity: {getOpacityForSeverity(symptom.severity)};"
>

<div class="session-node-meta">
    {#if symptom.duration}
        <span class="duration">{symptom.duration}{$t('session.units.days-short')}</span>
    {/if}
    {#if symptom.characteristics && symptom.characteristics.length > 0}
        <!--span class="characteristics-count">{symptom.characteristics.length} traits</span-->
    {/if}
    {#if symptom.confidence}
            <!--div class="confidence-score">{Math.round(symptom.confidence * 100)}%</div-->
        {/if}
    
    <div class="session-severity-badge severity-{symptom.severity}">S{symptom.severity}</div>
</div>
      
    
    
    <div class="session-node-content">
        <div class="session-node-name">{truncateText(symptom.text, isMobile ? 20 : 45)}</div>
    </div>
</div>

<style>
    /* Most node styles now use shared session-* classes */
    
  
    
    /* Severity badge styles now use session-severity-badge class */
    

    .confidence-score {
        color: #1f2937;
        font-size: 0.7em;
        font-weight: 600;
        background: rgba(255, 255, 255, 0.9);
        padding: 1px 4px;
        border-radius: 3px;
        line-height: 1;
        text-shadow: none;
    }
    
    /* Node content, text, and meta styles now use session-* classes */
    
    .duration,
    .characteristics-count {
        font-size: 0.65em;
        color: #4b5563;
        font-weight: 500;
        background: rgba(255, 255, 255, 0.7);
        padding: 1px 3px;
        line-height: 1;
    }
    
    .characteristics-count {
        background: rgba(59, 130, 246, 0.1);
        color: #3b82f6;
        border: 1px solid rgba(59, 130, 246, 0.2);
    }
    
    /* Responsive adjustments now handled by session-* classes */
    
</style>