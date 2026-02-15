<script lang="ts">
    import { createEventDispatcher, onMount } from 'svelte';

    interface Props {
        textData: ArrayBuffer;
        mimeType: string;
    }

    let { textData, mimeType }: Props = $props();

    const dispatch = createEventDispatcher();

    let textContent = $state('');
    let isLoaded = $state(false);
    let hasError = $state(false);

    onMount(() => {
        try {
            const decoder = new TextDecoder('utf-8');
            textContent = decoder.decode(textData);
            isLoaded = true;
            dispatch('loaded');
        } catch (error) {
            console.error('Failed to decode text:', error);
            hasError = true;
            dispatch('error', { message: 'Failed to decode text content' });
        }
    });

    // Determine if content should be syntax highlighted
    function getSyntaxLanguage(mimeType: string): string {
        switch (mimeType) {
            case 'application/json':
                return 'json';
            case 'application/xml':
            case 'text/xml':
                return 'xml';
            case 'text/html':
                return 'html';
            case 'text/css':
                return 'css';
            case 'text/javascript':
            case 'application/javascript':
                return 'javascript';
            case 'text/typescript':
                return 'typescript';
            case 'text/markdown':
                return 'markdown';
            default:
                return 'text';
        }
    }

    function formatJson(content: string): string {
        try {
            const parsed = JSON.parse(content);
            return JSON.stringify(parsed, null, 2);
        } catch {
            return content;
        }
    }

    function getDisplayContent(): string {
        if (mimeType === 'application/json') {
            return formatJson(textContent);
        }
        return textContent;
    }

    let language = getSyntaxLanguage(mimeType);
    let displayContent = $derived(getDisplayContent());
</script>

<style>
    .text-viewer {
        width: 100%;
        height: 100%;
        background: var(--bg-primary, #fff);
        border-radius: 8px;
        overflow: hidden;
    }

    .text-header {
        padding: 0.75rem 1rem;
        background: var(--bg-secondary, #f8f9fa);
        border-bottom: 1px solid var(--border-color, #e0e0e0);
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .text-info {
        font-size: 0.9rem;
        color: var(--text-secondary, #666);
    }

    .text-content {
        padding: 1rem;
        overflow: auto;
        height: calc(100% - 60px);
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        font-size: 0.875rem;
        line-height: 1.5;
        background: var(--bg-code, #f8f9fa);
    }

    .text-content pre {
        margin: 0;
        padding: 0;
        white-space: pre-wrap;
        word-wrap: break-word;
        color: var(--text-primary, #333);
    }

    .loading, .error {
        padding: 2rem;
        text-align: center;
        color: var(--text-secondary, #666);
    }

    .error {
        color: var(--error-color, #dc3545);
    }

    .syntax-json {
        color: var(--json-color, #0969da);
    }

    .syntax-xml {
        color: var(--xml-color, #cf222e);
    }

    .syntax-html {
        color: var(--html-color, #8250df);
    }

    .text-stats {
        font-size: 0.8rem;
        color: var(--text-tertiary, #999);
    }
</style>

<div class="text-viewer">
    {#if hasError}
        <div class="error">
            <p>Failed to load text content</p>
            <p>Type: {mimeType}</p>
        </div>
    {:else if !isLoaded}
        <div class="loading">
            <p>Loading text...</p>
        </div>
    {:else}
        <div class="text-header">
            <div class="text-info">
                <span>Type: {mimeType}</span>
                {#if language !== 'text'}
                    <span class="syntax-badge">({language})</span>
                {/if}
            </div>
            <div class="text-stats">
                {textContent.length.toLocaleString()} characters
                • {textContent.split('\n').length} lines
            </div>
        </div>
        
        <div class="text-content" class:syntax-json={language === 'json'} 
             class:syntax-xml={language === 'xml'} 
             class:syntax-html={language === 'html'}>
            <pre>{displayContent}</pre>
        </div>
    {/if}
</div> 