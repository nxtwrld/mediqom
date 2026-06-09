<script lang="ts">
    import { t } from '$lib/i18n';

    interface Props {
        data: any;
        document?: any;
        key?: string;
    }

    let { data, document, key }: Props = $props();
    
    // Check if we have anesthesia data
    let hasAnesthesia = $derived(data && (
        data.hasAnesthesia || 
        data.anesthesiaType ||
        data.anesthesiaDetails ||
        data.medications?.length > 0
    ));
    
    // Extract anesthesia sections
    let anesthesiaDetails = $derived(data?.anesthesiaDetails || {});
    let medications = $derived(data?.medications || []);
    let vitalSignsMonitoring = $derived(data?.vitalSignsMonitoring || {});
    let fluidManagement = $derived(data?.fluidManagement || {});
    let complications = $derived(data?.complications || []);
    let anesthesiaTeam = $derived(data?.anesthesiaTeam || []);
    let patientStatus = $derived(data?.patientStatus || {});
    let postAnesthesia = $derived(data?.postAnesthesia || {});
    
    // Helper functions with proper typing
    function getAnesthesiaTypeClass(type: string): string {
        const typeClasses: Record<string, string> = {
            'general': 'anesthesia-general',
            'regional': 'anesthesia-regional',
            'spinal': 'anesthesia-spinal',
            'epidural': 'anesthesia-epidural',
            'local': 'anesthesia-local',
            'sedation': 'anesthesia-sedation',
            'MAC': 'anesthesia-mac',
            'combined': 'anesthesia-combined'
        };
        return typeClasses[type] || 'anesthesia-other';
    }
    
    function getAirwayClass(method: string): string {
        const airwayClasses: Record<string, string> = {
            'endotracheal_tube': 'airway-tube',
            'LMA': 'airway-lma',
            'mask': 'airway-mask',
            'nasal_cannula': 'airway-nasal',
            'face_mask': 'airway-face-mask'
        };
        return airwayClasses[method] || 'airway-other';
    }
    
    function getDifficultyClass(difficulty: string): string {
        const difficultyClasses: Record<string, string> = {
            'easy': 'difficulty-easy',
            'moderate': 'difficulty-moderate',
            'difficult': 'difficulty-difficult',
            'failed': 'difficulty-failed'
        };
        return difficultyClasses[difficulty] || 'difficulty-unknown';
    }
    
    function getASAClass(asaClass: string): string {
        const asaClasses: Record<string, string> = {
            'I': 'asa-1',
            'II': 'asa-2',
            'III': 'asa-3',
            'IV': 'asa-4',
            'V': 'asa-5',
            'VI': 'asa-6',
            'E': 'asa-emergency'
        };
        return asaClasses[asaClass] || 'asa-unknown';
    }
    
    function getDispositionClass(disposition: string): string {
        const dispositionClasses: Record<string, string> = {
            'PACU': 'disposition-pacu',
            'ICU': 'disposition-icu',
            'floor': 'disposition-floor',
            'home': 'disposition-home'
        };
        return dispositionClasses[disposition] || 'disposition-other';
    }
    
    function getPainScoreClass(score: number): string {
        if (score <= 3) return 'pain-mild';
        if (score <= 6) return 'pain-moderate';
        return 'pain-severe';
    }
    
    function formatDuration(minutes: number): string {
        if (!minutes) return '';
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        
        if (hours > 0 && mins > 0) {
            return `${hours}h ${mins}m`;
        } else if (hours > 0) {
            return `${hours}h`;
        } else {
            return `${mins}m`;
        }
    }
</script>

