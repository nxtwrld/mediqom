<script lang="ts">
    import { run, stopPropagation } from 'svelte/legacy';

    import { getSortForEnum, sortbyProperty } from '$lib/array';
    import { ANALYZE_STEPS } from '$lib/types.d';
    import PropertyTile from '../PropertyTile.svelte';
    import { log } from '$lib/logging/logger';
    import { t } from '$lib/i18n';

    interface Props {
        analysis: any;
        step?: ANALYZE_STEPS;
    }

    let { analysis = $bindable(), step = ANALYZE_STEPS.transcript }: Props = $props();

    enum Origin {
        doctor = 'doctor',
        symptoms = 'symptoms',
        test = 'test',
        diagnosis = 'diagnosis'
    }

    const severityEnum = {
        mild: 0,
        moderate: 1,
        severe: 2
    }

    const priorityEnum = {
        low: 0,
        medium: 1,
        high: 2,
        critical: 3
    }

    const effectivenessEnum = {
        low: 0,
        medium: 1,
        high: 2
    }

    enum DaysOfWeek  {
        Monday = 'Monday',
        Tuesday = 'Tuesday',
        Wednesday = 'Wednesday',
        Thursday = 'Thursday',
        Friday = 'Friday',
        Saturday = 'Saturday',
        Sunday = 'Sunday'
    }
    enum Frequency {
        Daily = 'Dayily',
        Weekdays = 'Weekdays',
        EveryTwoDays = 'EveryTwoDays'
    }   

    function pinSpecialist(ar : {
        pinned: boolean,
        origin: Origin
    }[]) {
        ar.forEach((d) => {
            d.pinned = (d.origin == Origin.doctor);
        })
    }

    function getFrequency(days: DaysOfWeek[] = []): Frequency[] | DaysOfWeek[] {
        if (days.length === 7) {
            return [Frequency.Daily];
        }
        if (days.length === 5) {
            // TODO check only workdays are present
            return [Frequency.Weekdays]
        }
        return days;
    }

    function togglePin(item: any) {
        log.analysis.debug('Pinned', item);
        item.pinned = !item.pinned;
        analysis = {...analysis}
    }

    function removeItem(item: any, object: any[]) {
        object.splice(object.indexOf(item), 1);
        analysis = {...analysis}
    }

    function approveItem(item: any) {
        log.analysis.info('Approved item:', item);
        item.doctorFeedback = 'approved';
        analysis = {...analysis};
        
        // Send feedback to backend for AI learning
        sendFeedbackToAI(item, 'approved');
    }

    function rejectItem(item: any) {
        log.analysis.info('Rejected item:', item);
        item.doctorFeedback = 'rejected';
        analysis = {...analysis};
        
        // Send feedback to backend for AI learning
        sendFeedbackToAI(item, 'rejected');
    }

    function clearFeedback(item: any) {
        log.analysis.info('Cleared feedback for item:', item);
        delete item.doctorFeedback;
        analysis = {...analysis};
        
        // Send feedback to backend
        sendFeedbackToAI(item, 'neutral');
    }

    async function sendFeedbackToAI(item: any, feedback: string) {
        try {
            // We'll implement this endpoint to store feedback for AI learning
            const response = await fetch('/v1/session/feedback', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    itemType: getItemType(item),
                    itemContent: item,
                    feedback: feedback,
                    timestamp: Date.now()
                })
            });
            
            if (response.ok) {
                log.analysis.debug('Feedback sent to AI successfully');
            } else {
                log.analysis.error('Failed to send feedback to AI');
            }
        } catch (error) {
            log.analysis.error('Error sending feedback to AI:', error);
        }
    }

    function getItemType(item: any): string {
        if (item.probability !== undefined) return 'diagnosis';
        if (item.effectiveness !== undefined) return 'treatment';
        if (item.question !== undefined) return 'clarifyingQuestion';
        if (item.recommendation !== undefined) return 'doctorRecommendation';
        if (item.urgency !== undefined) return 'followUp';
        if (item.dosage !== undefined) return 'medication';
        return 'unknown';
    }

    function getFeedbackClass(item: any): string {
        if (item.doctorFeedback === 'approved') return 'feedback-approved';
        if (item.doctorFeedback === 'rejected') return 'feedback-rejected';
        return '';
    }

    // Non-mutating sort functions for Svelte 5 compatibility
    function getSortedSymptoms() {
        if (!analysis.symptoms) return [];
        return [...analysis.symptoms].sort(getSortForEnum(severityEnum, 'severity'));
    }

    function getSortedDiagnosis() {
        if (!analysis.diagnosis) return [];
        return [...analysis.diagnosis].sort(sortbyProperty('probability')).reverse();
    }

    function getSortedRecommendations() {
        if (!analysis.doctorRecommendations) return [];
        return [...analysis.doctorRecommendations].sort(getSortForEnum(priorityEnum, 'priority')).reverse();
    }

    function getSortedQuestions() {
        if (!analysis.clarifyingQuestions) return [];
        return [...analysis.clarifyingQuestions].sort(getSortForEnum(priorityEnum, 'priority')).reverse();
    }

    function getPriorityColor(priority: string): string {
        switch(priority) {
            case 'critical': return 'var(--color-error)';
            case 'high': return 'var(--color-warning)';
            case 'medium': return 'var(--color-info)';
            case 'low': return 'var(--color-success)';
            default: return 'var(--color-gray-500)';
        }
    }

    function getConfidenceColor(probability: number): string {
        if (probability >= 0.8) return 'var(--color-success)';
        if (probability >= 0.6) return 'var(--color-warning)';
        return 'var(--color-error)';
    }

    function formatConfidence(probability: number): string {
        return `${Math.round(probability * 100)}%`;
    }

    run(() => {
        if (analysis.diagnosis) {
            pinSpecialist(analysis.diagnosis);
        }
        if (analysis.treatment) {
            pinSpecialist(analysis.treatment);
        }
        if (analysis.followUp) {
            pinSpecialist(analysis.followUp);
        }
        if (analysis.medication) {
            pinSpecialist(analysis.medication);
        }
    });
