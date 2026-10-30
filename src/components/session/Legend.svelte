<script lang="ts">
    import { COLORS } from './config/visual-config';
    import { t } from '$lib/i18n';

    interface Props {
        detailed?: boolean;
    }

    let { detailed = false }: Props = $props();

    const nodeTypes = $derived([
        { type: 'symptom', color: COLORS.LEGEND.SYMPTOM, label: $t('session.headers.symptoms') },
        { type: 'diagnosis', color: COLORS.LEGEND.DIAGNOSIS, label: $t('session.headers.diagnoses') },
        { type: 'treatment', color: COLORS.LEGEND.TREATMENT, label: $t('session.headers.treatments') },
        { type: 'question', color: COLORS.LEGEND.QUESTION, label: $t('session.headers.questions') },
        { type: 'alert', color: COLORS.LEGEND.ALERT, label: $t('session.headers.alerts') }
    ]);

    const sources = $derived([
        { source: 'transcript', color: COLORS.SOURCES.TRANSCRIPT, label: $t('session.sources.transcript') },
        { source: 'medical_history', color: COLORS.SOURCES.MEDICAL_HISTORY, label: $t('session.sources.medical_history') },
        { source: 'family_history', color: COLORS.SOURCES.FAMILY_HISTORY, label: $t('session.sources.family_history') },
        { source: 'social_history', color: COLORS.SOURCES.SOCIAL_HISTORY, label: $t('session.sources.social_history') },
        { source: 'medication_history', color: COLORS.SOURCES.MEDICATION_HISTORY, label: $t('session.sources.medication_history') },
        { source: 'suspected', color: COLORS.SOURCES.SUSPECTED, label: $t('session.sources.suspected') }
    ]);

    const relationships = $derived([
        { type: 'supports', color: COLORS.RELATIONSHIPS.SUPPORTS, label: $t('session.relationships.supports') },
        { type: 'confirms', color: COLORS.RELATIONSHIPS.CONFIRMS, label: $t('session.relationships.confirms') },
        { type: 'suggests', color: COLORS.RELATIONSHIPS.SUGGESTS, label: $t('session.relationships.suggests') },
        { type: 'indicates', color: COLORS.RELATIONSHIPS.INDICATES, label: $t('session.relationships.indicates') },
        { type: 'contradicts', color: COLORS.RELATIONSHIPS.CONTRADICTS, label: $t('session.relationships.contradicts') },
        { type: 'rules_out', color: COLORS.RELATIONSHIPS.RULES_OUT, label: $t('session.relationships.rules_out') },
        { type: 'treats', color: COLORS.RELATIONSHIPS.TREATS, label: $t('session.relationships.treats') },
        { type: 'manages', color: COLORS.RELATIONSHIPS.MANAGES, label: $t('session.relationships.manages') },
        { type: 'requires', color: COLORS.RELATIONSHIPS.REQUIRES, label: $t('session.relationships.requires') },
        { type: 'investigates', color: COLORS.RELATIONSHIPS.INVESTIGATES, label: $t('session.relationships.investigates') },
        { type: 'clarifies', color: COLORS.RELATIONSHIPS.CLARIFIES, label: $t('session.relationships.clarifies') },
        { type: 'explores', color: COLORS.RELATIONSHIPS.EXPLORES, label: $t('session.relationships.explores') }
    ]);

    const priorities = $derived([
        { range: '1-2', color: COLORS.PRIORITY.HIGH, label: $t('session.priority.critical') },
        { range: '3-4', color: COLORS.PRIORITY.MEDIUM, label: $t('session.priority.high') },
        { range: '5-6', color: COLORS.UI.INFO, label: $t('session.priority.medium') },
        { range: '7-10', color: COLORS.PRIORITY.LOW, label: $t('session.priority.low') }
    ]);
</script>

