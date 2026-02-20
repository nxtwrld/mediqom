<script lang="ts">
    import { createEventDispatcher } from 'svelte';

    interface Props {
        data: ArrayBuffer;
        mimeType: string;
        fileName: string;
    }

    let { data, mimeType, fileName }: Props = $props();

    const dispatch = createEventDispatcher();

    // Get file size in human readable format
    function formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Get file extension from MIME type or filename
    function getFileExtension(): string {
        // Try to get from filename first
        if (fileName && fileName.includes('.')) {
            return fileName.split('.').pop()?.toLowerCase() || '';
        }
        
        // Fallback to MIME type mapping
        const mimeToExt: Record<string, string> = {
            'application/msword': 'doc',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
            'application/vnd.ms-excel': 'xls',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
            'application/vnd.ms-powerpoint': 'ppt',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
            'application/zip': 'zip',
            'application/x-rar-compressed': 'rar',
            'application/x-7z-compressed': '7z',
            'audio/mpeg': 'mp3',
            'audio/wav': 'wav',
            'video/mp4': 'mp4',
            'video/webm': 'webm',
        };
        
        return mimeToExt[mimeType] || '';
    }

    // Get icon based on file type
    function getFileIcon(): string {
        const ext = getFileExtension();
        
        if (mimeType.startsWith('application/vnd.ms-') || 
            mimeType.startsWith('application/vnd.openxmlformats-')) {
            if (mimeType.includes('word')) return '📄';
            if (mimeType.includes('excel') || mimeType.includes('sheet')) return '📊';
            if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return '📽️';
        }
        
        if (mimeType.startsWith('audio/')) return '🎵';
        if (mimeType.startsWith('video/')) return '🎬';
        if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('7z')) return '📦';
        if (mimeType.includes('archive') || mimeType.includes('compressed')) return '📦';
        
        return '📄';
    }

    function handleDownload() {
        dispatch('download');
    }

    const fileSize = $derived(formatFileSize(data.byteLength));
    const fileIcon = $derived(getFileIcon());
    const fileExt = $derived(getFileExtension());
</script>

<style>
    .unsupported-viewer {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 3rem 2rem;
        text-align: center;
        background: var(--bg-secondary, #f8f9fa);
        border-radius: 8px;
        border: 2px dashed var(--border-color, #dee2e6);
        min-height: 200px;
    }

    .file-icon {
        font-size: 4rem;
        margin-bottom: 1rem;
        opacity: 0.7;
    }

    .file-info {
        margin-bottom: 2rem;
    }

    .file-name {
        font-size: 1.2rem;
        font-weight: 600;
        color: var(--text-primary, #333);
        margin-bottom: 0.5rem;
        word-break: break-all;
    }

    .file-details {
        color: var(--text-secondary, #666);
        font-size: 0.9rem;
    }

    .file-type {
        background: var(--bg-primary, #fff);
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        border: 1px solid var(--border-color, #dee2e6);
        font-family: monospace;
        margin: 0.5rem 0;
        display: inline-block;
    }

    .preview-message {
        color: var(--text-secondary, #666);
        font-size: 0.9rem;
        margin-bottom: 1.5rem;
        max-width: 400px;
    }

    .actions {
        display: flex;
        gap: 1rem;
        flex-wrap: wrap;
        justify-content: center;
    }

    .btn {
        padding: 0.75rem 1.5rem;
        border: 1px solid var(--border-color, #ddd);
        background: var(--bg-primary, #fff);
        color: var(--text-primary, #333);
        border-radius: 6px;
        cursor: pointer;
        font-size: 0.9rem;
        transition: all 0.2s ease;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
    }

    .btn:hover {
        background: var(--bg-hover, #f0f0f0);
        transform: translateY(-1px);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    .btn.primary {
        background: var(--primary-color, #007bff);
        color: white;
        border-color: var(--primary-color, #007bff);
    }

    .btn.primary:hover {
        background: var(--primary-hover, #0056b3);
    }

    .future-support {
        margin-top: 2rem;
        padding: 1rem;
        background: var(--info-bg, #e7f3ff);
        border: 1px solid var(--info-border, #b3d9ff);
        border-radius: 6px;
        color: var(--info-text, #0066cc);
        font-size: 0.85rem;
    }
</style>

<div class="unsupported-viewer">
    <div class="file-icon">{fileIcon}</div>
    
    <div class="file-info">
        <div class="file-name">{fileName}</div>
        <div class="file-details">
            <div class="file-type">{mimeType}</div>
            <div>
                Size: {fileSize}
                {#if fileExt}
                    • Extension: .{fileExt}
                {/if}
            </div>
        </div>
    </div>

    <div class="preview-message">
        This file type cannot be previewed directly in the browser. You can download it to view with an appropriate application.
    </div>

    <div class="actions">
        <button class="btn primary" onclick={handleDownload}>
            ⬇️ Download File
        </button>
    </div>

    <div class="future-support">
        💡 Preview support for {mimeType.split('/')[0]} files may be added in future updates
    </div>
</div> 