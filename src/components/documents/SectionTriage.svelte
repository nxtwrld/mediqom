<script lang="ts">
    import { t } from '$lib/i18n';

    interface Props {
        data: any;
        document?: any;
        key?: string;
    }

    let { data, document, key }: Props = $props();
    
    // Check if we have triage data
    let hasTriage = $derived(data && (
        data.hasTriage || 
        data.chiefComplaint ||
        data.triageLevel ||
        data.arrivalTime
    ));
    
    // Helper functions with proper typing
    function getTriageLevelClass(level: number): string {
        const levelClasses: Record<number, string> = {
            1: 'triage-level-1', // Critical
            2: 'triage-level-2', // Emergent
            3: 'triage-level-3', // Urgent
            4: 'triage-level-4', // Less urgent
            5: 'triage-level-5'  // Non-urgent
        };
        return levelClasses[level] || 'triage-level-unknown';
    }
    
    function getTriageLevelLabel(level: number): string {
        const levelLabels: Record<number, string> = {
            1: 'Critical',
            2: 'Emergent', 
            3: 'Urgent',
            4: 'Less Urgent',
            5: 'Non-urgent'
        };
        return levelLabels[level] || 'Unknown';
    }
    
    function getUrgencyClass(urgency: string): string {
        const urgencyClasses: Record<string, string> = {
            'emergent': 'urgency-emergent',
            'urgent': 'urgency-urgent',
            'less_urgent': 'urgency-less-urgent',
            'non_urgent': 'urgency-non-urgent'
        };
        return urgencyClasses[urgency?.toLowerCase().replace(' ', '_')] || 'urgency-unknown';
    }
    
    function getModeOfArrivalClass(mode: string): string {
        const modeClasses: Record<string, string> = {
            'ambulance': 'mode-ambulance',
            'helicopter': 'mode-helicopter',
            'police': 'mode-police',
            'walk_in': 'mode-walk-in',
            'private_vehicle': 'mode-private',
            'public_transport': 'mode-public'
        };
        return modeClasses[mode] || 'mode-other';
    }
    
    function getPainScoreClass(score: number): string {
        if (score <= 3) return 'pain-mild';
        if (score <= 6) return 'pain-moderate';
        return 'pain-severe';
    }
    
    function formatDateTime(dateTimeString: string): string {
        if (!dateTimeString) return '';
        try {
            const date = new Date(dateTimeString);
            return date.toLocaleString();
        } catch {
            return dateTimeString;
        }
    }
</script>

