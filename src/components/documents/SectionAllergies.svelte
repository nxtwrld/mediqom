<script lang="ts">
    import { t } from '$lib/i18n';
    import AskButton from '$components/chat/AskButton.svelte';

    interface Props {
        data: any;
        document?: any;
        key?: string;
    }

    let { data, document, key }: Props = $props();

    // Check if we have allergy data
    let hasAllergies = $derived(data && (
        data.hasAllergies || 
        data.allergies?.length > 0 ||
        data.drugIntolerances?.length > 0 ||
        data.environmentalSensitivities?.length > 0
    ));
    
    // Extract allergy sections
    let allergies = $derived(data?.allergies || []);
    let drugIntolerances = $derived(data?.drugIntolerances || []);
    let environmentalSensitivities = $derived(data?.environmentalSensitivities || []);
    let familyAllergyHistory = $derived(data?.familyAllergyHistory || []);
    let allergyAlerts = $derived(data?.allergyAlerts || []);
    let noKnownAllergies = $derived(data?.noKnownAllergies || false);
    
    // Helper functions with proper typing
    function getCategoryClass(category: string): string {
        const categoryClasses: Record<string, string> = {
            'medication': 'allergy-medication',
            'food': 'allergy-food',
            'environmental': 'allergy-environmental',
            'latex': 'allergy-latex',
            'contrast': 'allergy-contrast',
            'other_chemical': 'allergy-chemical',
            'biological': 'allergy-biological',
            'unknown': 'allergy-unknown'
        };
        return categoryClasses[category] || 'allergy-general';
    }
    
    function getSeverityClass(severity: string): string {
        const severityClasses: Record<string, string> = {
            'mild': 'severity-mild',
            'moderate': 'severity-moderate',
            'severe': 'severity-severe',
            'life_threatening': 'severity-critical',
            'fatal': 'severity-critical',
            'unknown': 'severity-unknown'
        };
        return severityClasses[severity] || 'severity-unknown';
    }
    
    function getStatusClass(status: string): string {
        const statusClasses: Record<string, string> = {
            'active': 'status-active',
            'resolved': 'status-resolved',
            'inactive': 'status-inactive',
            'entered_in_error': 'status-error'
        };
        return statusClasses[status] || 'status-unknown';
    }
    
    function getReactionTypeClass(reactionType: string): string {
        const reactionClasses: Record<string, string> = {
            'allergic_reaction': 'reaction-allergic',
            'anaphylaxis': 'reaction-anaphylaxis',
            'intolerance': 'reaction-intolerance',
            'side_effect': 'reaction-side-effect',
            'toxicity': 'reaction-toxicity',
            'pseudoallergy': 'reaction-pseudo',
            'unknown': 'reaction-unknown'
        };
        return reactionClasses[reactionType] || 'reaction-general';
    }
    
    function getPriorityClass(priority: string): string {
        const priorityClasses: Record<string, string> = {
            'low': 'priority-low',
            'medium': 'priority-medium',
            'high': 'priority-high',
            'critical': 'priority-critical'
        };
        return priorityClasses[priority] || 'priority-medium';
    }
</script>

