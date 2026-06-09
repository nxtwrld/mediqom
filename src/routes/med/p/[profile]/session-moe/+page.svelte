<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { page } from '$app/stores';
    import SessionMoeVisualizer from '$components/session/SessionMoeVisualizer.svelte';
    import AudioButton from '$components/layout/AudioButton.svelte';
    import { sessionData } from '$lib/session/stores/session-data-store';
    import { sessionViewerActions } from '$lib/session/stores/session-viewer-store';
    import { transcriptStore } from '$lib/session/stores/transcript-store';
    import { sessionState, SessionState, unifiedSessionActions } from '$lib/session/stores/unified-session-store';
    import { logger } from '$lib/logging/logger';
    import { getLocale } from '$lib/i18n';

    const profileId = $page.params.profile;
    
    // Track transcript processing for MOE-QOM flow
    let transcriptItems = $state<any[]>([]);
    let isAnalyzing = $state(false);
    
    // Animation state variables for center AudioButton
    let centerButtonEl = $state<HTMLButtonElement>();
    let isAnimating = $state(false);
    let hasAnimated = $state(false); // Prevent multiple animations
    let animationTarget = $state({ left: '50%', top: '50%', width: '12rem', height: '12rem' });
    let animationTimeoutId: NodeJS.Timeout | null = null;

    // Animation logic - watch for session state changes
    $effect(() => {
        // When session starts running, trigger animation to header (only once)
        if ($sessionState === SessionState.Running && centerButtonEl && !isAnimating && !hasAnimated) {
            logger.audio.debug('Session started running, triggering animation to header');
            startAnimationToHeader();
        }
        
        // When session returns to Ready state after running, restore button
        if ($sessionState === SessionState.Ready && hasAnimated && centerButtonEl) {
            logger.audio.debug('Session returned to Ready state, restoring button to center position');
            restoreButtonToCenter();
        }
    });
    
    function startAnimationToHeader() {
        // Wait for header button to exist in DOM (hidden)
        const headerButton = document.getElementById('header-audio-button');
        if (!headerButton) {
            // Retry after a short delay if header button not ready
            logger.audio.debug('Header button not found, retrying...');
            animationTimeoutId = setTimeout(startAnimationToHeader, 100);
            return;
        }
        
        if (!centerButtonEl) return;
        
        logger.audio.debug('Starting animation from center to header');
        
        // Get positions
        const headerRect = headerButton.getBoundingClientRect();
        
        // Calculate target position - we want the CENTER of our button to be at the CENTER of the header button
        // Since transform: translate(-50%, -50%) is always applied, left/top should be the center point
        const targetLeft = headerRect.left + (headerRect.width / 2);
        const targetTop = headerRect.top + (headerRect.height / 2);
        
        // Start animation
        isAnimating = true;
        hasAnimated = true; // Mark that we've animated to prevent repetition
        
        // Trigger animation from center to header position
        animationTarget = { 
            left: `${targetLeft}px`, 
            top: `${targetTop}px`,
            width: '2.5rem', // Header button size
            height: '2.5rem'
        };
        
        logger.audio.debug('Animation target calculated', { 
            targetLeft, targetTop,
            headerWidth: headerRect.width,
            headerHeight: headerRect.height
        });
    }
    
    function restoreButtonToCenter() {
        if (!centerButtonEl) return;
        
        logger.audio.debug('Restoring button to center position');
        
        // Hide header button first
        const headerButton = document.getElementById('header-audio-button');
        if (headerButton) {
            headerButton.classList.add('hidden');
            logger.audio.debug('Header button hidden');
        }
        
        // Remove ALL inline styles applied during animation
        // This lets the CSS classes take over with their default values
        centerButtonEl.removeAttribute('style');
        
        // Reset animation state
        isAnimating = false;
        hasAnimated = false;
        
        // Reset animationTarget to defaults for next animation
        animationTarget = {
            left: '50%',
            top: '50%',
            width: '12rem',
            height: '12rem'
        };
        
        logger.audio.debug('Button restored to center position - inline styles removed');
    }
    
    function handleAnimationEnd(event: TransitionEvent) {
        if (!isAnimating) return;
        
        // Track which property finished transitioning
        logger.audio.debug('Transition ended for property:', event.propertyName);
        
        // Since we're animating left, top, width, and height, wait for size transitions to complete
        if (event.propertyName === 'width' || event.propertyName === 'height') {
            logger.audio.debug('Animation complete, hiding center button and showing header button');
            
            // Hide center button
            if (centerButtonEl) {
                centerButtonEl.style.visibility = 'hidden';
            }
            
            // Show header button by removing hidden class
            const headerButton = document.getElementById('header-audio-button');
            if (headerButton) {
                logger.audio.debug('Removing hidden class from header button', {
                    classList: headerButton.classList.toString(),
                    computedVisibility: window.getComputedStyle(headerButton).visibility,
                    computedOpacity: window.getComputedStyle(headerButton).opacity
                });
                headerButton.classList.remove('hidden');
                // Log after removing class
                setTimeout(() => {
                    logger.audio.debug('Header button state after removing hidden class', {
                        classList: headerButton.classList.toString(),
                        computedVisibility: window.getComputedStyle(headerButton).visibility,
                        computedOpacity: window.getComputedStyle(headerButton).opacity
                    });
                }, 10);
            } else {
                logger.audio.error('Header button not found!');
            }
            
            // Mark animation as complete
            isAnimating = false;
        }
    }
    
    onMount(() => {
        // Session is already in Ready state by default - no initialization needed
        logger.audio.debug('Session page mounted - session should already be in Ready state');
        
        // Initialize empty session stores - waiting for real transcript data
        // Session will remain empty until transcript data triggers MOE-QOM analysis
        
        // Initialize unified session for audio controls
        // This sets up the session state management without loading data
        // Real data will be loaded when transcript analysis begins
        
        // Subscribe to transcript updates to trigger MOE-QOM flow
        const unsubscribeTranscript = transcriptStore.subscribe(($transcriptState) => {
            if ($transcriptState && $transcriptState.items && $transcriptState.items.length > 0) {
                transcriptItems = $transcriptState.items;
                // Check for medical relevance and trigger MOE-QOM analysis
                handleTranscriptUpdate($transcriptState.items);
            }
        });
        
        return () => {
            unsubscribeTranscript();
        };
    });
    
    onDestroy(() => {
        // Clean up any pending timeouts
        if (animationTimeoutId) {
            clearTimeout(animationTimeoutId);
            animationTimeoutId = null;
        }
    });
    
    // Handle transcript updates and trigger MOE-QOM analysis when medical content is detected
    async function handleTranscriptUpdate(transcripts: any[]) {
        if (isAnalyzing || !transcripts.length) return;
        
        // Check if we have meaningful medical content
        const hasMedicalContent = transcripts.some(transcript => 
            transcript.medicalRelevance && transcript.medicalRelevance.isRelevant
        );
        
        if (hasMedicalContent && !isAnalyzing) {
            console.log('🔬 Medical relevance detected, triggering MOE-QOM analysis...');
            isAnalyzing = true;
            
            try {
                // This will be implemented when the MOE-QOM backend is ready
                // await triggerMoeQomAnalysis(transcripts);
                console.log('📊 MOE-QOM analysis would be triggered here');
            } catch (error) {
                console.error('❌ Failed to trigger MOE-QOM analysis:', error);
            } finally {
                isAnalyzing = false;
            }
        }
    }

    function handleNodeAction(detail: { action: string; targetId: string; reason?: string }) {
        console.log('Node action:', detail);
        
        // Handle node actions - this might need to go to viewer store depending on the action
        // For now, log the action (specific implementation depends on what these actions do)
        console.log('Node action handled:', detail);
    }
    
    // Handle start recording button click
    async function handleStartRecording() {
        console.log('🎤 Starting recording session...');
        
        try {
            // Session should already be in Ready state - no initialization needed
            const success = await unifiedSessionActions.startRecordingSession({
                language: getLocale() || 'en',
                models: ['GP'],
                useRealtime: true,
                translate: false  // Default to preserving original language
            });
            
            if (success) {
                console.log('✅ Recording session started successfully');
            } else {
                console.error('❌ Failed to start recording session');
            }
        } catch (error) {
            console.error('❌ Error starting recording session:', error);
        }
    }
