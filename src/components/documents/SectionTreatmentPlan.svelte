<script lang="ts">
    import { t } from '$lib/i18n';
    import AskButton from '$components/chat/AskButton.svelte';
    import { normalizeTreatmentGoals } from '$lib/careplan/normalize';

    interface Props {
        data: any;
        document?: any;
        key?: string;
    }

    let { data, document, key }: Props = $props();

    let hasTreatmentPlan = $derived(data && data.hasTreatmentPlan);

    // Legacy extractions stored goals as plain strings; new ones are
    // structured objects (see src/lib/configurations/core.treatmentGoal.ts).
    let treatmentGoals = $derived(normalizeTreatmentGoals(data?.treatmentGoals));
    let therapies = $derived(data?.therapies || []);
    let medications = $derived(data?.medications || []);
    let procedures = $derived(data?.procedures || []);
    let timeline = $derived(data?.timeline || {});
    let prognosis = $derived(data?.prognosis || {});
    let monitoring = $derived(data?.monitoring || {});
    let complications = $derived(data?.complications || []);
    let alternatives = $derived(data?.alternatives || []);
    
    function getPriorityClass(priority: string): string {
        const priorityClasses: Record<string, string> = {
            'immediate': 'priority-immediate',
            'urgent': 'priority-urgent',
            'routine': 'priority-routine',
            'optional': 'priority-optional'
        };
        return priorityClasses[priority] || 'priority-routine';
    }
    
    function getStatusClass(status: string): string {
        const statusClasses: Record<string, string> = {
            'planned': 'status-planned',
            'active': 'status-active',
            'completed': 'status-completed',
            'discontinued': 'status-discontinued',
            'on_hold': 'status-on-hold'
        };
        return statusClasses[status] || 'status-planned';
    }
    
    function getPrognosisClass(prognosis: string): string {
        const prognosisClasses: Record<string, string> = {
            'excellent': 'prognosis-excellent',
            'good': 'prognosis-good',
            'fair': 'prognosis-fair',
            'poor': 'prognosis-poor',
            'grave': 'prognosis-grave'
        };
        return prognosisClasses[prognosis] || 'prognosis-unknown';
    }
    
    function getComplexityClass(complexity: string): string {
        const complexityClasses: Record<string, string> = {
            'low': 'complexity-low',
            'moderate': 'complexity-moderate',
            'high': 'complexity-high',
            'extreme': 'complexity-extreme'
        };
        return complexityClasses[complexity] || 'complexity-moderate';
    }
    
    function formatDate(dateString: string): string {
        if (!dateString) return '';
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString();
        } catch {
            return dateString;
        }
    }
    
    function formatDuration(duration: any): string {
        if (!duration) return '';
        if (typeof duration === 'string') return duration;
        if (duration.value && duration.unit) {
            return `${duration.value} ${duration.unit}`;
        }
        return '';
    }
</script>

