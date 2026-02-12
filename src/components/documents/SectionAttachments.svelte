<script lang="ts">
    import { t } from '$lib/i18n';
    import { decrypt as decryptAes, importKey } from '$lib/encryption/aes';
    import { decrypt } from '$lib/documents/index';
    import { base64ToArrayBuffer } from '$lib/arrays';
    import { logger } from '$lib/logging/logger';
    import DocumentViewer from '../viewers/DocumentViewer.svelte';
    import Modal from '$components/ui/Modal.svelte';

    type Attachment = {
        thumbnail: string;
        type: string;
        path?: string;
        url?: string;
        file?: ArrayBuffer;
    }

  interface Props {
    data: Attachment[];
    key?: string | undefined;
  }

  let { data, key = undefined }: Props = $props();

    logger.api.debug('Attachments data:', data);

    const loadedAttachments = new Map<string, ArrayBuffer>();

    // Modal state - using Svelte 5 runes
    let showModal = $state(false);
    let currentAttachment = $state<Attachment | null>(null);
    let currentAttachmentData = $state<ArrayBuffer | null>(null);
    let isLoading = $state(false);
    let loadError = $state<string | null>(null);

    async function loadAttachement(attachment: Attachment): Promise<ArrayBuffer> {
        logger.api.debug('Loading attachment:', attachment);
        if (!attachment.path || !key) {
            throw new Error('Missing attachment path or decryption key');
        }

        // Check cache first
        if (loadedAttachments.has(attachment.path)) {
            return loadedAttachments.get(attachment.path)!;
        }

        // Extract profile ID from the path (format: profileId/filename)
        const profileId = attachment.path.split('/')[0];
        const fileResponse = await fetch(`/v1/med/profiles/${profileId}/attachments?path=${encodeURIComponent(attachment.path)}`);
        logger.api.debug('File response:', fileResponse);
        
        if (!fileResponse.ok) {
            throw new Error(`Failed to fetch attachment: ${fileResponse.status} ${fileResponse.statusText}`);
        }
        
        // read the encrypted base64 string from storage
        const encryptedData = await fileResponse.text();
        // decrypt the base64 encrypted data
        const file = await decrypt([encryptedData], key);
        // parse the decrypted JSON and extract the file data
        logger.api.debug('Decrypted file:', file);
        const json = JSON.parse(file[0]);
        const arrayBuffer = base64ToArrayBuffer(json.file);
        
        // Cache the result
        loadedAttachments.set(attachment.path, arrayBuffer);
        
        return arrayBuffer;
    }

    async function previewAttachment(attachment: Attachment): Promise<void> {
        currentAttachment = attachment;
        currentAttachmentData = null;
        isLoading = true;
        loadError = null;
        showModal = true;

        // If the attachment type is not supported for preview, directly download
        if (!isPreviewSupported(attachment.type)) {
            showModal = false;
            await downloadAttachment(attachment);
            return;
        }

        try {
            currentAttachmentData = await loadAttachement(attachment);
        } catch (error) {
            logger.api.error('Failed to load attachment for preview:', error);
            loadError = error instanceof Error ? error.message : 'Failed to load attachment';
        } finally {
            isLoading = false;
        }
    }

    async function downloadAttachment(attachment: Attachment): Promise<void> {
        try {
            const arrayBuffer = await loadAttachement(attachment);
            const blob = new Blob([arrayBuffer], { type: attachment.type || 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            // Extract file extension from attachment type or use a default
            const ext = attachment.type ? attachment.type.split('/')[1] || 'bin' : 'bin';
            a.download = `attachment.${ext}`;
            a.click();
            // Clean up the blob URL to prevent memory leaks
            URL.revokeObjectURL(url);
        } catch (error) {
            logger.api.error('Failed to download attachment:', error);
            // You might want to show a user-friendly error message here
        }
    }

    function closeModal() {
        showModal = false;
        currentAttachment = null;
        currentAttachmentData = null;
        loadError = null;
    }

    function getFileName(attachment: Attachment): string {
        if (attachment.path) {
            const parts = attachment.path.split('/');
            return parts[parts.length - 1] || 'attachment';
        }
        return 'attachment';
    }

    function isPreviewSupported(mimeType: string): boolean {
        return mimeType === 'application/pdf' || 
               mimeType.startsWith('image/') || 
               mimeType.startsWith('text/') ||
               mimeType === 'application/json' ||
               mimeType === 'application/xml';
    }

    function handleViewerDownload() {
        if (currentAttachment) {
            downloadAttachment(currentAttachment);
        }
    }
</script>


{#if data}
    <h3 class="h3 heading -sticky">{ $t('report.attachments') }</h3>

    <div class="attachments">
        {#each data as attachment}
            <button class="attachment" onclick={() => previewAttachment(attachment)} title="{$t('report.attachments-click-to-preview', { filename: getFileName(attachment) })}">
                {#if attachment.thumbnail}
                    <img src={attachment.thumbnail} loading="lazy" alt={attachment.type} />
                {:else}
                    <div class="attachment-placeholder">
                        {#if attachment.type === 'application/pdf'}
                            📄
                        {:else if attachment.type.startsWith('image/')}
                            🖼️
                        {:else if attachment.type.startsWith('text/')}
                            📝
                        {:else}
                            📎
                        {/if}
                    </div>
                {/if}
                
                <!-- Preview/unsupported indicator -->
                <div class="attachment-overlay">
                    {#if isPreviewSupported(attachment.type)}
                        <div class="preview-indicator">👁️</div>
                    {:else}
                        <div class="download-indicator">⬇️</div>
                    {/if}
                </div>
            </button>
        {/each}
    </div>
{/if}

<!-- Modal for attachment preview -->
{#if showModal}
    <Modal onclose={closeModal} style="padding: 0;">
        <div class="modal-content">
            <div class="modal-header">

                <button class="btn btn-download" onclick={() => currentAttachment && downloadAttachment(currentAttachment)}>
                    ⬇️ {$t('report.attachments-download')}
                </button>
                <h3>{$t('report.attachments-preview')}</h3>
            </div>
            
            <div class="modal-body">
                {#if isLoading}
                    <div class="loading-state">
                        <div class="spinner"></div>
                        <p>{$t('report.attachments-loading')}</p>
                    </div>
                {:else if loadError}
                    <div class="error-state">
                        <div class="error-icon">⚠️</div>
                        <h4>{$t('report.attachments-load-failed')}</h4>
                        <p>{loadError}</p>
                        <button class="btn btn-retry" onclick={() => currentAttachment && previewAttachment(currentAttachment)}>
                            {$t('report.attachments-try-again')}
                        </button>
                    </div>
                {:else if currentAttachment && currentAttachmentData}
                    <DocumentViewer
                        data={currentAttachmentData}
                        mimeType={currentAttachment.type}
                        fileName={getFileName(currentAttachment)}
                    />
                {/if}
            </div>
        </div>
    </Modal>
{/if}


<style>
    .attachments {
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        justify-content: stretch;
        align-items: stretch;
        flex-grow: 1;
        gap: 1rem;
        padding: 1.5rem;
        background-color: var(--color-background);
        margin-bottom: var(--gap);
    }

    .attachment {
        width: auto;
        height: 15rem;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        position: relative;
        background: none;
        border: none;
        cursor: pointer;
        border-radius: 8px;
        overflow: hidden;
        transition: transform 0.3s ease, box-shadow 0.3s ease;
    }

    .attachment:hover {
        transform: scale(1.05);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    }

    .attachment img {
        height: 100%;
        width: auto;
        max-width: 100%;
        object-fit: contain;
        box-shadow: 0 1rem 1rem -1rem rgba(0,0,0,.6);
        transition: transform .3s, border-width .3s;
        border: 0px solid var(--color-interactivity);
        border-radius: 4px;
    }

    .attachment:hover img {
        border-width: 2px;
    }

    .attachment-placeholder {
        font-size: 4rem;
        opacity: 0.6;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        background: var(--bg-secondary, #f8f9fa);
        border-radius: 8px;
        border: 2px dashed var(--border-color, #dee2e6);
    }

    .attachment-overlay {
        position: absolute;
        top: 0.5rem;
        right: 0.5rem;
        background: rgba(0, 0, 0, 0.7);
        color: white;
        border-radius: 50%;
        width: 2rem;
        height: 2rem;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.3s ease;
        font-size: 0.9rem;
    }

    .attachment:hover .attachment-overlay {
        opacity: 1;
    }

    .preview-indicator {
        color: #28a745;
    }

    .download-indicator {
        color: #007bff;
    }

    /* Button styles for modal */
    .btn {
        padding: 0.5rem 1rem;
        border: 1px solid var(--border-color, #ddd);
        background: var(--bg-primary, #fff);
        color: var(--text-primary, #333);
        border-radius: 6px;
        cursor: pointer;
        font-size: 0.9rem;
        transition: all 0.2s ease;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
    }

    .btn:hover {
        background: var(--bg-hover, #f0f0f0);
    }

    .btn-retry {
        background: var(--primary-color, #007bff);
        color: white;
        border-color: var(--primary-color, #007bff);
    }

    .btn-retry:hover {
        background: var(--primary-hover, #0056b3);
    }

    .btn-download {
        background: var(--primary-color, #007bff);
        color: white;
        border-color: var(--primary-color, #007bff);
    }

    .btn-download:hover {
        background: var(--primary-hover, #0056b3);
    }

    /* Modal content styles */
    .modal-content {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        max-height: 90vh;
        overflow: hidden;
    }

    .modal-header {
        padding: .5rem 3rem .5rem 1rem;
        border-bottom: 1px solid var(--border-color, #e0e0e0);
        display: flex;
        justify-content: flex-start;
        gap: 1rem;
        align-items: center;
        background: var(--bg-secondary, #f8f9fa);
    }

    .modal-header h3 {
        margin: 0;
        color: var(--text-primary, #333);
    }

    .modal-body {
        flex: 1;
        overflow: auto;
        display: flex;
        flex-direction: column;
    }

    .loading-state, .error-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 3rem;
        text-align: center;
        min-height: 300px;
    }

    .spinner {
        width: 40px;
        height: 40px;
        border: 4px solid var(--border-color, #e0e0e0);
        border-top: 4px solid var(--primary-color, #007bff);
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: 1rem;
    }

    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }

    .error-state {
        color: var(--error-color, #dc3545);
    }

    .error-icon {
        font-size: 3rem;
        margin-bottom: 1rem;
    }

    .error-state h4 {
        margin: 0 0 1rem 0;
    }

    .error-state p {
        margin: 0 0 1.5rem 0;
        color: var(--text-secondary, #666);
    }

    .btn-retry {
        background: var(--primary-color, #007bff);
        color: white;
        border-color: var(--primary-color, #007bff);
    }

    .btn-retry:hover {
        background: var(--primary-hover, #0056b3);
    }
</style>