</script>

{#if analysis.complaint}
<div class="block block-complaint">
    <p>{analysis.complaint}</p>
</div>
{/if}

{#if analysis.signals}
<div class="block block-results">
    <h4 class="h4">{$t('session.diagnosis.signals')}</h4>
    <div class="block-grid">
        {#each analysis.signals as signal}
            <PropertyTile property={signal} />
        {/each}
    </div>
</div>
{/if}

{#if analysis.symptoms}
<div class="block block-symptoms">
    <h4 class="h4">{$t('session.diagnosis.symptoms')}</h4>
    {#each getSortedSymptoms() as symptom}
    <div class="list-item severity -{symptom.severity}">
        <div class="list-title">{symptom.name}</div>
        <div>{symptom.duration}</div>
        <div>{symptom.bodyParts}</div>
        <div class="actions">
            <button class="list-action remove" aria-label={$t('aria.session.remove-symptom')} onclick={stopPropagation(() => removeItem(symptom, analysis.symptoms))}>
                <svg>
                    <use href="/icons.svg#minus"></use>
                </svg>
            </button>
        </div>
    </div>
    {/each}
</div>
{/if}

<!-- Enhanced Diagnosis Section -->
{#if analysis.diagnosis}
<div class="block block-diagnosis">
    <h4 class="h4">{$t('session.diagnosis.diagnostic-results')}</h4>
    {#each getSortedDiagnosis() as diagnosis}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="list-item diagnosis-item {getFeedbackClass(diagnosis)}" class:-pinned={diagnosis.pinned} onclick={() => togglePin(diagnosis)}>
        <div class="diagnosis-header">
            <div class="diagnosis-code">{#if diagnosis.code}{diagnosis.code}{:else}&nbsp;&nbsp;&nbsp;{/if}</div>
            <div class="list-title">{diagnosis.name}</div>
            <div class="confidence-badge" style="background-color: {getConfidenceColor(diagnosis.probability)}">
                {formatConfidence(diagnosis.probability)}
            </div>
        </div>

        <div class="diagnosis-details">
            <div class="basis">{diagnosis.basis}</div>
            {#if diagnosis.rationale}
                <div class="rationale"><strong>{$t('session.diagnosis.clinical-reasoning')}:</strong> {diagnosis.rationale}</div>
            {/if}
            {#if diagnosis.supportingSymptoms && diagnosis.supportingSymptoms.length > 0}
                <div class="supporting-symptoms">
                    <strong>{$t('session.diagnosis.supporting-symptoms')}:</strong>
                    <div class="symptom-tags">
                        {#each diagnosis.supportingSymptoms as symptom}
                            <span class="symptom-tag">{symptom}</span>
                        {/each}
                    </div>
                </div>
            {/if}
        </div>

        <div class="actions">
            <button class="list-action pin" aria-label={$t('aria.session.pin-diagnosis')} onclick={stopPropagation(() => togglePin(diagnosis))}>
                <svg>
                    <use href="/icons.svg#pin"></use>
                </svg>
            </button>
            <button class="list-action remove" aria-label={$t('aria.session.remove-diagnosis')} onclick={stopPropagation(() => removeItem(diagnosis, analysis.diagnosis))}>
                <svg>
                    <use href="/icons.svg#minus"></use>
                </svg>
            </button>
            <!-- Doctor Feedback Controls -->
            {#if diagnosis.origin === 'suggestion'}
                <div class="feedback-controls">
                    {#if diagnosis.doctorFeedback === 'approved'}
                        <button class="feedback-btn approved" aria-label={$t('aria.session.clear-approval')} onclick={stopPropagation(() => clearFeedback(diagnosis))}>
                            ✓ {$t('session.diagnosis.approved')}
                        </button>
                    {:else if diagnosis.doctorFeedback === 'rejected'}
                        <button class="feedback-btn rejected" aria-label={$t('aria.session.clear-rejection')} onclick={stopPropagation(() => clearFeedback(diagnosis))}>
                            ✗ {$t('session.diagnosis.rejected')}
                        </button>
                    {:else}
                        <button class="feedback-btn approve" aria-label={$t('aria.session.approve-suggestion')} onclick={stopPropagation(() => approveItem(diagnosis))}>
                            ✓
                        </button>
                        <button class="feedback-btn reject" aria-label={$t('aria.session.reject-suggestion')} onclick={stopPropagation(() => rejectItem(diagnosis))}>
                            ✗
                        </button>
                    {/if}
                </div>
            {/if}
        </div>
    </div>
    {/each}
</div>
{/if}

<!-- Doctor Recommendations Section -->
{#if analysis.doctorRecommendations && analysis.doctorRecommendations.length > 0}
<div class="block block-recommendations">
    <h4 class="h4">🎯 {$t('session.diagnosis.clinical-recommendations')}</h4>
    {#each getSortedRecommendations() as recommendation}
    <div class="recommendation-item priority-{recommendation.priority}">
        <div class="recommendation-header">
            <div class="recommendation-type">{(recommendation.type || '').replace('_', ' ').toUpperCase()}</div>
            <div class="priority-badge" style="background-color: {getPriorityColor(recommendation.priority)}">
                {(recommendation.priority || '').toUpperCase()}
            </div>
            <div class="timeframe-badge">{(recommendation.timeframe || '').replace('_', ' ')}</div>
        </div>
        <div class="recommendation-content">
            <div class="recommendation-text">{recommendation.recommendation}</div>
            <div class="recommendation-rationale"><em>{recommendation.rationale}</em></div>
        </div>
    </div>
    {/each}
</div>
{/if}

<!-- Clarifying Questions Section -->
{#if analysis.clarifyingQuestions && analysis.clarifyingQuestions.length > 0}
<div class="block block-questions">
    <h4 class="h4">❓ {$t('session.diagnosis.clarifying-questions')}</h4>
    {#each getSortedQuestions() as question}
        <div class="clarifying-question {getFeedbackClass(question)}">
            <div class="question-header">
                <div class="question-category">
                    <span class="category-badge category-{question.category?.toLowerCase().replace(/\s+/g, '-') || 'general'}">
                        {question.category || 'General'}
                    </span>
                    <span class="intent-badge">
                        {question.intent || 'Assessment'}
                    </span>
                </div>
                <div class="question-actions">
                    <button class="list-action remove" aria-label={$t('aria.session.remove-question')} onclick={() => removeItem(question, analysis.clarifyingQuestions)}>
                        <svg>
                            <use href="/icons.svg#minus"></use>
                        </svg>
                    </button>
                    <!-- Doctor Feedback Controls -->
                    <div class="feedback-controls">
                        {#if question.doctorFeedback === 'approved'}
                            <button class="feedback-btn approved" aria-label={$t('aria.session.clear-approval')} onclick={() => clearFeedback(question)}>
                                ✓ {$t('session.diagnosis.approved')}
                            </button>
                        {:else if question.doctorFeedback === 'rejected'}
                            <button class="feedback-btn rejected" aria-label={$t('aria.session.clear-rejection')} onclick={() => clearFeedback(question)}>
                                ✗ {$t('session.diagnosis.rejected')}
                            </button>
                        {:else}
                            <button class="feedback-btn approve" aria-label={$t('aria.session.approve-suggestion')} onclick={() => approveItem(question)}>
                                ✓
                            </button>
                            <button class="feedback-btn reject" aria-label={$t('aria.session.reject-suggestion')} onclick={() => rejectItem(question)}>
                                ✗
                            </button>
                        {/if}
                    </div>
                </div>
            </div>
            <div class="question-content">
                <h4 class="question-text">{question.question}</h4>
                {#if question.rationale}
                    <p class="question-rationale">{question.rationale}</p>
                {/if}
            </div>
        </div>
    {/each}
</div>
{/if}

<!-- Enhanced Treatment Section -->
{#if analysis.treatment}
<div class="block block-treatment">
    <h4 class="h4">{$t('session.diagnosis.treatment-plan')}</h4>
    {#each analysis.treatment as treatment}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="list-item treatment-item {getFeedbackClass(treatment)}" class:-pinned={treatment.pinned} onclick={() => togglePin(treatment)}>
        <div class="treatment-header">
            <div class="list-title">{treatment.description}</div>
            {#if treatment.effectiveness}
                <div class="effectiveness-badge effectiveness-{treatment.effectiveness}">
                    {(treatment.effectiveness || '').toUpperCase()} {$t('session.diagnosis.effectiveness')}
                </div>
            {/if}
        </div>
        {#if treatment.targetDiagnosis && treatment.targetDiagnosis.length > 0}
            <div class="target-diagnosis">
                <strong>{$t('session.diagnosis.targets')}:</strong>
                {#each treatment.targetDiagnosis as target}
                    <span class="target-tag">{target}</span>
                {/each}
            </div>
        {/if}
        <div class="actions">
            <button class="list-action pin" aria-label={$t('aria.session.pin-treatment')} onclick={stopPropagation(() => togglePin(treatment))}>
                <svg>
                    <use href="/icons.svg#pin"></use>
                </svg>
            </button>
            <button class="list-action remove" aria-label={$t('aria.session.remove-treatment')} onclick={stopPropagation(() => removeItem(treatment, analysis.treatment))}>
                <svg>
                    <use href="/icons.svg#minus"></use>
                </svg>
            </button>
            <!-- Doctor Feedback Controls -->
            {#if treatment.origin === 'suggestion'}
                <div class="feedback-controls">
                    {#if treatment.doctorFeedback === 'approved'}
                        <button class="feedback-btn approved" aria-label={$t('aria.session.clear-approval')} onclick={stopPropagation(() => clearFeedback(treatment))}>
                            ✓ {$t('session.diagnosis.approved')}
                        </button>
                    {:else if treatment.doctorFeedback === 'rejected'}
                        <button class="feedback-btn rejected" aria-label={$t('aria.session.clear-rejection')} onclick={stopPropagation(() => clearFeedback(treatment))}>
                            ✗ {$t('session.diagnosis.rejected')}
                        </button>
                    {:else}
                        <button class="feedback-btn approve" aria-label={$t('aria.session.approve-suggestion')} onclick={stopPropagation(() => approveItem(treatment))}>
                            ✓
                        </button>
                        <button class="feedback-btn reject" aria-label={$t('aria.session.reject-suggestion')} onclick={stopPropagation(() => rejectItem(treatment))}>
                            ✗
                        </button>
                    {/if}
                </div>
            {/if}
        </div>
    </div>
    {/each}
</div>
{/if}

<!-- Enhanced Follow-up Section -->
{#if analysis.followUp}
<div class="block block-follow-up">
    <h4 class="h4">{$t('session.diagnosis.follow-up')}</h4>
    {#each analysis.followUp as followUp}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="list-item followup-item" class:-pinned={followUp.pinned} onclick={() => togglePin(followUp)}>
        <div class="followup-header">
            <div class="followup-type">{(followUp.type || '').toUpperCase()}</div>
            <div class="list-title">{followUp.name}</div>
            {#if followUp.urgency}
                <div class="urgency-badge urgency-{followUp.urgency}">
                    {(followUp.urgency || '').replace('_', ' ').toUpperCase()}
                </div>
            {/if}
        </div>
        <div class="list-description">{followUp.reason}</div>
        <div class="actions">
            <button class="list-action pin" aria-label={$t('aria.session.pin-follow-up')} onclick={stopPropagation(() => togglePin(followUp))}>
                <svg>
                    <use href="/icons.svg#pin"></use>
                </svg>
            </button>
            <button class="list-action remove" aria-label={$t('aria.session.remove-follow-up')} onclick={stopPropagation(() => removeItem(followUp, analysis.followUp))}>
                <svg>
                    <use href="/icons.svg#minus"></use>
                </svg>
            </button>
        </div>
    </div>
    {/each}
</div>
{/if}

<!-- Enhanced Medication Section -->
{#if analysis.medication}
<div class="block block-prescriptions">
    <h4 class="h4">{$t('session.diagnosis.suggested-medication')}</h4>
    {#each analysis.medication as medication}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="list-item medication-item" class:-pinned={medication.pinned} onclick={() => togglePin(medication)}>
        <div class="medication-header">
            <div class="list-title">
                {medication.name} {medication.dosage}mg
                <div class="sub">{getFrequency(medication.days_of_week)} - {medication.days}</div>
                <div class="sub">{medication.time_of_day}</div>
            </div>
        </div>
        {#if medication.purpose}
            <div class="medication-purpose"><strong>{$t('session.diagnosis.purpose')}:</strong> {medication.purpose}</div>
        {/if}
        {#if medication.alternatives && medication.alternatives.length > 0}
            <div class="medication-alternatives">
                <strong>{$t('session.diagnosis.alternatives')}:</strong>
                {#each medication.alternatives as alternative}
                    <span class="alternative-tag">{alternative}</span>
                {/each}
            </div>
        {/if}
        <div class="actions">
            <button class="list-action pin" aria-label={$t('aria.session.pin-medication')} onclick={stopPropagation(() => togglePin(medication))}>
                <svg>
                    <use href="/icons.svg#pin"></use>
                </svg>
            </button>
            <button class="list-action remove" aria-label={$t('aria.session.remove-medication')} onclick={stopPropagation(() => removeItem(medication, analysis.medication))}>
                <svg>
                    <use href="/icons.svg#minus"></use>
                </svg>
            </button>
        </div>
    </div>
    {/each}
</div>
{/if}

<style>
    .block {
        display: flex;
        flex-direction: column;
        margin: 0 1rem 1rem 1rem;
        break-inside: avoid;   
    }

    .block-grid {
        display: grid;
        grid-template-columns: auto auto auto;
        gap: 1rem;
    }
    
    .block-complaint {
        background-color: var(--color-negative);
        color: var(--color-negative-text);
        grid-column-start: 1;
        grid-column-end: 3;
        border-radius: var(--radius-8);
        padding: 1rem;
        font-weight: 700;
    }
    
    .block-complaint p {
        font-size: 1.4rem;
    }

    .list-item {
        display: flex;
        flex-direction: row;
        gap: .5rem;
        padding: 1rem;
        border-radius: var(--radius-8);
        margin-bottom: var(--gap);
        background-color: var(--color-white);
        border-left: 4px solid transparent;
    }
    
    .list-item.-pinned {
        font-weight: 700;
        border-left-color: var(--color-primary);
    }

    /* Enhanced Diagnosis Styles */
    .diagnosis-item {
        border-left-color: var(--color-info);
    }
    
    .diagnosis-header {
        display: flex;
        align-items: center;
        gap: 1rem;
    }
    
    .diagnosis-code {
        font-family: monospace;
        background: var(--color-gray-100);
        padding: 0.25rem 0.5rem;
        border-radius: var(--radius-4);
        font-size: 0.8rem;
    }
    
    .confidence-badge {
        color: white;
        padding: 0.25rem 0.5rem;
        border-radius: var(--radius-4);
        font-size: 0.8rem;
        font-weight: bold;
    }
    
    .diagnosis-details {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin-top: 0.5rem;
    }
    
    .rationale {
        font-style: italic;
        color: var(--color-gray-700);
    }
    
    .supporting-symptoms {
        margin-top: 0.5rem;
    }
    
    .symptom-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem;
        margin-top: 0.25rem;
    }
    
    .symptom-tag {
        background: var(--color-info-light);
        color: var(--color-info-dark);
        padding: 0.2rem 0.4rem;
        border-radius: var(--radius-4);
        font-size: 0.8rem;
    }

    /* Recommendations Styles */
    .block-recommendations {
        background: linear-gradient(135deg, #f8f9ff 0%, #e8f4fd 100%);
        border-radius: var(--radius-8);
        padding: 1rem;
    }
    
    .recommendation-item {
        background: white;
        border-radius: var(--radius-8);
        padding: 1rem;
        margin-bottom: 0.5rem;
        border-left: 4px solid var(--color-primary);
    }
    
    .recommendation-header {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 0.5rem;
    }
    
    .recommendation-type {
        font-size: 0.8rem;
        font-weight: bold;
        color: var(--color-primary);
    }
    
    .priority-badge, .timeframe-badge {
        color: white;
        padding: 0.2rem 0.4rem;
        border-radius: var(--radius-4);
        font-size: 0.7rem;
        font-weight: bold;
    }
    
    .timeframe-badge {
        background: var(--color-gray-500);
    }
    
    .recommendation-content {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .recommendation-text {
        font-weight: 500;
    }
    
    .recommendation-rationale {
        color: var(--color-gray-600);
        font-size: 0.9rem;
    }

    /* Questions Styles */
    .block-questions {
        background: linear-gradient(135deg, #fffbf0 0%, #fff4e6 100%);
        border-radius: var(--radius-8);
        padding: 1rem;
    }
    
    .clarifying-question {
        background: white;
        border-radius: var(--radius-8);
        padding: var(--space-16);
        border: 1px solid var(--border-color);
        margin-bottom: var(--space-12);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    }
    
    .clarifying-question.feedback-approved {
        border-color: #22c55e;
        background: linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%);
        box-shadow: 0 2px 8px rgba(34, 197, 94, 0.15);
    }
    
    .clarifying-question.feedback-rejected {
        border-color: #ef4444;
        background: linear-gradient(135deg, #fef2f2 0%, #ffffff 100%);
        box-shadow: 0 2px 8px rgba(239, 68, 68, 0.15);
    }

    .question-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: var(--space-12);
    }

    .question-actions {
        display: flex;
        align-items: center;
        gap: var(--space-8);
    }

    .feedback-controls {
        display: flex;
        align-items: center;
        gap: var(--space-4);
    }

    .feedback-btn {
        display: flex;
        align-items: center;
        gap: var(--space-4);
        padding: var(--space-4) var(--space-8);
        border-radius: var(--radius-4);
        font-size: 12px;
        font-weight: 500;
        border: 1px solid;
        cursor: pointer;
        transition: all 0.2s ease;
        white-space: nowrap;
    }

    .feedback-btn.approve {
        border-color: #22c55e;
        color: #22c55e;
        background: white;
    }

    .feedback-btn.approve:hover {
        background: #22c55e;
        color: white;
    }

    .feedback-btn.reject {
        border-color: #ef4444;
        color: #ef4444;
        background: white;
    }

    .feedback-btn.reject:hover {
        background: #ef4444;
        color: white;
    }

    .feedback-btn.approved {
        border-color: #22c55e;
        background: #22c55e;
        color: white;
    }

    .feedback-btn.approved:hover {
        background: #16a34a;
    }

    .feedback-btn.rejected {
        border-color: #ef4444;
        background: #ef4444;
        color: white;
    }

    .feedback-btn.rejected:hover {
        background: #dc2626;
    }

    /* Apply feedback styling to diagnosis and treatment items */
    .item.feedback-approved {
        border-color: #22c55e;
        background: linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%);
        box-shadow: 0 2px 8px rgba(34, 197, 94, 0.15);
    }

    .item.feedback-rejected {
        border-color: #ef4444;
        background: linear-gradient(135deg, #fef2f2 0%, #ffffff 100%);
        box-shadow: 0 2px 8px rgba(239, 68, 68, 0.15);
        opacity: 0.7;
    }

    /* Update question category and intent styling */
    .category-badge {
        background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
        color: white;
        padding: var(--space-2) var(--space-8);
        border-radius: var(--radius-12);
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .intent-badge {
        background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
        color: white;
        padding: var(--space-2) var(--space-8);
        border-radius: var(--radius-12);
        font-size: 11px;
        font-weight: 500;
    }

    .question-text {
        font-size: 14px;
        font-weight: 600;
        color: var(--text-primary);
        margin: 0 0 var(--space-8) 0;
        line-height: 1.4;
    }

    .question-rationale {
        font-size: 13px;
        color: var(--text-secondary);
        font-style: italic;
        margin: 0;
        line-height: 1.4;
    }

    /* Treatment Styles */
    .treatment-item {
        border-left-color: var(--color-success);
    }
    
    .treatment-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
    }
    
    .effectiveness-badge {
        padding: 0.25rem 0.5rem;
        border-radius: var(--radius-4);
        font-size: 0.8rem;
        font-weight: bold;
    }
    
    .effectiveness-high {
        background: var(--color-success);
        color: white;
    }
    
    .effectiveness-medium {
        background: var(--color-warning);
        color: white;
    }
    
    .effectiveness-low {
        background: var(--color-error);
        color: white;
    }
    
    .target-diagnosis {
        margin-top: 0.5rem;
    }
    
    .target-tag {
        background: var(--color-success-light);
        color: var(--color-success-dark);
        padding: 0.2rem 0.4rem;
        border-radius: var(--radius-4);
        font-size: 0.8rem;
        margin-right: 0.25rem;
    }

    /* Follow-up Styles */
    .followup-item {
        border-left-color: var(--color-info);
    }
    
    .followup-header {
        display: flex;
        align-items: center;
        gap: 1rem;
    }
    
    .followup-type {
        font-size: 0.8rem;
        font-weight: bold;
        color: var(--color-info-dark);
    }
    
    .urgency-badge {
        padding: 0.25rem 0.5rem;
        border-radius: var(--radius-4);
        font-size: 0.8rem;
        font-weight: bold;
    }
    
    .urgency-immediate {
        background: var(--color-error);
        color: white;
    }
    
    .urgency-within-week {
        background: var(--color-warning);
        color: white;
    }
    
    .urgency-within-month {
        background: var(--color-info);
        color: white;
    }
    
    .urgency-routine {
        background: var(--color-success);
        color: white;
    }

    /* Medication Styles */
    .medication-item {
        border-left-color: var(--color-purple);
    }
    
    .medication-purpose {
        color: var(--color-gray-700);
        font-style: italic;
    }
    
    .medication-alternatives {
        margin-top: 0.5rem;
    }
    
    .alternative-tag {
        background: var(--color-purple-light);
        color: var(--color-purple-dark);
        padding: 0.2rem 0.4rem;
        border-radius: var(--radius-4);
        font-size: 0.8rem;
        margin-right: 0.25rem;
    }

    /* General Styles */
    .list-item .actions {
        display: flex;
        gap: .5rem;
        flex-wrap: nowrap;
        color: var(--color-gray-800-alpha);
        mix-blend-mode: multiply;
        align-self: flex-end;
        margin-top: auto;
    }
    
    .list-item.-pinned .pin {
        color: var(--color-neutral);
    }
    
    .list-title,
    .list-description {
        flex-grow: 1;
    }
    
    .list-description {
        font-weight: 300;
    }
    
    .list-action {
        width: 1.3rem;
        height: 1.3rem;
    }
    
    .list-action svg {
        width: 100%;
        height: 100%;
        fill: currentColor;
    }

    .sub {
        font-size: 0.9rem;
        font-weight: 200;
    }
</style>