{#if hasTriage}
    <h3 class="h3 heading -sticky">{$t('report.triage')}</h3>
    
    <!-- Chief Complaint -->
    {#if data.chiefComplaint}
        <div class="page -block">
            <h4 class="section-title-sub">{$t('report.chief-complaint')}</h4>
            <div class="chief-complaint">
                <p class="complaint-text">{data.chiefComplaint}</p>
            </div>
        </div>
    {/if}
    
    <!-- Triage Assessment -->
    <ul class="list-items">
        <li class="panel triage-assessment {getTriageLevelClass(data.triageLevel)}">
            <div class="triage-header">
                <h5 class="item-name">{$t('report.triage-assessment')}</h5>
                {#if data.triageLevel}
                    <div class="triage-badges">
                        <span class="triage-level-badge {getTriageLevelClass(data.triageLevel)}">
                            {$t('report.level')} {data.triageLevel} - {getTriageLevelLabel(data.triageLevel)}
                        </span>
                    </div>
                {/if}
            </div>
            
            <div class="item-details">
                {#if data.arrivalTime}
                    <div class="detail-item">
                        <span class="label">{$t('report.arrival-time')}:</span>
                        <span class="value">{formatDateTime(data.arrivalTime)}</span>
                    </div>
                {/if}
                
                {#if data.modeOfArrival}
                    <div class="detail-item">
                        <span class="label">{$t('report.mode-of-arrival')}:</span>
                        <span class="value mode-badge {getModeOfArrivalClass(data.modeOfArrival)}">{$t(`medical.enums.mode_of_arrival.${data.modeOfArrival}`)}</span>
                    </div>
                {/if}
                
                {#if data.urgencyClassification}
                    <div class="detail-item">
                        <span class="label">{$t('report.urgency')}:</span>
                        <span class="value urgency-badge {getUrgencyClass(data.urgencyClassification)}">{data.urgencyClassification}</span>
                    </div>
                {/if}
            </div>
        </li>
    </ul>
    
    <!-- Initial Vitals -->
    {#if data.initialVitals}
        <h4 class="section-title-sub">{$t('report.initial-vitals')}</h4>
        <ul class="list-items">
            <li class="panel vitals-panel">
                <div class="vitals-grid">
                    {#if data.initialVitals.temperature}
                        <div class="vital-item">
                            <span class="vital-label">{$t('report.temperature')}</span>
                            <span class="vital-value">{data.initialVitals.temperature}°C</span>
                        </div>
                    {/if}
                    
                    {#if data.initialVitals.bloodPressure}
                        <div class="vital-item">
                            <span class="vital-label">{$t('report.blood-pressure')}</span>
                            <span class="vital-value">{data.initialVitals.bloodPressure}</span>
                        </div>
                    {/if}
                    
                    {#if data.initialVitals.heartRate}
                        <div class="vital-item">
                            <span class="vital-label">{$t('report.heart-rate')}</span>
                            <span class="vital-value">{data.initialVitals.heartRate} bpm</span>
                        </div>
                    {/if}
                    
                    {#if data.initialVitals.respiratoryRate}
                        <div class="vital-item">
                            <span class="vital-label">{$t('report.respiratory-rate')}</span>
                            <span class="vital-value">{data.initialVitals.respiratoryRate} /min</span>
                        </div>
                    {/if}
                    
                    {#if data.initialVitals.oxygenSaturation}
                        <div class="vital-item">
                            <span class="vital-label">{$t('report.oxygen-saturation')}</span>
                            <span class="vital-value">{data.initialVitals.oxygenSaturation}%</span>
                        </div>
                    {/if}
                    
                    {#if data.initialVitals.painScore !== undefined}
                        <div class="vital-item">
                            <span class="vital-label">{$t('report.pain-score')}</span>
                            <span class="vital-value pain-score {getPainScoreClass(data.initialVitals.painScore)}">{data.initialVitals.painScore}/10</span>
                        </div>
                    {/if}
                </div>
            </li>
        </ul>
    {/if}
    
    <!-- Quick Assessment Info -->
    {#if data.allergies?.length > 0 || data.currentMedications?.length > 0}
        <h4 class="section-title-sub">{$t('report.quick-assessment')}</h4>
        <ul class="list-items">
            {#if data.allergies?.length > 0}
                <li class="panel quick-info-panel">
                    <div class="quick-info-header">
                        <span class="info-label">{$t('report.allergies')}</span>
                    </div>
                    <div class="quick-info-content">
                        <div class="info-tags">
                            {#each data.allergies as allergy}
                                <span class="info-tag allergy-tag">{allergy}</span>
                            {/each}
                        </div>
                    </div>
                </li>
            {/if}
            
            {#if data.currentMedications?.length > 0}
                <li class="panel quick-info-panel">
                    <div class="quick-info-header">
                        <span class="info-label">{$t('report.current-medications')}</span>
                    </div>
                    <div class="quick-info-content">
                        <div class="info-tags">
                            {#each data.currentMedications as medication}
                                <span class="info-tag medication-tag">{medication}</span>
                            {/each}
                        </div>
                    </div>
                </li>
            {/if}
        </ul>
    {/if}
    
    <!-- Triage Notes -->
    {#if data.triageNotes}
        <h4 class="section-title-sub">{$t('report.triage-notes')}</h4>
        <ul class="list-items">
            <li class="panel notes-panel">
                <div class="item-notes">
                    <p>{data.triageNotes}</p>
                </div>
            </li>
        </ul>
    {/if}
    
{:else if data}
    <h3 class="h3 heading -sticky">{$t('report.triage')}</h3>
    <div class="page -block">
        <p class="no-data">{$t('report.no-triage-data')}</p>
    </div>
{/if}

<style>
    /* SectionTriage specific panel types */
    
    /* Triage level styling */
    .triage-level-1 {
        border-left-color: var(--color-negative);
        background-color: rgba(var(--color-negative-rgb), 0.05);
    }
    
    .triage-level-2 {
        border-left-color: var(--color-warning);
        background-color: rgba(var(--color-warning-rgb), 0.05);
    }
    
    .triage-level-3 {
        border-left-color: var(--color-info);
        background-color: rgba(var(--color-info-rgb), 0.05);
    }
    
    .triage-level-4 {
        border-left-color: var(--color-positive);
        background-color: rgba(var(--color-positive-rgb), 0.05);
    }
    
    .triage-level-5 {
        border-left-color: var(--color-gray-800);
        background-color: rgba(var(--color-gray-800), 0.05);
    }
    
    .vitals-panel {
        border-left-color: var(--color-interactivity);
    }
    
    .quick-info-panel {
        border-left-color: var(--color-info);
    }
    
    .notes-panel {
        border-left-color: var(--color-gray-800);
    }
    
    /* Content styling */
    .chief-complaint {
        background-color: var(--color-surface);
        padding: 1rem;
        border-radius: 0.5rem;
        border-left: 4px solid var(--color-interactivity);
    }
    
    .complaint-text {
        font-size: 1.1rem;
        font-weight: 500;
        margin: 0;
        color: var(--color-text-primary);
    }
    
    .triage-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.75rem;
        gap: 1rem;
    }
    
    .triage-badges {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        align-items: flex-end;
    }
    
    .triage-level-badge {
        padding: 0.5rem 0.75rem;
        border-radius: 0.5rem;
        font-size: 0.9rem;
        font-weight: 600;
        text-transform: uppercase;
        color: white;
    }
    
    .triage-level-badge.triage-level-1 {
        background-color: var(--color-negative);
    }
    
    .triage-level-badge.triage-level-2 {
        background-color: var(--color-warning);
    }
    
    .triage-level-badge.triage-level-3 {
        background-color: var(--color-info);
    }
    
    .triage-level-badge.triage-level-4 {
        background-color: var(--color-positive);
    }
    
    .triage-level-badge.triage-level-5 {
        background-color: var(--color-gray-800);
    }
    
    .mode-badge,
    .urgency-badge {
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
        text-transform: capitalize;
    }
    
    .mode-badge.mode-ambulance,
    .mode-badge.mode-helicopter {
        background-color: var(--color-negative-light);
        color: var(--color-negative-dark);
    }
    
    .mode-badge.mode-police {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
    }
    
    .mode-badge.mode-walk-in,
    .mode-badge.mode-private,
    .mode-badge.mode-public {
        background-color: var(--color-info-light);
        color: var(--color-info-dark);
    }
    
    .urgency-badge.urgency-emergent {
        background-color: var(--color-negative-light);
        color: var(--color-negative-dark);
    }
    
    .urgency-badge.urgency-urgent {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
    }
    
    .urgency-badge.urgency-less-urgent,
    .urgency-badge.urgency-non-urgent {
        background-color: var(--color-info-light);
        color: var(--color-info-dark);
    }
    
    /* Vitals grid */
    .vitals-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 1rem;
    }
    
    .vital-item {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        padding: 0.75rem;
        background-color: var(--color-surface);
        border-radius: 0.5rem;
        text-align: center;
    }
    
    .vital-label {
        font-size: 0.8rem;
        font-weight: 500;
        color: var(--color-text-secondary);
        text-transform: uppercase;
    }
    
    .vital-value {
        font-size: 1.2rem;
        font-weight: 600;
        color: var(--color-text-primary);
    }
    
    .pain-score.pain-mild {
        color: var(--color-positive-dark);
    }
    
    .pain-score.pain-moderate {
        color: var(--color-warning-dark);
    }
    
    .pain-score.pain-severe {
        color: var(--color-negative-dark);
    }
    
    /* Quick assessment */
    .quick-info-header {
        margin-bottom: 0.5rem;
    }
    
    .info-label {
        font-weight: 600;
        color: var(--color-text-primary);
        text-transform: uppercase;
        font-size: 0.9rem;
    }
    
    .info-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }
    
    .info-tag {
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
    }
    
    .allergy-tag {
        background-color: var(--color-negative-light);
        color: var(--color-negative-dark);
    }
    
    .medication-tag {
        background-color: var(--color-info-light);
        color: var(--color-info-dark);
    }
    
    /* Uses global .item-details, .item-notes, and .no-data styles */
</style>