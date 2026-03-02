<script lang="ts">
    import { t } from '$lib/i18n';
    import { isEmpty } from '$lib/object';
    import AskButton from '$components/chat/AskButton.svelte';

    interface Props {
        data: any;
        document?: any;
        key?: string;
    }

    let { data, document, key }: Props = $props();
    // Check if we have medication data
    let hasMedications = $derived(data && (
        data.hasMedications || 
        data.currentMedications?.length > 0 || 
        data.newPrescriptions?.length > 0 ||
        data.discontinuedMedications?.length > 0 ||
        data.medicationChanges?.length > 0
    ));
    
    // Extract medication sections
    let currentMedications = $derived(data?.currentMedications || []);
    let newPrescriptions = $derived(data?.newPrescriptions || []);
    let discontinuedMedications = $derived(data?.discontinuedMedications || []);
    let medicationChanges = $derived(data?.medicationChanges || []);
    let medicationAllergies = $derived(data?.medicationAllergies || []);
    let interactions = $derived(data?.interactions || []);
    let adherenceAssessment = $derived(data?.adherenceAssessment);
    
    // Helper functions with proper typing
    function getStatusClass(status: string): string {
        const statusClasses: Record<string, string> = {
            'active': 'status-active',
            'completed': 'status-completed',
            'discontinued': 'status-discontinued',
            'on_hold': 'status-hold',
            'unknown': 'status-unknown'
        };
        return statusClasses[status] || 'status-unknown';
    }
    
    function getAdherenceClass(adherence: string): string {
        const adherenceClasses: Record<string, string> = {
            'excellent': 'adherence-excellent',
            'good': 'adherence-good', 
            'fair': 'adherence-fair',
            'poor': 'adherence-poor',
            'unknown': 'adherence-unknown'
        };
        return adherenceClasses[adherence] || 'adherence-unknown';
    }
    
    function getChangeTypeClass(changeType: string): string {
        const changeClasses: Record<string, string> = {
            'dose_increase': 'change-increase',
            'dose_decrease': 'change-decrease',
            'frequency_change': 'change-frequency',
            'discontinued': 'change-discontinued',
            'switched': 'change-switched',
            'added': 'change-added'
        };
        return changeClasses[changeType] || 'change-neutral';
    }
    
    function getSeverityClass(severity: string): string {
        const severityClasses: Record<string, string> = {
            'mild': 'severity-mild',
            'moderate': 'severity-moderate',
            'major': 'severity-major',
            'severe': 'severity-severe',
            'life_threatening': 'severity-critical',
            'contraindicated': 'severity-critical'
        };
        return severityClasses[severity] || 'severity-unknown';
    }
    
    function getRouteDisplay(route: string): string {
        const routeMap: Record<string, string> = {
            'oral': 'By mouth',
            'sublingual': 'Under tongue',
            'nasal': 'Nasal',
            'inhalation': 'Inhaled',
            'topical': 'Topical',
            'transdermal': 'Patch',
            'rectal': 'Rectal',
            'intravenous': 'IV',
            'intramuscular': 'IM',
            'subcutaneous': 'SubQ',
            'ophthalmic': 'Eye drops',
            'otic': 'Ear drops',
            'vaginal': 'Vaginal',
            'buccal': 'Buccal'
        };
        return routeMap[route] || route;
    }



</script>

