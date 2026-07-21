<script lang="ts">
    import { t } from '$lib/i18n';

    interface Props {
        data: any;
        document?: any;
        key?: string;
    }

    let { data, document, key }: Props = $props();
    
    let hasSpecimens = $derived(data && data.hasSpecimens);
    
    let specimens = $derived(data?.specimens || []);
    let collectionDetails = $derived(data?.collectionDetails || {});
    let processing = $derived(data?.processing || {});
    let storage = $derived(data?.storage || {});
    let quality = $derived(data?.quality || {});
    let pathologist = $derived(data?.pathologist);
    let technician = $derived(data?.technician);
    
    function getSpecimenTypeClass(type: string): string {
        const typeClasses: Record<string, string> = {
            'tissue': 'specimen-tissue',
            'blood': 'specimen-blood',
            'urine': 'specimen-urine',
            'fluid': 'specimen-fluid',
            'cytology': 'specimen-cytology',
            'biopsy': 'specimen-biopsy',
            'surgical': 'specimen-surgical',
            'frozen': 'specimen-frozen'
        };
        return typeClasses[type] || 'specimen-general';
    }
    
    function getQualityClass(quality: string): string {
        const qualityClasses: Record<string, string> = {
            'excellent': 'quality-excellent',
            'good': 'quality-good',
            'adequate': 'quality-adequate',
            'poor': 'quality-poor',
            'inadequate': 'quality-inadequate'
        };
        return qualityClasses[quality] || 'quality-unknown';
    }
    
    function getUrgencyClass(urgency: string): string {
        const urgencyClasses: Record<string, string> = {
            'routine': 'urgency-routine',
            'urgent': 'urgency-urgent',
            'stat': 'urgency-stat'
        };
        return urgencyClasses[urgency] || 'urgency-routine';
    }
    
    function getStatusClass(status: string): string {
        const statusClasses: Record<string, string> = {
            'received': 'status-received',
            'processing': 'status-processing',
            'completed': 'status-completed',
            'insufficient': 'status-insufficient',
            'contaminated': 'status-contaminated'
        };
        return statusClasses[status] || 'status-unknown';
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
    
    function formatSize(size: any): string {
        if (!size) return '';
        if (typeof size === 'string') return size;
        if (size.dimensions) return size.dimensions;
        if (size.volume) return size.volume;
        return '';
    }
</script>

{#if hasSpecimens}
    <h3 class="h3 heading -sticky">{$t('report.specimens')}</h3>
    
    <!-- Collection Details -->
    {#if Object.keys(collectionDetails).length > 0}
        <h4 class="section-title-sub">{$t('report.collection-details')}</h4>
        <div class="page -block">
            <div class="collection-info">
                {#if collectionDetails.collectionDate}
                    <div class="detail-item">
                        <span class="label">{$t('report.collection-date')}:</span>
                        <span class="value">{formatDate(collectionDetails.collectionDate)}</span>
                    </div>
                {/if}
                
                {#if collectionDetails.collectionMethod}
                    <div class="detail-item">
                        <span class="label">{$t('report.collection-method')}:</span>
                        <span class="value">{collectionDetails.collectionMethod}</span>
                    </div>
                {/if}
                
                {#if collectionDetails.collectionSite}
                    <div class="detail-item">
                        <span class="label">{$t('report.collection-site')}:</span>
                        <span class="value">{collectionDetails.collectionSite}</span>
                    </div>
                {/if}
                
                {#if collectionDetails.collector}
                    <div class="detail-item">
                        <span class="label">{$t('report.collector')}:</span>
                        <span class="value">{collectionDetails.collector}</span>
                    </div>
                {/if}
                
                {#if collectionDetails.transportTime}
                    <div class="detail-item">
                        <span class="label">{$t('report.transport-time')}:</span>
                        <span class="value">{collectionDetails.transportTime}</span>
                    </div>
                {/if}
                
                {#if collectionDetails.conditions}
                    <div class="detail-item">
                        <span class="label">{$t('report.conditions')}:</span>
                        <span class="value">{collectionDetails.conditions}</span>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
    
    <!-- Specimen List -->
    {#if specimens.length > 0}
        <h4 class="section-title-sub">{$t('report.specimen-list')}</h4>
        <ul class="list-items">
            {#each specimens as specimen}
                <li class="panel {getSpecimenTypeClass(specimen.type)} {getStatusClass(specimen.status)}">
                    <div class="specimen-header">
                        <div class="specimen-main">
                            <h5 class="specimen-id">{specimen.specimenId}</h5>
                            <div class="specimen-meta">
                                {#if specimen.type}
                                    <span class="specimen-type">{$t(`medical.enums.specimen_types.${specimen.type}`)}</span>
                                {/if}
                                {#if specimen.source}
                                    <span class="specimen-source">{specimen.source}</span>
                                {/if}
                            </div>
                        </div>
                        
                        <div class="specimen-badges">
                            {#if specimen.status}
                                <span class="status-badge {getStatusClass(specimen.status)}">
                                    {$t(`medical.enums.specimen_status.${specimen.status}`)}
                                </span>
                            {/if}
                            {#if specimen.priority}
                                <span class="priority-badge {getUrgencyClass(specimen.priority)}">
                                    {$t(`medical.enums.priority_levels.${specimen.priority}`)}
                                </span>
                            {/if}
                        </div>
                    </div>
                    
                    <div class="specimen-details">
                        {#if specimen.anatomicalLocation}
                            <div class="detail-item">
                                <span class="label">{$t('report.anatomical-location')}:</span>
                                <span class="value">{specimen.anatomicalLocation}</span>
                            </div>
                        {/if}
                        
                        {#if specimen.size}
                            <div class="detail-item">
                                <span class="label">{$t('report.size')}:</span>
                                <span class="value">{formatSize(specimen.size)}</span>
                            </div>
                        {/if}
                        
                        {#if specimen.weight}
                            <div class="detail-item">
                                <span class="label">{$t('report.weight')}:</span>
                                <span class="value">{specimen.weight}</span>
                            </div>
                        {/if}
                        
                        {#if specimen.color}
                            <div class="detail-item">
                                <span class="label">{$t('report.color')}:</span>
                                <span class="value">{specimen.color}</span>
                            </div>
                        {/if}
                        
                        {#if specimen.consistency}
                            <div class="detail-item">
                                <span class="label">{$t('report.consistency')}:</span>
                                <span class="value">{specimen.consistency}</span>
                            </div>
                        {/if}
                        
                        {#if specimen.receivedDate}
                            <div class="detail-item">
                                <span class="label">{$t('report.received-date')}:</span>
                                <span class="value">{formatDate(specimen.receivedDate)}</span>
                            </div>
                        {/if}
                        
                        {#if specimen.fixative}
                            <div class="detail-item">
                                <span class="label">{$t('report.fixative')}:</span>
                                <span class="value">{specimen.fixative}</span>
                            </div>
                        {/if}
                        
                        {#if specimen.container}
                            <div class="detail-item">
                                <span class="label">{$t('report.container')}:</span>
                                <span class="value">{specimen.container}</span>
                            </div>
                        {/if}
                        
                        {#if specimen.labelingIssues}
                            <div class="detail-item">
                                <span class="label">{$t('report.labeling-issues')}:</span>
                                <span class="value labeling-issues">{specimen.labelingIssues}</span>
                            </div>
                        {/if}
                    </div>
                    
                    {#if specimen.grossDescription}
                        <div class="gross-description">
                            <span class="label">{$t('report.gross-description')}:</span>
                            <p class="description-text">{specimen.grossDescription}</p>
                        </div>
                    {/if}
                    
                    {#if specimen.sections?.length > 0}
                        <div class="sections-info">
                            <span class="label">{$t('report.sections')}:</span>
                            <div class="sections-list">
                                {#each specimen.sections as section}
                                    <div class="section-item">
                                        <span class="section-id">{section.id}</span>
                                        {#if section.description}
                                            <span class="section-description">{section.description}</span>
                                        {/if}
                                        {#if section.stains}
                                            <span class="section-stains">{section.stains.join(', ')}</span>
                                        {/if}
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {/if}
                    
                    {#if specimen.notes}
                        <div class="specimen-notes">
                            <span class="label">{$t('report.notes')}:</span>
                            <p class="notes-text">{specimen.notes}</p>
                        </div>
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}
    
    <!-- Processing Information -->
    {#if Object.keys(processing).length > 0}
        <h4 class="section-title-sub">{$t('report.processing-information')}</h4>
        <div class="page -block">
            <div class="processing-info">
                {#if processing.processingDate}
                    <div class="detail-item">
                        <span class="label">{$t('report.processing-date')}:</span>
                        <span class="value">{formatDate(processing.processingDate)}</span>
                    </div>
                {/if}
                
                {#if processing.processingMethod}
                    <div class="detail-item">
                        <span class="label">{$t('report.processing-method')}:</span>
                        <span class="value">{processing.processingMethod}</span>
                    </div>
                {/if}
                
                {#if processing.fixationTime}
                    <div class="detail-item">
                        <span class="label">{$t('report.fixation-time')}:</span>
                        <span class="value">{processing.fixationTime}</span>
                    </div>
                {/if}
                
                {#if processing.embeddingDate}
                    <div class="detail-item">
                        <span class="label">{$t('report.embedding-date')}:</span>
                        <span class="value">{formatDate(processing.embeddingDate)}</span>
                    </div>
                {/if}
                
                {#if processing.sectioningDate}
                    <div class="detail-item">
                        <span class="label">{$t('report.sectioning-date')}:</span>
                        <span class="value">{formatDate(processing.sectioningDate)}</span>
                    </div>
                {/if}
                
                {#if processing.stainingDate}
                    <div class="detail-item">
                        <span class="label">{$t('report.staining-date')}:</span>
                        <span class="value">{formatDate(processing.stainingDate)}</span>
                    </div>
                {/if}
                
                {#if processing.processingNotes}
                    <div class="processing-notes">
                        <span class="label">{$t('report.processing-notes')}:</span>
                        <p class="notes-text">{processing.processingNotes}</p>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
    
    <!-- Storage Information -->
    {#if Object.keys(storage).length > 0}
        <h4 class="section-title-sub">{$t('report.storage-information')}</h4>
        <div class="page -block">
            <div class="storage-info">
                {#if storage.location}
                    <div class="detail-item">
                        <span class="label">{$t('report.storage-location')}:</span>
                        <span class="value">{storage.location}</span>
                    </div>
                {/if}
                
                {#if storage.temperature}
                    <div class="detail-item">
                        <span class="label">{$t('report.storage-temperature')}:</span>
                        <span class="value">{storage.temperature}</span>
                    </div>
                {/if}
                
                {#if storage.conditions}
                    <div class="detail-item">
                        <span class="label">{$t('report.storage-conditions')}:</span>
                        <span class="value">{storage.conditions}</span>
                    </div>
                {/if}
                
                {#if storage.retentionPeriod}
                    <div class="detail-item">
                        <span class="label">{$t('report.retention-period')}:</span>
                        <span class="value">{storage.retentionPeriod}</span>
                    </div>
                {/if}
                
                {#if storage.disposalDate}
                    <div class="detail-item">
                        <span class="label">{$t('report.disposal-date')}:</span>
                        <span class="value">{formatDate(storage.disposalDate)}</span>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
    
    <!-- Quality Assessment -->
    {#if Object.keys(quality).length > 0}
        <h4 class="section-title-sub">{$t('report.quality-assessment')}</h4>
        <div class="page -block">
            <div class="quality-info">
                {#if quality.overall}
                    <div class="quality-overall">
                        <span class="label">{$t('report.overall-quality')}:</span>
                        <span class="quality-value {getQualityClass(quality.overall)}">
                            {$t(`medical.enums.quality_levels.${quality.overall}`)}
                        </span>
                    </div>
                {/if}
                
                {#if quality.adequacy}
                    <div class="detail-item">
                        <span class="label">{$t('report.adequacy')}:</span>
                        <span class="value">{quality.adequacy}</span>
                    </div>
                {/if}
                
                {#if quality.artifacts?.length > 0}
                    <div class="artifacts-section">
                        <span class="label">{$t('report.artifacts')}:</span>
                        <div class="artifacts-list">
                            {#each quality.artifacts as artifact}
                                <span class="artifact-tag">{artifact}</span>
                            {/each}
                        </div>
                    </div>
                {/if}
                
                {#if quality.limitations?.length > 0}
                    <div class="limitations-section">
                        <span class="label">{$t('report.limitations')}:</span>
                        <ul class="limitations-list">
                            {#each quality.limitations as limitation}
                                <li>{limitation}</li>
                            {/each}
                        </ul>
                    </div>
                {/if}
                
                {#if quality.recommendations?.length > 0}
                    <div class="quality-recommendations">
                        <span class="label">{$t('report.quality-recommendations')}:</span>
                        <ul class="recommendations-list">
                            {#each quality.recommendations as recommendation}
                                <li>{recommendation}</li>
                            {/each}
                        </ul>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
    
    <!-- Staff Information -->
    {#if pathologist || technician}
        <h4 class="section-title-sub">{$t('report.staff-information')}</h4>
        <div class="page -block">
            <div class="staff-info">
                {#if pathologist}
                    <div class="staff-member">
                        <span class="label">{$t('report.pathologist')}:</span>
                        <div class="staff-details">
                            <span class="staff-name">{pathologist.name}</span>
                            {#if pathologist.title}
                                <span class="staff-title">{pathologist.title}</span>
                            {/if}
                            {#if pathologist.department}
                                <span class="staff-department">{pathologist.department}</span>
                            {/if}
                        </div>
                    </div>
                {/if}
                
                {#if technician}
                    <div class="staff-member">
                        <span class="label">{$t('report.technician')}:</span>
                        <div class="staff-details">
                            <span class="staff-name">{technician.name}</span>
                            {#if technician.title}
                                <span class="staff-title">{technician.title}</span>
                            {/if}
                        </div>
                    </div>
                {/if}
            </div>
        </div>
    {/if}
    
{:else if data}
    <h3 class="h3 heading -sticky">{$t('report.specimens')}</h3>
    <div class="page -block">
        <p class="no-data">{$t('report.no-specimen-data')}</p>
    </div>
{/if}

<style>
    .collection-info,
    .processing-info,
    .storage-info,
    .quality-info {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .specimen-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 0.75rem;
        gap: 1rem;
    }
    
    .specimen-main {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        flex: 1;
    }
    
    .specimen-id {
        font-size: 1.1rem;
        font-weight: 600;
        margin: 0;
        color: var(--color-text-primary);
    }
    
    .specimen-meta {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        flex-wrap: wrap;
    }
    
    .specimen-type {
        background-color: var(--color-info-light);
        color: var(--color-info-dark);
        padding: 0.125rem 0.375rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
        text-transform: uppercase;
    }
    
    .specimen-source {
        color: var(--color-text-secondary);
        font-size: 0.9rem;
        font-style: italic;
    }
    
    .specimen-badges {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        align-items: flex-end;
    }
    
    .status-badge,
    .priority-badge {
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
        text-transform: uppercase;
        white-space: nowrap;
    }
    
    .status-received {
        background-color: var(--color-info-light);
        color: var(--color-info-dark);
    }
    
    .status-processing {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
    }
    
    .status-completed {
        background-color: var(--color-positive-light);
        color: var(--color-positive-dark);
    }
    
    .status-insufficient {
        background-color: var(--color-negative-light);
        color: var(--color-negative-dark);
    }
    
    .status-contaminated {
        background-color: var(--color-negative-light);
        color: var(--color-negative-dark);
    }
    
    .urgency-routine {
        background-color: var(--color-info-light);
        color: var(--color-info-dark);
    }
    
    .urgency-urgent {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
    }
    
    .urgency-stat {
        background-color: var(--color-negative-light);
        color: var(--color-negative-dark);
    }
    
    .specimen-details {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .labeling-issues {
        color: var(--color-negative-dark);
        font-weight: 500;
    }
    
    .gross-description {
        margin-top: 0.75rem;
        padding-top: 0.75rem;
        border-top: 1px solid var(--color-border);
    }
    
    .description-text {
        margin: 0.25rem 0 0 0;
        color: var(--color-text-primary);
        line-height: 1.5;
    }
    
    .sections-info {
        margin-top: 0.75rem;
        padding-top: 0.75rem;
        border-top: 1px solid var(--color-border);
    }
    
    .sections-list {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        margin-top: 0.5rem;
    }
    
    .section-item {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        padding: 0.25rem;
        background-color: var(--color-surface);
        border-radius: 0.25rem;
        flex-wrap: wrap;
    }
    
    .section-id {
        font-weight: 600;
        color: var(--color-text-primary);
        background-color: var(--color-interactivity-light);
        color: var(--color-interactivity-dark);
        padding: 0.125rem 0.375rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
    }
    
    .section-description {
        color: var(--color-text-secondary);
        font-size: 0.9rem;
        flex: 1;
    }
    
    .section-stains {
        color: var(--color-text-secondary);
        font-size: 0.8rem;
        font-style: italic;
    }
    
    .specimen-notes {
        margin-top: 0.75rem;
        padding-top: 0.75rem;
        border-top: 1px solid var(--color-border);
    }
    
    .notes-text {
        margin: 0.25rem 0 0 0;
        color: var(--color-text-secondary);
        line-height: 1.5;
        font-style: italic;
    }
    
    .processing-notes {
        margin-top: 0.75rem;
        padding-top: 0.75rem;
        border-top: 1px solid var(--color-border);
    }
    
    .quality-overall {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.75rem;
        padding: 0.5rem;
        background-color: var(--color-surface);
        border-radius: 0.25rem;
    }
    
    .quality-value {
        font-weight: 600;
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        text-transform: uppercase;
        font-size: 0.9rem;
    }
    
    .quality-excellent {
        background-color: var(--color-positive-light);
        color: var(--color-positive-dark);
    }
    
    .quality-good {
        background-color: var(--color-positive-light);
        color: var(--color-positive-dark);
    }
    
    .quality-adequate {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
    }
    
    .quality-poor {
        background-color: var(--color-negative-light);
        color: var(--color-negative-dark);
    }
    
    .quality-inadequate {
        background-color: var(--color-negative-light);
        color: var(--color-negative-dark);
    }
    
    .artifacts-section {
        margin-bottom: 0.75rem;
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
    
    .limitations-section,
    .quality-recommendations {
        margin-bottom: 0.75rem;
    }
    
    .limitations-list,
    .recommendations-list {
        margin: 0.5rem 0 0 1.5rem;
        padding: 0;
    }
    
    .limitations-list li,
    .recommendations-list li {
        margin-bottom: 0.25rem;
        color: var(--color-text-secondary);
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
        min-width: 150px;
        flex-shrink: 0;
    }
    
    .value {
        color: var(--color-text-primary);
        flex: 1;
        line-height: 1.4;
    }
    
    /* Specimen type panel coloring */
    .specimen-tissue {
        border-left-color: var(--color-interactivity);
    }
    
    .specimen-blood {
        border-left-color: var(--color-negative);
    }
    
    .specimen-urine {
        border-left-color: var(--color-warning);
    }
    
    .specimen-fluid {
        border-left-color: var(--color-info);
    }
    
    .specimen-cytology {
        border-left-color: var(--color-gray-800);
    }
    
    .specimen-biopsy {
        border-left-color: var(--color-interactivity);
    }
    
    .specimen-surgical {
        border-left-color: var(--color-positive);
    }
    
    .specimen-frozen {
        border-left-color: var(--color-info);
    }
    
    .specimen-general {
        border-left-color: var(--color-text-secondary);
    }
    
    /* Status-based panel coloring overrides */
    .status-received {
        border-left-color: var(--color-info);
    }
    
    .status-processing {
        border-left-color: var(--color-warning);
    }
    
    .status-completed {
        border-left-color: var(--color-positive);
    }
    
    .status-insufficient {
        border-left-color: var(--color-negative);
    }
    
    .status-contaminated {
        border-left-color: var(--color-negative);
        border-left-width: 4px;
    }
</style>