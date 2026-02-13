<script lang="ts">
    import { t } from '$lib/i18n';
    import { onMount } from 'svelte';
    import { browser } from '$app/environment';

    interface Props {
        data: any;
        document?: any;
        key?: string;
    }

    let { data, document, key }: Props = $props();
    
    let hasImaging = $derived(data && (data.title || data.bodyParts?.length > 0));
    
    let title = $derived(data?.title || '');
    let bodyParts = $derived(data?.bodyParts || []);
    let date = $derived(data?.date);
    let imageUrls = $derived(data?.imageUrls || []);
    let dicomData = $derived(data?.dicomData || []);
    
    // Cornerstone.js variables
    let cornerstoneElements: HTMLDivElement[] = [];
    let cornerstoneLoaded = $state(false);
    
    // Load Cornerstone.js on mount - BROWSER ONLY
    onMount(async () => {
        // Critical: Only load Cornerstone in browser environment
        if (!browser) {
            console.warn('[SectionImaging] Cornerstone loading skipped - not in browser');
            return;
        }

        try {
            console.log('[SectionImaging] Loading Cornerstone modules...');
            // Dynamically import Cornerstone.js - browser only
            const cornerstone = await import('cornerstone-core');
            const cornerstoneWADOImageLoader = await import('cornerstone-wado-image-loader');
            const dicomParser = await import('dicom-parser');
            
            // Initialize Cornerstone
            cornerstone.external.cornerstone = cornerstone;
            cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
            cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
            
            // Configure WADO image loader
            cornerstoneWADOImageLoader.configure({
                beforeSend: (xhr: XMLHttpRequest) => {
                    // Add authorization headers if needed
                    if (key) {
                        xhr.setRequestHeader('Authorization', `Bearer ${key}`);
                    }
                }
            });
            
            cornerstoneLoaded = true;
            
            // Load DICOM images if available
            if (dicomData.length > 0) {
                await loadDicomImages(cornerstone);
            }
        } catch (error) {
            console.error('[SectionImaging] Failed to load Cornerstone.js:', error);
            console.warn('[SectionImaging] DICOM viewing will not be available');
            // Set a flag to show fallback UI
            cornerstoneLoaded = false;
        }
    });
    
    async function loadDicomImages(cornerstone: any) {
        for (let i = 0; i < dicomData.length && i < cornerstoneElements.length; i++) {
            const element = cornerstoneElements[i];
            const dicomUrl = dicomData[i].url || dicomData[i];
            
            try {
                cornerstone.enable(element);
                const imageId = `wadouri:${dicomUrl}`;
                const image = await cornerstone.loadImage(imageId);
                cornerstone.displayImage(element, image);
                
                // Add mouse tools
                element.addEventListener('mousedown', (e: MouseEvent) => {
                    let lastX = e.pageX;
                    let lastY = e.pageY;
                    
                    function mouseMoveHandler(e: MouseEvent) {
                        const deltaX = e.pageX - lastX;
                        const deltaY = e.pageY - lastY;
                        lastX = e.pageX;
                        lastY = e.pageY;
                        
                        const viewport = cornerstone.getViewport(element);
                        viewport.translation.x += deltaX;
                        viewport.translation.y += deltaY;
                        cornerstone.setViewport(element, viewport);
                    }
                    
                    function mouseUpHandler() {
                        document.removeEventListener('mousemove', mouseMoveHandler);
                        document.removeEventListener('mouseup', mouseUpHandler);
                    }
                    
                    document.addEventListener('mousemove', mouseMoveHandler);
                    document.addEventListener('mouseup', mouseUpHandler);
                });
                
                // Add wheel zoom
                element.addEventListener('wheel', (e: WheelEvent) => {
                    e.preventDefault();
                    const viewport = cornerstone.getViewport(element);
                    const scaleFactor = 1.1;
                    viewport.scale = e.deltaY < 0 ? viewport.scale * scaleFactor : viewport.scale / scaleFactor;
                    cornerstone.setViewport(element, viewport);
                });
                
            } catch (error) {
                console.error('Error loading DICOM image:', error);
            }
        }
    }
    
    function getUrgencyClass(urgency: number): string {
        if (urgency >= 5) return 'urgency-5';
        if (urgency >= 4) return 'urgency-4';
        if (urgency >= 3) return 'urgency-3';
        if (urgency >= 2) return 'urgency-2';
        return 'urgency-1';
    }
    
    function getStatusClass(status: string): string {
        if (!status) return 'status-unknown';
        
        const lowerStatus = status.toLowerCase();
        if (lowerStatus.includes('normal') || lowerStatus.includes('unremarkable')) {
            return 'status-normal';
        } else if (lowerStatus.includes('abnormal') || lowerStatus.includes('pathological')) {
            return 'status-abnormal';
        } else if (lowerStatus.includes('suspicious') || lowerStatus.includes('concerning')) {
            return 'status-suspicious';
        }
        return 'status-findings';
    }
    
    function getBodyPartClass(bodyPartId: string): string {
        // Map body part IDs to visual categories for styling
        const bodyPartCategories: Record<string, string> = {
            // Head and Brain
            'head': 'category-head',
            'skull': 'category-head',
            'brain': 'category-head',
            'neck': 'category-head',
            
            // Chest and Respiratory
            'chest': 'category-chest',
            'thorax': 'category-chest',
            'lungs': 'category-chest',
            'heart': 'category-chest',
            'sternum': 'category-chest',
            
            // Abdomen and Digestive
            'abdomen': 'category-abdomen',
            'stomach': 'category-abdomen',
            'liver_right': 'category-abdomen',
            'liver_left': 'category-abdomen',
            'pancreas': 'category-abdomen',
            'kidneys': 'category-abdomen',
            
            // Spine
            'cervical_spine': 'category-spine',
            'thoracic_spine': 'category-spine',
            'lumbar_spine': 'category-spine',
            'coccyx': 'category-spine',
            
            // Extremities
            'L_femur': 'category-extremities',
            'R_femur': 'category-extremities',
            'L_tibia': 'category-extremities',
            'R_tibia': 'category-extremities',
            'L_humerus': 'category-extremities',
            'R_humerus': 'category-extremities',
            
            // Pelvis and Urogenital
            'pelvis': 'category-pelvis',
            'bladder': 'category-pelvis',
            'uterus': 'category-pelvis',
            'prostate': 'category-pelvis'
        };
        
        return bodyPartCategories[bodyPartId] || 'category-general';
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
    
    function formatBodyPartName(bodyPartId: string): string {
        // Convert body part ID to human-readable format
        return bodyPartId
            .replace(/_/g, ' ')
            .replace(/^L_/, 'Left ')
            .replace(/^R_/, 'Right ')
            .replace(/\b\w/g, (l) => l.toUpperCase());
    }
</script>

{#if hasImaging}
    <h3 class="h3 heading -sticky">{$t('report.imaging')}</h3>
    
    {#if title}
        <div class="page -block">
            <div class="imaging-header">
                <h4 class="imaging-title">{title}</h4>
                {#if date}
                    <span class="imaging-date">{formatDate(date)}</span>
                {/if}
            </div>
        </div>
    {/if}
    
    <!-- DICOM Images Display -->
    {#if dicomData.length > 0}
        <h4 class="section-title-sub">{$t('report.dicom-images')}</h4>
        <div class="page -block">
            <div class="dicom-grid">
                {#each dicomData as dicom, index}
                    <div class="dicom-container">
                        <div 
                            class="dicom-viewer"
                            bind:this={cornerstoneElements[index]}
                        >
                            {#if !cornerstoneLoaded}
                                <div class="loading-placeholder">
                                    <span>{$t('report.loading-dicom')}</span>
                                </div>
                            {/if}
                        </div>
                        {#if dicom.title}
                            <div class="dicom-title">{dicom.title}</div>
                        {/if}
                    </div>
                {/each}
            </div>
        </div>
    {/if}
    
    <!-- Standard Images -->
    {#if imageUrls.length > 0}
        <h4 class="section-title-sub">{$t('report.images')}</h4>
        <div class="page -block">
            <div class="image-grid">
                {#each imageUrls as imageUrl}
                    <div class="image-container">
                        <img src={imageUrl} alt="Medical imaging" loading="lazy" class="medical-image" />
                    </div>
                {/each}
            </div>
        </div>
    {/if}
    
    <!-- Body Parts Analysis -->
    {#if bodyParts.length > 0}
        <h4 class="section-title-sub">{$t('report.anatomical-findings')}</h4>
        <ul class="list-items">
            {#each bodyParts as bodyPart}
                <li class="panel {getBodyPartClass(bodyPart.identification)} {getUrgencyClass(bodyPart.urgency)}">
                    <div class="bodypart-header">
                        <div class="bodypart-name-section">
                            <h5 class="bodypart-name">{formatBodyPartName(bodyPart.identification)}</h5>
                            {#if bodyPart.urgency}
                                <span class="urgency-badge urgency-{bodyPart.urgency}">
                                    {$t('report.urgency')} {bodyPart.urgency}
                                </span>
                            {/if}
                        </div>
                        {#if bodyPart.status}
                            <span class="status-badge {getStatusClass(bodyPart.status)}">
                                {bodyPart.status}
                            </span>
                        {/if}
                    </div>
                    
                    <div class="bodypart-details">
                        {#if bodyPart.diagnosis}
                            <div class="detail-item">
                                <span class="label">{$t('report.diagnosis')}:</span>
                                <span class="value diagnosis-text">{bodyPart.diagnosis}</span>
                            </div>
                        {/if}
                        
                        {#if bodyPart.treatment}
                            <div class="detail-item">
                                <span class="label">{$t('report.treatment')}:</span>
                                <span class="value treatment-text">{bodyPart.treatment}</span>
                            </div>
                        {/if}
                    </div>
                </li>
            {/each}
        </ul>
    {/if}
    
{:else if data}
    <h3 class="h3 heading -sticky">{$t('report.imaging')}</h3>
    <div class="page -block">
        <p class="no-data">{$t('report.no-imaging-data')}</p>
    </div>
{/if}

<style>
    .imaging-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 1rem;
        gap: 1rem;
    }
    
    .imaging-title {
        font-size: 1.2rem;
        font-weight: 600;
        margin: 0;
        color: var(--color-text-primary);
        flex: 1;
    }
    
    .imaging-date {
        color: var(--color-text-secondary);
        font-size: 0.9rem;
        white-space: nowrap;
    }
    
    /* DICOM Viewer Styles */
    .dicom-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 1rem;
        margin-bottom: 1rem;
    }
    
    .dicom-container {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .dicom-viewer {
        width: 100%;
        height: 300px;
        border: 2px solid var(--color-border);
        border-radius: 0.5rem;
        background-color: var(--color-background-secondary);
        position: relative;
        overflow: hidden;
        cursor: grab;
    }
    
    .dicom-viewer:active {
        cursor: grabbing;
    }
    
    .loading-placeholder {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: var(--color-text-secondary);
        font-style: italic;
    }
    
    .dicom-title {
        text-align: center;
        font-size: 0.9rem;
        font-weight: 500;
        color: var(--color-text-secondary);
    }
    
    /* Standard Images */
    .image-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 1rem;
        margin-bottom: 1rem;
    }
    
    .image-container {
        border: 1px solid var(--color-border);
        border-radius: 0.5rem;
        overflow: hidden;
    }
    
    .medical-image {
        width: 100%;
        height: auto;
        display: block;
    }
    
    /* Body Parts Analysis */
    .bodypart-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 0.75rem;
        gap: 1rem;
    }
    
    .bodypart-name-section {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        flex: 1;
    }
    
    .bodypart-name {
        font-size: 1.1rem;
        font-weight: 600;
        margin: 0;
        color: var(--color-text-primary);
    }
    
    .urgency-badge {
        padding: 0.125rem 0.375rem;
        border-radius: 0.25rem;
        font-size: 0.7rem;
        font-weight: 500;
        text-transform: uppercase;
        width: fit-content;
    }
    
    .urgency-1 {
        background-color: var(--color-success-light);
        color: var(--color-success-dark);
    }
    
    .urgency-2 {
        background-color: var(--color-info-light);
        color: var(--color-info-dark);
    }
    
    .urgency-3 {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
    }
    
    .urgency-4 {
        background-color: var(--color-danger-light);
        color: var(--color-danger-dark);
    }
    
    .urgency-5 {
        background-color: var(--color-danger);
        color: white;
    }
    
    .status-badge {
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.8rem;
        font-weight: 500;
        text-transform: uppercase;
        white-space: nowrap;
    }
    
    .status-normal {
        background-color: var(--color-success-light);
        color: var(--color-success-dark);
    }
    
    .status-abnormal {
        background-color: var(--color-danger-light);
        color: var(--color-danger-dark);
    }
    
    .status-suspicious {
        background-color: var(--color-warning-light);
        color: var(--color-warning-dark);
    }
    
    .status-findings {
        background-color: var(--color-info-light);
        color: var(--color-info-dark);
    }
    
    .status-unknown {
        background-color: var(--color-secondary-light);
        color: var(--color-secondary-dark);
    }
    
    .bodypart-details {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    
    .detail-item {
        display: flex;
        gap: 0.5rem;
        align-items: flex-start;
    }
    
    .label {
        font-weight: 500;
        color: var(--color-text-secondary);
        min-width: 80px;
        flex-shrink: 0;
    }
    
    .value {
        color: var(--color-text-primary);
        flex: 1;
        line-height: 1.4;
    }
    
    .diagnosis-text {
        font-weight: 500;
        color: var(--color-text-primary);
    }
    
    .treatment-text {
        color: var(--color-text-secondary);
        font-style: italic;
    }
    
    /* Body part category colors */
    .category-head {
        border-left-color: var(--color-primary);
    }
    
    .category-chest {
        border-left-color: var(--color-info);
    }
    
    .category-abdomen {
        border-left-color: var(--color-warning);
    }
    
    .category-spine {
        border-left-color: var(--color-success);
    }
    
    .category-extremities {
        border-left-color: var(--color-secondary);
    }
    
    .category-pelvis {
        border-left-color: var(--color-danger);
    }
    
    .category-general {
        border-left-color: var(--color-text-secondary);
    }
    
    /* Urgency-based panel coloring overrides */
    .urgency-5 {
        border-left-color: var(--color-danger);
        border-left-width: 4px;
    }
    
    .urgency-4 {
        border-left-color: var(--color-danger);
        border-left-width: 3px;
    }
    
    .urgency-3 {
        border-left-color: var(--color-warning);
    }
    
    .urgency-2 {
        border-left-color: var(--color-info);
    }
    
    .urgency-1 {
        border-left-color: var(--color-success);
    }
</style>