<div class="legend" class:detailed>
    
    <div class="legend-section">
        <h5>Node Types</h5>
        <div class="legend-items">
            {#each nodeTypes as item}
                <div class="legend-item">
                    <div 
                        class="color-indicator node-indicator"
                        style="background-color: {item.color}"
                    ></div>
                    <span class="label">{item.label}</span>
                </div>
            {/each}
        </div>
    </div>

    {#if detailed}
        <div class="legend-section">
            <h5>Symptom Sources</h5>
            <div class="legend-items">
                {#each sources as item}
                    <div class="legend-item">
                        <div 
                            class="color-indicator source-indicator"
                            style="background-color: {item.color}"
                        ></div>
                        <span class="label">{item.label}</span>
                    </div>
                {/each}
            </div>
        </div>

        <div class="legend-section">
            <h5>{$t('session.headers.relationships')}</h5>
            <div class="legend-items">
                {#each relationships as item}
                    <div class="legend-item">
                        <div 
                            class="color-indicator line-indicator"
                            style="background-color: {item.color}"
                        ></div>
                        <span class="label">{item.label}</span>
                    </div>
                {/each}
            </div>
        </div>

        <div class="legend-section">
            <h5>Priority Levels</h5>
            <div class="legend-items">
                {#each priorities as item}
                    <div class="legend-item">
                        <div 
                            class="color-indicator priority-indicator"
                            style="background-color: {item.color}"
                        ></div>
                        <span class="label">{item.label} ({item.range})</span>
                    </div>
                {/each}
            </div>
        </div>

        <div class="legend-section">
            <h5>Interaction Guide</h5>
            <div class="interaction-guide">
                <div class="guide-item">
                    <span class="action">{$t('session.interactions.click')}</span>
                    <span class="description">{$t('session.interactions.select-details')}</span>
                </div>
                <div class="guide-item">
                    <span class="action">{$t('session.interactions.hover')}</span>
                    <span class="description">{$t('session.interactions.preview-relationships')}</span>
                </div>
                <div class="guide-item">
                    <span class="action">{$t('session.interactions.pinch')}</span>
                    <span class="description">{$t('session.interactions.zoom')}</span>
                </div>
            </div>
        </div>
    {:else}
        <div class="compact-info">
            <p class="info-text">
{$t('session.interactions.click-nodes')}
            </p>
        </div>
    {/if}
</div>

<style>
    .legend {
        border-radius: 0.8rem;
        padding: 1.6rem;
        font-size: 1.4rem;
        max-width: 28rem;
    }

    .legend.detailed {
        max-width: none;
        width: 100%;
    }


    .legend-section {
        margin-bottom: 2rem;
    }

    .legend-section:last-child {
        margin-bottom: 0;
    }

    .legend-section h5 {
        margin: 0 0 0.8rem;
        font-size: 1.4rem;
        font-weight: 600;
        color: var(--color-text-primary, #1f2937);
    }

    .legend-items {
        display: grid;
        gap: 0.6rem;
    }

    .legend-item {
        display: flex;
        align-items: center;
        gap: 0.8rem;
    }

    .color-indicator {
        width: 1.2rem;
        height: 1.2rem;
        border-radius: 0.2rem;
        flex-shrink: 0;
    }

    .node-indicator {
        border-radius: 0.3rem;
        border: 1px solid rgba(0,0,0,0.1);
    }

    .source-indicator {
        width: 0.4rem;
        height: 1.6rem;
        border-radius: 0.2rem;
    }

    .line-indicator {
        height: 0.3rem;
        width: 2rem;
        border-radius: 1px;
    }

    .priority-indicator {
        border-radius: 50%;
        width: 1rem;
        height: 1rem;
    }

    .label {
        color: var(--color-text-primary, #1f2937);
        font-size: 1.4rem;
    }

    .compact-info {
        margin-top: 1.2rem;
    }

    .info-text {
        margin: 0;
        color: var(--color-text-secondary, #6b7280);
        font-size: 1.2rem;
        line-height: 1.4;
    }

    .interaction-guide {
        display: grid;
        gap: 0.6rem;
    }

    .guide-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .action {
        font-weight: 600;
        color: var(--color-interactivity, #3b82f6);
        font-size: 1.2rem;
    }

    .description {
        color: var(--color-text-secondary, #6b7280);
        font-size: 1.2rem;
    }

    /* Responsive adjustments */
    @media (max-width: 768px) {
        .legend {
            font-size: 1.2rem;
            padding: 1.2rem;
        }


        .legend-section h5 {
            font-size: 1.2rem;
        }

        .label,
        .action,
        .description {
            font-size: 1.2rem;
        }

        .color-indicator {
            width: 1rem;
            height: 1rem;
        }

        .source-indicator {
            width: 0.3rem;
            height: 1.4rem;
        }

        .line-indicator {
            width: 1.6rem;
            height: 0.2rem;
        }
    }
</style>