<script lang="ts">
    import { t } from '$lib/i18n';
    import AskButton from '$components/chat/AskButton.svelte';

    interface Props {
        data: any;
        document?: any;
        key?: string;
    }

    let { data, document, key }: Props = $props();

    let hasTreatments = $derived(data && data.hasTreatments);
    
    let currentTreatments = $derived(data?.currentTreatments || []);
    let pastTreatments = $derived(data?.pastTreatments || []);
    let plannedTreatments = $derived(data?.plannedTreatments || []);
    let emergencyTreatments = $derived(data?.emergencyTreatments || []);
    let treatmentSummary = $derived(data?.treatmentSummary || {});
    let treatmentOutcomes = $derived(data?.treatmentOutcomes || {});
    let adherence = $derived(data?.adherence || {});
    let provider = $derived(data?.provider);
    let coordinator = $derived(data?.coordinator);
    
    function getStatusClass(status: string): string {
        const statusClasses: Record<string, string> = {
            'active': 'status-active',
            'completed': 'status-completed',
            'discontinued': 'status-discontinued',
            'on_hold': 'status-on-hold',
            'planned': 'status-planned',
            'cancelled': 'status-cancelled',
            'emergency': 'status-emergency'
        };
        return statusClasses[status] || 'status-unknown';
    }
    
    function getPriorityClass(priority: string): string {
        const priorityClasses: Record<string, string> = {
            'low': 'priority-low',
            'medium': 'priority-medium',
            'high': 'priority-high',
            'urgent': 'priority-urgent',
            'emergency': 'priority-emergency'
        };
        return priorityClasses[priority] || 'priority-medium';
    }
    
    function getResponseClass(response: string): string {
        const responseClasses: Record<string, string> = {
            'excellent': 'response-excellent',
            'good': 'response-good',
            'fair': 'response-fair',
            'poor': 'response-poor',
            'none': 'response-none'
        };
        return responseClasses[response] || 'response-unknown';
    }
    
    function getAdherenceClass(adherence: string): string {
        const adherenceClasses: Record<string, string> = {
            'excellent': 'adherence-excellent',
            'good': 'adherence-good',
            'fair': 'adherence-fair',
            'poor': 'adherence-poor'
        };
        return adherenceClasses[adherence] || 'adherence-unknown';
    }
    
    function getOutcomeClass(outcome: string): string {
        const outcomeClasses: Record<string, string> = {
            'successful': 'outcome-successful',
            'partially_successful': 'outcome-partial',
            'unsuccessful': 'outcome-unsuccessful',
            'ongoing': 'outcome-ongoing'
        };
        return outcomeClasses[outcome] || 'outcome-unknown';
    }
    
    function getTreatmentTypeClass(type: string): string {
        const typeClasses: Record<string, string> = {
            'medication': 'type-medication',
            'procedure': 'type-procedure',
            'therapy': 'type-therapy',
            'surgery': 'type-surgery',
            'radiation': 'type-radiation',
            'chemotherapy': 'type-chemotherapy',
            'immunotherapy': 'type-immunotherapy',
            'lifestyle': 'type-lifestyle'
        };
        return typeClasses[type] || 'type-general';
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
    
    function formatPercentage(percentage: any): string {
        if (percentage === null || percentage === undefined) return '';
        if (typeof percentage === 'number') return `${percentage}%`;
        if (typeof percentage === 'string') return percentage;
        return '';
    }
</script>

{#if hasTreatments}
    <h3 class="h3 heading -sticky">{$t('report.treatments')}</h3>
    
    <!-- Treatment Summary -->
    {#if Object.keys(treatmentSummary).length > 0}
        <h4 class="section-title-sub">{$t('report.treatment-summary')}</h4>
        <div class="page -block">
            <div class="treatment-summary-info">
                {#if treatmentSummary.totalTreatments}
                    <div class="detail-item">
                        <span class="label">{$t('report.total-treatments')}:</span>
                        <span class="value">{treatmentSummary.totalTreatments}</span>
                    </div>
                {/if}
                
                {#if treatmentSummary.activeTreatments}
                    <div class="detail-item">
                        <span class="label">{$t('report.active-treatments')}:</span>
                        <span class="value active-count">{treatmentSummary.activeTreatments}</span>
                    </div>
                {/if}
                
                {#if treatmentSummary.completedTreatments}
                    <div class="detail-item">
                        <span class="label">{$t('report.completed-treatments')}:</span>
                        <span class="value completed-count">{treatmentSummary.completedTreatments}</span>
                    </div>
                {/if}
                
                {#if treatmentSummary.overallResponse}
                    <div class="detail-item">
                        <span class="label">{$t('report.overall-response')}:</span>
                        <span class="value {getResponseClass(treatmentSummary.overallResponse)}">
                            {$t(`medical.enums.treatment_response.${treatmentSummary.overallResponse}`)}
                        </span>
                    </div>
                {/if}
                
                {#if treatmentSummary.startDate}
                    <div class="detail-item">
                        <span class="label">{$t('report.treatment-start-date')}:</span>
                        <span class="value">{formatDate(treatmentSummary.startDate)}</span>
                    </div>
                {/if}
                
                {#if treatmentSummary.totalCost}
                    <div class="detail-item">
                        <span class="label">{$t('report.total-cost')}:</span>
                        <span class="value treatment-cost">{treatmentSummary.totalCost}</span>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
    
    <!-- Current Treatments -->
    {#if currentTreatments.length > 0}
        <h4 class="section-title-sub">{$t('report.current-treatments')}</h4>
        <ul class="list-items">
            {#each currentTreatments as treatment}
                <li class="panel treatment-item {getTreatmentTypeClass(treatment.type)} {getStatusClass(treatment.status)}">
                    <div class="treatment-header">
                        <div class="treatment-main">
                            <h5 class="treatment-name">{treatment.name}</h5>
                            <div class="treatment-meta">
                                <span class="treatment-type">{$t(`medical.enums.treatment_types.${treatment.type}`)}</span>
                                {#if treatment.dosage}
                                    <span class="treatment-dosage">{treatment.dosage}</span>
                                {/if}
                            </div>
                        </div>

                        <div class="treatment-badges">
                            {#if treatment.status}
                                <span class="status-badge {getStatusClass(treatment.status)}">
                                    {$t(`medical.enums.treatment_status.${treatment.status}`)}
                                </span>
                            {/if}
                            {#if treatment.priority}
                                <span class="priority-badge {getPriorityClass(treatment.priority)}">
                                    {$t(`medical.enums.priority_levels.${treatment.priority}`)}
                                </span>
                            {/if}
                            <AskButton
                                type="treatment"
                                label={treatment.name}
                                data={treatment}
                                documentId={document?.id}
                                documentTitle={document?.content?.title}
                            />
                        </div>
                    </div>

                    <div class="treatment-details">
                        {#if treatment.indication}
                            <div class="detail-item">
                                <span class="label">{$t('report.indication')}:</span>
                                <span class="value">{treatment.indication}</span>
                            </div>
                        {/if}
                        
                        {#if treatment.startDate}
                            <div class="detail-item">
                                <span class="label">{$t('report.start-date')}:</span>
                                <span class="value">{formatDate(treatment.startDate)}</span>
                            </div>
                        {/if}
                        
                        {#if treatment.frequency}
                            <div class="detail-item">
                                <span class="label">{$t('report.frequency')}:</span>
                                <span class="value">{treatment.frequency}</span>
                            </div>
                        {/if}
                        
                        {#if treatment.duration}
                            <div class="detail-item">
                                <span class="label">{$t('report.duration')}:</span>
                                <span class="value">{formatDuration(treatment.duration)}</span>
                            </div>
                        {/if}
                        
                        {#if treatment.route}
                            <div class="detail-item">
                                <span class="label">{$t('report.route')}:</span>
                                <span class="value">{$t(`medical.enums.administration_routes.${treatment.route}`)}</span>
                            </div>
                        {/if}
                        
                        {#if treatment.provider}
                            <div class="detail-item">
                                <span class="label">{$t('report.provider')}:</span>
                                <span class="value">{treatment.provider}</span>
                            </div>
                        {/if}
                        
                        {#if treatment.location}
                            <div class="detail-item">
                                <span class="label">{$t('report.location')}:</span>
                                <span class="value">{treatment.location}</span>
                            </div>
                        {/if}
                        
                        {#if treatment.nextAppointment}
                            <div class="detail-item">
                                <span class="label">{$t('report.next-appointment')}:</span>
                                <span class="value next-appointment">{formatDate(treatment.nextAppointment)}</span>
                            </div>
                        {/if}
                    </div>
                    
                    {#if treatment.response}
                        <div class="treatment-response">
                            <div class="detail-item">
                                <span class="label">{$t('report.response')}:</span>
                                <span class="value {getResponseClass(treatment.response)}">
                                    {$t(`medical.enums.treatment_response.${treatment.response}`)}
                                </span>
                            </div>
                        </div>
                    {/if}
                    
                    {#if treatment.sideEffects?.length > 0}
                        <div class="side-effects-section">
                            <span class="label">{$t('report.side-effects')}:</span>
                            <ul class="side-effects-list">
                                {#each treatment.sideEffects as sideEffect}
                                    <li>{sideEffect}</li>
                                {/each}
                            </ul>
                        </div>
                    {/if}
                    
                    {#if treatment.instructions}
                        <div class="treatment-instructions">
                            <span class="label">{$t('report.instructions')}:</span>
                            <p class="instructions-text">{treatment.instructions}</p>
                        </div>
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}
    
    <!-- Past Treatments -->
    {#if pastTreatments.length > 0}
        <h4 class="section-title-sub">{$t('report.past-treatments')}</h4>
        <ul class="list-items">
            {#each pastTreatments as treatment}
                <li class="panel treatment-item {getTreatmentTypeClass(treatment.type)} {getStatusClass(treatment.status)}">
                    <div class="treatment-header">
                        <div class="treatment-main">
                            <h5 class="treatment-name">{treatment.name}</h5>
                            <div class="treatment-meta">
                                <span class="treatment-type">{$t(`medical.enums.treatment_types.${treatment.type}`)}</span>
                                {#if treatment.dosage}
                                    <span class="treatment-dosage">{treatment.dosage}</span>
                                {/if}
                            </div>
                        </div>
                        
                        <div class="treatment-badges">
                            {#if treatment.status}
                                <span class="status-badge {getStatusClass(treatment.status)}">
                                    {$t(`medical.enums.treatment_status.${treatment.status}`)}
                                </span>
                            {/if}
                            {#if treatment.outcome}
                                <span class="outcome-badge {getOutcomeClass(treatment.outcome)}">
                                    {$t(`medical.enums.treatment_outcomes.${treatment.outcome}`)}
                                </span>
                            {/if}
                            <AskButton
                                type="treatment"
                                label={treatment.name}
                                data={treatment}
                                documentId={document?.id}
                                documentTitle={document?.content?.title}
                            />
                        </div>
                    </div>
                    
                    <div class="treatment-details">
                        {#if treatment.indication}
                            <div class="detail-item">
                                <span class="label">{$t('report.indication')}:</span>
                                <span class="value">{treatment.indication}</span>
                            </div>
                        {/if}
                        
                        {#if treatment.startDate}
                            <div class="detail-item">
                                <span class="label">{$t('report.start-date')}:</span>
                                <span class="value">{formatDate(treatment.startDate)}</span>
                            </div>
                        {/if}
                        
                        {#if treatment.endDate}
                            <div class="detail-item">
                                <span class="label">{$t('report.end-date')}:</span>
                                <span class="value">{formatDate(treatment.endDate)}</span>
                            </div>
                        {/if}
                        
                        {#if treatment.totalDuration}
                            <div class="detail-item">
                                <span class="label">{$t('report.total-duration')}:</span>
                                <span class="value">{formatDuration(treatment.totalDuration)}</span>
                            </div>
                        {/if}
                        
                        {#if treatment.reasonForDiscontinuation}
                            <div class="detail-item">
                                <span class="label">{$t('report.reason-for-discontinuation')}:</span>
                                <span class="value">{treatment.reasonForDiscontinuation}</span>
                            </div>
                        {/if}
                        
                        {#if treatment.effectiveness}
                            <div class="detail-item">
                                <span class="label">{$t('report.effectiveness')}:</span>
                                <span class="value effectiveness-rating">{formatPercentage(treatment.effectiveness)}</span>
                            </div>
                        {/if}
                    </div>
                    
                    {#if treatment.finalOutcome}
                        <div class="final-outcome">
                            <span class="label">{$t('report.final-outcome')}:</span>
                            <p class="outcome-text">{treatment.finalOutcome}</p>
                        </div>
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}
    
    <!-- Planned Treatments -->
    {#if plannedTreatments.length > 0}
        <h4 class="section-title-sub">{$t('report.planned-treatments')}</h4>
        <ul class="list-items">
            {#each plannedTreatments as treatment}
                <li class="panel treatment-item {getTreatmentTypeClass(treatment.type)} {getStatusClass(treatment.status)}">
                    <div class="treatment-header">
                        <div class="treatment-main">
                            <h5 class="treatment-name">{treatment.name}</h5>
                            <div class="treatment-meta">
                                <span class="treatment-type">{$t(`medical.enums.treatment_types.${treatment.type}`)}</span>
                                {#if treatment.estimatedDosage}
                                    <span class="treatment-dosage">{treatment.estimatedDosage}</span>
                                {/if}
                            </div>
                        </div>

                        <div class="treatment-badges">
                            {#if treatment.status}
                                <span class="status-badge {getStatusClass(treatment.status)}">
                                    {$t(`medical.enums.treatment_status.${treatment.status}`)}
                                </span>
                            {/if}
                            {#if treatment.priority}
                                <span class="priority-badge {getPriorityClass(treatment.priority)}">
                                    {$t(`medical.enums.priority_levels.${treatment.priority}`)}
                                </span>
                            {/if}
                            <AskButton
                                type="treatment"
                                label={treatment.name}
                                data={treatment}
                                documentId={document?.id}
                                documentTitle={document?.content?.title}
                            />
                        </div>
                    </div>
                    
                    <div class="treatment-details">
                        {#if treatment.indication}
                            <div class="detail-item">
                                <span class="label">{$t('report.indication')}:</span>
                                <span class="value">{treatment.indication}</span>
                            </div>
                        {/if}
                        
                        {#if treatment.scheduledDate}
                            <div class="detail-item">
                                <span class="label">{$t('report.scheduled-date')}:</span>
                                <span class="value scheduled-date">{formatDate(treatment.scheduledDate)}</span>
                            </div>
                        {/if}
                        
                        {#if treatment.estimatedDuration}
                            <div class="detail-item">
                                <span class="label">{$t('report.estimated-duration')}:</span>
                                <span class="value">{formatDuration(treatment.estimatedDuration)}</span>
                            </div>
                        {/if}
                        
                        {#if treatment.expectedOutcome}
                            <div class="detail-item">
                                <span class="label">{$t('report.expected-outcome')}:</span>
                                <span class="value">{treatment.expectedOutcome}</span>
                            </div>
                        {/if}
                        
                        {#if treatment.prerequisites?.length > 0}
                            <div class="prerequisites-section">
                                <span class="label">{$t('report.prerequisites')}:</span>
                                <ul class="prerequisites-list">
                                    {#each treatment.prerequisites as prerequisite}
                                        <li>{prerequisite}</li>
                                    {/each}
                                </ul>
                            </div>
                        {/if}
                        
                        {#if treatment.estimatedCost}
                            <div class="detail-item">
                                <span class="label">{$t('report.estimated-cost')}:</span>
                                <span class="value treatment-cost">{treatment.estimatedCost}</span>
                            </div>
                        {/if}
                    </div>
                    
                    {#if treatment.approvalStatus}
                        <div class="approval-status">
                            <div class="detail-item">
                                <span class="label">{$t('report.approval-status')}:</span>
                                <span class="value">{$t(`medical.enums.approval_status.${treatment.approvalStatus}`)}</span>
                            </div>
                        </div>
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}
    
    <!-- Emergency Treatments -->
    {#if emergencyTreatments.length > 0}
        <h4 class="section-title-sub">{$t('report.emergency-treatments')}</h4>
        <ul class="list-items">
            {#each emergencyTreatments as treatment}
                <li class="panel treatment-item {getTreatmentTypeClass(treatment.type)} {getStatusClass('emergency')}">
                    <div class="treatment-header">
                        <div class="treatment-main">
                            <h5 class="treatment-name">{treatment.name}</h5>
                            <div class="treatment-meta">
                                <span class="treatment-type">{$t(`medical.enums.treatment_types.${treatment.type}`)}</span>
                                <span class="emergency-indicator">{$t('report.emergency')}</span>
                            </div>
                        </div>
                        
                        <div class="treatment-badges">
                            <span class="status-badge {getStatusClass('emergency')}">
                                {$t('medical.enums.treatment_status.emergency')}
                            </span>
                            {#if treatment.urgency}
                                <span class="priority-badge {getPriorityClass(treatment.urgency)}">
                                    {$t(`medical.enums.urgency_levels.${treatment.urgency}`)}
                                </span>
                            {/if}
                        </div>
                    </div>
                    
                    <div class="treatment-details">
                        {#if treatment.indication}
                            <div class="detail-item">
                                <span class="label">{$t('report.indication')}:</span>
                                <span class="value">{treatment.indication}</span>
                            </div>
                        {/if}
                        
                        {#if treatment.timestamp}
                            <div class="detail-item">
                                <span class="label">{$t('report.timestamp')}:</span>
                                <span class="value">{formatDate(treatment.timestamp)}</span>
                            </div>
                        {/if}
                        
                        {#if treatment.duration}
                            <div class="detail-item">
                                <span class="label">{$t('report.duration')}:</span>
                                <span class="value">{formatDuration(treatment.duration)}</span>
                            </div>
                        {/if}
                        
                        {#if treatment.administeredBy}
                            <div class="detail-item">
                                <span class="label">{$t('report.administered-by')}:</span>
                                <span class="value">{treatment.administeredBy}</span>
                            </div>
                        {/if}
                        
                        {#if treatment.response}
                            <div class="detail-item">
                                <span class="label">{$t('report.response')}:</span>
                                <span class="value {getResponseClass(treatment.response)}">
                                    {$t(`medical.enums.treatment_response.${treatment.response}`)}
                                </span>
                            </div>
                        {/if}
                    </div>
                    
                    {#if treatment.complications?.length > 0}
                        <div class="complications-section">
                            <span class="label">{$t('report.complications')}:</span>
                            <ul class="complications-list">
                                {#each treatment.complications as complication}
                                    <li>{complication}</li>
                                {/each}
                            </ul>
                        </div>
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}
    
    <!-- Treatment Outcomes -->
    {#if Object.keys(treatmentOutcomes).length > 0}
        <h4 class="section-title-sub">{$t('report.treatment-outcomes')}</h4>
        <div class="page -block">
            <div class="treatment-outcomes-info">
                {#if treatmentOutcomes.overallOutcome}
                    <div class="outcome-overall">
                        <span class="label">{$t('report.overall-outcome')}:</span>
                        <span class="outcome-value {getOutcomeClass(treatmentOutcomes.overallOutcome)}">
                            {$t(`medical.enums.treatment_outcomes.${treatmentOutcomes.overallOutcome}`)}
                        </span>
                    </div>
                {/if}
                
                {#if treatmentOutcomes.symptomsImprovement}
                    <div class="detail-item">
                        <span class="label">{$t('report.symptoms-improvement')}:</span>
                        <span class="value improvement-percentage">{formatPercentage(treatmentOutcomes.symptomsImprovement)}</span>
                    </div>
                {/if}
                
                {#if treatmentOutcomes.functionalImprovement}
                    <div class="detail-item">
                        <span class="label">{$t('report.functional-improvement')}:</span>
                        <span class="value improvement-percentage">{formatPercentage(treatmentOutcomes.functionalImprovement)}</span>
                    </div>
                {/if}
                
                {#if treatmentOutcomes.qualityOfLife}
                    <div class="detail-item">
                        <span class="label">{$t('report.quality-of-life')}:</span>
                        <span class="value">{$t(`medical.enums.quality_levels.${treatmentOutcomes.qualityOfLife}`)}</span>
                    </div>
                {/if}
                
                {#if treatmentOutcomes.patientSatisfaction}
                    <div class="detail-item">
                        <span class="label">{$t('report.patient-satisfaction')}:</span>
                        <span class="value satisfaction-rating">{formatPercentage(treatmentOutcomes.patientSatisfaction)}</span>
                    </div>
                {/if}
                
                {#if treatmentOutcomes.adverseEvents}
                    <div class="detail-item">
                        <span class="label">{$t('report.adverse-events')}:</span>
                        <span class="value">{treatmentOutcomes.adverseEvents}</span>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
    
    <!-- Adherence -->
    {#if Object.keys(adherence).length > 0}
        <h4 class="section-title-sub">{$t('report.treatment-adherence')}</h4>
        <div class="page -block">
            <div class="adherence-info">
                {#if adherence.overall}
                    <div class="adherence-overall">
                        <span class="label">{$t('report.overall-adherence')}:</span>
                        <span class="adherence-value {getAdherenceClass(adherence.overall)}">
                            {$t(`medical.enums.adherence_levels.${adherence.overall}`)}
                        </span>
                    </div>
                {/if}
                
                {#if adherence.percentage}
                    <div class="detail-item">
                        <span class="label">{$t('report.adherence-percentage')}:</span>
                        <span class="value adherence-percentage">{formatPercentage(adherence.percentage)}</span>
                    </div>
                {/if}
                
                {#if adherence.missedDoses}
                    <div class="detail-item">
                        <span class="label">{$t('report.missed-doses')}:</span>
                        <span class="value">{adherence.missedDoses}</span>
                    </div>
                {/if}
                
                {#if adherence.barriers?.length > 0}
                    <div class="barriers-section">
                        <span class="label">{$t('report.barriers')}:</span>
                        <ul class="barriers-list">
                            {#each adherence.barriers as barrier}
                                <li>{barrier}</li>
                            {/each}
                        </ul>
                    </div>
                {/if}
                
                {#if adherence.interventions?.length > 0}
                    <div class="interventions-section">
                        <span class="label">{$t('report.interventions')}:</span>
                        <ul class="interventions-list">
                            {#each adherence.interventions as intervention}
                                <li>{intervention}</li>
                            {/each}
                        </ul>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
    
    <!-- Staff Information -->
    {#if provider || coordinator}
        <h4 class="section-title-sub">{$t('report.staff-information')}</h4>
        <div class="page -block">
            <div class="staff-info">
                {#if provider}
                    <div class="staff-member">
                        <span class="label">{$t('report.provider')}:</span>
                        <div class="staff-details">
                            <span class="staff-name">{provider.name}</span>
                            {#if provider.title}
                                <span class="staff-title">{provider.title}</span>
                            {/if}
                            {#if provider.department}
                                <span class="staff-department">{provider.department}</span>
                            {/if}
                            {#if provider.contact}
                                <span class="staff-contact">{provider.contact}</span>
                            {/if}
                        </div>
                    </div>
                {/if}
                
                {#if coordinator}
                    <div class="staff-member">
                        <span class="label">{$t('report.coordinator')}:</span>
                        <div class="staff-details">
                            <span class="staff-name">{coordinator.name}</span>
                            {#if coordinator.title}
                                <span class="staff-title">{coordinator.title}</span>
                            {/if}
                            {#if coordinator.contact}
                                <span class="staff-contact">{coordinator.contact}</span>
                            {/if}
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
    
{:else if data}
    <h3 class="h3 heading -sticky">{$t('report.treatments')}</h3>
    <div class="page -block">
        <p class="no-data">{$t('report.no-treatments-data')}</p>
    </div>
{/if}

<style>
    .treatment-summary-info {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .active-count {
        color: var(--color-success-dark);
        font-weight: 600;
    }
    
    .completed-count {
        color: var(--color-info-dark);
        font-weight: 600;
    }
    
    .treatment-cost {
        color: var(--color-warning-dark);
        font-weight: 600;
    }
    
    .treatment-item {
        border-left-color: var(--color-info);
    }
    
    .treatment-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 0.75rem;
        gap: 1rem;
    }
    
    .treatment-main {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        flex: 1;
    }
    
    .treatment-name {
        font-size: 1.1rem;
        font-weight: 600;
        margin: 0;
        color: var(--color-text-primary);
    }
    
    .treatment-meta {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        flex-wrap: wrap;
    }
    
    .treatment-type {
        background-color: var(--color-info-light);
        color: var(--color-info-dark);
        padding: 0.125rem 0.375rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
        text-transform: uppercase;
    }
    
    .treatment-dosage {
        color: var(--color-text-secondary);
        font-size: 0.9rem;
        font-weight: 500;
    }
    
    .emergency-indicator {
        background-color: var(--color-danger);
        color: white;
        padding: 0.125rem 0.375rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
        text-transform: uppercase;
        animation: pulse 1s infinite;
    }
    
    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
    }
    
    .treatment-badges {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        align-items: flex-end;
    }
    
    .treatment-details {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .next-appointment {
        color: var(--color-warning-dark);
        font-weight: 600;
    }
    
    .scheduled-date {
        color: var(--color-primary);
        font-weight: 600;
    }
    
    .effectiveness-rating {
        color: var(--color-success-dark);
        font-weight: 600;
    }
    
    .treatment-response {
        margin-top: 0.75rem;
        padding-top: 0.75rem;
        border-top: 1px solid var(--color-border);
    }
    
    .side-effects-section,
    .prerequisites-section,
    .complications-section,
    .barriers-section,
    .interventions-section {
        margin-top: 0.75rem;
    }
    
    .side-effects-list,
    .prerequisites-list,
    .complications-list,
    .barriers-list,
    .interventions-list {
        margin: 0.5rem 0 0 1.5rem;
        padding: 0;
    }
    
    .side-effects-list li,
    .prerequisites-list li,
    .complications-list li,
    .barriers-list li,
    .interventions-list li {
        margin-bottom: 0.25rem;
        color: var(--color-text-secondary);
    }
    
    .treatment-instructions {
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
    
    .final-outcome {
        margin-top: 0.75rem;
        padding-top: 0.75rem;
        border-top: 1px solid var(--color-border);
    }
    
    .outcome-text {
        margin: 0.25rem 0 0 0;
        color: var(--color-text-primary);
        line-height: 1.5;
    }
    
    .approval-status {
        margin-top: 0.75rem;
        padding-top: 0.75rem;
        border-top: 1px solid var(--color-border);
    }
    
    .treatment-outcomes-info,
    .adherence-info {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .outcome-overall,
    .adherence-overall {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.75rem;
        padding: 0.5rem 1rem;
        background-color: var(--color-background-secondary);
        border-radius: 0.5rem;
    }
    
    .outcome-value,
    .adherence-value {
        font-weight: 600;
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        text-transform: uppercase;
        font-size: 0.9rem;
    }
    
    .improvement-percentage,
    .satisfaction-rating,
    .adherence-percentage {
        font-weight: 600;
        color: var(--color-success-dark);
    }
    
    .staff-info {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }
    
    .staff-member {
        display: flex;
        gap: 0.5rem;
        align-items: flex-start;
    }
    
    .staff-details {
        display: flex;
        flex-direction: column;
        gap: 0.125rem;
    }
    
    .staff-name {
        font-weight: 600;
        color: var(--color-text-primary);
    }
    
    .staff-title,
    .staff-department,
    .staff-contact {
        color: var(--color-text-secondary);
        font-size: 0.9rem;
    }
    
    .status-badge,
    .priority-badge,
    .outcome-badge {
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
        text-transform: uppercase;
        white-space: nowrap;
    }
    
    .status-active {
        background-color: var(--color-success-light);
        color: var(--color-success-dark);
    }
    
    .status-completed {
        background-color: var(--color-info-light);
        color: var(--color-info-dark);
    }
    
    .status-discontinued {
        background-color: var(--color-danger-light);
        color: var(--color-danger-dark);
    }
    
    .status-on-hold {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
    }
    
    .status-planned {
        background-color: var(--color-primary-light);
        color: var(--color-primary-dark);
    }
    
    .status-cancelled {
        background-color: var(--color-secondary-light);
        color: var(--color-secondary-dark);
    }
    
    .status-emergency {
        background-color: var(--color-danger);
        color: white;
        animation: pulse 1s infinite;
    }
    
    .priority-low {
        background-color: var(--color-info-light);
        color: var(--color-info-dark);
    }
    
    .priority-medium {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
    }
    
    .priority-high {
        background-color: var(--color-danger-light);
        color: var(--color-danger-dark);
    }
    
    .priority-urgent {
        background-color: var(--color-danger);
        color: white;
    }
    
    .priority-emergency {
        background-color: var(--color-danger);
        color: white;
        animation: pulse 1s infinite;
    }
    
    .response-excellent {
        background-color: var(--color-success-light);
        color: var(--color-success-dark);
    }
    
    .response-good {
        background-color: var(--color-success-light);
        color: var(--color-success-dark);
    }
    
    .response-fair {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
    }
    
    .response-poor {
        background-color: var(--color-danger-light);
        color: var(--color-danger-dark);
    }
    
    .response-none {
        background-color: var(--color-secondary-light);
        color: var(--color-secondary-dark);
    }
    
    .outcome-successful {
        background-color: var(--color-success-light);
        color: var(--color-success-dark);
    }
    
    .outcome-partial {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
    }
    
    .outcome-unsuccessful {
        background-color: var(--color-danger-light);
        color: var(--color-danger-dark);
    }
    
    .outcome-ongoing {
        background-color: var(--color-info-light);
        color: var(--color-info-dark);
    }
    
    .adherence-excellent {
        background-color: var(--color-success-light);
        color: var(--color-success-dark);
    }
    
    .adherence-good {
        background-color: var(--color-success-light);
        color: var(--color-success-dark);
    }
    
    .adherence-fair {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
    }
    
    .adherence-poor {
        background-color: var(--color-danger-light);
        color: var(--color-danger-dark);
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
    
    /* Treatment type panel coloring */
    .type-medication {
        border-left-color: var(--color-primary);
    }
    
    .type-procedure {
        border-left-color: var(--color-warning);
    }
    
    .type-therapy {
        border-left-color: var(--color-info);
    }
    
    .type-surgery {
        border-left-color: var(--color-danger);
    }
    
    .type-radiation {
        border-left-color: var(--color-secondary);
    }
    
    .type-chemotherapy {
        border-left-color: var(--color-success);
    }
    
    .type-immunotherapy {
        border-left-color: var(--color-primary);
    }
    
    .type-lifestyle {
        border-left-color: var(--color-info);
    }
    
    .type-general {
        border-left-color: var(--color-text-secondary);
    }
    
    /* Status-based panel coloring overrides */
    .status-active {
        border-left-color: var(--color-success);
    }
    
    .status-completed {
        border-left-color: var(--color-info);
    }
    
    .status-discontinued {
        border-left-color: var(--color-danger);
    }
    
    .status-on-hold {
        border-left-color: var(--color-warning);
    }
    
    .status-planned {
        border-left-color: var(--color-primary);
    }
    
    .status-cancelled {
        border-left-color: var(--color-secondary);
    }
    
    .status-emergency {
        border-left-color: var(--color-danger);
        border-left-width: 4px;
    }
</style>