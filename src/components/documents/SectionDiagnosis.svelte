<script lang="ts">
    import { t } from '$lib/i18n';
    import AskButton from '$components/chat/AskButton.svelte';

    interface Props {
        data: any;
        document?: any;
        key?: string;
    }

    let { data, document, key }: Props = $props();

    // Check if we have diagnosis data
    let hasDiagnoses = $derived(data && Array.isArray(data) && data.length > 0);
    
    // Helper functions
    function getTypeClass(type: string): string {
        const typeClasses: Record<string, string> = {
            'primary': 'diagnosis-primary',
            'secondary': 'diagnosis-secondary',
            'differential': 'diagnosis-differential',
            'rule_out': 'diagnosis-rule-out',
            'provisional': 'diagnosis-provisional',
            'confirmed': 'diagnosis-confirmed'
        };
        return typeClasses[type] || 'diagnosis-general';
    }
    
    function getConfidenceClass(confidence: string): string {
        const confidenceClasses: Record<string, string> = {
            'confirmed': 'confidence-confirmed',
            'probable': 'confidence-probable',
            'possible': 'confidence-possible',
            'suspected': 'confidence-suspected'
        };
        return confidenceClasses[confidence] || 'confidence-unknown';
    }
    
    function getTypeLabel(type: string): string {
        const key = `report.diagnosis-types.${type}`;
        const translated = $t(key);
        // If translation exists, use it; otherwise fallback to the original type
        return translated !== key ? translated : type;
    }
</script>

{#if hasDiagnoses}
    <h3 class="h3 heading -sticky">{$t('report.diagnosis')}</h3>
    
    <ul class="list-items">
        {#each data as diagnosis}
            <li class="panel {getTypeClass(diagnosis.type)}">
                <div class="diagnosis-header">
                    <div class="diagnosis-main">
                        {#if diagnosis.code}
                            <span class="diagnosis-code">{diagnosis.code}</span>
                        {/if}
                        <h5 class="item-name">{diagnosis.description || diagnosis.name}</h5>
                    </div>
                    <div class="diagnosis-badges">
                        {#if diagnosis.type}
                            <span class="type-badge {getTypeClass(diagnosis.type)}">{getTypeLabel(diagnosis.type)}</span>
                        {/if}
                        <!--{#if diagnosis.confidence}
                            <span class="confidence-badge {getConfidenceClass(diagnosis.confidence)}">{diagnosis.confidence}</span>
                        {/if}-->
                        <AskButton
                            type="diagnosis"
                            label={diagnosis.description || diagnosis.name}
                            data={diagnosis}
                            documentId={document?.id}
                            documentTitle={document?.content?.title}
                        />
                    </div>
                </div>
                
                <div class="item-details">
                    {#if diagnosis.date}
                        <div class="detail-item">
                            <span class="label">{$t('report.diagnosis-date')}:</span>
                            <span class="value">{diagnosis.date}</span>
                        </div>
                    {/if}
                </div>
                
                {#if diagnosis.notes}
                    <div class="item-notes">
                        <span class="label">{$t('report.notes')}:</span>
                        <p>{diagnosis.notes}</p>
                    </div>
                {/if}
            </li>
        {/each}
    </ul>
{:else if data}
    <h3 class="h3 heading -sticky">{$t('report.diagnosis')}</h3>
    <div class="page -block">
        <p class="no-data">{$t('report.no-diagnosis-data')}</p>
    </div>
{/if}

<style>
    /* SectionDiagnosis specific panel types */
    
    /* Panel type variations */
    .diagnosis-primary {
        border-left-color: var(--color-primary);
    }
    
    .diagnosis-secondary {
        border-left-color: var(--color-secondary);
    }
    
    .diagnosis-differential {
        border-left-color: var(--color-warning);
    }
    
    .diagnosis-rule-out {
        border-left-color: var(--color-danger);
    }
    
    .diagnosis-provisional {
        border-left-color: var(--color-info);
    }
    
    .diagnosis-confirmed {
        border-left-color: var(--color-success);
    }
    
    /* Content styling */
    .diagnosis-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 0.75rem;
        gap: 1rem;
    }
    
    .diagnosis-main {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    
    .diagnosis-code {
        background-color: var(--color-highlight);
        color: var(--color-highlight-text);
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
        font-family: monospace;
    }
    
    .diagnosis-description {
        font-size: 1.1rem;
        font-weight: 600;
        margin: 0.25rem 0 0 0;
        color: var(--color-text-primary);
        display: inline;
    }
    
    .diagnosis-badges {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        align-items: flex-end;
    }
    
    .type-badge {
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
        text-transform: uppercase;
    }
    
    .diagnosis-primary .type-badge {
        background-color: var(--color-primary-light);
        color: var(--color-primary-dark);
    }
    
    .diagnosis-secondary .type-badge {
        background-color: var(--color-secondary-light);
        color: var(--color-secondary-dark);
    }
    
    .diagnosis-differential .type-badge {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
    }
    
    .diagnosis-rule-out .type-badge {
        background-color: var(--color-danger-light);
        color: var(--color-danger-dark);
    }
    
    .diagnosis-provisional .type-badge {
        background-color: var(--color-info-light);
        color: var(--color-info-dark);
    }
    
    .diagnosis-confirmed .type-badge {
        background-color: var(--color-success-light);
        color: var(--color-success-dark);
    }
    
    .confidence-badge {
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
        text-transform: capitalize;
    }
    
    .confidence-confirmed {
        background-color: var(--color-success-light);
        color: var(--color-success-dark);
    }
    
    .confidence-probable {
        background-color: var(--color-info-light);
        color: var(--color-info-dark);
    }
    
    .confidence-possible {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
    }
    
    .confidence-suspected {
        background-color: var(--color-danger-light);
        color: var(--color-danger-dark);
    }
    
    /* diagnosis-details now uses global .item-details styles */
    
    /* diagnosis-notes now uses global .item-notes styles */
    
    /* Uses global .no-data styles */
</style>