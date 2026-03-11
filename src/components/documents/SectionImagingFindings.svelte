<script lang="ts">
    import { t } from '$lib/i18n';
    import AskButton from '$components/chat/AskButton.svelte';

    interface Props {
        data: any;
        document?: any;
        key?: string;
    }

    let { data, document, key }: Props = $props();

    let hasImagingFindings = $derived(data && data.hasImagingFindings);
    
    let studyType = $derived(data?.studyType || '');
    let studyDateTime = $derived(data?.studyDateTime);
    let studyProtocol = $derived(data?.studyProtocol || '');
    let anatomicalRegions = $derived(data?.anatomicalRegions || []);
    let contrast = $derived(data?.contrast || {});
    let technicalQuality = $derived(data?.technicalQuality || {});
    let findings = $derived(data?.findings || []);
    let measurements = $derived(data?.measurements || []);
    let comparison = $derived(data?.comparison || {});
    let emergentFindings = $derived(data?.emergentFindings || []);
    let incidentalFindings = $derived(data?.incidentalFindings || []);
    let imagingDiagnoses = $derived(data?.imagingDiagnoses || []);
    let impression = $derived(data?.impression || '');
    let clinicalIndication = $derived(data?.clinicalIndication || '');
    let clinicalHistory = $derived(data?.clinicalHistory || '');
    let interpretingRadiologist = $derived(data?.interpretingRadiologist);
    let technologist = $derived(data?.technologist || '');
    let equipment = $derived(data?.equipment || {});
    let recommendations = $derived(data?.recommendations || []);
    let additionalComments = $derived(data?.additionalComments || '');
    
    function getStudyTypeClass(studyType: string): string {
        const studyTypeClasses: Record<string, string> = {
            'x_ray': 'study-xray',
            'ct_scan': 'study-ct',
            'mri': 'study-mri',
            'ultrasound': 'study-ultrasound',
            'nuclear_medicine': 'study-nuclear',
            'pet_scan': 'study-pet',
            'pet_ct': 'study-pet-ct',
            'mammography': 'study-mammography',
            'dexa_scan': 'study-dexa',
            'fluoroscopy': 'study-fluoroscopy',
            'angiography': 'study-angiography',
            'interventional': 'study-interventional'
        };
        return studyTypeClasses[studyType] || 'study-other';
    }
    
    function getQualityClass(quality: string): string {
        const qualityClasses: Record<string, string> = {
            'excellent': 'quality-excellent',
            'good': 'quality-good',
            'adequate': 'quality-adequate',
            'suboptimal': 'quality-suboptimal',
            'poor': 'quality-poor',
            'non_diagnostic': 'quality-non-diagnostic'
        };
        return qualityClasses[quality] || 'quality-unknown';
    }
    
    function getSignificanceClass(significance: string): string {
        const significanceClasses: Record<string, string> = {
            'normal': 'significance-normal',
            'incidental': 'significance-incidental',
            'clinically_significant': 'significance-clinical',
            'urgent': 'significance-urgent',
            'critical': 'significance-critical'
        };
        return significanceClasses[significance] || 'significance-unknown';
    }
    
    function getChangeClass(change: string): string {
        const changeClasses: Record<string, string> = {
            'new': 'change-new',
            'stable': 'change-stable',
            'improved': 'change-improved',
            'worse': 'change-worse',
            'resolved': 'change-resolved',
            'not_compared': 'change-not-compared'
        };
        return changeClasses[change] || 'change-unknown';
    }
    
    function getUrgencyClass(urgency: string): string {
        const urgencyClasses: Record<string, string> = {
            'stat': 'urgency-stat',
            'urgent': 'urgency-urgent',
            'semi_urgent': 'urgency-semi-urgent'
        };
        return urgencyClasses[urgency] || 'urgency-routine';
    }
    
    function getPriorityClass(priority: string): string {
        const priorityClasses: Record<string, string> = {
            'routine': 'priority-routine',
            'urgent': 'priority-urgent',
            'stat': 'priority-stat'
        };
        return priorityClasses[priority] || 'priority-routine';
    }
    
    function getMarginsClass(margins: string): string {
        const marginClasses: Record<string, string> = {
            'well_defined': 'margins-well-defined',
            'ill_defined': 'margins-ill-defined',
            'irregular': 'margins-irregular',
            'smooth': 'margins-smooth',
            'lobulated': 'margins-lobulated'
        };
        return marginClasses[margins] || 'margins-unknown';
    }
    
    function formatDate(dateString: string): string {
        if (!dateString) return '';
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
        } catch {
            return dateString;
        }
    }
    
    function formatMeasurement(measurement: any): string {
        if (!measurement.value) return '';
        return `${measurement.value} ${measurement.unit || ''}`;
    }
