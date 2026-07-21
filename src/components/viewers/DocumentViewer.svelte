<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import PdfViewer from './Pdf.svelte';
    import ImageViewer from './ImageViewer.svelte';
    import TextViewer from './TextViewer.svelte';
    import DicomViewer from './DicomViewer.svelte';
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
        if (mimeType === 'application/pdf') {
            return PdfViewer;
        }

        if (mimeType === 'application/dicom') {
            return DicomViewer;
        }

        if (mimeType.startsWith('image/')) {
            return ImageViewer;
        }

        if (mimeType.startsWith('text/') ||
            mimeType === 'application/json' ||
            mimeType === 'application/xml') {
            return TextViewer;
        }

        return UnsupportedViewer;
    }

    function getViewerProps(mimeType: string, data: ArrayBuffer) {
        if (mimeType === 'application/pdf') {
            return { pdfData: data };
        }

        if (mimeType === 'application/dicom') {
            return { dicomData: data };
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
        border-bottom: 1px solid var(--color-border, #e0e0e0);
        background: var(--color-background, #f8f9fa);
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    */

    /* Unused - no document-info class in template
    .document-info h3 {
        margin: 0;
        font-size: 1.1rem;
        color: var(--color-text-primary, #333);
    }
    */

    /* Unused - no document-info class in template
    .document-info p {
        margin: 0.25rem 0 0 0;
        font-size: 0.9rem;
        color: var(--color-text-secondary, #666);
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
        border: 1px solid var(--color-border, #ddd);
        background: var(--color-surface, #fff);
        color: var(--color-text-primary, #333);
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.9rem;
        transition: all 0.2s ease;
    }
    */

    /* Unused - no btn class in template
    .btn:hover {
        background: var(--color-gray-300, #f0f0f0);
    }
    */

    /* Unused - no btn class in template
    .btn.primary {
        background: var(--color-interactivity, #007bff);
        color: white;
        border-color: var(--color-interactivity, #007bff);
    }
    */

    /* Unused - no btn class in template
    .btn.primary:hover {
        background: var(--color-interactivity-dark, #0056b3);
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
        <ViewerComponent
            {...(viewerProps as any)}
            onerror={handleViewerEvent}
            onloaded={handleViewerEvent}
        />
    </div>
</div> 