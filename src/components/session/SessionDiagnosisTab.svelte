<script lang="ts">
    import type { DiagnosisNode } from './types/visualization';
    import DiagnosisCard from './shared/DiagnosisCard.svelte';
    import { t } from '$lib/i18n';
    import { sessionViewerActions } from '$lib/session/stores/session-viewer-store';

    interface Props {
        diagnoses: DiagnosisNode[];
        ondiagnosisSelect?: (diagnosisId: string) => void;
    }

    let { diagnoses = [], ondiagnosisSelect }: Props = $props();

    function handleDiagnosisClick(diagnosisId: string) {
        ondiagnosisSelect?.(diagnosisId);
        sessionViewerActions.selectDetailsTab();
    }

    // Sort diagnoses by priority (most critical first) and then by probability
    const sortedDiagnoses = $derived(
        [...diagnoses].sort((a, b) => {
            if (a.priority !== b.priority) {
                return a.priority - b.priority; // Lower number = higher priority
            }
            return b.probability - a.probability; // Higher probability first
        })
    );
</script>

<div class="diagnosis-list">
    <header class="list-header">
        <h3>{$t('session.headers.diagnoses')}</h3>
        <span class="count">({diagnoses.length})</span>
    </header>
    
    <div class="list-content">
        {#if sortedDiagnoses.length === 0}
            <div class="empty-state">
                <p>{$t('session.empty.no-diagnoses')}</p>
            </div>
        {:else}
            <div class="cards-grid">
                {#each sortedDiagnoses as diagnosis (diagnosis.id)}
                    <DiagnosisCard 
                        {diagnosis}
                        ondiagnosisClick={() => handleDiagnosisClick(diagnosis.id)}
                    />
                {/each}
            </div>
        {/if}
    </div>
</div>

<style>
    .diagnosis-list {
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