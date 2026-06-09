<script lang="ts">
    interface Props {
        isMobile?: boolean;
        currentZoom?: number;
        onZoomIn?: () => void;
        onZoomOut?: () => void;
        onZoomToFit?: () => void;
        onResetZoom?: () => void;
    }

    let {
        isMobile = false,
        currentZoom = 1,
        onZoomIn,
        onZoomOut,
        onZoomToFit,
        onResetZoom
    }: Props = $props();

    // Format zoom percentage for display
    const zoomPercentage = $derived(Math.round(currentZoom * 100));
</script>

<div class="zoom-controls" class:mobile={isMobile}>
    <div class="zoom-buttons">
        <button
            type="button"
            class="zoom-btn zoom-in"
            title="Zoom In (+)"
            onclick={onZoomIn}
            disabled={currentZoom >= 5}
        >
            <svg width="16" height="16" viewBox="0 0 16 16">
                <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
        </button>
        
        <div class="zoom-level" title="Current zoom level">
            {zoomPercentage}%
        </div>
        
        <button
            type="button"
            class="zoom-btn zoom-out"
            title="Zoom Out (-)"
            onclick={onZoomOut}
            disabled={currentZoom <= 0.2}
        >
            <svg width="16" height="16" viewBox="0 0 16 16">
                <path d="M3 8h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
        </button>
    </div>
    
    <div class="zoom-actions">
        <button
            type="button"
            class="zoom-btn fit-view"
            title="Fit to View"
            onclick={onZoomToFit}
        >
            {#if isMobile}
                <svg width="16" height="16" viewBox="0 0 16 16">
                    <rect x="2" y="2" width="12" height="12" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/>
                    <path d="M6 6h4v4" fill="none" stroke="currentColor" stroke-width="1.5"/>
                </svg>
            {:else}
                <svg width="16" height="16" viewBox="0 0 16 16">
                    <rect x="2" y="2" width="12" height="12" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/>
                    <path d="M6 6h4v4" fill="none" stroke="currentColor" stroke-width="1.5"/>
                </svg>
                <span>Fit</span>
            {/if}
        </button>
        
        <button
            type="button"
            class="zoom-btn reset"
            title="Reset Zoom (1:1)"
            onclick={onResetZoom}
            disabled={Math.abs(currentZoom - 1) < 0.01}
        >
            {#if isMobile}
                <svg width="16" height="16" viewBox="0 0 16 16">
                    <circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/>
                    <path d="M12 12l-2-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
            {:else}
                <svg width="16" height="16" viewBox="0 0 16 16">
                    <circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/>
                    <path d="M12 12l-2-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                <span>1:1</span>
            {/if}
        </button>
    </div>
</div>

<style>
    .zoom-controls {
        position: absolute;
        top: 12px;
        right: 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        z-index: 10;
        pointer-events: none;
    }

    .zoom-controls.mobile {
        top: 8px;
        right: 8px;
        gap: 4px;
    }

    .zoom-buttons,
    .zoom-actions {
        display: flex;
        align-items: center;
        background: var(--color-surface, #ffffff);
        border: 1px solid var(--color-border, #e2e8f0);
        border-radius: 6px;
        overflow: hidden;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        pointer-events: auto;
    }

    .zoom-buttons {
        flex-direction: row;
    }

    .zoom-actions {
        flex-direction: row;
        gap: 0;
    }

    .zoom-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding: 8px;
        border: none;
        background: transparent;
        color: var(--color-text-primary, #1f2937);
        cursor: pointer;
        transition: all 0.2s ease;
        font-size: 12px;
        font-weight: 500;
        min-width: 36px;
        min-height: 36px;
    }

    .mobile .zoom-btn {
        padding: 6px;
        min-width: 32px;
        min-height: 32px;
        font-size: 11px;
    }

    .zoom-btn:hover:not(:disabled) {
        background: var(--color-background, #f8fafc);
        color: var(--color-text-primary, #1f2937);
    }

    .zoom-btn:active:not(:disabled) {
        background: var(--color-border, #e2e8f0);
        transform: scale(0.98);
    }

    .zoom-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .zoom-level {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 12px;
        font-size: 12px;
        font-weight: 600;
        color: var(--color-text-secondary, #6b7280);
        border-left: 1px solid var(--color-border, #e2e8f0);
        border-right: 1px solid var(--color-border, #e2e8f0);
        min-width: 50px;
        user-select: none;
    }

    .mobile .zoom-level {
        padding: 0 8px;
        font-size: 11px;
        min-width: 40px;
    }

    .zoom-actions .zoom-btn + .zoom-btn {
        border-left: 1px solid var(--color-border, #e2e8f0);
    }

    .zoom-btn svg {
        flex-shrink: 0;
    }

    /* Keyboard focus styles */
    .zoom-btn:focus-visible {
        outline: 2px solid var(--color-interactivity, #3b82f6);
        outline-offset: -2px;
    }

    /* Animation for smooth transitions */
    .zoom-controls {
        animation: fadeIn 0.2s ease-out;
    }

    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(-10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
</style>