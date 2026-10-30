<script lang="ts">
    import QuestionsSection from './shared/QuestionsSection.svelte';
    import AlertsSection from './shared/AlertsSection.svelte';
    import { t } from '$lib/i18n';
    import { sessionDataActions } from '$lib/session/stores/session-data-store';

    interface Props {
        questions: any[];
        alerts: any[];
    }

    let { questions = [], alerts = [] }: Props = $props();

    let activeTab: 'questions' | 'alerts' = $state('questions');

    const pendingQuestions = $derived(questions.filter(q => q.status === 'pending').length);
    const pendingAlerts = $derived(alerts.filter(a => a.status === 'pending').length);


    function handleAlertAcknowledge(alertId: string) {
        // Use centralized store action
        sessionDataActions.acknowledgeAlert(alertId);
    }
</script>

<div class="question-manager">
    <header class="manager-header">
        <div class="tabs">
            <button 
                class="tab"
                class:active={activeTab === 'questions'}
                onclick={() => activeTab = 'questions'}
            >
                {$t('session.headers.questions')} <!--({questions.length})-->
                {#if pendingQuestions > 0}
                    <span class="badge">{pendingQuestions}</span>
                {/if}
            </button>
            <button 
                class="tab"
                class:active={activeTab === 'alerts'}
                onclick={() => activeTab = 'alerts'}
            >
                {$t('session.headers.alerts')} <!--({alerts.length})-->
                {#if pendingAlerts > 0}
                    <span class="badge">{pendingAlerts}</span>
                {/if}
            </button>
        </div>
    </header>

    <div class="content">
        {#if activeTab === 'questions'}
            <QuestionsSection 
                questions={questions}
                showFilters={true}
            />
        {:else}
            <AlertsSection 
                alerts={alerts}
                showFilters={true}
                onalertAcknowledge={handleAlertAcknowledge}
            />
        {/if}
    </div>
</div>

<style>
    .question-manager {
        display: flex;
        flex-direction: column;
        height: 100%;
    }

    .manager-header {
        padding: 1.6rem;
        border-bottom: 1px solid var(--color-border, #e2e8f0);
    }

    .tabs {
        display: flex;
        gap: 0.4rem;
    }

    .tab {
        position: relative;
        padding: 0.8rem 1.6rem;
        font-size: 1.4rem;
        border: 1px solid var(--color-border, #e2e8f0);
        background: var(--color-surface, #fff);
        border-radius: 0.6rem;
        cursor: pointer;
        transition: all 0.2s ease;
        font-weight: 500;
    }

    .tab.active {
        background: var(--color-interactivity, #3b82f6);
        color: white;
        border-color: var(--color-interactivity, #3b82f6);
    }

    .badge {
        position: absolute;
        top: -0.4rem;
        right: -0.4rem;
        background: var(--color-negative, #dc2626);
        color: white;
        font-size: 1.2rem;
        padding: 0.2rem 0.6rem;
        border-radius: 1rem;
        min-width: 1.6rem;
        text-align: center;
    }

    .content {
        flex: 1;
        overflow-y: auto;
        padding: 1.6rem;
    }

    /* Mobile optimizations */
    @media (max-width: 768px) {
        .manager-header,
        .content {
            padding: 1.2rem;
        }
    }
</style>