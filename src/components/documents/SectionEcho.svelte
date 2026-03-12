<script lang="ts">
    import { t } from '$lib/i18n';

    interface Props {
        data: any;
        document?: any;
        key?: string;
    }

    let { data, document, key }: Props = $props();
    
    let hasEcho = $derived(data && data.hasEcho);
    
    let studyType = $derived(data?.studyType || '');
    let echoDateTime = $derived(data?.echoDateTime);
    let leftVentricle = $derived(data?.leftVentricle || {});
    let rightVentricle = $derived(data?.rightVentricle || {});
    let leftAtrium = $derived(data?.leftAtrium || {});
    let rightAtrium = $derived(data?.rightAtrium || {});
    let valves = $derived(data?.valves || {});
    let pericardium = $derived(data?.pericardium || {});
    let aorta = $derived(data?.aorta || {});
    let otherFindings = $derived(data?.otherFindings || []);
    let interpretingCardiologist = $derived(data?.interpretingCardiologist);
    let echoTechnician = $derived(data?.echoTechnician);
    let clinicalContext = $derived(data?.clinicalContext || '');
    let technicalQuality = $derived(data?.technicalQuality || {});
    let comparison = $derived(data?.comparison || {});
    let clinicalIndication = $derived(data?.clinicalIndication || '');
    let summary = $derived(data?.summary || '');
    let recommendedFollowUp = $derived(data?.recommendedFollowUp || []);
    
    function getStudyTypeClass(studyType: string): string {
        const studyTypeClasses: Record<string, string> = {
            'transthoracic': 'study-tte',
            'transesophageal': 'study-tee',
            'stress_echo': 'study-stress',
            'contrast_echo': 'study-contrast',
            '3d_echo': 'study-3d',
            'dobutamine_stress': 'study-dobutamine',
            'exercise_stress': 'study-exercise'
        };
        return studyTypeClasses[studyType] || 'study-other';
    }
    
    function getEFClass(ef: number): string {
        if (ef >= 55) return 'ef-normal';
        if (ef >= 45) return 'ef-mild';
        if (ef >= 35) return 'ef-moderate';
        return 'ef-severe';
    }
    
    function getSeverityClass(severity: string): string {
        const severityClasses: Record<string, string> = {
            'none': 'severity-none',
            'trace': 'severity-trace',
            'mild': 'severity-mild',
            'moderate': 'severity-moderate',
            'severe': 'severity-severe'
        };
        return severityClasses[severity] || 'severity-unknown';
    }
    
    function getChamberSizeClass(size: string): string {
        const sizeClasses: Record<string, string> = {
            'normal': 'size-normal',
            'mildly_dilated': 'size-mild',
            'moderately_dilated': 'size-moderate',
            'severely_dilated': 'size-severe'
        };
        return sizeClasses[size] || 'size-unknown';
    }
    
    function getFunctionClass(func: string): string {
        const functionClasses: Record<string, string> = {
            'normal': 'function-normal',
            'mildly_reduced': 'function-mild',
            'moderately_reduced': 'function-moderate',
            'severely_reduced': 'function-severe'
        };
        return functionClasses[func] || 'function-unknown';
    }
    
    function getDiastolicGradeClass(grade: string): string {
        const gradeClasses: Record<string, string> = {
            'normal': 'diastolic-normal',
            'grade_1': 'diastolic-grade1',
            'grade_2': 'diastolic-grade2',
            'grade_3': 'diastolic-grade3',
            'indeterminate': 'diastolic-indeterminate'
        };
        return gradeClasses[grade] || 'diastolic-unknown';
    }
    
    function getEffusionClass(effusion: string): string {
        const effusionClasses: Record<string, string> = {
            'none': 'effusion-none',
            'trivial': 'effusion-trivial',
            'small': 'effusion-small',
            'moderate': 'effusion-moderate',
            'large': 'effusion-large'
        };
        return effusionClasses[effusion] || 'effusion-unknown';
    }
    
    function getQualityClass(quality: string): string {
        const qualityClasses: Record<string, string> = {
            'excellent': 'quality-excellent',
            'good': 'quality-good',
            'fair': 'quality-fair',
            'poor': 'quality-poor',
            'suboptimal': 'quality-suboptimal'
        };
        return qualityClasses[quality] || 'quality-unknown';
    }
    
    function getSignificanceClass(significance: string): string {
        const significanceClasses: Record<string, string> = {
            'normal_variant': 'significance-normal',
            'mild': 'significance-mild',
            'moderate': 'significance-moderate',
            'severe': 'significance-severe',
            'clinical_correlation': 'significance-clinical'
        };
        return significanceClasses[significance] || 'significance-unknown';
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
    
    function formatMeasurement(value: number, unit: string): string {
        if (value === undefined || value === null) return '';
        return `${value} ${unit}`;
    }
</script>

{#if hasEcho}
    <h3 class="h3 heading -sticky">{$t('report.echocardiogram')}</h3>
    
    <!-- Study Information -->
    <div class="page -block">
        <div class="study-header">
            {#if studyType}
                <div class="study-type {getStudyTypeClass(studyType)}">
                    {$t(`medical.enums.echo_study_types.${studyType}`)}
                </div>
            {/if}
            {#if echoDateTime}
                <div class="study-datetime">{formatDate(echoDateTime)}</div>
            {/if}
        </div>
        
        {#if clinicalIndication}
            <div class="clinical-indication">
                <span class="label">{$t('report.clinical-indication')}:</span>
                <span class="value">{clinicalIndication}</span>
            </div>
        {/if}
        
        {#if clinicalContext}
            <div class="clinical-context">
                <span class="label">{$t('report.clinical-context')}:</span>
                <span class="value">{clinicalContext}</span>
            </div>
        {/if}
    </div>
    
    <!-- Left Ventricle -->
    {#if Object.keys(leftVentricle).length > 0}
        <h4 class="section-title-sub">{$t('report.left-ventricle')}</h4>
        <div class="page -block">
            <div class="lv-section">
                <!-- Dimensions -->
                {#if leftVentricle.dimensions}
                    <div class="dimensions-grid">
                        <h5 class="subsection-title">{$t('report.dimensions')}</h5>
                        <div class="measurements-grid">
                            {#if leftVentricle.dimensions.lvedd}
                                <div class="measurement-item">
                                    <span class="measurement-label">{$t('report.lvedd')}:</span>
                                    <span class="measurement-value">{formatMeasurement(leftVentricle.dimensions.lvedd, 'mm')}</span>
                                </div>
                            {/if}
                            {#if leftVentricle.dimensions.lvesd}
                                <div class="measurement-item">
                                    <span class="measurement-label">{$t('report.lvesd')}:</span>
                                    <span class="measurement-value">{formatMeasurement(leftVentricle.dimensions.lvesd, 'mm')}</span>
                                </div>
                            {/if}
                            {#if leftVentricle.dimensions.lvpwt}
                                <div class="measurement-item">
                                    <span class="measurement-label">{$t('report.lvpwt')}:</span>
                                    <span class="measurement-value">{formatMeasurement(leftVentricle.dimensions.lvpwt, 'mm')}</span>
                                </div>
                            {/if}
                            {#if leftVentricle.dimensions.ivst}
                                <div class="measurement-item">
                                    <span class="measurement-label">{$t('report.ivst')}:</span>
                                    <span class="measurement-value">{formatMeasurement(leftVentricle.dimensions.ivst, 'mm')}</span>
                                </div>
                            {/if}
                            {#if leftVentricle.dimensions.lvedv}
                                <div class="measurement-item">
                                    <span class="measurement-label">{$t('report.lvedv')}:</span>
                                    <span class="measurement-value">{formatMeasurement(leftVentricle.dimensions.lvedv, 'mL')}</span>
                                </div>
                            {/if}
                            {#if leftVentricle.dimensions.lvesv}
                                <div class="measurement-item">
                                    <span class="measurement-label">{$t('report.lvesv')}:</span>
                                    <span class="measurement-value">{formatMeasurement(leftVentricle.dimensions.lvesv, 'mL')}</span>
                                </div>
                            {/if}
                        </div>
                    </div>
                {/if}
                
                <!-- Systolic Function -->
                {#if leftVentricle.systolicFunction}
                    <div class="systolic-function">
                        <h5 class="subsection-title">{$t('report.systolic-function')}</h5>
                        <div class="function-details">
                            {#if leftVentricle.systolicFunction.ejectionFraction}
                                <div class="ef-display">
                                    <span class="ef-label">{$t('report.ejection-fraction')}:</span>
                                    <span class="ef-value {getEFClass(leftVentricle.systolicFunction.ejectionFraction)}">
                                        {leftVentricle.systolicFunction.ejectionFraction}%
                                    </span>
                                    {#if leftVentricle.systolicFunction.efMethod}
                                        <span class="ef-method">({$t(`medical.enums.ef_methods.${leftVentricle.systolicFunction.efMethod}`)})</span>
                                    {/if}
                                </div>
                            {/if}
                            
                            {#if leftVentricle.systolicFunction.wallMotion}
                                <div class="wall-motion">
                                    <span class="label">{$t('report.wall-motion')}:</span>
                                    <span class="value">{$t(`medical.enums.wall_motion.${leftVentricle.systolicFunction.wallMotion}`)}</span>
                                </div>
                            {/if}
                            
                            {#if leftVentricle.systolicFunction.wallMotionAbnormalities?.length > 0}
                                <div class="wall-motion-abnormalities">
                                    <span class="label">{$t('report.wall-motion-abnormalities')}:</span>
                                    <ul class="abnormalities-list">
                                        {#each leftVentricle.systolicFunction.wallMotionAbnormalities as abnormality}
                                            <li class="abnormality-item">
                                                <span class="segment">{abnormality.segment}:</span>
                                                <span class="abnormality-type">{$t(`medical.enums.wall_motion.${abnormality.abnormality}`)}</span>
                                            </li>
                                        {/each}
                                    </ul>
                                </div>
                            {/if}
                        </div>
                    </div>
                {/if}
                
                <!-- Diastolic Function -->
                {#if leftVentricle.diastolicFunction}
                    <div class="diastolic-function">
                        <h5 class="subsection-title">{$t('report.diastolic-function')}</h5>
                        <div class="diastolic-details">
                            {#if leftVentricle.diastolicFunction.grade}
                                <div class="diastolic-grade">
                                    <span class="label">{$t('report.diastolic-grade')}:</span>
                                    <span class="grade-value {getDiastolicGradeClass(leftVentricle.diastolicFunction.grade)}">
                                        {$t(`medical.enums.diastolic_grades.${leftVentricle.diastolicFunction.grade}`)}
                                    </span>
                                </div>
                            {/if}
                            
                            <div class="diastolic-measurements">
                                {#if leftVentricle.diastolicFunction.eVelocity}
                                    <div class="measurement-item">
                                        <span class="measurement-label">{$t('report.e-velocity')}:</span>
                                        <span class="measurement-value">{formatMeasurement(leftVentricle.diastolicFunction.eVelocity, 'm/s')}</span>
                                    </div>
                                {/if}
                                {#if leftVentricle.diastolicFunction.aVelocity}
                                    <div class="measurement-item">
                                        <span class="measurement-label">{$t('report.a-velocity')}:</span>
                                        <span class="measurement-value">{formatMeasurement(leftVentricle.diastolicFunction.aVelocity, 'm/s')}</span>
                                    </div>
                                {/if}
                                {#if leftVentricle.diastolicFunction.eaRatio}
                                    <div class="measurement-item">
                                        <span class="measurement-label">{$t('report.ea-ratio')}:</span>
                                        <span class="measurement-value">{leftVentricle.diastolicFunction.eaRatio}</span>
                                    </div>
                                {/if}
                                {#if leftVentricle.diastolicFunction.ePrimeVelocity}
                                    <div class="measurement-item">
                                        <span class="measurement-label">{$t('report.e-prime-velocity')}:</span>
                                        <span class="measurement-value">{formatMeasurement(leftVentricle.diastolicFunction.ePrimeVelocity, 'cm/s')}</span>
                                    </div>
                                {/if}
                                {#if leftVentricle.diastolicFunction.eeRatio}
                                    <div class="measurement-item">
                                        <span class="measurement-label">{$t('report.ee-ratio')}:</span>
                                        <span class="measurement-value">{leftVentricle.diastolicFunction.eeRatio}</span>
                                    </div>
                                {/if}
                                {#if leftVentricle.diastolicFunction.decelerationTime}
                                    <div class="measurement-item">
                                        <span class="measurement-label">{$t('report.deceleration-time')}:</span>
                                        <span class="measurement-value">{formatMeasurement(leftVentricle.diastolicFunction.decelerationTime, 'ms')}</span>
                                    </div>
                                {/if}
                            </div>
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
    
    <!-- Right Ventricle -->
    {#if Object.keys(rightVentricle).length > 0}
        <h4 class="section-title-sub">{$t('report.right-ventricle')}</h4>
        <div class="page -block">
            <div class="rv-details">
                {#if rightVentricle.size}
                    <div class="detail-item">
                        <span class="label">{$t('report.size')}:</span>
                        <span class="value {getChamberSizeClass(rightVentricle.size)}">
                            {$t(`medical.enums.chamber_sizes.${rightVentricle.size}`)}
                        </span>
                    </div>
                {/if}
                {#if rightVentricle.function}
                    <div class="detail-item">
                        <span class="label">{$t('report.function')}:</span>
                        <span class="value {getFunctionClass(rightVentricle.function)}">
                            {$t(`medical.enums.rv_function.${rightVentricle.function}`)}
                        </span>
                    </div>
                {/if}
                {#if rightVentricle.tapse}
                    <div class="detail-item">
                        <span class="label">{$t('report.tapse')}:</span>
                        <span class="value">{formatMeasurement(rightVentricle.tapse, 'mm')}</span>
                    </div>
                {/if}
                {#if rightVentricle.rvsp}
                    <div class="detail-item">
                        <span class="label">{$t('report.rvsp')}:</span>
                        <span class="value">{formatMeasurement(rightVentricle.rvsp, 'mmHg')}</span>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
    
    <!-- Atria -->
    {#if Object.keys(leftAtrium).length > 0 || Object.keys(rightAtrium).length > 0}
        <h4 class="section-title-sub">{$t('report.atria')}</h4>
        <div class="page -block">
            <div class="atria-grid">
                {#if Object.keys(leftAtrium).length > 0}
                    <div class="atrium-section">
                        <h5 class="atrium-title">{$t('report.left-atrium')}</h5>
                        <div class="atrium-details">
                            {#if leftAtrium.size}
                                <div class="detail-item">
                                    <span class="label">{$t('report.size')}:</span>
                                    <span class="value {getChamberSizeClass(leftAtrium.size)}">
                                        {$t(`medical.enums.chamber_sizes.${leftAtrium.size}`)}
                                    </span>
                                </div>
                            {/if}
                            {#if leftAtrium.volume}
                                <div class="detail-item">
                                    <span class="label">{$t('report.volume')}:</span>
                                    <span class="value">{formatMeasurement(leftAtrium.volume, 'mL')}</span>
                                </div>
                            {/if}
                            {#if leftAtrium.volumeIndex}
                                <div class="detail-item">
                                    <span class="label">{$t('report.volume-index')}:</span>
                                    <span class="value">{formatMeasurement(leftAtrium.volumeIndex, 'mL/m²')}</span>
                                </div>
                            {/if}
                        </div>
                    </div>
                {/if}
                
                {#if Object.keys(rightAtrium).length > 0}
                    <div class="atrium-section">
                        <h5 class="atrium-title">{$t('report.right-atrium')}</h5>
                        <div class="atrium-details">
                            {#if rightAtrium.size}
                                <div class="detail-item">
                                    <span class="label">{$t('report.size')}:</span>
                                    <span class="value {getChamberSizeClass(rightAtrium.size)}">
                                        {$t(`medical.enums.chamber_sizes.${rightAtrium.size}`)}
                                    </span>
                                </div>
                            {/if}
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
    
    <!-- Valves -->
    {#if Object.keys(valves).length > 0}
        <h4 class="section-title-sub">{$t('report.valves')}</h4>
        <div class="page -block">
            <div class="valves-grid">
                {#if valves.mitral}
                    <div class="valve-section">
                        <h5 class="valve-title">{$t('report.mitral-valve')}</h5>
                        <div class="valve-details">
                            {#if valves.mitral.regurgitation}
                                <div class="detail-item">
                                    <span class="label">{$t('report.regurgitation')}:</span>
                                    <span class="value {getSeverityClass(valves.mitral.regurgitation)}">
                                        {$t(`medical.enums.valve_severity.${valves.mitral.regurgitation}`)}
                                    </span>
                                </div>
                            {/if}
                            {#if valves.mitral.stenosis}
                                <div class="detail-item">
                                    <span class="label">{$t('report.stenosis')}:</span>
                                    <span class="value {getSeverityClass(valves.mitral.stenosis)}">
                                        {$t(`medical.enums.valve_severity.${valves.mitral.stenosis}`)}
                                    </span>
                                </div>
                            {/if}
                            {#if valves.mitral.meanGradient}
                                <div class="detail-item">
                                    <span class="label">{$t('report.mean-gradient')}:</span>
                                    <span class="value">{formatMeasurement(valves.mitral.meanGradient, 'mmHg')}</span>
                                </div>
                            {/if}
                            {#if valves.mitral.valveArea}
                                <div class="detail-item">
                                    <span class="label">{$t('report.valve-area')}:</span>
                                    <span class="value">{formatMeasurement(valves.mitral.valveArea, 'cm²')}</span>
                                </div>
                            {/if}
                            {#if valves.mitral.morphology}
                                <div class="detail-item">
                                    <span class="label">{$t('report.morphology')}:</span>
                                    <span class="value">{valves.mitral.morphology}</span>
                                </div>
                            {/if}
                        </div>
                    </div>
                {/if}
                
                {#if valves.aortic}
                    <div class="valve-section">
                        <h5 class="valve-title">{$t('report.aortic-valve')}</h5>
                        <div class="valve-details">
                            {#if valves.aortic.regurgitation}
                                <div class="detail-item">
                                    <span class="label">{$t('report.regurgitation')}:</span>
                                    <span class="value {getSeverityClass(valves.aortic.regurgitation)}">
                                        {$t(`medical.enums.valve_severity.${valves.aortic.regurgitation}`)}
                                    </span>
                                </div>
                            {/if}
                            {#if valves.aortic.stenosis}
                                <div class="detail-item">
                                    <span class="label">{$t('report.stenosis')}:</span>
                                    <span class="value {getSeverityClass(valves.aortic.stenosis)}">
                                        {$t(`medical.enums.valve_severity.${valves.aortic.stenosis}`)}
                                    </span>
                                </div>
                            {/if}
                            {#if valves.aortic.peakVelocity}
                                <div class="detail-item">
                                    <span class="label">{$t('report.peak-velocity')}:</span>
                                    <span class="value">{formatMeasurement(valves.aortic.peakVelocity, 'm/s')}</span>
                                </div>
                            {/if}
                            {#if valves.aortic.meanGradient}
                                <div class="detail-item">
                                    <span class="label">{$t('report.mean-gradient')}:</span>
                                    <span class="value">{formatMeasurement(valves.aortic.meanGradient, 'mmHg')}</span>
                                </div>
                            {/if}
                            {#if valves.aortic.valveArea}
                                <div class="detail-item">
                                    <span class="label">{$t('report.valve-area')}:</span>
                                    <span class="value">{formatMeasurement(valves.aortic.valveArea, 'cm²')}</span>
                                </div>
                            {/if}
                            {#if valves.aortic.morphology}
                                <div class="detail-item">
                                    <span class="label">{$t('report.morphology')}:</span>
                                    <span class="value">{valves.aortic.morphology}</span>
                                </div>
                            {/if}
                        </div>
                    </div>
                {/if}
                
                {#if valves.tricuspid}
                    <div class="valve-section">
                        <h5 class="valve-title">{$t('report.tricuspid-valve')}</h5>
                        <div class="valve-details">
                            {#if valves.tricuspid.regurgitation}
                                <div class="detail-item">
                                    <span class="label">{$t('report.regurgitation')}:</span>
                                    <span class="value {getSeverityClass(valves.tricuspid.regurgitation)}">
                                        {$t(`medical.enums.valve_severity.${valves.tricuspid.regurgitation}`)}
                                    </span>
                                </div>
                            {/if}
                            {#if valves.tricuspid.peakVelocity}
                                <div class="detail-item">
                                    <span class="label">{$t('report.peak-velocity')}:</span>
                                    <span class="value">{formatMeasurement(valves.tricuspid.peakVelocity, 'm/s')}</span>
                                </div>
                            {/if}
                        </div>
                    </div>
                {/if}
                
                {#if valves.pulmonary}
                    <div class="valve-section">
                        <h5 class="valve-title">{$t('report.pulmonary-valve')}</h5>
                        <div class="valve-details">
                            {#if valves.pulmonary.regurgitation}
                                <div class="detail-item">
                                    <span class="label">{$t('report.regurgitation')}:</span>
                                    <span class="value {getSeverityClass(valves.pulmonary.regurgitation)}">
                                        {$t(`medical.enums.valve_severity.${valves.pulmonary.regurgitation}`)}
                                    </span>
                                </div>
                            {/if}
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
    
    <!-- Pericardium -->
    {#if Object.keys(pericardium).length > 0}
        <h4 class="section-title-sub">{$t('report.pericardium')}</h4>
        <div class="page -block">
            <div class="pericardium-details">
                {#if pericardium.effusion}
                    <div class="detail-item">
                        <span class="label">{$t('report.effusion')}:</span>
                        <span class="value {getEffusionClass(pericardium.effusion)}">
                            {$t(`medical.enums.effusion_sizes.${pericardium.effusion}`)}
                        </span>
                    </div>
                {/if}
                {#if pericardium.tamponade !== undefined}
                    <div class="detail-item">
                        <span class="label">{$t('report.tamponade')}:</span>
                        <span class="value {pericardium.tamponade ? 'tamponade-present' : 'tamponade-absent'}">
                            {pericardium.tamponade ? $t('report.present') : $t('report.absent')}
                        </span>
                    </div>
                {/if}
                {#if pericardium.thickness}
                    <div class="detail-item">
                        <span class="label">{$t('report.thickness')}:</span>
                        <span class="value">{pericardium.thickness}</span>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
    
    <!-- Aorta -->
    {#if Object.keys(aorta).length > 0}
        <h4 class="section-title-sub">{$t('report.aorta')}</h4>
        <div class="page -block">
            <div class="aorta-details">
                {#if aorta.root}
                    <div class="detail-item">
                        <span class="label">{$t('report.aortic-root')}:</span>
                        <span class="value">{formatMeasurement(aorta.root, 'mm')}</span>
                    </div>
                {/if}
                {#if aorta.ascendingAorta}
                    <div class="detail-item">
                        <span class="label">{$t('report.ascending-aorta')}:</span>
                        <span class="value">{formatMeasurement(aorta.ascendingAorta, 'mm')}</span>
                    </div>
                {/if}
                {#if aorta.abnormalities?.length > 0}
                    <div class="aortic-abnormalities">
                        <span class="label">{$t('report.abnormalities')}:</span>
                        <ul class="abnormalities-list">
                            {#each aorta.abnormalities as abnormality}
                                <li>{abnormality}</li>
                            {/each}
                        </ul>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
    
    <!-- Other Findings -->
    {#if otherFindings.length > 0}
        <h4 class="section-title-sub">{$t('report.other-findings')}</h4>
        <ul class="list-items">
            {#each otherFindings as finding}
                <li class="panel {getSignificanceClass(finding.significance)}">
                    <div class="finding-header">
                        <span class="finding-description">{finding.finding}</span>
                        {#if finding.significance}
                            <span class="significance-badge {getSignificanceClass(finding.significance)}">
                                {$t(`medical.enums.finding_significance.${finding.significance}`)}
                            </span>
                        {/if}
                    </div>
                    {#if finding.location}
                        <div class="finding-location">
                            <span class="label">{$t('report.location')}:</span>
                            <span class="value">{finding.location}</span>
                        </div>
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}
    
    <!-- Technical Quality -->
    {#if Object.keys(technicalQuality).length > 0}
        <h4 class="section-title-sub">{$t('report.technical-quality')}</h4>
        <div class="page -block">
            {#if technicalQuality.imageQuality}
                <div class="quality-assessment">
                    <span class="label">{$t('report.image-quality')}:</span>
                    <span class="quality-badge {getQualityClass(technicalQuality.imageQuality)}">
                        {$t(`medical.enums.image_quality.${technicalQuality.imageQuality}`)}
                    </span>
                </div>
            {/if}
            
            {#if technicalQuality.limitations?.length > 0}
                <div class="limitations-section">
                    <span class="label">{$t('report.limitations')}:</span>
                    <div class="limitations-list">
                        {#each technicalQuality.limitations as limitation}
                            <span class="limitation-tag">{$t(`medical.enums.echo_limitations.${limitation}`)}</span>
                        {/each}
                    </div>
                </div>
            {/if}
            
            {#if technicalQuality.completeness}
                <div class="completeness-section">
                    <span class="label">{$t('report.completeness')}:</span>
                    <span class="value">{$t(`medical.enums.study_completeness.${technicalQuality.completeness}`)}</span>
                </div>
            {/if}
        </div>
    {/if}
    
    <!-- Comparison with Prior Studies -->
    {#if Object.keys(comparison).length > 0}
        <h4 class="section-title-sub">{$t('report.comparison-with-prior')}</h4>
        <div class="page -block">
            <div class="comparison-details">
                {#if comparison.priorStudyDate}
                    <div class="detail-item">
                        <span class="label">{$t('report.prior-study-date')}:</span>
                        <span class="value">{formatDate(comparison.priorStudyDate)}</span>
                    </div>
                {/if}
                {#if comparison.interval}
                    <div class="detail-item">
                        <span class="label">{$t('report.interval')}:</span>
                        <span class="value">{comparison.interval}</span>
                    </div>
                {/if}
                {#if comparison.changes}
                    <div class="changes-section">
                        <span class="label">{$t('report.changes')}:</span>
                        <p class="changes-text">{comparison.changes}</p>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
    
    <!-- Summary -->
    {#if summary}
        <h4 class="section-title-sub">{$t('report.summary')}</h4>
        <div class="page -block">
            <div class="summary-text">{summary}</div>
        </div>
    {/if}
    
    <!-- Recommended Follow-up -->
    {#if recommendedFollowUp.length > 0}
        <h4 class="section-title-sub">{$t('report.recommended-follow-up')}</h4>
        <ul class="list-items">
            {#each recommendedFollowUp as followUp}
                <li class="panel followup-item">
                    <span class="followup-text">{followUp}</span>
                </li>
            {/each}
        </ul>
    {/if}
    
    <!-- Staff Information -->
    {#if interpretingCardiologist || echoTechnician}
        <h4 class="section-title-sub">{$t('report.staff-information')}</h4>
        <div class="page -block">
            <div class="staff-info">
                {#if interpretingCardiologist}
                    <div class="staff-member">
                        <span class="label">{$t('report.interpreting-cardiologist')}:</span>
                        <div class="staff-details">
                            <span class="staff-name">{interpretingCardiologist.name}</span>
                            {#if interpretingCardiologist.title}
                                <span class="staff-title">{interpretingCardiologist.title}</span>
                            {/if}
                            {#if interpretingCardiologist.department}
                                <span class="staff-department">{interpretingCardiologist.department}</span>
                            {/if}
                        </div>
                    </div>
                {/if}
                
                {#if echoTechnician}
                    <div class="staff-member">
                        <span class="label">{$t('report.echo-technician')}:</span>
                        <div class="staff-details">
                            <span class="staff-name">{echoTechnician.name}</span>
                            {#if echoTechnician.title}
                                <span class="staff-title">{echoTechnician.title}</span>
                            {/if}
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
    
{:else if data}
    <h3 class="h3 heading -sticky">{$t('report.echocardiogram')}</h3>
    <div class="page -block">
        <p class="no-data">{$t('report.no-echo-data')}</p>
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
    
    .study-tte { background-color: var(--color-info-light); color: var(--color-info-dark); }
    .study-tee { background-color: var(--color-primary-light); color: var(--color-primary-dark); }
    .study-stress { background-color: var(--color-warning-light); color: var(--color-warning-dark); }
    .study-contrast { background-color: var(--color-secondary-light); color: var(--color-secondary-dark); }
    .study-3d { background-color: var(--color-success-light); color: var(--color-success-dark); }
    .study-dobutamine { background-color: var(--color-danger-light); color: var(--color-danger-dark); }
    .study-exercise { background-color: var(--color-warning-light); color: var(--color-warning-dark); }
    .study-other { background-color: var(--color-secondary-light); color: var(--color-secondary-dark); }
    
    .study-datetime {
        color: var(--color-text-secondary);
        font-size: 0.9rem;
        white-space: nowrap;
    }
    
    .clinical-indication,
    .clinical-context {
        margin-bottom: 0.5rem;
    }
    
    .lv-section {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
    }
    
    .dimensions-grid {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    
    .subsection-title {
        font-size: 1rem;
        font-weight: 600;
        margin: 0;
        color: var(--color-text-primary);
        padding: 0.5rem 1rem;
    }
    
    .measurements-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 0.5rem;
    }
    
    .measurement-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.5rem;
        border-radius: 0.25rem;
        background-color: var(--color-background-secondary);
    }
    
    .measurement-label {
        font-weight: 500;
        color: var(--color-text-secondary);
    }
    
    .measurement-value {
        font-weight: 600;
        color: var(--color-text-primary);
    }
    
    .systolic-function,
    .diastolic-function {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    
    .function-details,
    .diastolic-details {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }
    
    .ef-display {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.75rem;
        background-color: var(--color-background-secondary);
        border-radius: 0.5rem;
    }
    
    .ef-label {
        font-weight: 500;
        color: var(--color-text-secondary);
    }
    
    .ef-value {
        font-size: 1.2rem;
        font-weight: 700;
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
    }
    
    .ef-normal { background-color: var(--color-success-light); color: var(--color-success-dark); }
    .ef-mild { background-color: var(--color-warning-light); color: var(--color-warning-dark); }
    .ef-moderate { background-color: var(--color-danger-light); color: var(--color-danger-dark); }
    .ef-severe { background-color: var(--color-danger); color: white; }
    
    .ef-method {
        color: var(--color-text-secondary);
        font-size: 0.9rem;
        font-style: italic;
    }
    
    .wall-motion {
        display: flex;
        gap: 0.5rem;
        align-items: center;
    }
    
    .wall-motion-abnormalities {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .abnormalities-list {
        margin: 0;
        padding: 0;
        list-style: none;
    }
    
    .abnormality-item {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        padding: 0.25rem;
        background-color: var(--color-background-secondary);
        border-radius: 0.25rem;
        margin-bottom: 0.25rem;
    }
    
    .segment {
        font-weight: 500;
        color: var(--color-text-secondary);
    }
    
    .abnormality-type {
        color: var(--color-danger-dark);
        font-weight: 500;
    }
    
    .diastolic-grade {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        padding: 0.5rem;
        background-color: var(--color-background-secondary);
        border-radius: 0.25rem;
    }
    
    .grade-value {
        font-weight: 600;
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
    }
    
    .diastolic-normal { background-color: var(--color-success-light); color: var(--color-success-dark); }
    .diastolic-grade1 { background-color: var(--color-warning-light); color: var(--color-warning-dark); }
    .diastolic-grade2 { background-color: var(--color-danger-light); color: var(--color-danger-dark); }
    .diastolic-grade3 { background-color: var(--color-danger); color: white; }
    .diastolic-indeterminate { background-color: var(--color-secondary-light); color: var(--color-secondary-dark); }
    
    .diastolic-measurements {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 0.5rem;
    }
    
    .rv-details {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .size-normal,
    .function-normal { color: var(--color-success-dark); }
    .size-mild,
    .function-mild { color: var(--color-warning-dark); }
    .size-moderate,
    .function-moderate { color: var(--color-danger-dark); }
    .size-severe,
    .function-severe { color: var(--color-danger); font-weight: 600; }
    
    .atria-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 1rem;
    }
    
    .atrium-section {
        padding: 1rem;
        background-color: var(--color-background-secondary);
        border-radius: 0.5rem;
    }
    
    .atrium-title {
        font-size: 1rem;
        font-weight: 600;
        margin: 0 0 0.75rem 0;
        color: var(--color-text-primary);
    }
    
    .atrium-details {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .valves-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 1rem;
    }
    
    .valve-section {
        padding: 1rem;
        background-color: var(--color-background-secondary);
        border-radius: 0.5rem;
    }
    
    .valve-title {
        font-size: 1rem;
        font-weight: 600;
        margin: 0 0 0.75rem 0;
        color: var(--color-text-primary);
    }
    
    .valve-details {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .severity-none { color: var(--color-success-dark); }
    .severity-trace { color: var(--color-success-dark); }
    .severity-mild { color: var(--color-warning-dark); }
    .severity-moderate { color: var(--color-danger-dark); }
    .severity-severe { color: var(--color-danger); font-weight: 600; }
    
    .pericardium-details,
    .aorta-details {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .effusion-none { color: var(--color-success-dark); }
    .effusion-trivial { color: var(--color-success-dark); }
    .effusion-small { color: var(--color-warning-dark); }
    .effusion-moderate { color: var(--color-danger-dark); }
    .effusion-large { color: var(--color-danger); font-weight: 600; }
    
    .tamponade-present { color: var(--color-danger); font-weight: 600; }
    .tamponade-absent { color: var(--color-success-dark); }
    
    .aortic-abnormalities {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .aortic-abnormalities .abnormalities-list {
        margin-left: 1rem;
    }
    
    .aortic-abnormalities .abnormalities-list li {
        margin-bottom: 0.25rem;
        color: var(--color-danger-dark);
    }
    
    .finding-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 0.5rem;
        gap: 1rem;
    }
    
    .finding-description {
        font-weight: 500;
        color: var(--color-text-primary);
        flex: 1;
    }
    
    .significance-badge {
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
        text-transform: uppercase;
        white-space: nowrap;
    }
    
    .significance-normal { background-color: var(--color-success-light); color: var(--color-success-dark); }
    .significance-mild { background-color: var(--color-warning-light); color: var(--color-warning-dark); }
    .significance-moderate { background-color: var(--color-danger-light); color: var(--color-danger-dark); }
    .significance-severe { background-color: var(--color-danger); color: white; }
    .significance-clinical { background-color: var(--color-info-light); color: var(--color-info-dark); }
    
    .finding-location {
        display: flex;
        gap: 0.5rem;
        margin-top: 0.5rem;
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
    .quality-fair { background-color: var(--color-warning-light); color: var(--color-warning-dark); }
    .quality-poor { background-color: var(--color-danger-light); color: var(--color-danger-dark); }
    .quality-suboptimal { background-color: var(--color-danger-light); color: var(--color-danger-dark); }
    
    .limitations-section {
        margin-bottom: 0.75rem;
    }
    
    .limitations-list {
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem;
        margin-top: 0.25rem;
    }
    
    .limitation-tag {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
        padding: 0.125rem 0.375rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
    }
    
    .completeness-section {
        margin-bottom: 0.75rem;
    }
    
    .comparison-details {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .changes-section {
        margin-top: 0.5rem;
    }
    
    .changes-text {
        margin-top: 0.25rem;
        margin-bottom: 0;
        color: var(--color-text-primary);
        line-height: 1.5;
    }
    
    .summary-text {
        font-size: 1.1rem;
        line-height: 1.6;
        color: var(--color-text-primary);
        background-color: var(--color-background-secondary);
        padding: 1rem;
        border-radius: 0.5rem;
        border-left: 4px solid var(--color-primary);
    }
    
    .followup-item {
        border-left-color: var(--color-info);
    }
    
    .followup-text {
        color: var(--color-text-primary);
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
    .staff-department {
        color: var(--color-text-secondary);
        font-size: 0.9rem;
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
    .significance-mild { border-left-color: var(--color-warning); }
    .significance-moderate { border-left-color: var(--color-danger); }
    .significance-severe { border-left-color: var(--color-danger); border-left-width: 4px; }
    .significance-clinical { border-left-color: var(--color-info); }
</style>