{#if hasMedications}
    <h3 class="h3 heading -sticky">{$t('report.medications')}</h3>
    
        <!-- Current Medications -->
        {#if currentMedications.length > 0}
                <h4 class="section-title-sub">{$t('report.current-medications')}</h4>
                <ul class="list-items">
                    {#each currentMedications as medication}
                        <li class="panel medication-active">
                            <div class="medication-header">
                                <h5 class="medication-name">{medication.medicationName}</h5>
                                <div class="medication-header-actions">
                                    <span class="medication-status {getStatusClass(medication.status)}">{$t(`medical.enums.medication_status.${medication.status || 'active'}`)}</span>
                                    <AskButton
                                        type="medication"
                                        label={medication.medicationName}
                                        data={medication}
                                        documentId={document?.id}
                                        documentTitle={document?.content?.title}
                                    />
                                </div>
                            </div>
                            
                            <div class="item-details">
                                {#if medication.genericName}
                                    <div class="detail-item">
                                        <span class="label">{$t('report.generic-name')}:</span>
                                        <span class="value">{medication.genericName}</span>
                                    </div>
                                {/if}
                                
                                {#if medication.strength || medication.dosage}
                                    <div class="detail-item">
                                        <span class="label">{$t('report.dose')}:</span>
                                        <span class="value dosage-value">{medication.strength || medication.dosage}</span>
                                    </div>
                                {/if}
                                
                                {#if medication.route}
                                    <div class="detail-item">
                                        <span class="label">{$t('report.route')}:</span>
                                        <span class="value">{getRouteDisplay(medication.route)}</span>
                                    </div>
                                {/if}
                                
                                {#if medication.frequency}
                                    <div class="detail-item">
                                        <span class="label">{$t('report.frequency')}:</span>
                                        <span class="value">{medication.frequency}</span>
                                    </div>
                                {/if}
                                
                                {#if medication.indication}
                                    <div class="detail-item">
                                        <span class="label">{$t('report.indication')}:</span>
                                        <span class="value">{medication.indication}</span>
                                    </div>
                                {/if}
                                
                                {#if medication.adherence}
                                    <div class="detail-item">
                                        <span class="label">{$t('report.adherence')}:</span>
                                        <span class="value {getAdherenceClass(medication.adherence)}">{$t(`medical.enums.adherence_levels.${medication.adherence}`)}</span>
                                    </div>
                                {/if}
                            </div>
                            
                            {#if medication.sideEffects?.length > 0}
                                <div class="side-effects">
                                    <span class="label">{$t('report.side-effects')}:</span>
                                    <div class="side-effects-list">
                                        {#each medication.sideEffects as effect}
                                            <span class="side-effect-tag">{effect}</span>
                                        {/each}
                                    </div>
                                </div>
                            {/if}
                            
                            {#if medication.notes}
                                <div class="item-notes">
                                    <span class="label">{$t('report.notes')}:</span>
                                    <p>{medication.notes}</p>
                                </div>
                            {/if}
                        </li>
                    {/each}
                </ul>
        {/if}
        
        <!-- New Prescriptions -->
        {#if newPrescriptions.length > 0}
                <h4 class="section-title-sub">{$t('report.new-prescriptions')}</h4>
                <ul class="list-items">
                    {#each newPrescriptions as prescription}
                        <li class="panel medication-new">
                            <div class="medication-header">
                                <h5 class="medication-name">{prescription.medicationName}</h5>
                                <div class="medication-header-actions">
                                    <span class="prescription-badge">{$t('report.new')}</span>
                                    <AskButton
                                        type="medication"
                                        label={prescription.medicationName}
                                        data={prescription}
                                        documentId={document?.id}
                                        documentTitle={document?.content?.title}
                                    />
                                </div>
                            </div>
                            
                            <div class="item-details">
                                {#if prescription.strength}
                                    <div class="detail-item">
                                        <span class="label">{$t('report.strength')}:</span>
                                        <span class="value dosage-value">{prescription.strength}</span>
                                    </div>
                                {/if}
                                
                                {#if prescription.dosage}
                                    <div class="detail-item">
                                        <span class="label">{$t('report.dosage')}:</span>
                                        <span class="value">{prescription.dosage}</span>
                                    </div>
                                {/if}
                                
                                {#if prescription.frequency?.schedule}
                                    <div class="detail-item">
                                        <span class="label">{$t('report.frequency')}:</span>
                                        <span class="value">{prescription.frequency.schedule}</span>
                                    </div>
                                {/if}
                                
                                {#if prescription.duration?.quantity}
                                    <div class="detail-item">
                                        <span class="label">{$t('report.quantity')}:</span>
                                        <span class="value">{prescription.duration.quantity}</span>
                                    </div>
                                {/if}
                            </div>
                            
                            {#if prescription.instructions?.administration || prescription.instructions?.specialInstructions}
                                <div class="item-notes">
                                    {#if prescription.instructions.administration}
                                        <p><strong>{$t('report.administration')}:</strong> {prescription.instructions.administration}</p>
                                    {/if}
                                    {#if prescription.instructions.specialInstructions}
                                        <p><strong>{$t('report.special-instructions')}:</strong> {prescription.instructions.specialInstructions}</p>
                                    {/if}
                                </div>
                            {/if}
                        </li>
                    {/each}
                </ul>
        {/if}
        
        <!-- Medication Changes -->
        {#if medicationChanges.length > 0}
                <h4 class="section-title-sub">{$t('report.medication-changes')}</h4>
                <ul class="list-items">
                    {#each medicationChanges as change}
                        <li class="panel {getChangeTypeClass(change.changeType)}">
                            <div class="change-header">
                                <span class="medication-name">{change.medicationName}</span>
                                <div class="change-header-actions">
                                    <span class="change-type">{$t(`medical.enums.medication_change_types.${change.changeType}`)}</span>
                                    <AskButton
                                        type="medication-change"
                                        label={change.medicationName}
                                        data={change}
                                        documentId={document?.id}
                                        documentTitle={document?.content?.title}
                                    />
                                </div>
                            </div>
                            
                            {#if change.previousDose || change.newDose}
                                <div class="dose-change">
                                    {#if change.previousDose}
                                        <span class="previous-dose">{$t('report.previous')}: {change.previousDose}</span>
                                    {/if}
                                    {#if change.newDose}
                                        <span class="arrow">→</span>
                                        <span class="new-dose">{$t('report.new')}: {change.newDose}</span>
                                    {/if}
                                </div>
                            {/if}
                            
                            {#if change.reason}
                                <div class="change-reason">
                                    <span class="label">{$t('report.reason')}:</span>
                                    <span class="value">{$t(`medical.enums.medication_change_reasons.${change.reason}`)}</span>
                                </div>
                            {/if}
                        </li>
                    {/each}
                </ul>
        {/if}
        
        <!-- Discontinued Medications -->
        {#if discontinuedMedications.length > 0}
                <h4 class="section-title-sub">{$t('report.discontinued-medications')}</h4>
                <ul class="list-items">
                    {#each discontinuedMedications as discontinued}
                        <li class="panel medication-discontinued">
                            <span class="medication-name">{discontinued.medicationName}</span>
                            {#if discontinued.dateDiscontinued}
                                <span class="date-discontinued">{discontinued.dateDiscontinued}</span>
                            {/if}
                            {#if discontinued.reasonDiscontinued}
                                <span class="reason">({$t(`medical.enums.discontinuation_reasons.${discontinued.reasonDiscontinued}`)})</span>
                            {/if}
                        </li>
                    {/each}
                </ul>
        {/if}
        
        <!-- Drug Interactions -->
        {#if interactions.length > 0}
                <h4 class="section-title-sub">{$t('report.drug-interactions')}</h4>
                <ul class="list-items">
                    {#each interactions as interaction}
                        <li class="panel {getSeverityClass(interaction.severity)}">
                            <div class="interaction-drugs">
                                <span class="drug1">{interaction.drug1}</span>
                                <span class="interaction-symbol">⚠️</span>
                                <span class="drug2">{interaction.drug2}</span>
                                <AskButton
                                    type="drug-interaction"
                                    label="{interaction.drug1} + {interaction.drug2}"
                                    data={interaction}
                                    documentId={document?.id}
                                    documentTitle={document?.content?.title}
                                />
                            </div>
                            <div class="interaction-details">
                                <span class="severity {getSeverityClass(interaction.severity)}">{$t(`medical.enums.interaction_severity.${interaction.severity}`)}</span>
                                {#if interaction.effect}
                                    <span class="effect">{interaction.effect}</span>
                                {/if}
                            </div>
                        </li>
                    {/each}
                </ul>
        {/if}
        
        <!-- Medication Allergies -->
        {#if medicationAllergies.length > 0}
                <h4 class="section-title-sub">{$t('report.medication-allergies')}</h4>
                <ul class="list-items">
                    {#each medicationAllergies as allergy}
                        <li class="panel allergy-item {getSeverityClass(allergy.severity)}">
                            <span class="medication">{allergy.medication}</span>
                            <span class="reaction">{allergy.reaction}</span>
                            {#if allergy.severity}
                                <span class="severity {getSeverityClass(allergy.severity)}">{$t(`medical.enums.allergy_severity.${allergy.severity}`)}</span>
                            {/if}
                        </li>
                    {/each}
                </ul>
        {/if}
        
        <!-- Adherence Assessment -->
        {#if !isEmpty(adherenceAssessment)}
            
                <h4 class="section-title-sub">{$t('report.adherence-assessment')}</h4>
                <ul class="list-items">
                    <li class="panel adherence-panel">
                        {#if adherenceAssessment.overallAdherence}
                            <div class="overall-adherence">
                                <span class="label">{$t('report.overall-adherence')}:</span>
                                <span class="value {getAdherenceClass(adherenceAssessment.overallAdherence)}">{$t(`medical.enums.adherence_levels.${adherenceAssessment.overallAdherence}`)}</span>
                            </div>
                        {/if}
                        
                        {#if adherenceAssessment.barriers?.length > 0}
                            <div class="barriers">
                                <span class="label">{$t('report.barriers')}:</span>
                                <ul>
                                    {#each adherenceAssessment.barriers as barrier}
                                        <li>{$t(`medical.enums.adherence_barriers.${barrier}`)}</li>
                                    {/each}
                                </ul>
                            </div>
                        {/if}
                        
                        {#if adherenceAssessment.interventions?.length > 0}
                            <div class="interventions">
                                <span class="label">{$t('report.interventions')}:</span>
                                <ul>
                                    {#each adherenceAssessment.interventions as intervention}
                                        <li>{intervention}</li>
                                    {/each}
                                </ul>
                            </div>
                        {/if}
                    </li>
                </ul>
            
        {/if}
{:else if data}
    <h3 class="h3 heading -sticky">{$t('report.medications')}</h3>
    <div class="page -block">
        <p class="no-data">{$t('report.no-medication-data')}</p>
    </div>
{/if}

<style>
    /* SectionMedications specific panel types */
    
    /* Panel type variations */
    .medication-active {
        border-left-color: var(--color-success);
    }
    
    .medication-new {
        border-left-color: var(--color-info);
    }
    
    .medication-discontinued {
        border-left-color: var(--color-danger);
    }
    
    .change-increase {
        border-left-color: var(--color-success);
    }
    
    .change-decrease {
        border-left-color: var(--color-warning);
    }
    
    .change-discontinued {
        border-left-color: var(--color-danger);
    }
    
    .change-added {
        border-left-color: var(--color-info);
    }
    
    .severity-mild {
        border-left-color: var(--color-info);
    }
    
    .severity-moderate {
        border-left-color: var(--color-warning);
    }
    
    .severity-major,
    .severity-severe,
    .severity-critical {
        border-left-color: var(--color-danger);
    }
    
    .allergy-item {
        border-left-color: var(--color-danger);
    }
    
    .adherence-panel {
        border-left-color: var(--color-info);
    }
    
    /* Content styling */
    .medication-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.75rem;
    }
    
    .medication-name {
        font-size: 1.1rem;
        font-weight: 600;
        margin: 0;
        color: var(--color-text-primary);
    }
    
    .medication-status {
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
        text-transform: uppercase;
    }
    
    .status-active {
        background-color: var(--color-success-light);
        color: var(--color-success-dark);
    }
    
    .status-discontinued {
        background-color: var(--color-danger-light);
        color: var(--color-danger-dark);
    }
    
    .status-hold {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
    }
    
    .prescription-badge {
        background-color: var(--color-success);
        color: white;
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
    }
    
    .medication-header-actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    /* medication-details now uses global .item-details styles */
    
    .detail-item {
        display: flex;
        gap: 0.5rem;
    }
    
    .label {
        font-weight: 500;
        color: var(--color-text-secondary);
        min-width: 80px;
    }
    
    .value {
        color: var(--color-text-primary);
    }
    
    .dosage-value {
        font-weight: 600;
        color: var(--color-success-dark);
    }
    
    .adherence-excellent {
        color: var(--color-success-dark);
        font-weight: 600;
    }
    
    .adherence-good {
        color: var(--color-success);
        font-weight: 600;
    }
    
    .adherence-fair {
        color: var(--color-warning-dark);
        font-weight: 600;
    }
    
    .adherence-poor {
        color: var(--color-danger-dark);
        font-weight: 600;
    }
    
    .side-effects {
        margin-bottom: 0.75rem;
    }
    
    .side-effects-list {
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem;
        margin-top: 0.25rem;
    }
    
    .side-effect-tag {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
        padding: 0.125rem 0.375rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
    }
    
    .change-header-actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    /* medication-notes and medication-instructions now use global .item-notes styles */

    /* Medication Changes */
    .change-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.5rem;
    }
    
    .change-type {
        font-size: 0.8rem;
        font-weight: 500;
        text-transform: uppercase;
        color: var(--color-text-secondary);
    }
    
    .dose-change {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.5rem;
    }
    
    .arrow {
        color: var(--color-text-secondary);
        font-weight: bold;
    }
    
    .new-dose {
        font-weight: 600;
    }
    
    /* Discontinued medications */
    .date-discontinued {
        font-size: 0.8rem;
        color: var(--color-text-secondary);
        margin-left: 0.5rem;
    }
    
    .reason {
        font-size: 0.8rem;
        color: var(--color-text-secondary);
        font-style: italic;
        margin-left: 0.5rem;
    }
    
    /* Drug Interactions */
    .interaction-drugs {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.5rem;
        font-weight: 600;
    }
    
    .interaction-symbol {
        color: var(--color-warning-dark);
    }
    
    .interaction-details {
        display: flex;
        gap: 1rem;
        font-size: 0.9rem;
    }
    
    .severity {
        font-weight: 600;
        text-transform: uppercase;
        font-size: 0.8rem;
    }
    
    /* Allergies */
    .allergy-item .medication {
        font-weight: 600;
        margin-right: 0.5rem;
    }
    
    .allergy-item .reaction {
        margin-right: 0.5rem;
    }
    
    /* Adherence Assessment */
    .overall-adherence {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 1rem;
    }
    
    .barriers, .interventions {
        margin-bottom: 0.75rem;
    }
    
    .barriers ul, .interventions ul {
        margin: 0.5rem 0 0 1.5rem;
        padding: 0;
    }
    
    .barriers li, .interventions li {
        margin-bottom: 0.25rem;
    }
    
    /* Uses global .no-data styles */
</style>