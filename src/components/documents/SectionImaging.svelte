<script lang="ts">
    import { t } from '$lib/i18n';
    import { translateAnatomy } from '$lib/i18n/anatomy';
    import ui from '$lib/ui';
    import Modal from '$components/ui/Modal.svelte';
    import { decrypt } from '$lib/documents/index';
    import { base64ToArrayBuffer } from '$lib/arrays';
    import { apiFetch } from '$lib/api/client';
    import { logger } from '$lib/logging/logger';

    let selectedImage = $state<string | null>(null);
    let dicomData = $state<ArrayBuffer | null>(null);
    let isDicomLoading = $state(false);
    let dicomError = $state<string | null>(null);

    function openPreview(src: string) {
        selectedImage = src;
    }

    function closePreview() {
        selectedImage = null;
        dicomData = null;
        dicomError = null;
    }

    async function openDicomViewer(attachment: Attachment) {
        if (!encryptionKey || !attachment.path) return;
        dicomData = null;
        dicomError = null;
        isDicomLoading = true;
        selectedImage = attachment.thumbnail || '__dicom__';

        try {
            const profileId = attachment.path.split('/')[0];
            const fileResponse = await apiFetch(`/v1/med/profiles/${profileId}/attachments?path=${encodeURIComponent(attachment.path)}`);

            if (!fileResponse.ok) {
                throw new Error(`Failed to fetch: ${fileResponse.status}`);
            }

            const encryptedData = await fileResponse.text();
            const file = await decrypt([encryptedData], encryptionKey);
            const json = JSON.parse(file[0]);
            dicomData = base64ToArrayBuffer(json.file);
        } catch (e) {
            logger.api.error('[SectionImaging] Failed to load DICOM:', e);
            dicomError = e instanceof Error ? e.message : 'Failed to load DICOM data';
        } finally {
            isDicomLoading = false;
        }
    }

    function handleThumbnailClick(attachment: Attachment) {
        logger.api.info('[SectionImaging] handleThumbnailClick:', {
            type: attachment.type,
            path: attachment.path,
            hasKey: !!encryptionKey,
            hasThumbnail: !!attachment.thumbnail,
        });
        if (isDicomAttachment(attachment)) {
            if (attachment.path && encryptionKey) {
                openDicomViewer(attachment);
            } else {
                dicomError = !encryptionKey ? 'Missing encryption key' : 'Missing DICOM file path';
                selectedImage = attachment.thumbnail || '__dicom__';
            }
        } else if (attachment.thumbnail) {
            openPreview(attachment.thumbnail);
        }
    }

    interface Anomaly {
        type?: string;
        description?: string;
        location?: { bodyPart?: string; region?: string; side?: string };
        measurements?: { size?: string; area?: string; volume?: string; other?: string };
        severity?: string;
        confidence?: number;
        urgentFinding?: boolean;
    }

    interface Study {
        modality?: string;
        anatomicalRegion?: string;
        viewPosition?: string;
        imageQuality?: string;
        anomalies?: Anomaly[];
        overallAssessment?: {
            summary?: string;
            primaryFindings?: string[];
            hasUrgentFindings?: boolean;
            recommendedActions?: string[];
            overallConfidence?: number;
        };
        visualDescription?: string;
        technicalQuality?: { contrast?: string; brightness?: string; artifacts?: boolean; positioning?: string };
    }

    interface Attachment {
        type?: string;
        thumbnail?: string;
        path?: string;
    }

    interface Props {
        data: { studies?: Study[]; attachments?: Attachment[] };
        document?: any;
        encryptionKey?: string;
    }

    let { data, document: doc, encryptionKey }: Props = $props();

    function isDicomAttachment(attachment: Attachment): boolean {
        return attachment.type?.includes('dicom') === true;
    }

    let studies = $derived(data?.studies || []);
    let attachments = $derived(data?.attachments || []);

    function translateEnum(prefix: string, value: string): string {
        const key = `report.${prefix}.${value}`;
        const translated = $t(key);
        return translated && translated !== key ? translated : value.replace(/_/g, ' ');
    }

    function hasSidePrefix(part: string): boolean {
        const normalized = normalize(part);
        return normalized.startsWith('L_') || normalized.startsWith('R_');
    }

    function normalize(str: string): string {
        return str.replace(/ /gi, '_');
    }

    function showBodyPart(part: string) {
        ui.emit('viewer:anatomy', { object: normalize(part) });
    }

    function getSeverityClass(severity?: string): string {
        switch (severity) {
            case 'critical': return '-critical';
            case 'severe': return '-severe';
            case 'moderate': return '-moderate';
            case 'mild': return '-mild';
            default: return '';
        }
    }
</script>