{#if hasTreatmentPlan}
    <h3 class="h3 heading -sticky">{$t('report.treatment-plan')}</h3>
    
    <!-- Treatment Goals -->
    {#if treatmentGoals.length > 0}
        <h4 class="section-title-sub">{$t('report.treatment-goals')}</h4>
        <ul class="list-items">
            {#each treatmentGoals as goal}
                <li class="panel goal-item {getPriorityClass(goal.priority || '')}">
                    <div class="goal-header">
                        <div class="goal-main">
                            <h5 class="goal-title">{goal.goal}</h5>
                            {#if goal.description}
                                <p class="goal-description">{goal.description}</p>
                            {/if}
                        </div>

                        <div class="goal-badges">
                            {#if goal.priority}
                                <span class="priority-badge {getPriorityClass(goal.priority)}">
                                    {$t(`medical.enums.priority_levels.${goal.priority}`)}
                                </span>
                            {/if}
                            {#if goal.status}
                                <span class="status-badge {getStatusClass(goal.status)}">
                                    {$t(`medical.enums.treatment_status.${goal.status}`)}
                                </span>
                            {/if}
                        </div>
                    </div>

                    <div class="goal-details">
                        {#if goal.measurableOutcome}
                            <div class="detail-item">
                                <span class="label">{$t('report.measurable-outcome')}:</span>
                                <span class="value">{goal.measurableOutcome}</span>
                            </div>
                        {/if}

                        {#if goal.timeline}
                            <div class="detail-item">
                                <span class="label">{$t('report.timeframe')}:</span>
                                <span class="value">{formatDuration(goal.timeline)}</span>
                            </div>
                        {/if}

                        {#if goal.achievabilityScore}
                            <div class="detail-item">
                                <span class="label">{$t('report.achievability-score')}:</span>
                                <span class="value achievability-score">{goal.achievabilityScore}%</span>
                            </div>
                        {/if}
                    </div>
                </li>
            {/each}
        </ul>
    {/if}
    
    <!-- Therapies -->
    {#if therapies.length > 0}
        <h4 class="section-title-sub">{$t('report.therapies')}</h4>
        <ul class="list-items">
            {#each therapies as therapy}
                <li class="panel therapy-item {getStatusClass(therapy.status)}">
                    <div class="therapy-header">
                        <div class="therapy-main">
                            <h5 class="therapy-name">{therapy.name}</h5>
                            <span class="therapy-type">{$t(`medical.enums.therapy_types.${therapy.type}`)}</span>
                        </div>
                        
                        <div class="therapy-badges">
                            {#if therapy.status}
                                <span class="status-badge {getStatusClass(therapy.status)}">
                                    {$t(`medical.enums.treatment_status.${therapy.status}`)}
                                </span>
                            {/if}
                            {#if therapy.complexity}
                                <span class="complexity-badge {getComplexityClass(therapy.complexity)}">
                                    {$t(`medical.enums.complexity_levels.${therapy.complexity}`)}
                                </span>
                            {/if}
                            <AskButton
                                type="therapy"
                                label={therapy.name}
                                data={therapy}
                                documentId={document?.id}
                                documentTitle={document?.content?.title}
                            />
                        </div>
                    </div>
                    
                    <div class="therapy-details">
                        {#if therapy.startDate}
                            <div class="detail-item">
                                <span class="label">{$t('report.start-date')}:</span>
                                <span class="value">{formatDate(therapy.startDate)}</span>
                            </div>
                        {/if}
                        
                        {#if therapy.duration}
                            <div class="detail-item">
                                <span class="label">{$t('report.duration')}:</span>
                                <span class="value">{formatDuration(therapy.duration)}</span>
                            </div>
                        {/if}
                        
                        {#if therapy.frequency}
                            <div class="detail-item">
                                <span class="label">{$t('report.frequency')}:</span>
                                <span class="value">{therapy.frequency}</span>
                            </div>
                        {/if}
                        
                        {#if therapy.provider}
                            <div class="detail-item">
                                <span class="label">{$t('report.provider')}:</span>
                                <span class="value">{therapy.provider}</span>
                            </div>
                        {/if}
                        
                        {#if therapy.location}
                            <div class="detail-item">
                                <span class="label">{$t('report.location')}:</span>
                                <span class="value">{therapy.location}</span>
                            </div>
                        {/if}
                    </div>
                    
                    {#if therapy.instructions}
                        <div class="therapy-instructions">
                            <span class="label">{$t('report.instructions')}:</span>
                            <p class="instructions-text">{therapy.instructions}</p>
                        </div>
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}
    
    <!-- Medications -->
    {#if medications.length > 0}
        <h4 class="section-title-sub">{$t('report.medications')}</h4>
        <ul class="list-items">
            {#each medications as medication}
                <li class="panel medication-item {getStatusClass(medication.status)}">
                    <div class="medication-header">
                        <div class="medication-main">
                            <h5 class="medication-name">{medication.name}</h5>
                            {#if medication.dosage}
                                <span class="medication-dosage">{medication.dosage}</span>
                            {/if}
                        </div>
                        
                        <div class="medication-badges">
                            {#if medication.status}
                                <span class="status-badge {getStatusClass(medication.status)}">
                                    {$t(`medical.enums.treatment_status.${medication.status}`)}
                                </span>
                            {/if}
                            {#if medication.priority}
                                <span class="priority-badge {getPriorityClass(medication.priority)}">
                                    {$t(`medical.enums.priority_levels.${medication.priority}`)}
                                </span>
                            {/if}
                            <AskButton
                                type="medication"
                                label={medication.name}
                                data={medication}
                                documentId={document?.id}
                                documentTitle={document?.content?.title}
                            />
                        </div>
                    </div>
                    
                    <div class="medication-details">
                        {#if medication.route}
                            <div class="detail-item">
                                <span class="label">{$t('report.route')}:</span>
                                <span class="value">{$t(`medical.enums.administration_routes.${medication.route}`)}</span>
                            </div>
                        {/if}
                        
                        {#if medication.frequency}
                            <div class="detail-item">
                                <span class="label">{$t('report.frequency')}:</span>
                                <span class="value">{medication.frequency}</span>
                            </div>
                        {/if}
                        
                        {#if medication.duration}
                            <div class="detail-item">
                                <span class="label">{$t('report.duration')}:</span>
                                <span class="value">{formatDuration(medication.duration)}</span>
                            </div>
                        {/if}
                        
                        {#if medication.indication}
                            <div class="detail-item">
                                <span class="label">{$t('report.indication')}:</span>
                                <span class="value">{medication.indication}</span>
                            </div>
                        {/if}
                        
                        {#if medication.contraindications?.length > 0}
                            <div class="contraindications-section">
                                <span class="label">{$t('report.contraindications')}:</span>
                                <ul class="contraindications-list">
                                    {#each medication.contraindications as contraindication}
                                        <li>{contraindication}</li>
                                    {/each}
                                </ul>
                            </div>
                        {/if}
                    </div>
                </li>
            {/each}
        </ul>
    {/if}
    
    <!-- Procedures -->
    {#if procedures.length > 0}
        <h4 class="section-title-sub">{$t('report.procedures')}</h4>
        <ul class="list-items">
            {#each procedures as procedure}
                <li class="panel procedure-item {getPriorityClass(procedure.priority)}">
                    <div class="procedure-header">
                        <div class="procedure-main">
                            <h5 class="procedure-name">{procedure.name}</h5>
                            <span class="procedure-type">{$t(`medical.enums.procedure_types.${procedure.type}`)}</span>
                        </div>
                        
                        <div class="procedure-badges">
                            {#if procedure.priority}
                                <span class="priority-badge {getPriorityClass(procedure.priority)}">
                                    {$t(`medical.enums.priority_levels.${procedure.priority}`)}
                                </span>
                            {/if}
                            {#if procedure.status}
                                <span class="status-badge {getStatusClass(procedure.status)}">
                                    {$t(`medical.enums.treatment_status.${procedure.status}`)}
                                </span>
                            {/if}
                            <AskButton
                                type="procedure"
                                label={procedure.name}
                                data={procedure}
                                documentId={document?.id}
                                documentTitle={document?.content?.title}
                            />
                        </div>
                    </div>
                    
                    <div class="procedure-details">
                        {#if procedure.scheduledDate}
                            <div class="detail-item">
                                <span class="label">{$t('report.scheduled-date')}:</span>
                                <span class="value">{formatDate(procedure.scheduledDate)}</span>
                            </div>
                        {/if}
                        
                        {#if procedure.estimatedDuration}
                            <div class="detail-item">
                                <span class="label">{$t('report.estimated-duration')}:</span>
                                <span class="value">{formatDuration(procedure.estimatedDuration)}</span>
                            </div>
                        {/if}
                        
                        {#if procedure.anesthesia}
                            <div class="detail-item">
                                <span class="label">{$t('report.anesthesia')}:</span>
                                <span class="value">{$t(`medical.enums.anesthesia_types.${procedure.anesthesia}`)}</span>
                            </div>
                        {/if}
                        
                        {#if procedure.surgeon}
                            <div class="detail-item">
                                <span class="label">{$t('report.surgeon')}:</span>
                                <span class="value">{procedure.surgeon}</span>
                            </div>
                        {/if}
                        
                        {#if procedure.risks?.length > 0}
                            <div class="risks-section">
                                <span class="label">{$t('report.risks')}:</span>
                                <ul class="risks-list">
                                    {#each procedure.risks as risk}
                                        <li>{risk}</li>
                                    {/each}
                                </ul>
                            </div>
                        {/if}
                    </div>
                </li>
            {/each}
        </ul>
    {/if}
    
    <!-- Timeline -->
    {#if Object.keys(timeline).length > 0}
        <h4 class="section-title-sub">{$t('report.timeline')}</h4>
        <div class="page -block">
            <div class="timeline-info">
                {#if timeline.startDate}
                    <div class="detail-item">
                        <span class="label">{$t('report.start-date')}:</span>
                        <span class="value">{formatDate(timeline.startDate)}</span>
                    </div>
                {/if}
                
                {#if timeline.estimatedDuration}
                    <div class="detail-item">
                        <span class="label">{$t('report.estimated-duration')}:</span>
                        <span class="value">{formatDuration(timeline.estimatedDuration)}</span>
                    </div>
                {/if}
                
                {#if timeline.milestones?.length > 0}
                    <div class="milestones-section">
                        <span class="label">{$t('report.milestones')}:</span>
                        <div class="milestones-list">
                            {#each timeline.milestones as milestone}
                                <div class="milestone-item">
                                    <span class="milestone-date">{formatDate(milestone.date)}</span>
                                    <span class="milestone-description">{milestone.description}</span>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
    
    <!-- Prognosis -->
    {#if Object.keys(prognosis).length > 0}
        <h4 class="section-title-sub">{$t('report.prognosis')}</h4>
        <div class="page -block">
            <div class="prognosis-info">
                {#if prognosis.overall}
                    <div class="prognosis-overall">
                        <span class="label">{$t('report.overall-prognosis')}:</span>
                        <span class="prognosis-value {getPrognosisClass(prognosis.overall)}">
                            {$t(`medical.enums.prognosis_levels.${prognosis.overall}`)}
                        </span>
                    </div>
                {/if}
                
                {#if prognosis.survivalRate}
                    <div class="detail-item">
                        <span class="label">{$t('report.survival-rate')}:</span>
                        <span class="value">{prognosis.survivalRate}</span>
                    </div>
                {/if}
                
                {#if prognosis.functionalOutcome}
                    <div class="detail-item">
                        <span class="label">{$t('report.functional-outcome')}:</span>
                        <span class="value">{prognosis.functionalOutcome}</span>
                    </div>
                {/if}
                
                {#if prognosis.qualityOfLife}
                    <div class="detail-item">
                        <span class="label">{$t('report.quality-of-life')}:</span>
                        <span class="value">{prognosis.qualityOfLife}</span>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
    
    <!-- Monitoring -->
    {#if Object.keys(monitoring).length > 0}
        <h4 class="section-title-sub">{$t('report.monitoring')}</h4>
        <div class="page -block">
            <div class="monitoring-info">
                {#if monitoring.frequency}
                    <div class="detail-item">
                        <span class="label">{$t('report.monitoring-frequency')}:</span>
                        <span class="value">{monitoring.frequency}</span>
                    </div>
                {/if}
                
                {#if monitoring.parameters?.length > 0}
                    <div class="parameters-section">
                        <span class="label">{$t('report.parameters')}:</span>
                        <div class="parameters-list">
                            {#each monitoring.parameters as parameter}
                                <span class="parameter-tag">{parameter}</span>
                            {/each}
                        </div>
                    </div>
                {/if}
                
                {#if monitoring.alertCriteria?.length > 0}
                    <div class="alert-criteria-section">
                        <span class="label">{$t('report.alert-criteria')}:</span>
                        <ul class="alert-criteria-list">
                            {#each monitoring.alertCriteria as criterion}
                                <li>{criterion}</li>
                            {/each}
                        </ul>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
    
    <!-- Complications -->
    {#if complications.length > 0}
        <h4 class="section-title-sub">{$t('report.potential-complications')}</h4>
        <ul class="list-items">
            {#each complications as complication}
                <li class="panel complication-item">
                    <div class="complication-header">
                        <span class="complication-name">{complication.name}</span>
                        {#if complication.probability}
                            <span class="probability-badge">{complication.probability}%</span>
                        {/if}
                    </div>
                    
                    <div class="complication-details">
                        <p class="complication-description">{complication.description}</p>
                        
                        {#if complication.prevention}
                            <div class="detail-item">
                                <span class="label">{$t('report.prevention')}:</span>
                                <span class="value">{complication.prevention}</span>
                            </div>
                        {/if}
                        
                        {#if complication.management}
                            <div class="detail-item">
                                <span class="label">{$t('report.management')}:</span>
                                <span class="value">{complication.management}</span>
                            </div>
                        {/if}
                    </div>
                </li>
            {/each}
        </ul>
    {/if}
    
    <!-- Alternatives -->
    {#if alternatives.length > 0}
        <h4 class="section-title-sub">{$t('report.alternative-treatments')}</h4>
        <ul class="list-items">
            {#each alternatives as alternative}
                <li class="panel alternative-item">
                    <div class="alternative-header">
                        <span class="alternative-name">{alternative.name}</span>
                        {#if alternative.effectiveness}
                            <span class="effectiveness-badge">{alternative.effectiveness}%</span>
                        {/if}
                    </div>
                    
                    <div class="alternative-details">
                        <p class="alternative-description">{alternative.description}</p>
                        
                        {#if alternative.advantages?.length > 0}
                            <div class="advantages-section">
                                <span class="label">{$t('report.advantages')}:</span>
                                <ul class="advantages-list">
                                    {#each alternative.advantages as advantage}
                                        <li>{advantage}</li>
                                    {/each}
                                </ul>
                            </div>
                        {/if}
                        
                        {#if alternative.disadvantages?.length > 0}
                            <div class="disadvantages-section">
                                <span class="label">{$t('report.disadvantages')}:</span>
                                <ul class="disadvantages-list">
                                    {#each alternative.disadvantages as disadvantage}
                                        <li>{disadvantage}</li>
                                    {/each}
                                </ul>
                            </div>
                        {/if}
                    </div>
                </li>
            {/each}
        </ul>
    {/if}
    
{:else if data}
    <h3 class="h3 heading -sticky">{$t('report.treatment-plan')}</h3>
    <div class="page -block">
        <p class="no-data">{$t('report.no-treatment-plan-data')}</p>
    </div>
{/if}

<style>
    .goal-item {
        border-left-color: var(--color-interactivity);
    }
    
    .goal-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 0.75rem;
        gap: 1rem;
    }
    
    .goal-main {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        flex: 1;
    }
    
    .goal-title {
        font-size: 1.1rem;
        font-weight: 600;
        margin: 0;
        color: var(--color-text-primary);
    }
    
    .goal-description {
        margin: 0;
        color: var(--color-text-secondary);
        line-height: 1.5;
    }
    
    .goal-badges {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        align-items: flex-end;
    }
    
    .goal-details {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .achievability-score {
        font-weight: 600;
        color: var(--color-positive-dark);
    }
    
    .therapy-item {
        border-left-color: var(--color-info);
    }
    
    .therapy-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 0.75rem;
        gap: 1rem;
    }
    
    .therapy-main {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        flex: 1;
    }
    
    .therapy-name {
        font-size: 1.1rem;
        font-weight: 600;
        margin: 0;
        color: var(--color-text-primary);
    }
    
    .therapy-type {
        font-size: 0.9rem;
        color: var(--color-text-secondary);
        font-weight: 500;
    }
    
    .therapy-badges {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        align-items: flex-end;
    }
    
    .therapy-details {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .therapy-instructions {
        margin-top: 0.75rem;
        padding-top: 0.75rem;
        border-top: 1px solid var(--color-border);
    }
    
    .instructions-text {
        margin: 0.25rem 0 0 0;
        color: var(--color-text-secondary);
        line-height: 1.5;
        font-style: italic;
    }
    
    .medication-item {
        border-left-color: var(--color-gray-800);
    }
    
    .medication-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 0.75rem;
        gap: 1rem;
    }
    
    .medication-main {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        flex: 1;
    }
    
    .medication-name {
        font-size: 1.1rem;
        font-weight: 600;
        margin: 0;
        color: var(--color-text-primary);
    }
    
    .medication-dosage {
        font-size: 0.9rem;
        color: var(--color-text-secondary);
        font-weight: 500;
    }
    
    .medication-badges {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        align-items: flex-end;
    }
    
    .medication-details {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .procedure-item {
        border-left-color: var(--color-warning);
    }
    
    .procedure-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 0.75rem;
        gap: 1rem;
    }
    
    .procedure-main {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        flex: 1;
    }
    
    .procedure-name {
        font-size: 1.1rem;
        font-weight: 600;
        margin: 0;
        color: var(--color-text-primary);
    }
    
    .procedure-type {
        font-size: 0.9rem;
        color: var(--color-text-secondary);
        font-weight: 500;
    }
    
    .procedure-badges {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        align-items: flex-end;
    }
    
    .procedure-details {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .timeline-info {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .milestones-section {
        margin-top: 0.75rem;
    }
    
    .milestones-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin-top: 0.5rem;
    }
    
    .milestone-item {
        display: flex;
        gap: 0.75rem;
        align-items: center;
        padding: 0.5rem;
        background-color: var(--color-surface);
        border-radius: 0.25rem;
    }
    
    .milestone-date {
        font-weight: 600;
        color: var(--color-interactivity);
        min-width: 100px;
    }
    
    .milestone-description {
        color: var(--color-text-primary);
        flex: 1;
    }
    
    .prognosis-info {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .prognosis-overall {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.75rem;
        padding: 0.5rem 1rem;
        background-color: var(--color-surface);
        border-radius: 0.5rem;
    }
    
    .prognosis-value {
        font-weight: 600;
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        text-transform: uppercase;
        font-size: 0.9rem;
    }
    
    .prognosis-excellent {
        background-color: var(--color-positive-light);
        color: var(--color-positive-dark);
    }
    
    .prognosis-good {
        background-color: var(--color-positive-light);
        color: var(--color-positive-dark);
    }
    
    .prognosis-fair {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
    }
    
    .prognosis-poor {
        background-color: var(--color-negative-light);
        color: var(--color-negative-dark);
    }
    
    .prognosis-grave {
        background-color: var(--color-negative);
        color: white;
    }
    
    .monitoring-info {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .parameters-section {
        margin-top: 0.75rem;
    }
    
    .parameters-list {
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem;
        margin-top: 0.5rem;
    }
    
    .parameter-tag {
        background-color: var(--color-info-light);
        color: var(--color-info-dark);
        padding: 0.125rem 0.375rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
    }
    
    .alert-criteria-section {
        margin-top: 0.75rem;
    }
    
    .alert-criteria-list {
        margin: 0.5rem 0 0 1.5rem;
        padding: 0;
    }
    
    .alert-criteria-list li {
        margin-bottom: 0.25rem;
        color: var(--color-text-secondary);
    }
    
    .complication-item {
        border-left-color: var(--color-negative);
    }
    
    .complication-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.75rem;
        gap: 1rem;
    }
    
    .complication-name {
        font-weight: 600;
        color: var(--color-text-primary);
        flex: 1;
    }
    
    .probability-badge {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
    }
    
    .complication-details {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .complication-description {
        margin: 0 0 0.5rem 0;
        color: var(--color-text-primary);
        line-height: 1.5;
    }
    
    .alternative-item {
        border-left-color: var(--color-gray-800);
    }
    
    .alternative-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.75rem;
        gap: 1rem;
    }
    
    .alternative-name {
        font-weight: 600;
        color: var(--color-text-primary);
        flex: 1;
    }
    
    .effectiveness-badge {
        background-color: var(--color-positive-light);
        color: var(--color-positive-dark);
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
    }
    
    .alternative-details {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .alternative-description {
        margin: 0 0 0.5rem 0;
        color: var(--color-text-primary);
        line-height: 1.5;
    }
    
    .advantages-section,
    .disadvantages-section,
    .contraindications-section,
    .risks-section {
        margin-top: 0.75rem;
    }
    
    .advantages-list,
    .disadvantages-list,
    .contraindications-list,
    .risks-list {
        margin: 0.5rem 0 0 1.5rem;
        padding: 0;
    }
    
    .advantages-list li,
    .disadvantages-list li,
    .contraindications-list li,
    .risks-list li {
        margin-bottom: 0.25rem;
        color: var(--color-text-secondary);
    }
    
    .priority-badge,
    .status-badge,
    .complexity-badge {
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
        text-transform: uppercase;
        white-space: nowrap;
    }
    
    .priority-immediate {
        background-color: var(--color-negative);
        color: white;
    }
    
    .priority-urgent {
        background-color: var(--color-negative-light);
        color: var(--color-negative-dark);
    }
    
    .priority-routine {
        background-color: var(--color-info-light);
        color: var(--color-info-dark);
    }
    
    .priority-optional {
        background-color: var(--color-gray-600);
        color: var(--color-gray-900);
    }
    
    .status-planned {
        background-color: var(--color-info-light);
        color: var(--color-info-dark);
    }
    
    .status-active {
        background-color: var(--color-positive-light);
        color: var(--color-positive-dark);
    }
    
    .status-completed {
        background-color: var(--color-positive-light);
        color: var(--color-positive-dark);
    }
    
    .status-discontinued {
        background-color: var(--color-negative-light);
        color: var(--color-negative-dark);
    }
    
    .status-on-hold {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
    }
    
    .complexity-low {
        background-color: var(--color-positive-light);
        color: var(--color-positive-dark);
    }
    
    .complexity-moderate {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
    }
    
    .complexity-high {
        background-color: var(--color-negative-light);
        color: var(--color-negative-dark);
    }
    
    .complexity-extreme {
        background-color: var(--color-negative);
        color: white;
    }
    
    .detail-item {
        display: flex;
        gap: 0.5rem;
        align-items: flex-start;
    }
    
    .label {
        font-weight: 500;
        color: var(--color-text-secondary);
        min-width: 150px;
        flex-shrink: 0;
    }
    
    .value {
        color: var(--color-text-primary);
        flex: 1;
        line-height: 1.4;
    }
    
    /* Priority-based panel coloring */
    .priority-immediate {
        border-left-color: var(--color-negative);
        border-left-width: 4px;
    }
    
    .priority-urgent {
        border-left-color: var(--color-negative);
    }
    
    .priority-routine {
        border-left-color: var(--color-info);
    }
    
    .priority-optional {
        border-left-color: var(--color-gray-800);
    }
    
    /* Status-based panel coloring */
    .status-planned {
        border-left-color: var(--color-info);
    }
    
    .status-active {
        border-left-color: var(--color-positive);
    }
    
    .status-completed {
        border-left-color: var(--color-positive);
    }
    
    .status-discontinued {
        border-left-color: var(--color-negative);
    }
    
    .status-on-hold {
        border-left-color: var(--color-warning);
    }
</style>