</script>

{#if hasImagingFindings}
    <h3 class="h3 heading -sticky">{$t('report.imaging-findings')}</h3>
    
    <!-- Study Information -->
    <div class="page -block">
        <div class="study-header">
            {#if studyType}
                <div class="study-type {getStudyTypeClass(studyType)}">
                    {$t(`medical.enums.imaging_study_types.${studyType}`)}
                </div>
            {/if}
            {#if studyDateTime}
                <div class="study-datetime">{formatDate(studyDateTime)}</div>
            {/if}
        </div>
        
        {#if studyProtocol}
            <div class="study-protocol">
                <span class="label">{$t('report.protocol')}:</span>
                <span class="value">{studyProtocol}</span>
            </div>
        {/if}
        
        {#if clinicalIndication}
            <div class="clinical-indication">
                <span class="label">{$t('report.clinical-indication')}:</span>
                <span class="value">{clinicalIndication}</span>
            </div>
        {/if}
        
        {#if clinicalHistory}
            <div class="clinical-history">
                <span class="label">{$t('report.clinical-history')}:</span>
                <span class="value">{clinicalHistory}</span>
            </div>
        {/if}
    </div>
    
    <!-- Contrast Information -->
    {#if contrast.used}
        <h4 class="section-title-sub">{$t('report.contrast-information')}</h4>
        <div class="page -block">
            <div class="contrast-info">
                {#if contrast.type}
                    <div class="detail-item">
                        <span class="label">{$t('report.contrast-type')}:</span>
                        <span class="value">{$t(`medical.enums.contrast_types.${contrast.type}`)}</span>
                    </div>
                {/if}
                {#if contrast.route}
                    <div class="detail-item">
                        <span class="label">{$t('report.administration-route')}:</span>
                        <span class="value">{$t(`medical.enums.contrast_routes.${contrast.route}`)}</span>
                    </div>
                {/if}
                {#if contrast.volume}
                    <div class="detail-item">
                        <span class="label">{$t('report.volume')}:</span>
                        <span class="value">{contrast.volume}</span>
                    </div>
                {/if}
                {#if contrast.reaction}
                    <div class="detail-item">
                        <span class="label">{$t('report.reaction')}:</span>
                        <span class="value reaction-noted">{contrast.reaction}</span>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
    
    <!-- Technical Quality -->
    {#if Object.keys(technicalQuality).length > 0}
        <h4 class="section-title-sub">{$t('report.technical-quality')}</h4>
        <div class="page -block">
            {#if technicalQuality.quality}
                <div class="quality-assessment">
                    <span class="label">{$t('report.quality')}:</span>
                    <span class="quality-badge {getQualityClass(technicalQuality.quality)}">
                        {$t(`medical.enums.imaging_quality.${technicalQuality.quality}`)}
                    </span>
                </div>
            {/if}
            
            {#if technicalQuality.limitations?.length > 0}
                <div class="limitations-section">
                    <span class="label">{$t('report.limitations')}:</span>
                    <ul class="limitations-list">
                        {#each technicalQuality.limitations as limitation}
                            <li>{limitation}</li>
                        {/each}
                    </ul>
                </div>
            {/if}
            
            {#if technicalQuality.artifacts?.length > 0}
                <div class="artifacts-section">
                    <span class="label">{$t('report.artifacts')}:</span>
                    <div class="artifacts-list">
                        {#each technicalQuality.artifacts as artifact}
                            <span class="artifact-tag">{$t(`medical.enums.imaging_artifacts.${artifact}`)}</span>
                        {/each}
                    </div>
                </div>
            {/if}
        </div>
    {/if}
    
    <!-- Emergent Findings -->
    {#if emergentFindings.length > 0}
        <h4 class="section-title-sub">{$t('report.emergent-findings')}</h4>
        <ul class="list-items">
            {#each emergentFindings as finding}
                <li class="panel emergent-finding {getUrgencyClass(finding.urgency)}">
                    <div class="emergent-header">
                        <span class="finding-description">{finding.finding}</span>
                        <div class="emergent-header-actions">
                            <span class="urgency-badge {getUrgencyClass(finding.urgency)}">
                                {$t(`medical.enums.urgency_levels.${finding.urgency}`)}
                            </span>
                            <AskButton
                                type="imaging-finding"
                                label={finding.finding}
                                data={finding}
                                documentId={document?.id}
                                documentTitle={document?.content?.title}
                            />
                        </div>
                    </div>
                    
                    {#if finding.recommendedAction}
                        <div class="recommended-action">
                            <span class="label">{$t('report.recommended-action')}:</span>
                            <span class="value">{finding.recommendedAction}</span>
                        </div>
                    {/if}
                    
                    {#if finding.communicatedTo}
                        <div class="communication-info">
                            <span class="label">{$t('report.communicated-to')}:</span>
                            <span class="value">{finding.communicatedTo}</span>
                        </div>
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}
    
    <!-- Detailed Findings -->
    {#if findings.length > 0}
        <h4 class="section-title-sub">{$t('report.detailed-findings')}</h4>
        <ul class="list-items">
            {#each findings as finding}
                <li class="panel {getSignificanceClass(finding.significance)}">
                    <div class="finding-header">
                        <div class="finding-main">
                            <h5 class="finding-title">
                                {#if finding.organ}
                                    {finding.organ}
                                {:else if finding.region}
                                    {finding.region}
                                {/if}
                            </h5>
                            <p class="finding-description">{finding.finding}</p>
                        </div>
                        
                        <div class="finding-badges">
                            {#if finding.significance}
                                <span class="significance-badge {getSignificanceClass(finding.significance)}">
                                    {$t(`medical.enums.finding_significance.${finding.significance}`)}
                                </span>
                            {/if}
                            {#if finding.changeFromPrior}
                                <span class="change-badge {getChangeClass(finding.changeFromPrior)}">
                                    {$t(`medical.enums.change_from_prior.${finding.changeFromPrior}`)}
                                </span>
                            {/if}
                            <AskButton
                                type="imaging-finding"
                                label={finding.organ || finding.region || finding.finding}
                                data={finding}
                                documentId={document?.id}
                                documentTitle={document?.content?.title}
                            />
                        </div>
                    </div>
                    
                    {#if finding.location}
                        <div class="finding-location">
                            <span class="label">{$t('report.location')}:</span>
                            <span class="value">{finding.location}</span>
                        </div>
                    {/if}
                    
                    <!-- Characteristics -->
                    {#if finding.characteristics && Object.keys(finding.characteristics).length > 0}
                        <div class="characteristics-section">
                            <span class="label">{$t('report.characteristics')}:</span>
                            <div class="characteristics-grid">
                                {#if finding.characteristics.size}
                                    <div class="characteristic-item">
                                        <span class="char-label">{$t('report.size')}:</span>
                                        <span class="char-value">{finding.characteristics.size}</span>
                                    </div>
                                {/if}
                                {#if finding.characteristics.shape}
                                    <div class="characteristic-item">
                                        <span class="char-label">{$t('report.shape')}:</span>
                                        <span class="char-value">{finding.characteristics.shape}</span>
                                    </div>
                                {/if}
                                {#if finding.characteristics.density}
                                    <div class="characteristic-item">
                                        <span class="char-label">{$t('report.density')}:</span>
                                        <span class="char-value">{finding.characteristics.density}</span>
                                    </div>
                                {/if}
                                {#if finding.characteristics.intensity}
                                    <div class="characteristic-item">
                                        <span class="char-label">{$t('report.intensity')}:</span>
                                        <span class="char-value">{finding.characteristics.intensity}</span>
                                    </div>
                                {/if}
                                {#if finding.characteristics.echogenicity}
                                    <div class="characteristic-item">
                                        <span class="char-label">{$t('report.echogenicity')}:</span>
                                        <span class="char-value">{finding.characteristics.echogenicity}</span>
                                    </div>
                                {/if}
                                {#if finding.characteristics.enhancement}
                                    <div class="characteristic-item">
                                        <span class="char-label">{$t('report.enhancement')}:</span>
                                        <span class="char-value">{finding.characteristics.enhancement}</span>
                                    </div>
                                {/if}
                                {#if finding.characteristics.margins}
                                    <div class="characteristic-item">
                                        <span class="char-label">{$t('report.margins')}:</span>
                                        <span class="char-value {getMarginsClass(finding.characteristics.margins)}">
                                            {$t(`medical.enums.margins.${finding.characteristics.margins}`)}
                                        </span>
                                    </div>
                                {/if}
                            </div>
                        </div>
                    {/if}
                    
                    <!-- Measurements -->
                    {#if finding.measurements?.length > 0}
                        <div class="measurements-section">
                            <span class="label">{$t('report.measurements')}:</span>
                            <div class="measurements-grid">
                                {#each finding.measurements as measurement}
                                    <div class="measurement-item">
                                        <span class="measurement-parameter">{measurement.parameter}:</span>
                                        <span class="measurement-value">{formatMeasurement(measurement)}</span>
                                        {#if measurement.method}
                                            <span class="measurement-method">({measurement.method})</span>
                                        {/if}
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {/if}
                    
                    <!-- Differential Diagnoses -->
                    {#if finding.likelyDifferential?.length > 0}
                        <div class="differential-section">
                            <span class="label">{$t('report.differential-diagnoses')}:</span>
                            <div class="differential-list">
                                {#each finding.likelyDifferential as differential}
                                    <span class="differential-item">{differential}</span>
                                {/each}
                            </div>
                        </div>
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}
    
    <!-- Quantitative Measurements -->
    {#if measurements.length > 0}
        <h4 class="section-title-sub">{$t('report.quantitative-measurements')}</h4>
        <div class="page -block">
            <div class="measurements-table">
                {#each measurements as measurement}
                    <div class="measurement-row {measurement.abnormal ? 'abnormal' : 'normal'}">
                        <div class="measurement-structure">{measurement.structure}</div>
                        <div class="measurement-parameter">{measurement.parameter}</div>
                        <div class="measurement-value">{formatMeasurement(measurement)}</div>
                        {#if measurement.normalRange}
                            <div class="measurement-range">{$t('report.normal')}: {measurement.normalRange}</div>
                        {/if}
                    </div>
                {/each}
            </div>
        </div>
    {/if}
    
    <!-- Comparison with Prior Studies -->
    {#if Object.keys(comparison).length > 0}
        <h4 class="section-title-sub">{$t('report.comparison-with-prior')}</h4>
        <div class="page -block">
            <div class="comparison-info">
                {#if comparison.priorStudyDate}
                    <div class="detail-item">
                        <span class="label">{$t('report.prior-study-date')}:</span>
                        <span class="value">{formatDate(comparison.priorStudyDate)}</span>
                    </div>
                {/if}
                {#if comparison.priorStudyType}
                    <div class="detail-item">
                        <span class="label">{$t('report.prior-study-type')}:</span>
                        <span class="value">{comparison.priorStudyType}</span>
                    </div>
                {/if}
                {#if comparison.interval}
                    <div class="detail-item">
                        <span class="label">{$t('report.interval')}:</span>
                        <span class="value">{comparison.interval}</span>
                    </div>
                {/if}
                {#if comparison.overallChange}
                    <div class="detail-item">
                        <span class="label">{$t('report.overall-change')}:</span>
                        <span class="value {getChangeClass(comparison.overallChange)}">
                            {$t(`medical.enums.change_from_prior.${comparison.overallChange}`)}
                        </span>
                    </div>
                {/if}
                {#if comparison.specificChanges?.length > 0}
                    <div class="specific-changes">
                        <span class="label">{$t('report.specific-changes')}:</span>
                        <ul class="changes-list">
                            {#each comparison.specificChanges as change}
                                <li>{change}</li>
                            {/each}
                        </ul>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
    
    <!-- Incidental Findings -->
    {#if incidentalFindings.length > 0}
        <h4 class="section-title-sub">{$t('report.incidental-findings')}</h4>
        <ul class="list-items">
            {#each incidentalFindings as finding}
                <li class="panel incidental-finding">
                    <div class="incidental-header">
                        <span class="finding-description">{finding.finding}</span>
                        {#if finding.followUpRecommended}
                            <span class="followup-badge">{$t('report.followup-recommended')}</span>
                        {/if}
                    </div>
                    
                    {#if finding.followUpDetails}
                        <div class="followup-details">
                            <span class="label">{$t('report.followup-details')}:</span>
                            <span class="value">{finding.followUpDetails}</span>
                        </div>
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}
    
    <!-- Imaging Diagnoses -->
    {#if imagingDiagnoses.length > 0}
        <h4 class="section-title-sub">{$t('report.imaging-diagnoses')}</h4>
        <ul class="list-items">
            {#each imagingDiagnoses as diagnosis}
                <li class="panel diagnosis-item">
                    <div class="diagnosis-header">
                        <span class="diagnosis-name">{diagnosis.name}</span>
                        <div class="diagnosis-header-actions">
                            {#if diagnosis.confidence}
                                <span class="confidence-badge">{Math.round(diagnosis.confidence * 100)}%</span>
                            {/if}
                            <AskButton
                                type="imaging-diagnosis"
                                label={diagnosis.name}
                                data={diagnosis}
                                documentId={document?.id}
                                documentTitle={document?.content?.title}
                            />
                        </div>
                    </div>
                    {#if diagnosis.description}
                        <p class="diagnosis-description">{diagnosis.description}</p>
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}
    
    <!-- Overall Impression -->
    {#if impression}
        <h4 class="section-title-sub">{$t('report.impression')}</h4>
        <div class="page -block">
            <div class="impression-text">{impression}</div>
        </div>
    {/if}
    
    <!-- Recommendations -->
    {#if recommendations.length > 0}
        <h4 class="section-title-sub">{$t('report.recommendations')}</h4>
        <ul class="list-items">
            {#each recommendations as recommendation}
                <li class="panel recommendation-item {getPriorityClass(recommendation.priority)}">
                    <div class="recommendation-header">
                        <span class="recommendation-text">{recommendation.recommendation}</span>
                        {#if recommendation.priority}
                            <span class="priority-badge {getPriorityClass(recommendation.priority)}">
                                {$t(`medical.enums.priority_levels.${recommendation.priority}`)}
                            </span>
                        {/if}
                    </div>
                    
                    <div class="recommendation-details">
                        {#if recommendation.timeframe}
                            <div class="detail-item">
                                <span class="label">{$t('report.timeframe')}:</span>
                                <span class="value">{recommendation.timeframe}</span>
                            </div>
                        {/if}
                        {#if recommendation.indication}
                            <div class="detail-item">
                                <span class="label">{$t('report.indication')}:</span>
                                <span class="value">{recommendation.indication}</span>
                            </div>
                        {/if}
                    </div>
                </li>
            {/each}
        </ul>
    {/if}
    
    <!-- Equipment Information -->
    {#if Object.keys(equipment).length > 0}
        <h4 class="section-title-sub">{$t('report.equipment-information')}</h4>
        <div class="page -block">
            <div class="equipment-info">
                {#if equipment.manufacturer}
                    <div class="detail-item">
                        <span class="label">{$t('report.manufacturer')}:</span>
                        <span class="value">{equipment.manufacturer}</span>
                    </div>
                {/if}
                {#if equipment.model}
                    <div class="detail-item">
                        <span class="label">{$t('report.model')}:</span>
                        <span class="value">{equipment.model}</span>
                    </div>
                {/if}
                {#if equipment.fieldStrength}
                    <div class="detail-item">
                        <span class="label">{$t('report.field-strength')}:</span>
                        <span class="value">{equipment.fieldStrength}</span>
                    </div>
                {/if}
                {#if equipment.technique}
                    <div class="detail-item">
                        <span class="label">{$t('report.technique')}:</span>
                        <span class="value">{equipment.technique}</span>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
    
    <!-- Staff Information -->
    {#if interpretingRadiologist || technologist}
        <h4 class="section-title-sub">{$t('report.staff-information')}</h4>
        <div class="page -block">
            <div class="staff-info">
                {#if interpretingRadiologist}
                    <div class="staff-member">
                        <span class="label">{$t('report.interpreting-radiologist')}:</span>
                        <div class="staff-details">
                            <span class="staff-name">{interpretingRadiologist.name}</span>
                            {#if interpretingRadiologist.title}
                                <span class="staff-title">{interpretingRadiologist.title}</span>
                            {/if}
                            {#if interpretingRadiologist.department}
                                <span class="staff-department">{interpretingRadiologist.department}</span>
                            {/if}
                        </div>
                    </div>
                {/if}
                
                {#if technologist}
                    <div class="staff-member">
                        <span class="label">{$t('report.technologist')}:</span>
                        <span class="value">{technologist}</span>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
    
    <!-- Additional Comments -->
    {#if additionalComments}
        <h4 class="section-title-sub">{$t('report.additional-comments')}</h4>
        <div class="page -block">
            <div class="additional-comments">{additionalComments}</div>
        </div>
    {/if}
    
{:else if data}
    <h3 class="h3 heading -sticky">{$t('report.imaging-findings')}</h3>
    <div class="page -block">
        <p class="no-data">{$t('report.no-imaging-findings-data')}</p>
    </div>
{/if}

<style>
    .study-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
        gap: 1rem;
    }
    
    .study-type {
        font-size: 1.2rem;
        font-weight: 600;
        padding: 0.5rem 1rem;
        border-radius: 0.5rem;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    
    .study-xray { background-color: var(--color-info-light); color: var(--color-info-dark); }
    .study-ct { background-color: var(--color-primary-light); color: var(--color-primary-dark); }
    .study-mri { background-color: var(--color-secondary-light); color: var(--color-secondary-dark); }
    .study-ultrasound { background-color: var(--color-success-light); color: var(--color-success-dark); }
    .study-nuclear { background-color: var(--color-warning-light); color: var(--color-warning-dark); }
    .study-pet { background-color: var(--color-danger-light); color: var(--color-danger-dark); }
    .study-other { background-color: var(--color-secondary-light); color: var(--color-secondary-dark); }
    
    .study-datetime {
        color: var(--color-text-secondary);
        font-size: 0.9rem;
        white-space: nowrap;
    }
    
    .study-protocol,
    .clinical-indication,
    .clinical-history {
        margin-bottom: 0.5rem;
    }
    
    .contrast-info {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .reaction-noted {
        color: var(--color-danger-dark);
        font-weight: 600;
    }
    
    .quality-assessment {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.75rem;
    }
    
    .quality-badge {
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.9rem;
        font-weight: 500;
        text-transform: uppercase;
    }
    
    .quality-excellent { background-color: var(--color-success-light); color: var(--color-success-dark); }
    .quality-good { background-color: var(--color-success-light); color: var(--color-success-dark); }
    .quality-adequate { background-color: var(--color-warning-light); color: var(--color-warning-dark); }
    .quality-suboptimal { background-color: var(--color-danger-light); color: var(--color-danger-dark); }
    .quality-poor { background-color: var(--color-danger-light); color: var(--color-danger-dark); }
    .quality-non-diagnostic { background-color: var(--color-danger-light); color: var(--color-danger-dark); }
    
    .limitations-section,
    .artifacts-section {
        margin-bottom: 0.75rem;
    }
    
    .limitations-list {
        margin: 0.5rem 0 0 1.5rem;
        padding: 0;
    }
    
    .limitations-list li {
        margin-bottom: 0.25rem;
    }
    
    .artifacts-list {
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem;
        margin-top: 0.25rem;
    }
    
    .artifact-tag {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
        padding: 0.125rem 0.375rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
    }
    
    .emergent-finding {
        border-left-width: 4px;
    }
    
    .urgency-stat {
        background-color: var(--color-danger);
        color: white;
        border-left-color: var(--color-danger);
    }
    
    .urgency-urgent {
        background-color: var(--color-danger-light);
        color: var(--color-danger-dark);
        border-left-color: var(--color-danger);
    }
    
    .urgency-semi-urgent {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
        border-left-color: var(--color-warning);
    }
    
    .emergent-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 0.75rem;
        gap: 1rem;
    }
    
    .urgency-badge {
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
        text-transform: uppercase;
        white-space: nowrap;
    }
    
    .recommended-action,
    .communication-info {
        margin-bottom: 0.5rem;
    }
    
    .finding-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 0.75rem;
        gap: 1rem;
    }
    
    .finding-main {
        flex: 1;
    }
    
    .finding-title {
        font-size: 1.1rem;
        font-weight: 600;
        margin: 0 0 0.5rem 0;
        color: var(--color-text-primary);
    }
    
    .finding-description {
        margin: 0;
        color: var(--color-text-primary);
        line-height: 1.4;
    }
    
    .finding-badges {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        align-items: flex-end;
    }
    
    .significance-badge,
    .change-badge {
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
        text-transform: uppercase;
        white-space: nowrap;
    }
    
    .significance-normal { background-color: var(--color-success-light); color: var(--color-success-dark); }
    .significance-incidental { background-color: var(--color-info-light); color: var(--color-info-dark); }
    .significance-clinical { background-color: var(--color-warning-light); color: var(--color-warning-dark); }
    .significance-urgent { background-color: var(--color-danger-light); color: var(--color-danger-dark); }
    .significance-critical { background-color: var(--color-danger); color: white; }
    
    .change-new { background-color: var(--color-info-light); color: var(--color-info-dark); }
    .change-stable { background-color: var(--color-success-light); color: var(--color-success-dark); }
    .change-improved { background-color: var(--color-success-light); color: var(--color-success-dark); }
    .change-worse { background-color: var(--color-danger-light); color: var(--color-danger-dark); }
    .change-resolved { background-color: var(--color-success-light); color: var(--color-success-dark); }
    .change-not-compared { background-color: var(--color-secondary-light); color: var(--color-secondary-dark); }
    
    .finding-location {
        margin-bottom: 0.75rem;
    }
    
    .characteristics-section,
    .measurements-section,
    .differential-section {
        margin-bottom: 0.75rem;
    }
    
    .characteristics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 0.5rem;
        margin-top: 0.5rem;
    }
    
    .characteristic-item {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        padding: 0.25rem;
        background-color: var(--color-background-secondary);
        border-radius: 0.25rem;
    }
    
    .char-label {
        font-size: 0.9rem;
        color: var(--color-text-secondary);
        min-width: 60px;
    }
    
    .char-value {
        font-size: 0.9rem;
        color: var(--color-text-primary);
        font-weight: 500;
    }
    
    .margins-well-defined { color: var(--color-success-dark); }
    .margins-ill-defined { color: var(--color-warning-dark); }
    .margins-irregular { color: var(--color-danger-dark); }
    .margins-smooth { color: var(--color-success-dark); }
    .margins-lobulated { color: var(--color-info-dark); }
    
    .measurements-grid {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        margin-top: 0.5rem;
    }
    
    .measurement-item {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        font-size: 0.9rem;
    }
    
    .measurement-parameter {
        font-weight: 500;
        color: var(--color-text-secondary);
    }
    
    .measurement-value {
        font-weight: 600;
        color: var(--color-text-primary);
    }
    
    .measurement-method {
        color: var(--color-text-secondary);
        font-style: italic;
    }
    
    .differential-list {
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem;
        margin-top: 0.5rem;
    }
    
    .differential-item {
        background-color: var(--color-info-light);
        color: var(--color-info-dark);
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.9rem;
    }
    
    .measurements-table {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .measurement-row {
        display: grid;
        grid-template-columns: 1fr 1fr auto auto;
        gap: 1rem;
        align-items: center;
        padding: 0.5rem;
        border-radius: 0.25rem;
        background-color: var(--color-background-secondary);
    }
    
    .measurement-row.normal {
        border-left: 3px solid var(--color-success);
    }
    
    .measurement-row.abnormal {
        border-left: 3px solid var(--color-danger);
    }
    
    .measurement-structure {
        font-weight: 600;
        color: var(--color-text-primary);
    }
    
    .measurement-parameter {
        color: var(--color-text-secondary);
    }
    
    .measurement-value {
        font-weight: 600;
        color: var(--color-text-primary);
    }
    
    .measurement-range {
        color: var(--color-text-secondary);
        font-size: 0.9rem;
    }
    
    .comparison-info {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .specific-changes {
        margin-top: 0.5rem;
    }
    
    .changes-list {
        margin: 0.5rem 0 0 1.5rem;
        padding: 0;
    }
    
    .changes-list li {
        margin-bottom: 0.25rem;
    }
    
    .incidental-finding {
        border-left-color: var(--color-info);
    }
    
    .incidental-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 0.5rem;
        gap: 1rem;
    }
    
    .followup-badge {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
        text-transform: uppercase;
        white-space: nowrap;
    }
    
    .followup-details {
        margin-top: 0.5rem;
    }
    
    .diagnosis-item {
        border-left-color: var(--color-primary);
    }
    
    .diagnosis-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.5rem;
        gap: 1rem;
    }
    
    .diagnosis-name {
        font-weight: 600;
        color: var(--color-text-primary);
    }
    
    .confidence-badge {
        background-color: var(--color-info-light);
        color: var(--color-info-dark);
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
    }
    
    .diagnosis-description {
        margin: 0;
        color: var(--color-text-secondary);
    }
    
    .impression-text {
        font-size: 1.1rem;
        line-height: 1.6;
        color: var(--color-text-primary);
        background-color: var(--color-background-secondary);
        padding: 1rem;
        border-radius: 0.5rem;
        border-left: 4px solid var(--color-primary);
    }
    
    .recommendation-item {
        border-left-color: var(--color-info);
    }
    
    .recommendation-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 0.5rem;
        gap: 1rem;
    }
    
    .recommendation-text {
        font-weight: 500;
        color: var(--color-text-primary);
        flex: 1;
    }
    
    .priority-badge {
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
        text-transform: uppercase;
        white-space: nowrap;
    }
    
    .priority-routine { background-color: var(--color-info-light); color: var(--color-info-dark); }
    .priority-urgent { background-color: var(--color-warning-light); color: var(--color-warning-dark); }
    .priority-stat { background-color: var(--color-danger-light); color: var(--color-danger-dark); }
    
    .recommendation-details {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }
    
    .equipment-info,
    .staff-info {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
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
    .staff-department {
        color: var(--color-text-secondary);
        font-size: 0.9rem;
    }
    
    .additional-comments {
        font-style: italic;
        color: var(--color-text-secondary);
        line-height: 1.5;
    }
    
    .detail-item {
        display: flex;
        gap: 0.5rem;
        align-items: flex-start;
    }
    
    .label {
        font-weight: 500;
        color: var(--color-text-secondary);
        min-width: 120px;
        flex-shrink: 0;
    }
    
    .value {
        color: var(--color-text-primary);
        flex: 1;
        line-height: 1.4;
    }
    
    /* Panel significance coloring */
    .significance-normal { border-left-color: var(--color-success); }
    .significance-incidental { border-left-color: var(--color-info); }
    .significance-clinical { border-left-color: var(--color-warning); }
    .significance-urgent { border-left-color: var(--color-danger); }
    .significance-critical { border-left-color: var(--color-danger); border-left-width: 4px; }
    
    /* Priority-based panel coloring */
    .priority-stat { border-left-color: var(--color-danger); border-left-width: 4px; }
    .priority-urgent { border-left-color: var(--color-warning); border-left-width: 3px; }
    .priority-routine { border-left-color: var(--color-info); }
</style>