{#if studies.length > 0 || attachments.length > 0}
    <h3 class="h3 heading -sticky">{$t('report.imaging')}</h3>

    <!-- Thumbnail gallery from attachments -->
    {#if attachments.length > 0}
        <div class="page -block">
            <div class="thumbnail-gallery">
                {#each attachments as attachment}
                    {#if attachment.thumbnail}
                        <button class="thumbnail-item" onclick={() => handleThumbnailClick(attachment)}>
                            <img src={attachment.thumbnail} loading="lazy" alt={attachment.type || 'Medical image'} />
                            {#if isDicomAttachment(attachment)}
                                <div class="dicom-badge">DICOM</div>
                            {/if}
                        </button>
                    {/if}
                {/each}
            </div>
        </div>
    {/if}

    <!-- Per-study analysis -->
    {#each studies as study, i}
        <div class="page -block imaging-study">
            <!-- Study metadata -->
            <div class="study-meta">
                {#if study.modality}
                    <span class="badge -modality">{translateEnum('imaging-modalities', study.modality)}</span>
                {/if}
                {#if study.anatomicalRegion}
                    <span class="badge -region">{translateEnum('imaging-regions', study.anatomicalRegion)}</span>
                {/if}
                {#if study.viewPosition}
                    <span class="badge -view">{translateEnum('imaging-views', study.viewPosition)}</span>
                {/if}
                {#if study.imageQuality}
                    <span class="badge -quality -{study.imageQuality}">{$t('report.imaging-quality')}: {translateEnum('imaging-quality-values', study.imageQuality)}</span>
                {/if}
            </div>

            <!-- Visual description -->
            {#if study.visualDescription}
                <p class="visual-description">{study.visualDescription}</p>
            {/if}
        </div>
            <!-- Anomalies -->
            {#if study.anomalies && study.anomalies.length > 0}
                <h4 class="h4">{$t('report.imaging-anomalies')}</h4>
                <ul class="list-items">
                    {#each study.anomalies as anomaly}
                        <li class="panel anomaly-item {getSeverityClass(anomaly.severity)}">
                            <div class="anomaly-header">
                                {#if anomaly.type}
                                    <span class="anomaly-type">{translateEnum('imaging-anomaly-types', anomaly.type)}</span>
                                {/if}
                                {#if anomaly.severity}
                                    <span class="badge -severity {getSeverityClass(anomaly.severity)}">{translateEnum('imaging-severity', anomaly.severity)}</span>
                                {/if}
                                {#if anomaly.urgentFinding}
                                    <span class="badge -urgent">{$t('report.imaging-urgent')}</span>
                                {/if}
                            </div>
                            {#if anomaly.description}
                                <p class="p anomaly-description">{anomaly.description}</p>
                            {/if}
                            {#if anomaly.location}
                                <div class="anomaly-detail">
                                    <span class="label">{$t('report.location')}:</span>
                                    <span>
                                        {anomaly.location.bodyPart ? translateAnatomy(normalize(anomaly.location.bodyPart), $t) : ''}
                                        {#if anomaly.location.region} - {translateAnatomy(normalize(anomaly.location.region), $t)}{/if}
                                        {#if anomaly.location.side && !(anomaly.location.bodyPart && hasSidePrefix(anomaly.location.bodyPart))} ({translateEnum('imaging-sides', anomaly.location.side)}){/if}
                                    </span>
                                    {#if anomaly.location.bodyPart}
                                        <button class="anatomy-btn" onclick={() => showBodyPart(anomaly.location!.bodyPart!)} aria-label="View body part anatomy">
                                            <svg><use href="/icons.svg#anatomy" /></svg>
                                        </button>
                                    {/if}
                                </div>
                            {/if}
                            {#if anomaly.measurements?.size}
                                <div class="anomaly-detail">
                                    <span class="label">{$t('report.imaging-size')}:</span>
                                    <span>{anomaly.measurements.size}</span>
                                </div>
                            {/if}
                        </li>
                    {/each}
                </ul>
            {/if}

            <!-- Overall assessment -->

            {#if study.overallAssessment}
                <h4 class="h4">{$t('report.imaging-assessment')}</h4>
                <div class="page -block imaging-study">
                <div class="assessment">
                    {#if study.overallAssessment.summary}
                        <p class="assessment-summary">{study.overallAssessment.summary}</p>
                    {/if}
                    {#if study.overallAssessment.primaryFindings && study.overallAssessment.primaryFindings.length > 0}
                        <div class="findings-list">
                            <span class="label">{$t('report.findings')}:</span>
                            <ul>
                                {#each study.overallAssessment.primaryFindings as finding}
                                    <li>{finding}</li>
                                {/each}
                            </ul>
                        </div>
                    {/if}
                    {#if study.overallAssessment.recommendedActions && study.overallAssessment.recommendedActions.length > 0}
                        <div class="findings-list">
                            <span class="label">{$t('report.imaging-recommended-actions')}:</span>
                            <ul>
                                {#each study.overallAssessment.recommendedActions as action}
                                    <li>{action}</li>
                                {/each}
                            </ul>
                        </div>
                    {/if}
                </div>
            </div>
            {/if}
    {/each}
{/if}

{#if selectedImage}
    <Modal onclose={closePreview} style="padding: 0;">
        {#if dicomData || isDicomLoading || dicomError}
            <!-- DICOM Viewer modal -->
            <div class="dicom-modal-content">
                {#if isDicomLoading}
                    <div class="loading-state">
                        <div class="spinner"></div>
                        <p>{$t('dicom.loading')}</p>
                    </div>
                {:else if dicomError}
                    <div class="error-state">
                        <p>{dicomError}</p>
                    </div>
                {:else if dicomData}
                    {#await import('../viewers/DicomViewer.svelte') then module}
                        <module.default dicomData={dicomData} />
                    {/await}
                {/if}
            </div>
        {:else}
            <!-- Static image fallback -->
            <div class="fullscreen-image">
                <img src={selectedImage} alt="Medical imaging" />
            </div>
        {/if}
    </Modal>
{/if}

<style>
    .thumbnail-gallery {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ui-pad-small);
    }

    .thumbnail-item {
        height: 15rem;
        border-radius: var(--ui-radius-medium);
        overflow: hidden;
        background: #000;
        border: none;
        padding: 0;
        cursor: pointer;
        transition: opacity 0.15s ease;
        position: relative;
    }

    .thumbnail-item:hover {
        opacity: 0.85;
    }

    .thumbnail-item img {
        height: 100%;
        width: auto;
        object-fit: contain;
        display: block;
    }

    .dicom-badge {
        position: absolute;
        bottom: 0.375rem;
        right: 0.375rem;
        background: rgba(0, 0, 0, 0.75);
        color: #4a9eff;
        font-size: 0.65rem;
        font-weight: 600;
        padding: 0.125rem 0.375rem;
        border-radius: 3px;
        letter-spacing: 0.05em;
    }

    .fullscreen-image {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
    }

    .fullscreen-image img {
        max-width: 90vw;
        max-height: 85vh;
        object-fit: contain;
    }

    .dicom-modal-content {
        width: 90vw;
        height: 85vh;
        display: flex;
        flex-direction: column;
    }

    .loading-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        flex: 1;
        color: #aaa;
    }

    .spinner {
        width: 40px;
        height: 40px;
        border: 4px solid #333;
        border-top: 4px solid #aaa;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: 1rem;
    }

    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }

    .error-state {
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 1;
        color: #f66;
        padding: 2rem;
        text-align: center;
    }

    .imaging-study {
        display: flex;
        flex-direction: column;
        gap: var(--ui-pad-small);
    }

    .study-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 0.375rem;
    }

    .badge {
        padding: 0.125rem 0.5rem;
        border-radius: var(--ui-radius-small);
        font-size: 0.8rem;
        font-weight: 500;
        text-transform: capitalize;
    }

    .badge.-modality {
        background: var(--color-interactivity);
        color: #fff;
    }

    .badge.-region {
        background: var(--color-gray-200);
        color: var(--color-text-primary);
    }

    .badge.-view {
        background: var(--color-gray-200);
        color: var(--color-text-secondary);
    }

    .badge.-quality {
        background: var(--color-gray-100);
        color: var(--color-text-secondary);
    }

    .badge.-severity {
        text-transform: uppercase;
        font-size: 0.7rem;
    }

    .badge.-severity.-critical,
    .badge.-severity.-severe {
        background: var(--color-negative);
        color: #fff;
    }

    .badge.-severity.-moderate {
        background: var(--color-warning);
        color: #fff;
    }

    .badge.-severity.-mild {
        background: var(--color-positive);
        color: #fff;
    }

    .badge.-urgent {
        background: var(--color-negative);
        color: #fff;
        font-weight: 600;
        text-transform: uppercase;
        font-size: 0.7rem;
    }

    .visual-description {
        line-height: 1.5;
        margin: 0;
    }

    .subsection-title {
        font-size: 0.95rem;
        font-weight: 600;
        margin: var(--ui-pad-small) 0 0;
        color: var(--color-text-primary);
    }

    .anomaly-item {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }

    .anomaly-header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
    }

    .anomaly-type {
        font-weight: 600;
        text-transform: capitalize;
        color: var(--color-text-primary);
    }

    .anomaly-description {
        margin: 0;
        line-height: 1.4;
    }

    .anomaly-detail {
        display: flex;
        gap: 0.5rem;
        font-size: 0.9rem;
    }

    .label {
        font-weight: 500;
        color: var(--color-text-secondary);
        flex-shrink: 0;
    }

    .assessment {
        display: flex;
        flex-direction: column;
        gap: var(--ui-pad-small);
    }

    .assessment-summary {
        margin: 0;
        line-height: 1.5;
    }

    .findings-list {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }

    .findings-list ul {
        margin: 0;
        padding-left: 1.25rem;
    }

    .findings-list li {
        line-height: 1.4;
        color: var(--color-text-primary);
    }

    .panel.-critical,
    .panel.-severe {
        border-left: var(--indicator-width) solid var(--color-negative);
    }

    .panel.-moderate {
        border-left: var(--indicator-width) solid var(--color-warning);
    }

    .anatomy-btn {
        background: none;
        border: none;
        cursor: pointer;
        padding: 0.125rem;
        color: var(--color-text-secondary);
        flex-shrink: 0;
    }

    .anatomy-btn:hover {
        color: var(--color-interactivity);
    }

    .anatomy-btn svg {
        width: 1.25rem;
        height: 1.25rem;
    }
</style>
