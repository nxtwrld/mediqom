<script lang="ts">
    import type { SymptomNode } from './types/visualization';
    import SymptomCard from './shared/SymptomCard.svelte';
    import { t } from '$lib/i18n';
    import { sessionViewerActions } from '$lib/session/stores/session-viewer-store';

    interface Props {
        symptoms: SymptomNode[];
        onsymptomSelect?: (symptomId: string) => void;
    }

    let { symptoms = [], onsymptomSelect }: Props = $props();

    function handleSymptomClick(symptomId: string) {
        onsymptomSelect?.(symptomId);
        sessionViewerActions.selectDetailsTab();
    }

    // Sort symptoms by severity (most severe first)
    const sortedSymptoms = $derived(
        [...symptoms].sort((a, b) => a.severity - b.severity)
    );
</script>

<div class="symptoms-list">
    <header class="list-header">
        <h3>{$t('session.headers.symptoms')}</h3>
        <span class="count">({symptoms.length})</span>
    </header>
    
    <div class="list-content">
        {#if sortedSymptoms.length === 0}
            <div class="empty-state">
                <p>{$t('session.empty.no-symptoms')}</p>
            </div>
        {:else}
            <div class="cards-grid">
                {#each sortedSymptoms as symptom (symptom.id)}
                    <SymptomCard 
                        {symptom}
                        onsymptomClick={() => handleSymptomClick(symptom.id)}
                    />
                {/each}
            </div>
        {/if}
    </div>
</div>

<style>
    .symptoms-list {
        display: flex;
        flex-direction: column;
        height: 100%;
    }

    .list-header {
        display: flex;
        align-items: center;
        gap: 0.8rem;
        padding: 1.6rem;
        border-bottom: 1px solid var(--color-border, #e2e8f0);
    }

    .list-header h3 {
        margin: 0;
        font-size: 1.8rem;
        font-weight: 600;
        color: var(--color-text-primary, #1f2937);
    }

    .count {
        font-size: 1.4rem;
        color: var(--color-text-secondary, #6b7280);
    }

    .list-content {
        flex: 1;
        overflow-y: auto;
        padding: 1.6rem;
    }

    .cards-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(30rem, 1fr));
        gap: 1.6rem;
    }

    .empty-state {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 20rem;
        color: var(--color-text-secondary, #6b7280);
        font-size: 1.4rem;
    }

    @media (max-width: 768px) {
        .cards-grid {
            grid-template-columns: 1fr;
        }
    }
</style>