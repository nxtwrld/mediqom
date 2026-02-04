<script lang="ts">
    import { onMount } from 'svelte';

    interface Props {
        imageData: ArrayBuffer;
        mimeType: string;
    }

    let { imageData, mimeType }: Props = $props();

    let imageSrc = $state('');
    let imageLoaded = $state(false);
    let imageError = $state(false);

    onMount(() => {
        try {
            const blob = new Blob([imageData], { type: mimeType });
            imageSrc = URL.createObjectURL(blob);
        } catch (error) {
            console.error('Failed to create image blob:', error);
            imageError = true;
        }

        return () => {
            if (imageSrc) {
                URL.revokeObjectURL(imageSrc);
            }
        };
    });

    function handleImageLoad() {
        imageLoaded = true;
    }

    function handleImageError() {
        imageError = true;
    }
</script>

<style>
    .image-viewer {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 200px;
        background: var(--bg-secondary, #f8f9fa);
        border-radius: 8px;
    }

    .image-container {
        max-width: 100%;
        max-height: 100%;
        text-align: center;
    }

    .image {
        max-width: 100%;
        max-height: 70vh;
        object-fit: contain;
        border-radius: 4px;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    }

    .loading, .error {
        padding: 2rem;
        text-align: center;
        color: var(--text-secondary, #666);
    }

    .error {
        color: var(--error-color, #dc3545);
    }

    .image-info {
        margin-top: 1rem;
        font-size: 0.9rem;
        color: var(--text-secondary, #666);
    }

    .hidden {
        display: none;
    }
</style>

<div class="image-viewer">
    {#if imageError}
        <div class="error">
            <p>Failed to load image</p>
            <p>Type: {mimeType}</p>
        </div>
    {:else if !imageLoaded && imageSrc}
        <div class="loading">
            <p>Loading image...</p>
        </div>
    {/if}

    {#if imageSrc && !imageError}
        <div class="image-container">
            <img 
                src={imageSrc} 
                alt="Attachment preview"
                class="image"
                loading="lazy"
                class:hidden={!imageLoaded}
                onload={handleImageLoad}
                onerror={handleImageError}
            />
            {#if imageLoaded}
                <div class="image-info">
                    {mimeType}
                </div>
            {/if}
        </div>
    {/if}
</div> 