{#if hasAllergies || noKnownAllergies}
    <h3 class="h3 heading -sticky">{$t('report.allergies')}</h3>
    
    <!-- No Known Allergies Statement -->
    {#if noKnownAllergies}
        <div class="page -block">
            <div class="no-allergies-statement">
                <span class="nka-badge">{$t('report.no-known-allergies')}</span>
            </div>
        </div>
    {/if}
    
    <!-- Allergy Alerts -->
    {#if allergyAlerts.length > 0}
        <h4 class="section-title-sub">{$t('report.allergy-alerts')}</h4>
        <ul class="list-items">
            {#each allergyAlerts as alert}
                <li class="panel alert-item {getPriorityClass(alert.priority)}">
                    <div class="alert-header">
                        <span class="alert-priority {getPriorityClass(alert.priority)}">{$t(`medical.enums.alert_priorities.${alert.priority}`)}</span>
                    </div>
                    <div class="alert-content">
                        <p class="alert-message">{alert.alert}</p>
                        {#if alert.instructions}
                            <p class="alert-instructions">{alert.instructions}</p>
                        {/if}
                    </div>
                </li>
            {/each}
        </ul>
    {/if}
    
    <!-- Main Allergies -->
    {#if allergies.length > 0}
        <h4 class="section-title-sub">{$t('report.documented-allergies')}</h4>
        <ul class="list-items">
            {#each allergies as allergy}
                <li class="panel {getCategoryClass(allergy.category)} {getSeverityClass(allergy.severity)}">
                    <div class="allergy-header">
                        <div class="allergy-main">
                            <h5 class="item-name">{allergy.allergen}</h5>
                            {#if allergy.category}
                                <span class="category-badge {getCategoryClass(allergy.category)}">{$t(`medical.enums.allergy_categories.${allergy.category}`)}</span>
                            {/if}
                        </div>
                        <div class="allergy-badges">
                            {#if allergy.severity}
                                <span class="severity-badge {getSeverityClass(allergy.severity)}">{$t(`medical.enums.allergy_severity.${allergy.severity}`)}</span>
                            {/if}
                            {#if allergy.status}
                                <span class="status-badge {getStatusClass(allergy.status)}">{$t(`medical.enums.allergy_status.${allergy.status}`)}</span>
                            {/if}
                            <AskButton
                                type="allergy"
                                label={allergy.allergen}
                                data={allergy}
                                documentId={document?.id}
                                documentTitle={document?.content?.title}
                            />
                        </div>
                    </div>
                    
                    <div class="item-details">
                        {#if allergy.reactionType}
                            <div class="detail-item">
                                <span class="label">{$t('report.reaction-type')}:</span>
                                <span class="value {getReactionTypeClass(allergy.reactionType)}">{$t(`medical.enums.reaction_types.${allergy.reactionType}`)}</span>
                            </div>
                        {/if}
                        
                        {#if allergy.onsetDate}
                            <div class="detail-item">
                                <span class="label">{$t('report.onset-date')}:</span>
                                <span class="value">{allergy.onsetDate}</span>
                            </div>
                        {/if}
                        
                        {#if allergy.lastReactionDate}
                            <div class="detail-item">
                                <span class="label">{$t('report.last-reaction')}:</span>
                                <span class="value">{allergy.lastReactionDate}</span>
                            </div>
                        {/if}
                        
                        {#if allergy.certainty}
                            <div class="detail-item">
                                <span class="label">{$t('report.certainty')}:</span>
                                <span class="value">{$t(`medical.enums.certainty_levels.${allergy.certainty}`)}</span>
                            </div>
                        {/if}
                    </div>
                    
                    <!-- Reactions List -->
                    {#if allergy.reactions?.length > 0}
                        <div class="reactions-section">
                            <span class="label">{$t('report.reactions')}:</span>
                            <div class="reactions-list">
                                {#each allergy.reactions as reaction}
                                    <div class="reaction-item">
                                        <span class="reaction-symptom">{reaction.symptom}</span>
                                        {#if reaction.system}
                                            <span class="reaction-system">({$t(`medical.enums.body_systems.${reaction.system}`)})</span>
                                        {/if}
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {/if}
                    
                    <!-- Medication Details -->
                    {#if allergy.medicationDetails}
                        <div class="medication-details">
                            {#if allergy.medicationDetails.genericName}
                                <div class="detail-item">
                                    <span class="label">{$t('report.generic-name')}:</span>
                                    <span class="value">{allergy.medicationDetails.genericName}</span>
                                </div>
                            {/if}
                            {#if allergy.medicationDetails.drugClass}
                                <div class="detail-item">
                                    <span class="label">{$t('report.drug-class')}:</span>
                                    <span class="value">{allergy.medicationDetails.drugClass}</span>
                                </div>
                            {/if}
                        </div>
                    {/if}
                    
                    <!-- Emergency Treatment -->
                    {#if allergy.emergencyTreatment?.required}
                        <div class="emergency-section">
                            <span class="label emergency-label">{$t('report.emergency-treatment')}:</span>
                            {#if allergy.emergencyTreatment.epipenPrescribed}
                                <div class="emergency-item">
                                    <span class="epipen-badge">{$t('report.epipen-prescribed')}</span>
                                </div>
                            {/if}
                            {#if allergy.emergencyTreatment.emergencyInstructions}
                                <p class="emergency-instructions">{allergy.emergencyTreatment.emergencyInstructions}</p>
                            {/if}
                        </div>
                    {/if}
                    
                    {#if allergy.notes}
                        <div class="item-notes">
                            <span class="label">{$t('report.notes')}:</span>
                            <p>{allergy.notes}</p>
                        </div>
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}
    
    <!-- Drug Intolerances -->
    {#if drugIntolerances.length > 0}
        <h4 class="section-title-sub">{$t('report.drug-intolerances')}</h4>
        <ul class="list-items">
            {#each drugIntolerances as intolerance}
                <li class="panel intolerance-item">
                    <div class="intolerance-header">
                        <span class="medication-name">{intolerance.medication}</span>
                        <div class="intolerance-header-actions">
                            <span class="intolerance-badge">{$t('report.intolerance')}</span>
                            <AskButton
                                type="drug-intolerance"
                                label={intolerance.medication}
                                data={intolerance}
                                documentId={document?.id}
                                documentTitle={document?.content?.title}
                            />
                        </div>
                    </div>
                    <div class="intolerance-details">
                        <div class="detail-item">
                            <span class="label">{$t('report.reaction')}:</span>
                            <span class="value">{intolerance.reaction}</span>
                        </div>
                    </div>
                    {#if intolerance.notes}
                        <div class="item-notes">
                            <span class="label">{$t('report.notes')}:</span>
                            <p>{intolerance.notes}</p>
                        </div>
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}
    
    <!-- Environmental Sensitivities -->
    {#if environmentalSensitivities.length > 0}
        <h4 class="section-title-sub">{$t('report.environmental-sensitivities')}</h4>
        <ul class="list-items">
            {#each environmentalSensitivities as sensitivity}
                <li class="panel environmental-item {getSeverityClass(sensitivity.severity)}">
                    <div class="sensitivity-header">
                        <span class="trigger-name">{sensitivity.trigger}</span>
                        <div class="sensitivity-header-actions">
                            {#if sensitivity.seasonal}
                                <span class="seasonal-badge">{$t('report.seasonal')}</span>
                            {/if}
                            <AskButton
                                type="environmental-sensitivity"
                                label={sensitivity.trigger}
                                data={sensitivity}
                                documentId={document?.id}
                                documentTitle={document?.content?.title}
                            />
                        </div>
                    </div>
                    <div class="sensitivity-details">
                        <div class="detail-item">
                            <span class="label">{$t('report.reaction')}:</span>
                            <span class="value">{$t(`medical.enums.allergy_reactions.${sensitivity.reaction}`)}</span>
                        </div>
                        {#if sensitivity.severity}
                            <div class="detail-item">
                                <span class="label">{$t('report.severity')}:</span>
                                <span class="value {getSeverityClass(sensitivity.severity)}">{$t(`medical.enums.allergy_severity.${sensitivity.severity}`)}</span>
                            </div>
                        {/if}
                        {#if sensitivity.season}
                            <div class="detail-item">
                                <span class="label">{$t('report.season')}:</span>
                                <span class="value">{sensitivity.season}</span>
                            </div>
                        {/if}
                    </div>
                </li>
            {/each}
        </ul>
    {/if}
    
    <!-- Family Allergy History -->
    {#if familyAllergyHistory.length > 0}
        <h4 class="section-title-sub">{$t('report.family-allergy-history')}</h4>
        <ul class="list-items">
            {#each familyAllergyHistory as familyAllergy}
                <li class="panel family-allergy-item">
                    <div class="family-header">
                        <span class="relative-name">{familyAllergy.relative}</span>
                        <span class="allergen-name">{familyAllergy.allergen}</span>
                    </div>
                    <div class="family-details">
                        <span class="reaction-name">{$t(`medical.enums.allergy_reactions.${familyAllergy.reaction}`)}</span>
                    </div>
                </li>
            {/each}
        </ul>
    {/if}
    
{:else if data}
    <h3 class="h3 heading -sticky">{$t('report.allergies')}</h3>
    <div class="page -block">
        <p class="no-data">{$t('report.no-allergy-data')}</p>
    </div>
{/if}

<style>
    /* SectionAllergies specific panel types */
    
    /* Panel type variations */
    .allergy-medication {
        border-left-color: var(--color-danger);
    }
    
    .allergy-food {
        border-left-color: var(--color-warning);
    }
    
    .allergy-environmental {
        border-left-color: var(--color-info);
    }
    
    .allergy-latex {
        border-left-color: var(--color-secondary);
    }
    
    .allergy-contrast {
        border-left-color: var(--color-primary);
    }
    
    .intolerance-item {
        border-left-color: var(--color-warning);
    }
    
    .environmental-item {
        border-left-color: var(--color-info);
    }
    
    .family-allergy-item {
        border-left-color: var(--color-secondary);
    }
    
    .alert-item {
        border-left-color: var(--color-danger);
    }
    
    /* Severity-based styling */
    .severity-mild {
        border-left-color: var(--color-success);
    }
    
    .severity-moderate {
        border-left-color: var(--color-warning);
    }
    
    .severity-severe,
    .severity-critical {
        border-left-color: var(--color-danger);
    }
    
    /* Content styling */
    .no-allergies-statement {
        text-align: center;
        padding: 1rem;
    }
    
    .nka-badge {
        background-color: var(--color-success-light);
        color: var(--color-success-dark);
        padding: 0.5rem 1rem;
        border-radius: 0.5rem;
        font-weight: 600;
        font-size: 1rem;
    }
    
    .allergy-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 0.75rem;
        gap: 1rem;
    }
    
    .allergy-main {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
    }
    
    .allergy-badges {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        align-items: flex-end;
    }
    
    .category-badge,
    .severity-badge,
    .status-badge {
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
        text-transform: uppercase;
    }
    
    .category-badge {
        background-color: var(--color-info-light);
        color: var(--color-info-dark);
    }
    
    .severity-badge.severity-mild {
        background-color: var(--color-success-light);
        color: var(--color-success-dark);
    }
    
    .severity-badge.severity-moderate {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
    }
    
    .severity-badge.severity-severe,
    .severity-badge.severity-critical {
        background-color: var(--color-danger-light);
        color: var(--color-danger-dark);
    }
    
    .status-badge.status-active {
        background-color: var(--color-success-light);
        color: var(--color-success-dark);
    }
    
    .status-badge.status-resolved {
        background-color: var(--color-secondary-light);
        color: var(--color-secondary-dark);
    }
    
    .reactions-section {
        margin-bottom: 0.75rem;
    }
    
    .reactions-list {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-top: 0.25rem;
    }
    
    .reaction-item {
        background-color: var(--color-background-secondary);
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.9rem;
    }
    
    .reaction-system {
        color: var(--color-text-secondary);
        font-size: 0.8rem;
        margin-left: 0.25rem;
    }
    
    .emergency-section {
        background-color: var(--color-danger-light);
        padding: 0.75rem;
        border-radius: 0.5rem;
        margin-bottom: 0.75rem;
    }
    
    .emergency-label {
        color: var(--color-danger-dark);
        font-weight: 600;
        text-transform: uppercase;
    }
    
    .epipen-badge {
        background-color: var(--color-danger);
        color: white;
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
        margin-top: 0.5rem;
        display: inline-block;
    }
    
    .emergency-instructions {
        color: var(--color-danger-dark);
        margin-top: 0.5rem;
        margin-bottom: 0;
        font-weight: 500;
    }
    
    .intolerance-header,
    .sensitivity-header,
    .family-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.5rem;
    }
    
    .intolerance-badge {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
    }
    
    .seasonal-badge {
        background-color: var(--color-info-light);
        color: var(--color-info-dark);
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
    }
    
    .medication-name,
    .trigger-name,
    .relative-name,
    .allergen-name {
        font-weight: 600;
        color: var(--color-text-primary);
    }
    
    .alert-header {
        margin-bottom: 0.5rem;
    }
    
    .alert-priority {
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
        text-transform: uppercase;
    }
    
    .alert-priority.priority-critical,
    .alert-priority.priority-high {
        background-color: var(--color-danger-light);
        color: var(--color-danger-dark);
    }
    
    .alert-priority.priority-medium {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
    }
    
    .alert-priority.priority-low {
        background-color: var(--color-info-light);
        color: var(--color-info-dark);
    }
    
    .alert-message {
        font-weight: 500;
        margin-bottom: 0.5rem;
    }
    
    .alert-instructions {
        color: var(--color-text-secondary);
        font-style: italic;
        margin-bottom: 0;
    }
    
    /* Uses global .item-details, .item-notes, and .no-data styles */
</style>