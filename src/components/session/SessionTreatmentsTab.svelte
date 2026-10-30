<script lang="ts">
    import type { TreatmentNode } from './types/visualization';
    import TreatmentCard from './shared/TreatmentCard.svelte';
    import { t } from '$lib/i18n';
    import { sessionViewerActions } from '$lib/session/stores/session-viewer-store';

    interface Props {
        treatments: TreatmentNode[];
        ontreatmentSelect?: (treatmentId: string) => void;
    }

    let { treatments = [], ontreatmentSelect }: Props = $props();

    function handleTreatmentClick(treatmentId: string) {
        ontreatmentSelect?.(treatmentId);
        sessionViewerActions.selectDetailsTab();
    }

    // Sort treatments by priority (most critical first) and then by type
    const sortedTreatments = $derived(
        [...treatments].sort((a, b) => {
            // First sort by urgency if present
            if (a.urgency && b.urgency) {
                const urgencyOrder = { 'immediate': 0, 'urgent': 1, 'routine': 2 };
                const urgencyDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
                if (urgencyDiff !== 0) return urgencyDiff;
            }
            // Then by priority
            return a.priority - b.priority; // Lower number = higher priority
        })
    );

    // Group treatments by type for better organization
    const treatmentsByType = $derived(() => {
        const groups: Record<string, TreatmentNode[]> = {};
        sortedTreatments.forEach(treatment => {
            if (!groups[treatment.type]) {
                groups[treatment.type] = [];
            }
            groups[treatment.type].push(treatment);
        });
        return groups;
    });
</script>

<div class="treatments-list">
    <header class="list-header">
        <h3>{$t('session.headers.treatments')}</h3>
        <span class="count">({treatments.length})</span>
    </header>
    
    <div class="list-content">
        {#if sortedTreatments.length === 0}
            <div class="empty-state">
                <p>{$t('session.empty.no-treatments')}</p>
            </div>
        {:else}
            <div class="cards-grid">
                {#each sortedTreatments as treatment (treatment.id)}
                    <TreatmentCard 
                        {treatment}
                        ontreatmentClick={() => handleTreatmentClick(treatment.id)}
                    />
                {/each}
            </div>
        {/if}
    </div>
</div>

<style>
    .treatments-list {
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