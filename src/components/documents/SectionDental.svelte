<script lang="ts">
    import { t } from '$lib/i18n';

    interface Props {
        data: any;
        document?: any;
        key?: string;
    }

    let { data, document, key }: Props = $props();
    
    let hasDental = $derived(data && data.hasDental);
    
    let oralExamination = $derived(data?.oralExamination || {});
    let teeth = $derived(data?.teeth || []);
    let periodontal = $derived(data?.periodontal || {});
    let occlusion = $derived(data?.occlusion || {});
    let oralHygiene = $derived(data?.oralHygiene || {});
    let radiographs = $derived(data?.radiographs || []);
    let diagnosis = $derived(data?.diagnosis || []);
    let treatmentPlan = $derived(data?.treatmentPlan || []);
    let previousTreatment = $derived(data?.previousTreatment || []);
    let dentalProvider = $derived(data?.dentalProvider);
    let followUp = $derived(data?.followUp || {});
    let notes = $derived(data?.notes || '');
    
    function getToothConditionClass(condition: string): string {
        const conditionClasses: Record<string, string> = {
            'healthy': 'tooth-healthy',
            'carious': 'tooth-carious',
            'restored': 'tooth-restored',
            'crowned': 'tooth-crowned',
            'root_canal': 'tooth-root-canal',
            'extracted': 'tooth-extracted',
            'impacted': 'tooth-impacted',
            'fractured': 'tooth-fractured',
            'mobile': 'tooth-mobile',
            'sensitive': 'tooth-sensitive'
        };
        return conditionClasses[condition] || 'tooth-general';
    }
    
    function getPeriodontalClass(condition: string): string {
        const perioClasses: Record<string, string> = {
            'healthy': 'perio-healthy',
            'gingivitis': 'perio-gingivitis',
            'mild_periodontitis': 'perio-mild',
            'moderate_periodontitis': 'perio-moderate',
            'severe_periodontitis': 'perio-severe',
            'advanced_periodontitis': 'perio-advanced'
        };
        return perioClasses[condition] || 'perio-unknown';
    }
    
    function getUrgencyClass(urgency: string): string {
        const urgencyClasses: Record<string, string> = {
            'routine': 'urgency-routine',
            'urgent': 'urgency-urgent',
            'emergency': 'urgency-emergency'
        };
        return urgencyClasses[urgency] || 'urgency-routine';
    }
    
    function getSeverityClass(severity: string): string {
        const severityClasses: Record<string, string> = {
            'mild': 'severity-mild',
            'moderate': 'severity-moderate',
            'severe': 'severity-severe'
        };
        return severityClasses[severity] || 'severity-unknown';
    }
    
    function getPriorityClass(priority: string): string {
        const priorityClasses: Record<string, string> = {
            'low': 'priority-low',
            'medium': 'priority-medium',
            'high': 'priority-high',
            'urgent': 'priority-urgent'
        };
        return priorityClasses[priority] || 'priority-medium';
    }
    
    function getHygieneClass(level: string): string {
        const hygieneClasses: Record<string, string> = {
            'excellent': 'hygiene-excellent',
            'good': 'hygiene-good',
            'fair': 'hygiene-fair',
            'poor': 'hygiene-poor'
        };
        return hygieneClasses[level] || 'hygiene-unknown';
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
    
    function formatToothNumber(number: number): string {
        if (number >= 1 && number <= 32) {
            return `#${number}`;
        }
        return `${number}`;
    }
    
    function getToothQuadrant(number: number): string {
        if (number >= 1 && number <= 8) return 'upper-right';
        if (number >= 9 && number <= 16) return 'upper-left';
        if (number >= 17 && number <= 24) return 'lower-left';
        if (number >= 25 && number <= 32) return 'lower-right';
        return 'unknown';
    }
</script>

{#if hasDental}
    <h3 class="h3 heading -sticky">{$t('report.dental-examination')}</h3>
    
    <!-- Oral Examination Overview -->
    {#if Object.keys(oralExamination).length > 0}
        <h4 class="section-title-sub">{$t('report.oral-examination')}</h4>
        <div class="page -block">
            <div class="oral-exam-overview">
                {#if oralExamination.generalAppearance}
                    <div class="detail-item">
                        <span class="label">{$t('report.general-appearance')}:</span>
                        <span class="value">{oralExamination.generalAppearance}</span>
                    </div>
                {/if}
                
                {#if oralExamination.oralMucosa}
                    <div class="detail-item">
                        <span class="label">{$t('report.oral-mucosa')}:</span>
                        <span class="value">{oralExamination.oralMucosa}</span>
                    </div>
                {/if}
                
                {#if oralExamination.tongue}
                    <div class="detail-item">
                        <span class="label">{$t('report.tongue')}:</span>
                        <span class="value">{oralExamination.tongue}</span>
                    </div>
                {/if}
                
                {#if oralExamination.palate}
                    <div class="detail-item">
                        <span class="label">{$t('report.palate')}:</span>
                        <span class="value">{oralExamination.palate}</span>
                    </div>
                {/if}
                
                {#if oralExamination.throat}
                    <div class="detail-item">
                        <span class="label">{$t('report.throat')}:</span>
                        <span class="value">{oralExamination.throat}</span>
                    </div>
                {/if}
                
                {#if oralExamination.lymphNodes}
                    <div class="detail-item">
                        <span class="label">{$t('report.lymph-nodes')}:</span>
                        <span class="value">{oralExamination.lymphNodes}</span>
                    </div>
                {/if}
                
                {#if oralExamination.tmj}
                    <div class="detail-item">
                        <span class="label">{$t('report.tmj')}:</span>
                        <span class="value">{oralExamination.tmj}</span>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
    
    <!-- Teeth Assessment -->
    {#if teeth.length > 0}
        <h4 class="section-title-sub">{$t('report.teeth-assessment')}</h4>
        <div class="page -block">
            <div class="teeth-grid">
                {#each teeth as tooth}
                    <div class="tooth-item {getToothConditionClass(tooth.condition)} {getToothQuadrant(tooth.number)}">
                        <div class="tooth-header">
                            <span class="tooth-number">{formatToothNumber(tooth.number)}</span>
                            <span class="tooth-name">{tooth.name}</span>
                        </div>
                        
                        <div class="tooth-details">
                            {#if tooth.condition}
                                <div class="tooth-condition">
                                    <span class="condition-badge {getToothConditionClass(tooth.condition)}">
                                        {$t(`medical.enums.tooth_conditions.${tooth.condition}`)}
                                    </span>
                                </div>
                            {/if}
                            
                            {#if tooth.surfaces?.length > 0}
                                <div class="tooth-surfaces">
                                    <span class="surfaces-label">{$t('report.surfaces')}:</span>
                                    <div class="surfaces-list">
                                        {#each tooth.surfaces as surface}
                                            <span class="surface-tag">{surface}</span>
                                        {/each}
                                    </div>
                                </div>
                            {/if}
                            
                            {#if tooth.mobility}
                                <div class="tooth-mobility">
                                    <span class="mobility-label">{$t('report.mobility')}:</span>
                                    <span class="mobility-value">{tooth.mobility}</span>
                                </div>
                            {/if}
                            
                            {#if tooth.probing?.length > 0}
                                <div class="tooth-probing">
                                    <span class="probing-label">{$t('report.probing-depths')}:</span>
                                    <div class="probing-values">
                                        {#each tooth.probing as probe}
                                            <span class="probe-value">{probe}mm</span>
                                        {/each}
                                    </div>
                                </div>
                            {/if}
                            
                            {#if tooth.restoration}
                                <div class="tooth-restoration">
                                    <span class="restoration-label">{$t('report.restoration')}:</span>
                                    <span class="restoration-value">{tooth.restoration}</span>
                                </div>
                            {/if}
                            
                            {#if tooth.notes}
                                <div class="tooth-notes">
                                    <span class="notes-label">{$t('report.notes')}:</span>
                                    <span class="notes-value">{tooth.notes}</span>
                                </div>
                            {/if}
                        </div>
                    </div>
                {/each}
            </div>
        </div>
    {/if}
    
    <!-- Periodontal Assessment -->
    {#if Object.keys(periodontal).length > 0}
        <h4 class="section-title-sub">{$t('report.periodontal-assessment')}</h4>
        <div class="page -block">
            <div class="periodontal-info">
                {#if periodontal.overallCondition}
                    <div class="perio-overall">
                        <span class="label">{$t('report.overall-condition')}:</span>
                        <span class="perio-condition {getPeriodontalClass(periodontal.overallCondition)}">
                            {$t(`medical.enums.periodontal_conditions.${periodontal.overallCondition}`)}
                        </span>
                    </div>
                {/if}
                
                {#if periodontal.gingivitis}
                    <div class="detail-item">
                        <span class="label">{$t('report.gingivitis')}:</span>
                        <span class="value {getSeverityClass(periodontal.gingivitis)}">
                            {$t(`medical.enums.severity_levels.${periodontal.gingivitis}`)}
                        </span>
                    </div>
                {/if}
                
                {#if periodontal.bleeding}
                    <div class="detail-item">
                        <span class="label">{$t('report.bleeding-on-probing')}:</span>
                        <span class="value bleeding-indicator">{periodontal.bleeding}%</span>
                    </div>
                {/if}
                
                {#if periodontal.pocketDepths}
                    <div class="detail-item">
                        <span class="label">{$t('report.average-pocket-depth')}:</span>
                        <span class="value">{periodontal.pocketDepths}mm</span>
                    </div>
                {/if}
                
                {#if periodontal.calculus}
                    <div class="detail-item">
                        <span class="label">{$t('report.calculus')}:</span>
                        <span class="value {getSeverityClass(periodontal.calculus)}">
                            {$t(`medical.enums.severity_levels.${periodontal.calculus}`)}
                        </span>
                    </div>
                {/if}
                
                {#if periodontal.plaque}
                    <div class="detail-item">
                        <span class="label">{$t('report.plaque')}:</span>
                        <span class="value {getSeverityClass(periodontal.plaque)}">
                            {$t(`medical.enums.severity_levels.${periodontal.plaque}`)}
                        </span>
                    </div>
                {/if}
                
                {#if periodontal.recession}
                    <div class="detail-item">
                        <span class="label">{$t('report.gingival-recession')}:</span>
                        <span class="value">{periodontal.recession}</span>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
    
    <!-- Occlusion -->
    {#if Object.keys(occlusion).length > 0}
        <h4 class="section-title-sub">{$t('report.occlusion')}</h4>
        <div class="page -block">
            <div class="occlusion-info">
                {#if occlusion.classification}
                    <div class="detail-item">
                        <span class="label">{$t('report.classification')}:</span>
                        <span class="value">{occlusion.classification}</span>
                    </div>
                {/if}
                
                {#if occlusion.overbite}
                    <div class="detail-item">
                        <span class="label">{$t('report.overbite')}:</span>
                        <span class="value">{occlusion.overbite}mm</span>
                    </div>
                {/if}
                
                {#if occlusion.overjet}
                    <div class="detail-item">
                        <span class="label">{$t('report.overjet')}:</span>
                        <span class="value">{occlusion.overjet}mm</span>
                    </div>
                {/if}
                
                {#if occlusion.crossbite}
                    <div class="detail-item">
                        <span class="label">{$t('report.crossbite')}:</span>
                        <span class="value">{occlusion.crossbite ? $t('report.present') : $t('report.absent')}</span>
                    </div>
                {/if}
                
                {#if occlusion.openbite}
                    <div class="detail-item">
                        <span class="label">{$t('report.openbite')}:</span>
                        <span class="value">{occlusion.openbite ? $t('report.present') : $t('report.absent')}</span>
                    </div>
                {/if}
                
                {#if occlusion.midline}
                    <div class="detail-item">
                        <span class="label">{$t('report.midline-deviation')}:</span>
                        <span class="value">{occlusion.midline}</span>
                    </div>
                {/if}
                
                {#if occlusion.bruxism}
                    <div class="detail-item">
                        <span class="label">{$t('report.bruxism')}:</span>
                        <span class="value bruxism-indicator">{occlusion.bruxism ? $t('report.present') : $t('report.absent')}</span>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
    
    <!-- Oral Hygiene -->
    {#if Object.keys(oralHygiene).length > 0}
        <h4 class="section-title-sub">{$t('report.oral-hygiene')}</h4>
        <div class="page -block">
            <div class="hygiene-assessment">
                {#if oralHygiene.overall}
                    <div class="hygiene-overall">
                        <span class="label">{$t('report.overall-hygiene')}:</span>
                        <span class="hygiene-value {getHygieneClass(oralHygiene.overall)}">
                            {$t(`medical.enums.hygiene_levels.${oralHygiene.overall}`)}
                        </span>
                    </div>
                {/if}
                
                {#if oralHygiene.plaqueIndex}
                    <div class="detail-item">
                        <span class="label">{$t('report.plaque-index')}:</span>
                        <span class="value">{oralHygiene.plaqueIndex}%</span>
                    </div>
                {/if}
                
                {#if oralHygiene.brushingFrequency}
                    <div class="detail-item">
                        <span class="label">{$t('report.brushing-frequency')}:</span>
                        <span class="value">{oralHygiene.brushingFrequency}</span>
                    </div>
                {/if}
                
                {#if oralHygiene.flossing}
                    <div class="detail-item">
                        <span class="label">{$t('report.flossing')}:</span>
                        <span class="value">{oralHygiene.flossing}</span>
                    </div>
                {/if}
                
                {#if oralHygiene.mouthwash}
                    <div class="detail-item">
                        <span class="label">{$t('report.mouthwash')}:</span>
                        <span class="value">{oralHygiene.mouthwash ? $t('report.yes') : $t('report.no')}</span>
                    </div>
                {/if}
                
                {#if oralHygiene.recommendations?.length > 0}
                    <div class="hygiene-recommendations">
                        <span class="label">{$t('report.recommendations')}:</span>
                        <ul class="recommendations-list">
                            {#each oralHygiene.recommendations as recommendation}
                                <li>{recommendation}</li>
                            {/each}
                        </ul>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
    
    <!-- Radiographs -->
    {#if radiographs.length > 0}
        <h4 class="section-title-sub">{$t('report.radiographs')}</h4>
        <ul class="list-items">
            {#each radiographs as radiograph}
                <li class="panel radiograph-item">
                    <div class="radiograph-header">
                        <div class="radiograph-main">
                            <h5 class="radiograph-type">{radiograph.type}</h5>
                            <span class="radiograph-date">{formatDate(radiograph.date)}</span>
                        </div>
                        
                        {#if radiograph.quality}
                            <span class="quality-badge">{radiograph.quality}</span>
                        {/if}
                    </div>
                    
                    <div class="radiograph-details">
                        {#if radiograph.area}
                            <div class="detail-item">
                                <span class="label">{$t('report.area')}:</span>
                                <span class="value">{radiograph.area}</span>
                            </div>
                        {/if}
                        
                        {#if radiograph.findings}
                            <div class="radiograph-findings">
                                <span class="label">{$t('report.findings')}:</span>
                                <p class="findings-text">{radiograph.findings}</p>
                            </div>
                        {/if}
                        
                        {#if radiograph.pathology}
                            <div class="radiograph-pathology">
                                <span class="label">{$t('report.pathology')}:</span>
                                <span class="pathology-text">{radiograph.pathology}</span>
                            </div>
                        {/if}
                    </div>
                </li>
            {/each}
        </ul>
    {/if}
    
    <!-- Dental Diagnosis -->
    {#if diagnosis.length > 0}
        <h4 class="section-title-sub">{$t('report.dental-diagnosis')}</h4>
        <ul class="list-items">
            {#each diagnosis as diag}
                <li class="panel diagnosis-item {getSeverityClass(diag.severity)}">
                    <div class="diagnosis-header">
                        <span class="diagnosis-name">{diag.condition}</span>
                        {#if diag.severity}
                            <span class="severity-badge {getSeverityClass(diag.severity)}">
                                {$t(`medical.enums.severity_levels.${diag.severity}`)}
                            </span>
                        {/if}
                    </div>
                    
                    <div class="diagnosis-details">
                        {#if diag.teethAffected?.length > 0}
                            <div class="detail-item">
                                <span class="label">{$t('report.teeth-affected')}:</span>
                                <span class="value">{diag.teethAffected.map((t: number) => formatToothNumber(t)).join(', ')}</span>
                            </div>
                        {/if}
                        
                        {#if diag.description}
                            <div class="diagnosis-description">
                                <span class="label">{$t('report.description')}:</span>
                                <p class="description-text">{diag.description}</p>
                            </div>
                        {/if}
                        
                        {#if diag.prognosis}
                            <div class="detail-item">
                                <span class="label">{$t('report.prognosis')}:</span>
                                <span class="value">{diag.prognosis}</span>
                            </div>
                        {/if}
                    </div>
                </li>
            {/each}
        </ul>
    {/if}
    
    <!-- Treatment Plan -->
    {#if treatmentPlan.length > 0}
        <h4 class="section-title-sub">{$t('report.treatment-plan')}</h4>
        <ul class="list-items">
            {#each treatmentPlan as treatment}
                <li class="panel treatment-item {getPriorityClass(treatment.priority)}">
                    <div class="treatment-header">
                        <div class="treatment-main">
                            <h5 class="treatment-procedure">{treatment.procedure}</h5>
                            {#if treatment.tooth}
                                <span class="treatment-tooth">{formatToothNumber(treatment.tooth)}</span>
                            {/if}
                        </div>
                        
                        <div class="treatment-badges">
                            {#if treatment.priority}
                                <span class="priority-badge {getPriorityClass(treatment.priority)}">
                                    {$t(`medical.enums.priority_levels.${treatment.priority}`)}
                                </span>
                            {/if}
                            {#if treatment.urgency}
                                <span class="urgency-badge {getUrgencyClass(treatment.urgency)}">
                                    {$t(`medical.enums.urgency_levels.${treatment.urgency}`)}
                                </span>
                            {/if}
                        </div>
                    </div>
                    
                    <div class="treatment-details">
                        {#if treatment.description}
                            <div class="detail-item">
                                <span class="label">{$t('report.description')}:</span>
                                <span class="value">{treatment.description}</span>
                            </div>
                        {/if}
                        
                        {#if treatment.estimatedCost}
                            <div class="detail-item">
                                <span class="label">{$t('report.estimated-cost')}:</span>
                                <span class="value cost-value">{treatment.estimatedCost}</span>
                            </div>
                        {/if}
                        
                        {#if treatment.estimatedTime}
                            <div class="detail-item">
                                <span class="label">{$t('report.estimated-time')}:</span>
                                <span class="value">{treatment.estimatedTime}</span>
                            </div>
                        {/if}
                        
                        {#if treatment.alternatives?.length > 0}
                            <div class="alternatives-section">
                                <span class="label">{$t('report.alternatives')}:</span>
                                <ul class="alternatives-list">
                                    {#each treatment.alternatives as alternative}
                                        <li>{alternative}</li>
                                    {/each}
                                </ul>
                            </div>
                        {/if}
                    </div>
                </li>
            {/each}
        </ul>
    {/if}
    
    <!-- Previous Treatment -->
    {#if previousTreatment.length > 0}
        <h4 class="section-title-sub">{$t('report.previous-treatment')}</h4>
        <ul class="list-items">
            {#each previousTreatment as prevTreat}
                <li class="panel previous-treatment-item">
                    <div class="previous-header">
                        <div class="previous-main">
                            <h5 class="previous-procedure">{prevTreat.procedure}</h5>
                            <span class="previous-date">{formatDate(prevTreat.date)}</span>
                        </div>
                        
                        {#if prevTreat.provider}
                            <span class="previous-provider">{prevTreat.provider}</span>
                        {/if}
                    </div>
                    
                    <div class="previous-details">
                        {#if prevTreat.tooth}
                            <div class="detail-item">
                                <span class="label">{$t('report.tooth')}:</span>
                                <span class="value">{formatToothNumber(prevTreat.tooth)}</span>
                            </div>
                        {/if}
                        
                        {#if prevTreat.outcome}
                            <div class="detail-item">
                                <span class="label">{$t('report.outcome')}:</span>
                                <span class="value">{prevTreat.outcome}</span>
                            </div>
                        {/if}
                        
                        {#if prevTreat.complications}
                            <div class="detail-item">
                                <span class="label">{$t('report.complications')}:</span>
                                <span class="value complications-text">{prevTreat.complications}</span>
                            </div>
                        {/if}
                    </div>
                </li>
            {/each}
        </ul>
    {/if}
    
    <!-- Follow-up -->
    {#if Object.keys(followUp).length > 0}
        <h4 class="section-title-sub">{$t('report.follow-up')}</h4>
        <div class="page -block">
            <div class="followup-info">
                {#if followUp.nextAppointment}
                    <div class="detail-item">
                        <span class="label">{$t('report.next-appointment')}:</span>
                        <span class="value next-appointment">{formatDate(followUp.nextAppointment)}</span>
                    </div>
                {/if}
                
                {#if followUp.recallInterval}
                    <div class="detail-item">
                        <span class="label">{$t('report.recall-interval')}:</span>
                        <span class="value">{followUp.recallInterval}</span>
                    </div>
                {/if}
                
                {#if followUp.instructions}
                    <div class="followup-instructions">
                        <span class="label">{$t('report.instructions')}:</span>
                        <p class="instructions-text">{followUp.instructions}</p>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
    
    <!-- Dental Provider -->
    {#if dentalProvider}
        <h4 class="section-title-sub">{$t('report.dental-provider')}</h4>
        <div class="page -block">
            <div class="provider-info">
                <span class="provider-name">{dentalProvider.name}</span>
                {#if dentalProvider.title}
                    <span class="provider-title">{dentalProvider.title}</span>
                {/if}
                {#if dentalProvider.specialty}
                    <span class="provider-specialty">{dentalProvider.specialty}</span>
                {/if}
                {#if dentalProvider.license}
                    <span class="provider-license">{$t('report.license')}: {dentalProvider.license}</span>
                {/if}
            </div>
        </div>
    {/if}
    
    <!-- Additional Notes -->
    {#if notes}
        <h4 class="section-title-sub">{$t('report.additional-notes')}</h4>
        <div class="page -block">
            <div class="notes-content">
                <p class="notes-text">{notes}</p>
            </div>
        </div>
    {/if}
    
{:else if data}
    <h3 class="h3 heading -sticky">{$t('report.dental-examination')}</h3>
    <div class="page -block">
        <p class="no-data">{$t('report.no-dental-data')}</p>
    </div>
{/if}

<style>
    .oral-exam-overview {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .teeth-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 1rem;
    }
    
    .tooth-item {
        border: 1px solid var(--color-border);
        border-radius: 0.5rem;
        padding: 1rem;
        background-color: var(--color-background-secondary);
        border-left-width: 4px;
    }
    
    .tooth-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.75rem;
    }
    
    .tooth-number {
        font-size: 1.2rem;
        font-weight: 700;
        color: var(--color-text-primary);
        background-color: var(--color-primary-light);
        color: var(--color-primary-dark);
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
    }
    
    .tooth-name {
        font-size: 0.9rem;
        color: var(--color-text-secondary);
        font-weight: 500;
    }
    
    .tooth-details {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .tooth-condition {
        margin-bottom: 0.5rem;
    }
    
    .condition-badge {
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
        text-transform: uppercase;
    }
    
    .tooth-healthy {
        border-left-color: var(--color-success);
    }
    
    .tooth-healthy .condition-badge {
        background-color: var(--color-success-light);
        color: var(--color-success-dark);
    }
    
    .tooth-carious {
        border-left-color: var(--color-danger);
    }
    
    .tooth-carious .condition-badge {
        background-color: var(--color-danger-light);
        color: var(--color-danger-dark);
    }
    
    .tooth-restored {
        border-left-color: var(--color-info);
    }
    
    .tooth-restored .condition-badge {
        background-color: var(--color-info-light);
        color: var(--color-info-dark);
    }
    
    .tooth-crowned {
        border-left-color: var(--color-warning);
    }
    
    .tooth-crowned .condition-badge {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
    }
    
    .tooth-root-canal {
        border-left-color: var(--color-secondary);
    }
    
    .tooth-root-canal .condition-badge {
        background-color: var(--color-secondary-light);
        color: var(--color-secondary-dark);
    }
    
    .tooth-extracted {
        border-left-color: var(--color-danger);
    }
    
    .tooth-extracted .condition-badge {
        background-color: var(--color-danger-light);
        color: var(--color-danger-dark);
    }
    
    .tooth-impacted {
        border-left-color: var(--color-warning);
    }
    
    .tooth-impacted .condition-badge {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
    }
    
    .tooth-fractured {
        border-left-color: var(--color-danger);
    }
    
    .tooth-fractured .condition-badge {
        background-color: var(--color-danger-light);
        color: var(--color-danger-dark);
    }
    
    .tooth-mobile {
        border-left-color: var(--color-warning);
    }
    
    .tooth-mobile .condition-badge {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
    }
    
    .tooth-sensitive {
        border-left-color: var(--color-info);
    }
    
    .tooth-sensitive .condition-badge {
        background-color: var(--color-info-light);
        color: var(--color-info-dark);
    }
    
    .tooth-general {
        border-left-color: var(--color-secondary);
    }
    
    .tooth-general .condition-badge {
        background-color: var(--color-secondary-light);
        color: var(--color-secondary-dark);
    }
    
    .tooth-surfaces {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }
    
    .surfaces-label {
        font-size: 0.9rem;
        color: var(--color-text-secondary);
        font-weight: 500;
    }
    
    .surfaces-list {
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem;
    }
    
    .surface-tag {
        background-color: var(--color-primary-light);
        color: var(--color-primary-dark);
        padding: 0.125rem 0.375rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
    }
    
    .tooth-mobility,
    .tooth-restoration,
    .tooth-notes {
        display: flex;
        gap: 0.5rem;
        align-items: flex-start;
    }
    
    .mobility-label,
    .restoration-label,
    .notes-label {
        font-size: 0.9rem;
        color: var(--color-text-secondary);
        font-weight: 500;
        min-width: 60px;
    }
    
    .mobility-value,
    .restoration-value,
    .notes-value {
        font-size: 0.9rem;
        color: var(--color-text-primary);
        flex: 1;
    }
    
    .tooth-probing {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }
    
    .probing-label {
        font-size: 0.9rem;
        color: var(--color-text-secondary);
        font-weight: 500;
    }
    
    .probing-values {
        display: flex;
        gap: 0.25rem;
    }
    
    .probe-value {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
        padding: 0.125rem 0.375rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
    }
    
    .periodontal-info {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .perio-overall {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.5rem;
        padding: 0.5rem;
        background-color: var(--color-background-secondary);
        border-radius: 0.25rem;
    }
    
    .perio-condition {
        font-weight: 600;
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        text-transform: uppercase;
        font-size: 0.9rem;
    }
    
    .perio-healthy {
        background-color: var(--color-success-light);
        color: var(--color-success-dark);
    }
    
    .perio-gingivitis {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
    }
    
    .perio-mild {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
    }
    
    .perio-moderate {
        background-color: var(--color-danger-light);
        color: var(--color-danger-dark);
    }
    
    .perio-severe {
        background-color: var(--color-danger);
        color: white;
    }
    
    .perio-advanced {
        background-color: var(--color-danger);
        color: white;
    }
    
    .bleeding-indicator {
        color: var(--color-danger-dark);
        font-weight: 600;
    }
    
    .occlusion-info {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .bruxism-indicator {
        color: var(--color-warning-dark);
        font-weight: 600;
    }
    
    .hygiene-assessment {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }
    
    .hygiene-overall {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.5rem;
        padding: 0.5rem;
        background-color: var(--color-background-secondary);
        border-radius: 0.25rem;
    }
    
    .hygiene-value {
        font-weight: 600;
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        text-transform: uppercase;
        font-size: 0.9rem;
    }
    
    .hygiene-excellent {
        background-color: var(--color-success-light);
        color: var(--color-success-dark);
    }
    
    .hygiene-good {
        background-color: var(--color-success-light);
        color: var(--color-success-dark);
    }
    
    .hygiene-fair {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
    }
    
    .hygiene-poor {
        background-color: var(--color-danger-light);
        color: var(--color-danger-dark);
    }
    
    .hygiene-recommendations {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .recommendations-list {
        margin: 0;
        padding-left: 1.5rem;
    }
    
    .recommendations-list li {
        margin-bottom: 0.25rem;
        color: var(--color-text-primary);
    }
    
    .radiograph-item {
        border-left-color: var(--color-info);
    }
    
    .radiograph-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 0.75rem;
        gap: 1rem;
    }
    
    .radiograph-main {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        flex: 1;
    }
    
    .radiograph-type {
        font-size: 1.1rem;
        font-weight: 600;
        margin: 0;
        color: var(--color-text-primary);
    }
    
    .radiograph-date {
        color: var(--color-text-secondary);
        font-size: 0.9rem;
    }
    
    .quality-badge {
        background-color: var(--color-info-light);
        color: var(--color-info-dark);
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
        text-transform: uppercase;
    }
    
    .radiograph-details {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .radiograph-findings {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }
    
    .findings-text {
        margin: 0;
        color: var(--color-text-primary);
        line-height: 1.5;
    }
    
    .radiograph-pathology {
        display: flex;
        gap: 0.5rem;
        align-items: flex-start;
    }
    
    .pathology-text {
        color: var(--color-danger-dark);
        font-weight: 500;
    }
    
    .diagnosis-item {
        border-left-color: var(--color-primary);
    }
    
    .diagnosis-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.75rem;
        gap: 1rem;
    }
    
    .diagnosis-name {
        font-size: 1.1rem;
        font-weight: 600;
        color: var(--color-text-primary);
    }
    
    .severity-badge {
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
        text-transform: uppercase;
    }
    
    .severity-mild {
        background-color: var(--color-info-light);
        color: var(--color-info-dark);
    }
    
    .severity-moderate {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
    }
    
    .severity-severe {
        background-color: var(--color-danger-light);
        color: var(--color-danger-dark);
    }
    
    .diagnosis-details {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .diagnosis-description {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }
    
    .description-text {
        margin: 0;
        color: var(--color-text-primary);
        line-height: 1.5;
    }
    
    .treatment-item {
        border-left-color: var(--color-warning);
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
    
    .treatment-procedure {
        font-size: 1.1rem;
        font-weight: 600;
        margin: 0;
        color: var(--color-text-primary);
    }
    
    .treatment-tooth {
        color: var(--color-text-secondary);
        font-size: 0.9rem;
        font-weight: 500;
    }
    
    .treatment-badges {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        align-items: flex-end;
    }
    
    .priority-badge,
    .urgency-badge {
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
        text-transform: uppercase;
        white-space: nowrap;
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
    
    .urgency-routine {
        background-color: var(--color-info-light);
        color: var(--color-info-dark);
    }
    
    .urgency-urgent {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
    }
    
    .urgency-emergency {
        background-color: var(--color-danger-light);
        color: var(--color-danger-dark);
    }
    
    .treatment-details {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .cost-value {
        color: var(--color-success-dark);
        font-weight: 600;
    }
    
    .alternatives-section {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .alternatives-list {
        margin: 0;
        padding-left: 1.5rem;
    }
    
    .alternatives-list li {
        margin-bottom: 0.25rem;
        color: var(--color-text-primary);
    }
    
    .previous-treatment-item {
        border-left-color: var(--color-secondary);
    }
    
    .previous-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 0.75rem;
        gap: 1rem;
    }
    
    .previous-main {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        flex: 1;
    }
    
    .previous-procedure {
        font-size: 1.1rem;
        font-weight: 600;
        margin: 0;
        color: var(--color-text-primary);
    }
    
    .previous-date {
        color: var(--color-text-secondary);
        font-size: 0.9rem;
    }
    
    .previous-provider {
        color: var(--color-text-secondary);
        font-size: 0.9rem;
        font-style: italic;
    }
    
    .previous-details {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .complications-text {
        color: var(--color-danger-dark);
        font-weight: 500;
    }
    
    .followup-info {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .next-appointment {
        color: var(--color-warning-dark);
        font-weight: 600;
    }
    
    .followup-instructions {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }
    
    .instructions-text {
        margin: 0;
        color: var(--color-text-primary);
        line-height: 1.5;
    }
    
    .provider-info {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }
    
    .provider-name {
        font-weight: 600;
        color: var(--color-text-primary);
    }
    
    .provider-title,
    .provider-specialty,
    .provider-license {
        color: var(--color-text-secondary);
        font-size: 0.9rem;
    }
    
    .notes-content {
        background-color: var(--color-background-secondary);
        padding: 1rem;
        border-radius: 0.5rem;
    }
    
    .notes-text {
        margin: 0;
        color: var(--color-text-secondary);
        line-height: 1.5;
        font-style: italic;
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
    
    /* Panel severity coloring */
    .severity-mild {
        border-left-color: var(--color-info);
    }
    
    .severity-moderate {
        border-left-color: var(--color-warning);
    }
    
    .severity-severe {
        border-left-color: var(--color-danger);
    }
    
    /* Priority-based panel coloring */
    .priority-low {
        border-left-color: var(--color-info);
    }
    
    .priority-medium {
        border-left-color: var(--color-warning);
    }
    
    .priority-high {
        border-left-color: var(--color-danger);
    }
    
    .priority-urgent {
        border-left-color: var(--color-danger);
        border-left-width: 4px;
    }
</style>