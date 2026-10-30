<script lang="ts">
    import { onMount } from 'svelte';
    import type { PDFDocumentProxy } from 'pdfjs-dist';

    interface Props {
        pdfData: ArrayBuffer | string;
        src?: string; // Optional source URL to refetch if ArrayBuffer is detached
    }

    let { pdfData, src }: Props = $props();
  
    let pdf: PDFDocumentProxy | null = $state(null);
    let numPages = $state(0);
    let pageNumbers: number[] = $state([]);
    let canvasRefs: HTMLCanvasElement[] = $state([]);
    let error: string | null = $state(null);
  
    onMount(async () => {
        try {
            const { pdfjsLib } = await import('$lib/files/lazyPdfjs');
        
            let loadingTask;
        
            if (typeof pdfData === 'string') {
                // Convert base64 string to Uint8Array
                const byteCharacters = atob(pdfData);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                loadingTask = pdfjsLib.getDocument({ data: byteArray });
            } else if (pdfData instanceof ArrayBuffer) {
                // Check if ArrayBuffer is detached
                if (pdfData.byteLength === 0) {
                    if (src) {
                        // Try to refetch the data from the source URL
                        const response = await fetch(src);
                        if (!response.ok) {
                            throw new Error(`Failed to fetch PDF from ${src}: ${response.status}`);
                        }
                        const freshArrayBuffer = await response.arrayBuffer();
                        const uint8Array = new Uint8Array(freshArrayBuffer);
                        loadingTask = pdfjsLib.getDocument({ data: uint8Array });
                    } else {
                        throw new Error('ArrayBuffer is detached/empty and no source URL provided for refetch');
                    }
                } else {
                    // Create a new Uint8Array to avoid detached ArrayBuffer issues
                    try {
                        const uint8Array = new Uint8Array(pdfData);
                        loadingTask = pdfjsLib.getDocument({ data: uint8Array });
                    } catch (arrayBufferError) {
                        // Try to clone the ArrayBuffer
                        const clonedBuffer = pdfData.slice(0);
                        const uint8Array = new Uint8Array(clonedBuffer);
                        loadingTask = pdfjsLib.getDocument({ data: uint8Array });
                    }
                }
            } else if (pdfData && typeof pdfData === 'object' && 'byteLength' in pdfData) {
                loadingTask = pdfjsLib.getDocument({ data: pdfData as Uint8Array });
            } else {
                throw new Error(`Invalid pdfData format: ${typeof pdfData}`);
            }

            pdf = await loadingTask.promise;
            numPages = pdf.numPages;

            pageNumbers = Array.from({ length: numPages }, (_, i) => i + 1);
            canvasRefs = new Array(numPages);
        } catch (err) {
            error = err instanceof Error ? err.message : 'Unknown error';
            console.error('PDF loading error:', err);
        }
    });
  
    async function renderPage(pageNum: number, canvas: HTMLCanvasElement) {
        if (!pdf || !canvas) return;

        try {
            const page = await pdf.getPage(pageNum);

            const viewport = page.getViewport({ scale: 1.5 });

            canvas.width = viewport.width;
            canvas.height = viewport.height;

            const context = canvas.getContext('2d');
            if (!context) {
                throw new Error('Could not get 2D context from canvas');
            }

            const renderContext = {
                canvasContext: context,
                viewport: viewport,
            };

            await page.render(renderContext).promise;
        } catch (err) {
            console.error(`Error rendering page ${pageNum}:`, err);
        }
    }

    // Use $effect to render pages when PDF and canvas elements are ready
    $effect(() => {
        if (pdf && canvasRefs.length > 0) {
            canvasRefs.forEach((canvas, index) => {
                if (canvas) {
                    renderPage(index + 1, canvas);
                }
            });
        }
    });
</script>
  
<style>
    canvas {
        display: block;
        margin: 1em auto;
        max-width: 100%;
    }
    
    .error {
        background-color: #ffe6e6;
        border: 1px solid #ff0000;
        padding: 1em;
        margin: 1em 0;
        border-radius: 0.4rem;
    }
</style>
  
{#if error}
    <div class="error">
        <h3>Error loading PDF:</h3>
        <p>{error}</p>
    </div>
{:else if pdf}
    {#each pageNumbers as _, index}
        <canvas bind:this={canvasRefs[index]}></canvas>
    {/each}
{:else}
    <p>Loading PDF...</p>
{/if}