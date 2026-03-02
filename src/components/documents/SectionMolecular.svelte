<script lang="ts">
    import { t } from '$lib/i18n';
    import AskButton from '$components/chat/AskButton.svelte';

    interface Props {
        data: any;
        document?: any;
        key?: string;
    }

    let { data, document, key }: Props = $props();

    let hasMolecular = $derived(data && data.hasMolecular);
    
    let geneticTesting = $derived(data?.geneticTesting || []);
    let genomicAnalysis = $derived(data?.genomicAnalysis || []);
    let biomarkers = $derived(data?.biomarkers || []);
    let mutations = $derived(data?.mutations || []);
    let expressionProfiles = $derived(data?.expressionProfiles || []);
    let pharmacogenomics = $derived(data?.pharmacogenomics || []);
    let sequencing = $derived(data?.sequencing || []);
    let qualityMetrics = $derived(data?.qualityMetrics || {});
    let technicalNotes = $derived(data?.technicalNotes);
    let molecularPathologist = $derived(data?.molecularPathologist);
    let laboratoryTechnician = $derived(data?.laboratoryTechnician);
    
    function getResultClass(result: string): string {
        const resultClasses: Record<string, string> = {
            'positive': 'result-positive',
            'negative': 'result-negative',
            'variant_of_unknown_significance': 'result-vus',
            'pathogenic': 'result-pathogenic',
            'likely_pathogenic': 'result-likely-pathogenic',
            'benign': 'result-benign',
            'likely_benign': 'result-likely-benign',
            'detected': 'result-detected',
            'not_detected': 'result-not-detected',
            'amplified': 'result-amplified',
            'deleted': 'result-deleted',
            'normal': 'result-normal'
        };
        return resultClasses[result] || 'result-unknown';
    }
    
    function getSignificanceClass(significance: string): string {
        const significanceClasses: Record<string, string> = {
            'high': 'significance-high',
            'moderate': 'significance-moderate',
            'low': 'significance-low',
            'unknown': 'significance-unknown'
        };
        return significanceClasses[significance] || 'significance-unknown';
    }
    
    function getQualityClass(quality: string): string {
        const qualityClasses: Record<string, string> = {
            'excellent': 'quality-excellent',
            'good': 'quality-good',
            'adequate': 'quality-adequate',
            'poor': 'quality-poor',
            'failed': 'quality-failed'
        };
        return qualityClasses[quality] || 'quality-unknown';
    }
    
    function getExpressionClass(expression: string): string {
        const expressionClasses: Record<string, string> = {
            'overexpressed': 'expression-over',
            'underexpressed': 'expression-under',
            'normal': 'expression-normal',
            'absent': 'expression-absent',
            'variable': 'expression-variable'
        };
        return expressionClasses[expression] || 'expression-unknown';
    }
    
    function getResponseClass(response: string): string {
        const responseClasses: Record<string, string> = {
            'sensitive': 'response-sensitive',
            'resistant': 'response-resistant',
            'intermediate': 'response-intermediate',
            'unknown': 'response-unknown'
        };
        return responseClasses[response] || 'response-unknown';
    }
    
    function getTestTypeClass(type: string): string {
        const typeClasses: Record<string, string> = {
            'genetic': 'type-genetic',
            'genomic': 'type-genomic',
            'proteomic': 'type-proteomic',
            'metabolomic': 'type-metabolomic',
            'epigenetic': 'type-epigenetic',
            'transcriptomic': 'type-transcriptomic'
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
    
    function formatPercentage(percentage: any): string {
        if (percentage === null || percentage === undefined) return '';
        if (typeof percentage === 'number') return `${percentage}%`;
        if (typeof percentage === 'string') return percentage;
        return '';
    }
    
    function formatCoverage(coverage: any): string {
        if (!coverage) return '';
        if (typeof coverage === 'string') return coverage;
        if (coverage.value && coverage.unit) {
            return `${coverage.value}${coverage.unit}`;
        }
        return coverage.toString();
    }
    
    function formatAlleleFrequency(frequency: any): string {
        if (!frequency) return '';
        if (typeof frequency === 'number') return frequency.toFixed(4);
        if (typeof frequency === 'string') return frequency;
        return '';
    }
</script>

{#if hasMolecular}
    <h3 class="h3 heading -sticky">{$t('report.molecular-analysis')}</h3>
    
    <!-- Genetic Testing -->
    {#if geneticTesting.length > 0}
        <h4 class="section-title-sub">{$t('report.genetic-testing')}</h4>
        <ul class="list-items">
            {#each geneticTesting as test}
                <li class="panel genetic-test-item {getTestTypeClass('genetic')} {getResultClass(test.result)}">
                    <div class="test-header">
                        <div class="test-main">
                            <h5 class="test-name">{test.name}</h5>
                            <div class="test-details-inline">
                                <span class="test-method">{$t(`medical.enums.test_methods.${test.method}`)}</span>
                                {#if test.gene}
                                    <span class="gene-info">{test.gene}</span>
                                {/if}
                            </div>
                        </div>
                        
                        <div class="test-badges">
                            {#if test.result}
                                <span class="result-badge {getResultClass(test.result)}">
                                    {$t(`medical.enums.genetic_results.${test.result}`)}
                                </span>
                            {/if}
                            {#if test.significance}
                                <span class="significance-badge {getSignificanceClass(test.significance)}">
                                    {$t(`medical.enums.significance_levels.${test.significance}`)}
                                </span>
                            {/if}
                            <AskButton
                                type="genetic-test"
                                label={test.name}
                                data={test}
                                documentId={document?.id}
                                documentTitle={document?.content?.title}
                            />
                        </div>
                    </div>
                    
                    <div class="test-details">
                        {#if test.variant}
                            <div class="detail-item">
                                <span class="label">{$t('report.variant')}:</span>
                                <span class="value variant-info">{test.variant}</span>
                            </div>
                        {/if}
                        
                        {#if test.chromosome}
                            <div class="detail-item">
                                <span class="label">{$t('report.chromosome')}:</span>
                                <span class="value">{test.chromosome}</span>
                            </div>
                        {/if}
                        
                        {#if test.position}
                            <div class="detail-item">
                                <span class="label">{$t('report.position')}:</span>
                                <span class="value">{test.position}</span>
                            </div>
                        {/if}
                        
                        {#if test.alleleFrequency}
                            <div class="detail-item">
                                <span class="label">{$t('report.allele-frequency')}:</span>
                                <span class="value">{formatAlleleFrequency(test.alleleFrequency)}</span>
                            </div>
                        {/if}
                        
                        {#if test.coverage}
                            <div class="detail-item">
                                <span class="label">{$t('report.coverage')}:</span>
                                <span class="value">{formatCoverage(test.coverage)}</span>
                            </div>
                        {/if}
                        
                        {#if test.zygosity}
                            <div class="detail-item">
                                <span class="label">{$t('report.zygosity')}:</span>
                                <span class="value">{$t(`medical.enums.zygosity_types.${test.zygosity}`)}</span>
                            </div>
                        {/if}
                        
                        {#if test.inheritance}
                            <div class="detail-item">
                                <span class="label">{$t('report.inheritance')}:</span>
                                <span class="value">{$t(`medical.enums.inheritance_patterns.${test.inheritance}`)}</span>
                            </div>
                        {/if}
                    </div>
                    
                    {#if test.clinicalSignificance}
                        <div class="clinical-significance">
                            <span class="label">{$t('report.clinical-significance')}:</span>
                            <p class="significance-text">{test.clinicalSignificance}</p>
                        </div>
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}
    
    <!-- Genomic Analysis -->
    {#if genomicAnalysis.length > 0}
        <h4 class="section-title-sub">{$t('report.genomic-analysis')}</h4>
        <ul class="list-items">
            {#each genomicAnalysis as analysis}
                <li class="panel genomic-analysis-item {getTestTypeClass('genomic')} {getResultClass(analysis.result)}">
                    <div class="analysis-header">
                        <div class="analysis-main">
                            <h5 class="analysis-name">{analysis.name}</h5>
                            <span class="analysis-type">{$t(`medical.enums.genomic_analysis_types.${analysis.type}`)}</span>
                        </div>
                        
                        <div class="analysis-badges">
                            {#if analysis.result}
                                <span class="result-badge {getResultClass(analysis.result)}">
                                    {$t(`medical.enums.analysis_results.${analysis.result}`)}
                                </span>
                            {/if}
                            {#if analysis.confidence}
                                <span class="confidence-badge">{formatPercentage(analysis.confidence)}</span>
                            {/if}
                        </div>
                    </div>
                    
                    <div class="analysis-details">
                        {#if analysis.technique}
                            <div class="detail-item">
                                <span class="label">{$t('report.technique')}:</span>
                                <span class="value">{analysis.technique}</span>
                            </div>
                        {/if}
                        
                        {#if analysis.platform}
                            <div class="detail-item">
                                <span class="label">{$t('report.platform')}:</span>
                                <span class="value">{analysis.platform}</span>
                            </div>
                        {/if}
                        
                        {#if analysis.readDepth}
                            <div class="detail-item">
                                <span class="label">{$t('report.read-depth')}:</span>
                                <span class="value">{analysis.readDepth}</span>
                            </div>
                        {/if}
                        
                        {#if analysis.mappingQuality}
                            <div class="detail-item">
                                <span class="label">{$t('report.mapping-quality')}:</span>
                                <span class="value">{analysis.mappingQuality}</span>
                            </div>
                        {/if}
                        
                        {#if analysis.variantCount}
                            <div class="detail-item">
                                <span class="label">{$t('report.variant-count')}:</span>
                                <span class="value">{analysis.variantCount}</span>
                            </div>
                        {/if}
                        
                        {#if analysis.tumorPurity}
                            <div class="detail-item">
                                <span class="label">{$t('report.tumor-purity')}:</span>
                                <span class="value">{formatPercentage(analysis.tumorPurity)}</span>
                            </div>
                        {/if}
                        
                        {#if analysis.copyNumberVariants?.length > 0}
                            <div class="copy-number-variants-section">
                                <span class="label">{$t('report.copy-number-variants')}:</span>
                                <div class="copy-number-variants-list">
                                    {#each analysis.copyNumberVariants as variant}
                                        <div class="cnv-item">
                                            <span class="cnv-gene">{variant.gene}</span>
                                            <span class="cnv-type {getResultClass(variant.type)}">{variant.type}</span>
                                            <span class="cnv-ratio">{variant.ratio}</span>
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        {/if}
                    </div>
                    
                    {#if analysis.interpretation}
                        <div class="analysis-interpretation">
                            <span class="label">{$t('report.interpretation')}:</span>
                            <p class="interpretation-text">{analysis.interpretation}</p>
                        </div>
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}
    
    <!-- Biomarkers -->
    {#if biomarkers.length > 0}
        <h4 class="section-title-sub">{$t('report.biomarkers')}</h4>
        <ul class="list-items">
            {#each biomarkers as biomarker}
                <li class="panel biomarker-item {getResultClass(biomarker.result)}">
                    <div class="biomarker-header">
                        <div class="biomarker-main">
                            <h5 class="biomarker-name">{biomarker.name}</h5>
                            <span class="biomarker-type">{$t(`medical.enums.biomarker_types.${biomarker.type}`)}</span>
                        </div>
                        
                        <div class="biomarker-badges">
                            {#if biomarker.result}
                                <span class="result-badge {getResultClass(biomarker.result)}">
                                    {$t(`medical.enums.biomarker_results.${biomarker.result}`)}
                                </span>
                            {/if}
                            {#if biomarker.level}
                                <span class="level-badge">{biomarker.level}</span>
                            {/if}
                            <AskButton
                                type="biomarker"
                                label={biomarker.name}
                                data={biomarker}
                                documentId={document?.id}
                                documentTitle={document?.content?.title}
                            />
                        </div>
                    </div>
                    
                    <div class="biomarker-details">
                        {#if biomarker.value}
                            <div class="detail-item">
                                <span class="label">{$t('report.value')}:</span>
                                <span class="value biomarker-value">{biomarker.value}</span>
                            </div>
                        {/if}
                        
                        {#if biomarker.units}
                            <div class="detail-item">
                                <span class="label">{$t('report.units')}:</span>
                                <span class="value">{biomarker.units}</span>
                            </div>
                        {/if}
                        
                        {#if biomarker.referenceRange}
                            <div class="detail-item">
                                <span class="label">{$t('report.reference-range')}:</span>
                                <span class="value">{biomarker.referenceRange}</span>
                            </div>
                        {/if}
                        
                        {#if biomarker.method}
                            <div class="detail-item">
                                <span class="label">{$t('report.method')}:</span>
                                <span class="value">{biomarker.method}</span>
                            </div>
                        {/if}
                        
                        {#if biomarker.sensitivity}
                            <div class="detail-item">
                                <span class="label">{$t('report.sensitivity')}:</span>
                                <span class="value">{formatPercentage(biomarker.sensitivity)}</span>
                            </div>
                        {/if}
                        
                        {#if biomarker.specificity}
                            <div class="detail-item">
                                <span class="label">{$t('report.specificity')}:</span>
                                <span class="value">{formatPercentage(biomarker.specificity)}</span>
                            </div>
                        {/if}
                    </div>
                    
                    {#if biomarker.clinicalRelevance}
                        <div class="clinical-relevance">
                            <span class="label">{$t('report.clinical-relevance')}:</span>
                            <p class="relevance-text">{biomarker.clinicalRelevance}</p>
                        </div>
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}
    
    <!-- Mutations -->
    {#if mutations.length > 0}
        <h4 class="section-title-sub">{$t('report.mutations')}</h4>
        <ul class="list-items">
            {#each mutations as mutation}
                <li class="panel mutation-item {getResultClass(mutation.significance)}">
                    <div class="mutation-header">
                        <div class="mutation-main">
                            <h5 class="mutation-name">{mutation.gene} {mutation.change}</h5>
                            <span class="mutation-type">{$t(`medical.enums.mutation_types.${mutation.type}`)}</span>
                        </div>
                        
                        <div class="mutation-badges">
                            {#if mutation.significance}
                                <span class="significance-badge {getSignificanceClass(mutation.significance)}">
                                    {$t(`medical.enums.mutation_significance.${mutation.significance}`)}
                                </span>
                            {/if}
                            {#if mutation.alleleFrequency}
                                <span class="frequency-badge">{formatAlleleFrequency(mutation.alleleFrequency)}</span>
                            {/if}
                            <AskButton
                                type="mutation"
                                label={mutation.gene}
                                data={mutation}
                                documentId={document?.id}
                                documentTitle={document?.content?.title}
                            />
                        </div>
                    </div>
                    
                    <div class="mutation-details">
                        {#if mutation.transcript}
                            <div class="detail-item">
                                <span class="label">{$t('report.transcript')}:</span>
                                <span class="value">{mutation.transcript}</span>
                            </div>
                        {/if}
                        
                        {#if mutation.proteinChange}
                            <div class="detail-item">
                                <span class="label">{$t('report.protein-change')}:</span>
                                <span class="value protein-change">{mutation.proteinChange}</span>
                            </div>
                        {/if}
                        
                        {#if mutation.exon}
                            <div class="detail-item">
                                <span class="label">{$t('report.exon')}:</span>
                                <span class="value">{mutation.exon}</span>
                            </div>
                        {/if}
                        
                        {#if mutation.consequence}
                            <div class="detail-item">
                                <span class="label">{$t('report.consequence')}:</span>
                                <span class="value">{mutation.consequence}</span>
                            </div>
                        {/if}
                        
                        {#if mutation.populationFrequency}
                            <div class="detail-item">
                                <span class="label">{$t('report.population-frequency')}:</span>
                                <span class="value">{formatAlleleFrequency(mutation.populationFrequency)}</span>
                            </div>
                        {/if}
                        
                        {#if mutation.predictions?.length > 0}
                            <div class="predictions-section">
                                <span class="label">{$t('report.predictions')}:</span>
                                <div class="predictions-list">
                                    {#each mutation.predictions as prediction}
                                        <div class="prediction-item">
                                            <span class="prediction-tool">{prediction.tool}</span>
                                            <span class="prediction-score">{prediction.score}</span>
                                            <span class="prediction-result">{prediction.result}</span>
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        {/if}
                    </div>
                    
                    {#if mutation.therapeuticImplications?.length > 0}
                        <div class="therapeutic-implications">
                            <span class="label">{$t('report.therapeutic-implications')}:</span>
                            <ul class="implications-list">
                                {#each mutation.therapeuticImplications as implication}
                                    <li>{implication}</li>
                                {/each}
                            </ul>
                        </div>
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}
    
    <!-- Expression Profiles -->
    {#if expressionProfiles.length > 0}
        <h4 class="section-title-sub">{$t('report.expression-profiles')}</h4>
        <ul class="list-items">
            {#each expressionProfiles as profile}
                <li class="panel expression-profile-item {getExpressionClass(profile.level)}">
                    <div class="profile-header">
                        <div class="profile-main">
                            <h5 class="profile-name">{profile.gene}</h5>
                            <span class="profile-type">{$t(`medical.enums.expression_types.${profile.type}`)}</span>
                        </div>
                        
                        <div class="profile-badges">
                            {#if profile.level}
                                <span class="expression-badge {getExpressionClass(profile.level)}">
                                    {$t(`medical.enums.expression_levels.${profile.level}`)}
                                </span>
                            {/if}
                            {#if profile.foldChange}
                                <span class="fold-change-badge">{profile.foldChange}x</span>
                            {/if}
                        </div>
                    </div>
                    
                    <div class="profile-details">
                        {#if profile.value}
                            <div class="detail-item">
                                <span class="label">{$t('report.expression-value')}:</span>
                                <span class="value expression-value">{profile.value}</span>
                            </div>
                        {/if}
                        
                        {#if profile.percentile}
                            <div class="detail-item">
                                <span class="label">{$t('report.percentile')}:</span>
                                <span class="value">{profile.percentile}%</span>
                            </div>
                        {/if}
                        
                        {#if profile.controlValue}
                            <div class="detail-item">
                                <span class="label">{$t('report.control-value')}:</span>
                                <span class="value">{profile.controlValue}</span>
                            </div>
                        {/if}
                        
                        {#if profile.pValue}
                            <div class="detail-item">
                                <span class="label">{$t('report.p-value')}:</span>
                                <span class="value">{profile.pValue}</span>
                            </div>
                        {/if}
                        
                        {#if profile.method}
                            <div class="detail-item">
                                <span class="label">{$t('report.method')}:</span>
                                <span class="value">{profile.method}</span>
                            </div>
                        {/if}
                    </div>
                    
                    {#if profile.functionalImplications}
                        <div class="functional-implications">
                            <span class="label">{$t('report.functional-implications')}:</span>
                            <p class="implications-text">{profile.functionalImplications}</p>
                        </div>
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}
    
    <!-- Pharmacogenomics -->
    {#if pharmacogenomics.length > 0}
        <h4 class="section-title-sub">{$t('report.pharmacogenomics')}</h4>
        <ul class="list-items">
            {#each pharmacogenomics as pharmaco}
                <li class="panel pharmacogenomics-item {getResponseClass(pharmaco.response)}">
                    <div class="pharmaco-header">
                        <div class="pharmaco-main">
                            <h5 class="pharmaco-drug">{pharmaco.drug}</h5>
                            <span class="pharmaco-gene">{pharmaco.gene}</span>
                        </div>
                        
                        <div class="pharmaco-badges">
                            {#if pharmaco.response}
                                <span class="response-badge {getResponseClass(pharmaco.response)}">
                                    {$t(`medical.enums.drug_responses.${pharmaco.response}`)}
                                </span>
                            {/if}
                            {#if pharmaco.phenotype}
                                <span class="phenotype-badge">{pharmaco.phenotype}</span>
                            {/if}
                        </div>
                    </div>
                    
                    <div class="pharmaco-details">
                        {#if pharmaco.genotype}
                            <div class="detail-item">
                                <span class="label">{$t('report.genotype')}:</span>
                                <span class="value genotype-info">{pharmaco.genotype}</span>
                            </div>
                        {/if}
                        
                        {#if pharmaco.alleles}
                            <div class="detail-item">
                                <span class="label">{$t('report.alleles')}:</span>
                                <span class="value">{pharmaco.alleles}</span>
                            </div>
                        {/if}
                        
                        {#if pharmaco.activityScore}
                            <div class="detail-item">
                                <span class="label">{$t('report.activity-score')}:</span>
                                <span class="value">{pharmaco.activityScore}</span>
                            </div>
                        {/if}
                        
                        {#if pharmaco.metabolizerStatus}
                            <div class="detail-item">
                                <span class="label">{$t('report.metabolizer-status')}:</span>
                                <span class="value">{$t(`medical.enums.metabolizer_status.${pharmaco.metabolizerStatus}`)}</span>
                            </div>
                        {/if}
                        
                        {#if pharmaco.dosageRecommendation}
                            <div class="detail-item">
                                <span class="label">{$t('report.dosage-recommendation')}:</span>
                                <span class="value dosage-recommendation">{pharmaco.dosageRecommendation}</span>
                            </div>
                        {/if}
                    </div>
                    
                    {#if pharmaco.clinicalGuidelines}
                        <div class="clinical-guidelines">
                            <span class="label">{$t('report.clinical-guidelines')}:</span>
                            <p class="guidelines-text">{pharmaco.clinicalGuidelines}</p>
                        </div>
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}
    
    <!-- Sequencing -->
    {#if sequencing.length > 0}
        <h4 class="section-title-sub">{$t('report.sequencing')}</h4>
        <ul class="list-items">
            {#each sequencing as seq}
                <li class="panel sequencing-item {getTestTypeClass(seq.type)}">
                    <div class="sequencing-header">
                        <div class="sequencing-main">
                            <h5 class="sequencing-name">{seq.name}</h5>
                            <span class="sequencing-type">{$t(`medical.enums.sequencing_types.${seq.type}`)}</span>
                        </div>
                        
                        <div class="sequencing-badges">
                            {#if seq.status}
                                <span class="status-badge">{$t(`medical.enums.sequencing_status.${seq.status}`)}</span>
                            {/if}
                        </div>
                    </div>
                    
                    <div class="sequencing-details">
                        {#if seq.platform}
                            <div class="detail-item">
                                <span class="label">{$t('report.platform')}:</span>
                                <span class="value">{seq.platform}</span>
                            </div>
                        {/if}
                        
                        {#if seq.readLength}
                            <div class="detail-item">
                                <span class="label">{$t('report.read-length')}:</span>
                                <span class="value">{seq.readLength}</span>
                            </div>
                        {/if}
                        
                        {#if seq.totalReads}
                            <div class="detail-item">
                                <span class="label">{$t('report.total-reads')}:</span>
                                <span class="value">{seq.totalReads}</span>
                            </div>
                        {/if}
                        
                        {#if seq.meanCoverage}
                            <div class="detail-item">
                                <span class="label">{$t('report.mean-coverage')}:</span>
                                <span class="value">{seq.meanCoverage}x</span>
                            </div>
                        {/if}
                        
                        {#if seq.targetRegions}
                            <div class="detail-item">
                                <span class="label">{$t('report.target-regions')}:</span>
                                <span class="value">{seq.targetRegions}</span>
                            </div>
                        {/if}
                        
                        {#if seq.uniformity}
                            <div class="detail-item">
                                <span class="label">{$t('report.uniformity')}:</span>
                                <span class="value">{formatPercentage(seq.uniformity)}</span>
                            </div>
                        {/if}
                    </div>
                    
                    {#if seq.qualityMetrics}
                        <div class="seq-quality-metrics">
                            <span class="label">{$t('report.quality-metrics')}:</span>
                            <div class="metrics-grid">
                                {#if seq.qualityMetrics.q30}
                                    <div class="metric-item">
                                        <span class="metric-name">Q30:</span>
                                        <span class="metric-value">{formatPercentage(seq.qualityMetrics.q30)}</span>
                                    </div>
                                {/if}
                                {#if seq.qualityMetrics.duplicationRate}
                                    <div class="metric-item">
                                        <span class="metric-name">{$t('report.duplication-rate')}:</span>
                                        <span class="metric-value">{formatPercentage(seq.qualityMetrics.duplicationRate)}</span>
                                    </div>
                                {/if}
                                {#if seq.qualityMetrics.mappingRate}
                                    <div class="metric-item">
                                        <span class="metric-name">{$t('report.mapping-rate')}:</span>
                                        <span class="metric-value">{formatPercentage(seq.qualityMetrics.mappingRate)}</span>
                                    </div>
                                {/if}
                            </div>
                        </div>
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}
    
    <!-- Quality Metrics -->
    {#if Object.keys(qualityMetrics).length > 0}
        <h4 class="section-title-sub">{$t('report.quality-metrics')}</h4>
        <div class="page -block">
            <div class="quality-metrics-info">
                {#if qualityMetrics.overall}
                    <div class="quality-overall">
                        <span class="label">{$t('report.overall-quality')}:</span>
                        <span class="quality-value {getQualityClass(qualityMetrics.overall)}">
                            {$t(`medical.enums.quality_levels.${qualityMetrics.overall}`)}
                        </span>
                    </div>
                {/if}
                
                {#if qualityMetrics.dnaQuality}
                    <div class="detail-item">
                        <span class="label">{$t('report.dna-quality')}:</span>
                        <span class="value">{qualityMetrics.dnaQuality}</span>
                    </div>
                {/if}
                
                {#if qualityMetrics.concentration}
                    <div class="detail-item">
                        <span class="label">{$t('report.concentration')}:</span>
                        <span class="value">{qualityMetrics.concentration}</span>
                    </div>
                {/if}
                
                {#if qualityMetrics.purity}
                    <div class="detail-item">
                        <span class="label">{$t('report.purity')}:</span>
                        <span class="value">{qualityMetrics.purity}</span>
                    </div>
                {/if}
                
                {#if qualityMetrics.integrity}
                    <div class="detail-item">
                        <span class="label">{$t('report.integrity')}:</span>
                        <span class="value">{qualityMetrics.integrity}</span>
                    </div>
                {/if}
                
                {#if qualityMetrics.limitations?.length > 0}
                    <div class="limitations-section">
                        <span class="label">{$t('report.limitations')}:</span>
                        <ul class="limitations-list">
                            {#each qualityMetrics.limitations as limitation}
                                <li>{limitation}</li>
                            {/each}
                        </ul>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
    
    <!-- Technical Notes -->
    {#if technicalNotes}
        <h4 class="section-title-sub">{$t('report.technical-notes')}</h4>
        <div class="page -block">
            <div class="technical-notes">
                <p class="notes-text">{technicalNotes}</p>
            </div>
        </div>
    {/if}
    
    <!-- Staff Information -->
    {#if molecularPathologist || laboratoryTechnician}
        <h4 class="section-title-sub">{$t('report.staff-information')}</h4>
        <div class="page -block">
            <div class="staff-info">
                {#if molecularPathologist}
                    <div class="staff-member">
                        <span class="label">{$t('report.molecular-pathologist')}:</span>
                        <div class="staff-details">
                            <span class="staff-name">{molecularPathologist.name}</span>
                            {#if molecularPathologist.title}
                                <span class="staff-title">{molecularPathologist.title}</span>
                            {/if}
                            {#if molecularPathologist.certifications}
                                <span class="staff-certifications">{molecularPathologist.certifications}</span>
                            {/if}
                        </div>
                    </div>
                {/if}
                
                {#if laboratoryTechnician}
                    <div class="staff-member">
                        <span class="label">{$t('report.laboratory-technician')}:</span>
                        <div class="staff-details">
                            <span class="staff-name">{laboratoryTechnician.name}</span>
                            {#if laboratoryTechnician.title}
                                <span class="staff-title">{laboratoryTechnician.title}</span>
                            {/if}
                            {#if laboratoryTechnician.certifications}
                                <span class="staff-certifications">{laboratoryTechnician.certifications}</span>
                            {/if}
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
    
{:else if data}
    <h3 class="h3 heading -sticky">{$t('report.molecular-analysis')}</h3>
    <div class="page -block">
        <p class="no-data">{$t('report.no-molecular-analysis-data')}</p>
    </div>
{/if}

<style>
    .genetic-test-item {
        border-left-color: var(--color-primary);
    }
    
    .genomic-analysis-item {
        border-left-color: var(--color-info);
    }
    
    .biomarker-item {
        border-left-color: var(--color-secondary);
    }
    
    .mutation-item {
        border-left-color: var(--color-warning);
    }
    
    .expression-profile-item {
        border-left-color: var(--color-success);
    }
    
    .pharmacogenomics-item {
        border-left-color: var(--color-danger);
    }
    
    .sequencing-item {
        border-left-color: var(--color-info);
    }
    
    .test-header,
    .analysis-header,
    .biomarker-header,
    .mutation-header,
    .profile-header,
    .pharmaco-header,
    .sequencing-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 0.75rem;
        gap: 1rem;
    }
    
    .test-main,
    .analysis-main,
    .biomarker-main,
    .mutation-main,
    .profile-main,
    .pharmaco-main,
    .sequencing-main {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        flex: 1;
    }
    
    .test-name,
    .analysis-name,
    .biomarker-name,
    .mutation-name,
    .profile-name,
    .pharmaco-drug,
    .sequencing-name {
        font-size: 1.1rem;
        font-weight: 600;
        margin: 0;
        color: var(--color-text-primary);
    }
    
    .test-details-inline {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        flex-wrap: wrap;
    }
    
    .test-method {
        background-color: var(--color-info-light);
        color: var(--color-info-dark);
        padding: 0.125rem 0.375rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
        text-transform: uppercase;
    }
    
    .gene-info {
        background-color: var(--color-primary-light);
        color: var(--color-primary-dark);
        padding: 0.125rem 0.375rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
        font-family: monospace;
    }
    
    .analysis-type,
    .biomarker-type,
    .mutation-type,
    .profile-type,
    .pharmaco-gene,
    .sequencing-type {
        font-size: 0.9rem;
        color: var(--color-text-secondary);
        font-weight: 500;
    }
    
    .test-badges,
    .analysis-badges,
    .biomarker-badges,
    .mutation-badges,
    .profile-badges,
    .pharmaco-badges,
    .sequencing-badges {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        align-items: flex-end;
    }
    
    .test-details,
    .analysis-details,
    .biomarker-details,
    .mutation-details,
    .profile-details,
    .pharmaco-details,
    .sequencing-details {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .variant-info,
    .protein-change,
    .genotype-info {
        font-family: monospace;
        background-color: var(--color-background-secondary);
        padding: 0.125rem 0.375rem;
        border-radius: 0.25rem;
        font-size: 0.9rem;
    }
    
    .biomarker-value,
    .expression-value {
        font-weight: 600;
        color: var(--color-primary);
    }
    
    .dosage-recommendation {
        font-weight: 600;
        color: var(--color-warning-dark);
    }
    
    .clinical-significance,
    .analysis-interpretation,
    .clinical-relevance,
    .functional-implications,
    .clinical-guidelines {
        margin-top: 0.75rem;
        padding-top: 0.75rem;
        border-top: 1px solid var(--color-border);
    }
    
    .significance-text,
    .interpretation-text,
    .relevance-text,
    .implications-text,
    .guidelines-text {
        margin: 0.25rem 0 0 0;
        color: var(--color-text-primary);
        line-height: 1.5;
        font-style: italic;
    }
    
    .copy-number-variants-section,
    .predictions-section,
    .therapeutic-implications,
    .limitations-section {
        margin-top: 0.75rem;
    }
    
    .copy-number-variants-list,
    .predictions-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin-top: 0.5rem;
    }
    
    .cnv-item,
    .prediction-item {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        padding: 0.5rem;
        background-color: var(--color-background-secondary);
        border-radius: 0.25rem;
        flex-wrap: wrap;
    }
    
    .cnv-gene,
    .prediction-tool {
        font-weight: 600;
        color: var(--color-text-primary);
    }
    
    .cnv-type {
        padding: 0.125rem 0.375rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
        text-transform: uppercase;
    }
    
    .cnv-ratio,
    .prediction-score {
        font-weight: 500;
        color: var(--color-text-secondary);
    }
    
    .prediction-result {
        font-weight: 500;
        color: var(--color-primary);
    }
    
    .implications-list,
    .limitations-list {
        margin: 0.5rem 0 0 1.5rem;
        padding: 0;
    }
    
    .implications-list li,
    .limitations-list li {
        margin-bottom: 0.25rem;
        color: var(--color-text-secondary);
    }
    
    .seq-quality-metrics {
        margin-top: 0.75rem;
        padding-top: 0.75rem;
        border-top: 1px solid var(--color-border);
    }
    
    .metrics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 0.5rem;
        margin-top: 0.5rem;
    }
    
    .metric-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.25rem 0.5rem;
        background-color: var(--color-background-secondary);
        border-radius: 0.25rem;
    }
    
    .metric-name {
        font-weight: 500;
        color: var(--color-text-secondary);
    }
    
    .metric-value {
        font-weight: 600;
        color: var(--color-primary);
    }
    
    .quality-metrics-info {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .quality-overall {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.75rem;
        padding: 0.5rem 1rem;
        background-color: var(--color-background-secondary);
        border-radius: 0.5rem;
    }
    
    .quality-value {
        font-weight: 600;
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        text-transform: uppercase;
        font-size: 0.9rem;
    }
    
    .technical-notes {
        padding: 1rem;
        background-color: var(--color-background-secondary);
        border-radius: 0.5rem;
        border-left: 4px solid var(--color-info);
    }
    
    .notes-text {
        margin: 0;
        color: var(--color-text-primary);
        line-height: 1.5;
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
    .staff-certifications {
        color: var(--color-text-secondary);
        font-size: 0.9rem;
    }
    
    .result-badge,
    .significance-badge,
    .level-badge,
    .frequency-badge,
    .expression-badge,
    .fold-change-badge,
    .response-badge,
    .phenotype-badge,
    .confidence-badge,
    .status-badge {
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
        text-transform: uppercase;
        white-space: nowrap;
    }
    
    .result-positive,
    .result-detected,
    .result-pathogenic {
        background-color: var(--color-danger-light);
        color: var(--color-danger-dark);
    }
    
    .result-negative,
    .result-not-detected,
    .result-benign {
        background-color: var(--color-success-light);
        color: var(--color-success-dark);
    }
    
    .result-vus {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
    }
    
    .result-likely-pathogenic {
        background-color: var(--color-danger-light);
        color: var(--color-danger-dark);
        opacity: 0.8;
    }
    
    .result-likely-benign {
        background-color: var(--color-success-light);
        color: var(--color-success-dark);
        opacity: 0.8;
    }
    
    .result-amplified {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
    }
    
    .result-deleted {
        background-color: var(--color-danger-light);
        color: var(--color-danger-dark);
    }
    
    .result-normal {
        background-color: var(--color-success-light);
        color: var(--color-success-dark);
    }
    
    .significance-high {
        background-color: var(--color-danger-light);
        color: var(--color-danger-dark);
    }
    
    .significance-moderate {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
    }
    
    .significance-low {
        background-color: var(--color-info-light);
        color: var(--color-info-dark);
    }
    
    .significance-unknown {
        background-color: var(--color-secondary-light);
        color: var(--color-secondary-dark);
    }
    
    .expression-over {
        background-color: var(--color-danger-light);
        color: var(--color-danger-dark);
    }
    
    .expression-under {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
    }
    
    .expression-normal {
        background-color: var(--color-success-light);
        color: var(--color-success-dark);
    }
    
    .expression-absent {
        background-color: var(--color-secondary-light);
        color: var(--color-secondary-dark);
    }
    
    .expression-variable {
        background-color: var(--color-info-light);
        color: var(--color-info-dark);
    }
    
    .response-sensitive {
        background-color: var(--color-success-light);
        color: var(--color-success-dark);
    }
    
    .response-resistant {
        background-color: var(--color-danger-light);
        color: var(--color-danger-dark);
    }
    
    .response-intermediate {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
    }
    
    .response-unknown {
        background-color: var(--color-secondary-light);
        color: var(--color-secondary-dark);
    }
    
    .quality-excellent {
        background-color: var(--color-success-light);
        color: var(--color-success-dark);
    }
    
    .quality-good {
        background-color: var(--color-success-light);
        color: var(--color-success-dark);
    }
    
    .quality-adequate {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
    }
    
    .quality-poor {
        background-color: var(--color-danger-light);
        color: var(--color-danger-dark);
    }
    
    .quality-failed {
        background-color: var(--color-danger);
        color: white;
    }
    
    .level-badge,
    .frequency-badge,
    .fold-change-badge,
    .phenotype-badge,
    .confidence-badge,
    .status-badge {
        background-color: var(--color-info-light);
        color: var(--color-info-dark);
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
    
    /* Test type panel coloring */
    .type-genetic {
        border-left-color: var(--color-primary);
    }
    
    .type-genomic {
        border-left-color: var(--color-info);
    }
    
    .type-proteomic {
        border-left-color: var(--color-secondary);
    }
    
    .type-metabolomic {
        border-left-color: var(--color-warning);
    }
    
    .type-epigenetic {
        border-left-color: var(--color-success);
    }
    
    .type-transcriptomic {
        border-left-color: var(--color-danger);
    }
    
    .type-general {
        border-left-color: var(--color-text-secondary);
    }
    
    /* Result-based panel coloring overrides */
    .result-pathogenic {
        border-left-color: var(--color-danger);
        border-left-width: 4px;
    }
    
    .result-likely-pathogenic {
        border-left-color: var(--color-danger);
    }
    
    .result-vus {
        border-left-color: var(--color-warning);
    }
    
    .result-positive {
        border-left-color: var(--color-danger);
    }
    
    .result-negative {
        border-left-color: var(--color-success);
    }
    
    .result-benign {
        border-left-color: var(--color-success);
    }
    
    .result-likely-benign {
        border-left-color: var(--color-success);
    }
</style>