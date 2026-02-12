<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import PdfViewer from './Pdf.svelte';
    import ImageViewer from './ImageViewer.svelte';
    import TextViewer from './TextViewer.svelte';
    import UnsupportedViewer from './UnsupportedViewer.svelte';
    import { t } from '$lib/i18n';

    interface Props {
        data: ArrayBuffer;
        mimeType: string;
        fileName?: string;
        isPreview?: boolean;
    }

    let { data, mimeType, fileName = 'document', isPreview = false }: Props = $props();

    const dispatch = createEventDispatcher();

    // Document type detection and routing
    function getViewerComponent(mimeType: string) {
        // PDF documents
        if (mimeType === 'application/pdf') {
            return PdfViewer;
        }
        
        // Image documents
        if (mimeType.startsWith('image/')) {
            return ImageViewer;
        }
        
        // Text documents
        if (mimeType.startsWith('text/') || 
            mimeType === 'application/json' ||
            mimeType === 'application/xml') {
            return TextViewer;
        }

        // Add more document types here as needed
        // Examples for future expansion:
        // - Word documents: application/vnd.openxmlformats-officedocument.wordprocessingml.document
        // - Excel: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
        // - PowerPoint: application/vnd.openxmlformats-officedocument.presentationml.presentation
        
        return UnsupportedViewer;
    }

    function getViewerProps(mimeType: string, data: ArrayBuffer) {
        if (mimeType === 'application/pdf') {
            return { pdfData: data };
        }
        
        if (mimeType.startsWith('image/')) {
            return { imageData: data, mimeType };
        }
        
        if (mimeType.startsWith('text/') || 
            mimeType === 'application/json' ||
            mimeType === 'application/xml') {
            return { textData: data, mimeType };
        }
        
        return { data, mimeType, fileName };
    }

    let ViewerComponent = $derived(getViewerComponent(mimeType));
    let viewerProps = $derived(getViewerProps(mimeType, data));
    
    function handleViewerEvent(event: CustomEvent) {
        dispatch(event.type, event.detail);
    }
</script>

<style>
    .document-viewer {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
    }

    /* Unused - no document-header class in template
    .document-header {
        padding: 1rem;
        border-bottom: 1px solid var(--border-color, #e0e0e0);
        background: var(--bg-secondary, #f8f9fa);
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    */

    /* Unused - no document-info class in template
    .document-info h3 {
        margin: 0;
        font-size: 1.1rem;
        color: var(--text-primary, #333);
    }
    */

    /* Unused - no document-info class in template
    .document-info p {
        margin: 0.25rem 0 0 0;
        font-size: 0.9rem;
        color: var(--text-secondary, #666);
    }
    */

    /* Unused - no document-actions class in template
    .document-actions {
        display: flex;
        gap: 0.5rem;
    }
    */

    /* Unused - no btn class in template
    .btn {
        padding: 0.5rem 1rem;
        border: 1px solid var(--border-color, #ddd);
        background: var(--bg-primary, #fff);
        color: var(--text-primary, #333);
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.9rem;
        transition: all 0.2s ease;
    }
    */

    /* Unused - no btn class in template
    .btn:hover {
        background: var(--bg-hover, #f0f0f0);
    }
    */

    /* Unused - no btn class in template
    .btn.primary {
        background: var(--primary-color, #007bff);
        color: white;
        border-color: var(--primary-color, #007bff);
    }
    */

    /* Unused - no btn class in template
    .btn.primary:hover {
        background: var(--primary-hover, #0056b3);
    }
    */

    .viewer-content {
        flex: 1;
        overflow: auto;
        padding: 1rem;
    }

    .preview-mode .viewer-content {
        max-height: 400px;
    }
</style>

<div class="document-viewer" class:preview-mode={isPreview}>
    <div class="viewer-content">
        <svelte:component
            this={ViewerComponent}
            {...viewerProps}
            onerror={handleViewerEvent}
            onloaded={handleViewerEvent}
        />
    </div>
</div> 