</script>

<svelte:head>
    <title>MoE Session Analysis - {profileId} | Mediqom</title>
    <meta name="description" content="Medical session analysis with Mixture of Experts visualization" />
</svelte:head>

<div class="session-moe-page">
    {#if !$sessionData}
        <div class="empty-state">
            <div class="empty-content">
                {#if isAnalyzing}
                    <h2>Analyzing Medical Consultation</h2>
                    <p>Our Mixture of Experts (MoE) system is processing your medical conversation...</p>
                    
                    <div class="analysis-progress">
                        <div class="spinner"></div>
                        <p>MOE-QOM Analysis in Progress</p>
                    </div>
                    
                    {#if transcriptItems.length > 0}
                        <div class="transcript-preview">
                            <p class="preview-label">Latest transcript:</p>
                            <p class="preview-text">"{transcriptItems[transcriptItems.length - 1]?.text || ''}"</p>
                        </div>
                    {/if}
                {:else if transcriptItems.length > 0}
                    <h2>Medical Conversation Detected</h2>
                    <p>We've captured {transcriptItems.length} transcript entries. Waiting for medical relevance detection...</p>
                    
                    <div class="session-button-container">
                        <!-- Shim element to reserve space -->
                        <div class="button-space-shim"></div>
                        <!-- Clickable wrapper button that starts recording -->
                        <button 
                            class="session-trigger-button"
                            onclick={handleStartRecording}
                            disabled={isAnalyzing}
                            bind:this={centerButtonEl}
                            class:animating={isAnimating}
                            style="left: {animationTarget.left}; top: {animationTarget.top}; width: {animationTarget.width}; height: {animationTarget.height};"
                            ontransitionend={handleAnimationEnd}
                        >
                            <!-- AudioButton inside for visual display only -->
                            <AudioButton />
                        </button>
                    </div>
                {:else}
                    <h2>Start Your Medical Session Analysis</h2>
                    <p>Begin recording your medical consultation to analyze it with our Mixture of Experts (MoE) system.</p>
                    
                    <div class="session-button-container">
                        <!-- Shim element to reserve space -->
                        <div class="button-space-shim"></div>
                        <!-- Clickable wrapper button that starts recording -->
                        <button 
                            class="session-trigger-button"
                            onclick={handleStartRecording}
                            disabled={isAnalyzing}
                            bind:this={centerButtonEl}
                            class:animating={isAnimating}
                            style="left: {animationTarget.left}; top: {animationTarget.top}; width: {animationTarget.width}; height: {animationTarget.height};"
                            ontransitionend={handleAnimationEnd}
                        >
                            <!-- AudioButton inside for visual display only -->
                            <AudioButton />
                        </button>
                    </div>
                    
                    <div class="instructions">
                        <p class="instruction-text">
                            Click the recording button above to start capturing the medical conversation.
                            Our AI will detect medical relevance and automatically trigger expert analysis.
                        </p>
                    </div>
                {/if}
            </div>
        </div>
    {:else}
        <SessionMoeVisualizer 
            sessionData={$sessionData}
            isRealTime={true}
            showLegend={true}
            enableInteractions={true}
            onnodeAction={handleNodeAction}
            transcript={transcriptItems}
        />
    {/if}
</div>

<style>
    .session-moe-page {
        height: 100%;
        background: var(--color-background, #f8fafc);
        overflow: hidden;
    }

    .empty-state {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        padding: 2rem;
        background: linear-gradient(135deg, var(--color-background, #f8fafc) 0%, var(--color-surface, #fff) 100%);
    }

    .empty-content {
        text-align: center;
        max-width: 600px;
        width: 100%;
    }

    .empty-content h2 {
        font-size: 2rem;
        font-weight: 600;
        color: var(--color-text-primary, #1f2937);
        margin: 0 0 1rem 0;
    }

    .empty-content > p {
        font-size: 1.125rem;
        color: var(--color-text-secondary, #6b7280);
        margin: 0 0 3rem 0;
        line-height: 1.6;
    }

    .session-button-container {
        position: relative;
        margin: 0 0 3rem 0;
        background: transparent !important;
        border: none !important;
    }
    
    .button-space-shim {
        width: 12rem;
        height: 12rem;
        margin: 0 auto;
        /* This creates the space for the fixed position button */
    }
    
    .session-trigger-button {
        position: fixed;
        transform: translate(-50%, -50%);
        z-index: 1000;
        background: transparent;
        border: none;
        cursor: pointer;
        padding: 0;
        outline: none;
        /* Default values, will be overridden by inline styles */
        top: 50%;
        left: 50%;
        width: 12rem;
        height: 12rem;
    }
    
    .session-trigger-button:disabled {
        cursor: not-allowed;
        opacity: 0.7;
    }
    
    .session-trigger-button.animating {
        /* Keep transform centering, just add transition for smooth animation */
        transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1);
    }
    
    .session-trigger-button:hover:not(:disabled) {
        transform: translate(-50%, -50%) scale(1.02);
    }
    
    .session-trigger-button:active:not(:disabled) {
        transform: translate(-50%, -50%) scale(0.98);
    }
    
    /* Override any inherited toolbar styles */
    .session-trigger-button :global(.audio-button-container) {
        --button-size: 100%;
        --animation-duration: 2s;
        pointer-events: none; /* AudioButton inside shouldn't capture clicks */
    }
    
    .session-trigger-button :global(.audio-button) {
        width: 100%;
        height: 100%;
        pointer-events: none; /* AudioButton inside shouldn't capture clicks */
    }

    .instructions {
        padding: 1.5rem;
        background: var(--color-surface, #fff);
        border: 1px solid var(--color-border, #e2e8f0);
        border-radius: 12px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .instruction-text {
        font-size: 0.95rem;
        color: var(--color-text-secondary, #6b7280);
        margin: 0;
        line-height: 1.5;
    }

    .analysis-progress {
        display: flex;
        flex-direction: column;
        align-items: center;
        margin: 2rem 0;
    }

    .analysis-progress .spinner {
        width: 32px;
        height: 32px;
        border: 3px solid var(--color-border, #e2e8f0);
        border-top: 3px solid var(--color-interactivity, #3b82f6);
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: 1rem;
    }

    .analysis-progress p {
        font-size: 0.95rem;
        color: var(--color-text-secondary, #6b7280);
        margin: 0;
    }

    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }

    .transcript-preview {
        margin-top: 2rem;
        padding: 1rem;
        background: var(--color-surface, #f1f5f9);
        border-radius: 8px;
        border-left: 4px solid var(--color-interactivity, #3b82f6);
    }

    .preview-label {
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--color-text-secondary, #6b7280);
        margin: 0 0 0.5rem 0;
    }

    .preview-text {
        font-size: 0.95rem;
        color: var(--color-text-primary, #1f2937);
        margin: 0;
        font-style: italic;
        line-height: 1.4;
    }

    /* Ensure full height on mobile */
    @media (max-width: 768px) {
        .session-moe-page {
            height: 100vh;
            height: 100dvh; /* Dynamic viewport height for mobile browsers */
        }
    }
</style>