{#if hasAnesthesia}
    <h3 class="h3 heading -sticky">{$t('report.anesthesia')}</h3>
    
    <!-- Anesthesia Overview -->
    <ul class="list-items">
        <li class="panel anesthesia-overview {getAnesthesiaTypeClass(data.anesthesiaType)}">
            <div class="anesthesia-header">
                <h5 class="item-name">{$t('report.anesthesia-overview')}</h5>
                {#if data.anesthesiaType}
                    <span class="anesthesia-type-badge {getAnesthesiaTypeClass(data.anesthesiaType)}">{$t(`medical.enums.anesthesia_types.${data.anesthesiaType}`)}</span>
                {/if}
            </div>
            
            <div class="item-details">
                {#if anesthesiaDetails.technique}
                    <div class="detail-item">
                        <span class="label">{$t('report.technique')}:</span>
                        <span class="value">{$t(`medical.enums.anesthesia_techniques.${anesthesiaDetails.technique}`)}</span>
                    </div>
                {/if}
                
                {#if anesthesiaDetails.inductionTime}
                    <div class="detail-item">
                        <span class="label">{$t('report.induction-time')}:</span>
                        <span class="value">{anesthesiaDetails.inductionTime}</span>
                    </div>
                {/if}
                
                {#if anesthesiaDetails.emergenceTime}
                    <div class="detail-item">
                        <span class="label">{$t('report.emergence-time')}:</span>
                        <span class="value">{anesthesiaDetails.emergenceTime}</span>
                    </div>
                {/if}
                
                {#if anesthesiaDetails.duration}
                    <div class="detail-item">
                        <span class="label">{$t('report.duration')}:</span>
                        <span class="value">{formatDuration(anesthesiaDetails.duration)}</span>
                    </div>
                {/if}
            </div>
            
            <!-- Airway Management -->
            {#if anesthesiaDetails.airwayManagement}
                <div class="airway-section">
                    <span class="label">{$t('report.airway-management')}:</span>
                    <div class="airway-details">
                        {#if anesthesiaDetails.airwayManagement.method}
                            <div class="airway-item">
                                <span class="airway-method {getAirwayClass(anesthesiaDetails.airwayManagement.method)}">{$t(`medical.enums.airway_methods.${anesthesiaDetails.airwayManagement.method}`)}</span>
                                {#if anesthesiaDetails.airwayManagement.tubeSize}
                                    <span class="tube-size">Size: {anesthesiaDetails.airwayManagement.tubeSize}</span>
                                {/if}
                            </div>
                        {/if}
                        
                        {#if anesthesiaDetails.airwayManagement.difficulty}
                            <div class="difficulty-item">
                                <span class="difficulty-label">{$t('report.difficulty')}:</span>
                                <span class="difficulty-value {getDifficultyClass(anesthesiaDetails.airwayManagement.difficulty)}">{$t(`medical.enums.intubation_difficulty.${anesthesiaDetails.airwayManagement.difficulty}`)}</span>
                            </div>
                        {/if}
                        
                        {#if anesthesiaDetails.airwayManagement.attempts}
                            <div class="attempts-item">
                                <span class="attempts-label">{$t('report.attempts')}:</span>
                                <span class="attempts-value">{anesthesiaDetails.airwayManagement.attempts}</span>
                            </div>
                        {/if}
                    </div>
                </div>
            {/if}
        </li>
    </ul>
    
    <!-- Patient Status -->
    {#if patientStatus && (patientStatus.asaClass || patientStatus.mallampati || patientStatus.allergies?.length > 0)}
        <h4 class="section-title-sub">{$t('report.patient-status')}</h4>
        <ul class="list-items">
            <li class="panel patient-status-panel {getASAClass(patientStatus.asaClass)}">
                <div class="patient-status-grid">
                    {#if patientStatus.asaClass}
                        <div class="status-item">
                            <span class="status-label">{$t('report.asa-class')}</span>
                            <span class="status-value asa-badge {getASAClass(patientStatus.asaClass)}">ASA {patientStatus.asaClass}</span>
                        </div>
                    {/if}
                    
                    {#if patientStatus.mallampati}
                        <div class="status-item">
                            <span class="status-label">{$t('report.mallampati')}</span>
                            <span class="status-value mallampati-badge">Class {patientStatus.mallampati}</span>
                        </div>
                    {/if}
                </div>
                
                {#if patientStatus.allergies?.length > 0}
                    <div class="allergies-section">
                        <span class="label">{$t('report.allergies')}:</span>
                        <div class="allergies-list">
                            {#each patientStatus.allergies as allergy}
                                <span class="allergy-tag">{allergy}</span>
                            {/each}
                        </div>
                    </div>
                {/if}
            </li>
        </ul>
    {/if}
    
    <!-- Medications -->
    {#if medications.length > 0}
        <h4 class="section-title-sub">{$t('report.anesthesia-medications')}</h4>
        <ul class="list-items">
            {#each medications as medication}
                <li class="panel medication-item">
                    <div class="medication-header">
                        <h5 class="medication-name">{medication.name}</h5>
                        {#if medication.purpose}
                            <span class="purpose-badge">{medication.purpose}</span>
                        {/if}
                    </div>
                    
                    <div class="item-details">
                        <div class="detail-item">
                            <span class="label">{$t('report.dose')}:</span>
                            <span class="value dose-value">{medication.dose}</span>
                        </div>
                        
                        {#if medication.route}
                            <div class="detail-item">
                                <span class="label">{$t('report.route')}:</span>
                                <span class="value">{$t(`medical.enums.administration_routes.${medication.route}`)}</span>
                            </div>
                        {/if}
                        
                        {#if medication.time}
                            <div class="detail-item">
                                <span class="label">{$t('report.time')}:</span>
                                <span class="value">{medication.time}</span>
                            </div>
                        {/if}
                    </div>
                </li>
            {/each}
        </ul>
    {/if}
    
    <!-- Fluid Management -->
    {#if fluidManagement && (fluidManagement.crystalloids || fluidManagement.colloids || fluidManagement.bloodProducts?.length > 0)}
        <h4 class="section-title-sub">{$t('report.fluid-management')}</h4>
        <ul class="list-items">
            <li class="panel fluid-panel">
                <div class="fluid-grid">
                    {#if fluidManagement.crystalloids}
                        <div class="fluid-section">
                            <h6 class="fluid-title">{$t('report.crystalloids')}</h6>
                            <div class="fluid-details">
                                {#if fluidManagement.crystalloids.type}
                                    <span class="fluid-type">{$t(`medical.enums.crystalloid_types.${fluidManagement.crystalloids.type}`)}</span>
                                {/if}
                                {#if fluidManagement.crystalloids.volume}
                                    <span class="fluid-volume">{fluidManagement.crystalloids.volume}</span>
                                {/if}
                            </div>
                        </div>
                    {/if}
                    
                    {#if fluidManagement.colloids}
                        <div class="fluid-section">
                            <h6 class="fluid-title">{$t('report.colloids')}</h6>
                            <div class="fluid-details">
                                {#if fluidManagement.colloids.type}
                                    <span class="fluid-type">{$t(`medical.enums.colloid_types.${fluidManagement.colloids.type}`)}</span>
                                {/if}
                                {#if fluidManagement.colloids.volume}
                                    <span class="fluid-volume">{fluidManagement.colloids.volume}</span>
                                {/if}
                            </div>
                        </div>
                    {/if}
                    
                    {#if fluidManagement.estimatedBloodLoss}
                        <div class="fluid-section">
                            <h6 class="fluid-title">{$t('report.blood-loss')}</h6>
                            <div class="fluid-details">
                                <span class="fluid-volume blood-loss">{fluidManagement.estimatedBloodLoss}</span>
                            </div>
                        </div>
                    {/if}
                    
                    {#if fluidManagement.urineOutput}
                        <div class="fluid-section">
                            <h6 class="fluid-title">{$t('report.urine-output')}</h6>
                            <div class="fluid-details">
                                <span class="fluid-volume">{fluidManagement.urineOutput}</span>
                            </div>
                        </div>
                    {/if}
                </div>
                
                {#if fluidManagement.bloodProducts?.length > 0}
                    <div class="blood-products-section">
                        <span class="label">{$t('report.blood-products')}:</span>
                        <div class="blood-products-list">
                            {#each fluidManagement.bloodProducts as product}
                                <div class="blood-product-item">
                                    <span class="product-type">{$t(`medical.enums.blood_products.${product.product}`)}</span>
                                    <span class="product-units">{product.units} units</span>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}
            </li>
        </ul>
    {/if}
    
    <!-- Complications -->
    {#if complications.length > 0}
        <h4 class="section-title-sub">{$t('report.complications')}</h4>
        <ul class="list-items">
            {#each complications as complication}
                <li class="panel complication-item {complication.resolved ? 'complication-resolved' : 'complication-unresolved'}">
                    <div class="complication-header">
                        <span class="complication-text">{complication.complication}</span>
                        <span class="resolved-badge {complication.resolved ? 'resolved' : 'unresolved'}">{complication.resolved ? $t('report.resolved') : $t('report.unresolved')}</span>
                    </div>
                    
                    {#if complication.time || complication.intervention}
                        <div class="item-details">
                            {#if complication.time}
                                <div class="detail-item">
                                    <span class="label">{$t('report.time')}:</span>
                                    <span class="value">{complication.time}</span>
                                </div>
                            {/if}
                            
                            {#if complication.intervention}
                                <div class="detail-item">
                                    <span class="label">{$t('report.intervention')}:</span>
                                    <span class="value">{complication.intervention}</span>
                                </div>
                            {/if}
                        </div>
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}
    
    <!-- Post-Anesthesia -->
    {#if postAnesthesia && (postAnesthesia.recoveryTime || postAnesthesia.painScore !== undefined || postAnesthesia.disposition)}
        <h4 class="section-title-sub">{$t('report.post-anesthesia')}</h4>
        <ul class="list-items">
            <li class="panel post-anesthesia-panel {getDispositionClass(postAnesthesia.disposition)}">
                <div class="post-anesthesia-grid">
                    {#if postAnesthesia.recoveryTime}
                        <div class="post-item">
                            <span class="post-label">{$t('report.recovery-time')}</span>
                            <span class="post-value">{formatDuration(postAnesthesia.recoveryTime)}</span>
                        </div>
                    {/if}
                    
                    {#if postAnesthesia.painScore !== undefined}
                        <div class="post-item">
                            <span class="post-label">{$t('report.pain-score')}</span>
                            <span class="post-value pain-score {getPainScoreClass(postAnesthesia.painScore)}">{postAnesthesia.painScore}/10</span>
                        </div>
                    {/if}
                    
                    {#if postAnesthesia.disposition}
                        <div class="post-item">
                            <span class="post-label">{$t('report.disposition')}</span>
                            <span class="post-value disposition-badge {getDispositionClass(postAnesthesia.disposition)}">{$t(`medical.enums.disposition_types.${postAnesthesia.disposition}`)}</span>
                        </div>
                    {/if}
                    
                    {#if postAnesthesia.nauseaVomiting}
                        <div class="post-item">
                            <span class="post-label">{$t('report.nausea-vomiting')}</span>
                            <span class="post-value nausea-badge">{$t('report.present')}</span>
                        </div>
                    {/if}
                </div>
            </li>
        </ul>
    {/if}
    
    <!-- Anesthesia Team -->
    {#if anesthesiaTeam.length > 0}
        <h4 class="section-title-sub">{$t('report.anesthesia-team')}</h4>
        <ul class="list-items">
            {#each anesthesiaTeam as member}
                <li class="panel team-member-panel">
                    <div class="member-header">
                        <span class="member-name">{member.name}</span>
                        {#if member.role}
                            <span class="member-role">{$t(`medical.enums.professional_roles.${member.role}`)}</span>
                        {/if}
                    </div>
                    {#if member.credentials}
                        <div class="member-credentials">
                            <span class="credentials">{member.credentials}</span>
                        </div>
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}
    
{:else if data}
    <h3 class="h3 heading -sticky">{$t('report.anesthesia')}</h3>
    <div class="page -block">
        <p class="no-data">{$t('report.no-anesthesia-data')}</p>
    </div>
{/if}

<style>
    /* SectionAnesthesia specific panel types */
    
    /* Anesthesia type variations */
    .anesthesia-general {
        border-left-color: var(--color-interactivity);
    }
    
    .anesthesia-regional,
    .anesthesia-spinal,
    .anesthesia-epidural {
        border-left-color: var(--color-info);
    }
    
    .anesthesia-local {
        border-left-color: var(--color-positive);
    }
    
    .anesthesia-sedation,
    .anesthesia-mac {
        border-left-color: var(--color-warning);
    }
    
    .anesthesia-combined {
        border-left-color: var(--color-gray-800);
    }
    
    .patient-status-panel {
        border-left-color: var(--color-info);
    }
    
    .medication-item {
        border-left-color: var(--color-positive);
    }
    
    .fluid-panel {
        border-left-color: var(--color-info);
    }
    
    .complication-resolved {
        border-left-color: var(--color-positive);
    }
    
    .complication-unresolved {
        border-left-color: var(--color-negative);
    }
    
    .post-anesthesia-panel {
        border-left-color: var(--color-gray-800);
    }
    
    .team-member-panel {
        border-left-color: var(--color-info);
    }
    
    /* Content styling */
    .anesthesia-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.75rem;
        gap: 1rem;
    }
    
    .anesthesia-type-badge {
        padding: 0.5rem 0.75rem;
        border-radius: 0.5rem;
        font-size: 0.9rem;
        font-weight: 600;
        text-transform: uppercase;
        color: white;
    }
    
    .anesthesia-type-badge.anesthesia-general {
        background-color: var(--color-interactivity);
    }
    
    .anesthesia-type-badge.anesthesia-regional,
    .anesthesia-type-badge.anesthesia-spinal,
    .anesthesia-type-badge.anesthesia-epidural {
        background-color: var(--color-info);
    }
    
    .anesthesia-type-badge.anesthesia-local {
        background-color: var(--color-positive);
    }
    
    .anesthesia-type-badge.anesthesia-sedation,
    .anesthesia-type-badge.anesthesia-mac {
        background-color: var(--color-warning);
    }
    
    .airway-section {
        margin-bottom: 0.75rem;
        padding: 0.75rem;
        background-color: var(--color-surface);
        border-radius: 0.5rem;
    }
    
    .airway-details {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        margin-top: 0.5rem;
    }
    
    .airway-method {
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-weight: 500;
        background-color: var(--color-interactivity-light);
        color: var(--color-interactivity-dark);
    }
    
    .tube-size {
        color: var(--color-text-secondary);
        font-size: 0.9rem;
    }
    
    .difficulty-value.difficulty-easy {
        color: var(--color-positive-dark);
    }
    
    .difficulty-value.difficulty-moderate {
        color: var(--color-warning-dark);
    }
    
    .difficulty-value.difficulty-difficult,
    .difficulty-value.difficulty-failed {
        color: var(--color-negative-dark);
    }
    
    /* Patient status grid */
    .patient-status-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 1rem;
        margin-bottom: 0.75rem;
    }
    
    .status-item {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        text-align: center;
    }
    
    .status-label {
        font-size: 0.8rem;
        font-weight: 500;
        color: var(--color-text-secondary);
        text-transform: uppercase;
    }
    
    .asa-badge {
        padding: 0.5rem;
        border-radius: 0.5rem;
        font-weight: 600;
        color: white;
    }
    
    .asa-badge.asa-1,
    .asa-badge.asa-2 {
        background-color: var(--color-positive);
    }
    
    .asa-badge.asa-3 {
        background-color: var(--color-warning);
    }
    
    .asa-badge.asa-4,
    .asa-badge.asa-5,
    .asa-badge.asa-6 {
        background-color: var(--color-negative);
    }
    
    .asa-badge.asa-emergency {
        background-color: var(--color-negative);
    }
    
    .mallampati-badge {
        padding: 0.5rem;
        border-radius: 0.5rem;
        font-weight: 600;
        background-color: var(--color-info);
        color: white;
    }
    
    .allergies-section {
        margin-top: 0.75rem;
    }
    
    .allergies-list {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-top: 0.25rem;
    }
    
    .allergy-tag {
        background-color: var(--color-negative-light);
        color: var(--color-negative-dark);
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
    }
    
    /* Medication styling */
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
    
    .purpose-badge {
        background-color: var(--color-info-light);
        color: var(--color-info-dark);
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
        text-transform: capitalize;
    }
    
    .dose-value {
        font-weight: 600;
        color: var(--color-positive-dark);
    }
    
    /* Fluid management */
    .fluid-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1rem;
        margin-bottom: 0.75rem;
    }
    
    .fluid-section {
        padding: 0.75rem;
        background-color: var(--color-surface);
        border-radius: 0.5rem;
    }
    
    .fluid-title {
        font-size: 0.9rem;
        font-weight: 600;
        margin: 0 0 0.5rem 0;
        color: var(--color-text-primary);
        text-transform: uppercase;
    }
    
    .fluid-details {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }
    
    .fluid-type {
        font-weight: 500;
        color: var(--color-text-primary);
    }
    
    .fluid-volume {
        font-weight: 600;
        color: var(--color-interactivity);
    }
    
    .fluid-volume.blood-loss {
        color: var(--color-negative-dark);
    }
    
    .blood-products-section {
        border-top: 1px solid var(--color-border);
        padding-top: 0.75rem;
        margin-top: 0.75rem;
    }
    
    .blood-products-list {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-top: 0.5rem;
    }
    
    .blood-product-item {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        padding: 0.5rem;
        background-color: var(--color-negative-light);
        border-radius: 0.25rem;
    }
    
    .product-type {
        font-weight: 600;
        color: var(--color-negative-dark);
    }
    
    .product-units {
        color: var(--color-negative-dark);
    }
    
    /* Complications */
    .complication-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.5rem;
        gap: 1rem;
    }
    
    .complication-text {
        font-weight: 500;
        color: var(--color-text-primary);
    }
    
    .resolved-badge {
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
        text-transform: uppercase;
    }
    
    .resolved-badge.resolved {
        background-color: var(--color-positive-light);
        color: var(--color-positive-dark);
    }
    
    .resolved-badge.unresolved {
        background-color: var(--color-negative-light);
        color: var(--color-negative-dark);
    }
    
    /* Post-anesthesia */
    .post-anesthesia-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 1rem;
    }
    
    .post-item {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        padding: 0.75rem;
        background-color: var(--color-surface);
        border-radius: 0.5rem;
        text-align: center;
    }
    
    .post-label {
        font-size: 0.8rem;
        font-weight: 500;
        color: var(--color-text-secondary);
        text-transform: uppercase;
    }
    
    .post-value {
        font-size: 1.1rem;
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
    
    .disposition-badge {
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
        text-transform: uppercase;
    }
    
    .disposition-badge.disposition-icu {
        background-color: var(--color-negative-light);
        color: var(--color-negative-dark);
    }
    
    .disposition-badge.disposition-pacu {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
    }
    
    .disposition-badge.disposition-floor,
    .disposition-badge.disposition-home {
        background-color: var(--color-positive-light);
        color: var(--color-positive-dark);
    }
    
    .nausea-badge {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
    }
    
    /* Team member styling */
    .member-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.5rem;
    }
    
    .member-name {
        font-weight: 600;
        color: var(--color-text-primary);
    }
    
    .member-role {
        background-color: var(--color-surface);
        color: var(--color-text-secondary);
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
        text-transform: capitalize;
    }
    
    .member-credentials {
        font-size: 0.9rem;
        color: var(--color-text-secondary);
    }
    
    .credentials {
        font-style: italic;
    }
    
    /* Uses global .item-details, .item-notes, and .no-data styles */
</style>