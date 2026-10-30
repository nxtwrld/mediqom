<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { 
        unifiedSessionStore,
        audioState, 
        sessionState,
        AudioState,
        SessionState,
        unifiedSessionActions
    } from '$lib/session/stores/unified-session-store';
    import shortcuts from '$lib/shortcuts';
    import { logger } from '$lib/logging/logger';
    import ui from '$lib/ui';


    // Component state
    let animationContainer = $state<HTMLDivElement>();
    let buttonContainer = $state<HTMLDivElement>();

    // Direct reactive states from stores
    let currentAudioState = $derived($audioState);
    let currentSessionState = $derived($sessionState);
    let audioState_value = $derived(currentAudioState.state);

    // Baseline listening animation management
    let baselineAnimationInterval: ReturnType<typeof setInterval> | null = null;
    
    // Animation element tracking
    let activeAnimationCount = $state(0);
    const MAX_ANIMATIONS = 25;
    
    // Animation throttling
    let lastTickTime = 0;
    const TICK_THROTTLE_MS = 150; // ~8 animations per second max

    // Visual feedback for microphone activity
    function createMicTick(energy: number) {
        if (!animationContainer) return;
        
        // Skip creating new animation if we're at the limit
        if (activeAnimationCount >= MAX_ANIMATIONS) return;
        
        // Throttle animation creation to spread them out over time
        const now = Date.now();
        if (now - lastTickTime < TICK_THROTTLE_MS) return;
        lastTickTime = now;
        
        const tickElement = document.createElement('div');
        tickElement.addEventListener('animationend', () => {
            tickElement.remove();
            activeAnimationCount--;
        });
        
        // Better energy scaling: multiply small values to make them more visible
        // Remove the Math.max(energy, 0.1) that flattens all low energy
        const scaledOpacity = Math.min(energy * 3, 0.7);
        tickElement.style.opacity = `${scaledOpacity}`;
        
        // Set CSS custom property for the animation to use
        tickElement.style.setProperty('--start-opacity', `${scaledOpacity}`);
        
        tickElement.classList.add(audioState_value, 'animate');
        animationContainer.appendChild(tickElement);
        activeAnimationCount++;
    }

    // Start baseline listening animation
    function startBaselineAnimation() {
        stopBaselineAnimation(); // Prevent duplicates
        baselineAnimationInterval = setInterval(() => {
                createMicTick(0.2); // Very low energy = subtle baseline animation
        }, 2000); // Every 2.5s
        logger.audio.debug('Started baseline listening animation');
    }

    // Stop baseline listening animation
    function stopBaselineAnimation() {
        if (baselineAnimationInterval) {
            clearInterval(baselineAnimationInterval);
            baselineAnimationInterval = null;
            logger.audio.debug('Stopped baseline listening animation');
        }
    }

    // Handle audio features for visual feedback
    function handleAudioFeatures(features: any) {
        // Handle both event format and direct data format
        const data = features.detail || features;
        const { energy } = data;
        if (energy && energy > 0.001) {
            createMicTick(energy);
        }
    }

    // State-based animation management
    $effect(() => {
        // Start baseline animation when entering listening state
        if (audioState_value === AudioState.Listening) {
            startBaselineAnimation();
        } else {
            // Stop baseline animation when leaving listening state
            stopBaselineAnimation();
        }
    });

    // COMMENTED OUT: Toggle recording state - moved to unified-session-store
    // TODO: Remove after new architecture is fully tested
    /* async function toggleRecording(event: Event) {
        event.stopPropagation();
        
        logger.audio.info('AudioButton: Toggle recording clicked', {
            audioState_value,
            currentSessionState,
            audioState_exact: JSON.stringify(audioState_value),
            sessionState_exact: JSON.stringify(currentSessionState),
            AudioState_Ready: AudioState.Ready,
            AudioState_Listening: AudioState.Listening,
            AudioState_Speaking: AudioState.Speaking,
            AudioState_Stopping: AudioState.Stopping,
            SessionState_Running: SessionState.Running,
            isRunningCheck: currentSessionState === SessionState.Running,
            isListeningCheck: audioState_value === AudioState.Listening,
            isSpeakingCheck: audioState_value === AudioState.Speaking
        });

        if (audioState_value === AudioState.Stopping) {
            logger.audio.debug('Recording is stopping, ignoring click');
            return;
        }

        // Handle stopping (if currently running)
        logger.audio.info('Checking stop condition:', {
            condition: 'currentSessionState === SessionState.Running',
            result: currentSessionState === SessionState.Running,
            currentSessionState,
            SessionState_Running: SessionState.Running
        });
        
        if (currentSessionState === SessionState.Running) {
            logger.audio.info('STOPPING: Session is running, initiating stop sequence');
            
            // Stop the complete session including audio cleanup
            await unifiedSessionActions.stopSessionComplete();
            return;
        }

        // CRITICAL: Request microphone access immediately in the click handler
        // This must happen synchronously to satisfy browser security requirements
        try {
            logger.audio.debug('Requesting microphone in click handler...');
            
            // Import and initialize microphone synchronously in user interaction
            const { getAudioVAD } = await import('$lib/audio/microphone');
            const audio = await getAudioVAD({ analyzer: true });
            
            if (audio instanceof Error) {
                throw audio;
            }
            
            logger.audio.info('Microphone access granted in click handler', {
                hasStream: !!audio.stream,
                streamId: audio.stream?.id,
                trackCount: audio.stream?.getTracks().length || 0
            });
            
            // Use proper session lifecycle method to handle state transitions
            const sessionStarted = await unifiedSessionActions.startSessionWithAudio(audio, {
                language,
                models,
                useRealtime
            });

            if (!sessionStarted) {
                // Clean up audio on failure
                audio.stop();
                throw new Error('Failed to start session');
            }

            // Audio recording is now handled by unified session store
            if (!sessionStarted) {
                
                unifiedSessionStore.update(state => ({
                    ...state,
                    audio: {
                        ...state.audio,
                        isRecording: false,
                        state: AudioState.Ready
                    },
                    ui: {
                        ...state.ui,
                        audioButtonPosition: state.ui.isOnNewSessionPage ? 'center' : 'hidden'
                    }
                }));
                logger.audio.warn('Failed to start recording - rolled back');
            }
        } catch (error) {
            logger.audio.error('Error accessing microphone or starting recording:', error);
            
            // Audio cleanup handled by unified session store
            
            unifiedSessionStore.update(state => ({
                ...state,
                audio: {
                    ...state.audio,
                    isRecording: false,
                    state: AudioState.Error
                },
                ui: {
                    ...state.ui,
                    audioButtonPosition: state.ui.isOnNewSessionPage ? 'center' : 'hidden'
                },
                error: `Microphone access failed: ${error instanceof Error ? error.message : String(error)}`
            }));
        }
    } */

    // Route changes are handled by unified-session-store automatically

    // Component lifecycle
    onMount(() => {
        logger.audio.debug('AudioButton mounted');
        
        // Listen for UI events
        ui.on('audio:features', handleAudioFeatures);
        
        // COMMENTED OUT: Keyboard shortcuts - handled by parent components now
        // const unsubscribeShortcut = shortcuts.listen('Space', () => {
        //     toggleRecording(new Event('click'));
        // });

        return () => {
            // unsubscribeShortcut();
        };
    });

    onDestroy(() => {
        logger.audio.debug('AudioButton destroying...');
        
        // Clean up event listeners
        ui.off('audio:features', handleAudioFeatures);
        
        // Stop baseline animation
        stopBaselineAnimation();
        
        // AudioButton is now visual-only - recording cleanup handled by unified session store
        if (currentSessionState === SessionState.Running) {
            logger.audio.debug('AudioButton destroying while recording - cleanup handled by session store');
        }
    });
</script>

<!-- Simple AudioButton that inherits parent positioning -->
<div class="audio-button-container" bind:this={buttonContainer}>
        <div bind:this={animationContainer} class="animation-container">
            <!-- CHANGED: Button to div - no click handler, display-only -->
            <div
                class="audio-button {audioState_value}"
                class:is-recording={currentSessionState === SessionState.Running}
                class:is-running={currentSessionState === SessionState.Running}
                class:is-paused={currentSessionState === SessionState.Paused}
                aria-label={currentSessionState === SessionState.Running ? 'Recording active' : 'Recording inactive'}
                title={currentSessionState === SessionState.Running ? 'Recording active' : 'Recording inactive'}
            >
            {#if audioState_value === AudioState.Stopping}
                <div class="loading-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            {:else if audioState_value === AudioState.Listening || audioState_value === AudioState.Speaking}
                <svg class="microphone-icon">
                    <use href="/icons.svg#mic-off"></use>
                </svg>
            {:else}
                <svg class="microphone-icon">
                    <use href="/icons.svg#mic"></use>
                </svg>
            {/if}
            </div>
        </div>
</div>

<style>
    .audio-button-container {
        --idle-color: var(--color-interactivity);
        --idle-color-text: var(--color-interactivity-text);
        --speech-color: var(--color-positive);
        --listen-color: var(--color-interactivity);
        --sound-color: var(--idle-color);
        --sound-color-text: var(--idle-color-text);
        --button-size: 4.8rem;
        --animation-duration: 2s; /* Default animation duration */
        
        /* Simple container that inherits parent positioning */
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .animation-container {
        position: relative;
        width: 100%;
        height: 100%;
        /* Create stacking context for proper layering */
        z-index: 1000;
    }

    /* Button styling */
    .audio-button {
        position: relative;
        width: var(--button-size);
        height: var(--button-size);
        border-radius: 50%;
        border: 0.3rem solid var(--sound-color);
        background-color: var(--sound-color);
        color: var(--sound-color-text);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: var(--text-bold);
        box-shadow: 0 1rem 1rem -0.3rem rgba(0, 0, 0, 0.5);
        transition: all 0.3s ease;
        overflow: hidden;
        /* Ensure button is above animations */
        z-index: 1002;
    }

    .audio-button:hover {
        transform: scale(1.05);
        box-shadow: 0 1.6rem 1.2rem -0.8rem rgba(0, 0, 0, 0.4);
        /* Ensure base hover state maintains button colors */
        background-color: var(--sound-color);
        border-color: var(--sound-color);
        color: var(--sound-color-text);
    }

    .audio-button:active {
        transform: scale(0.95);
    }

    /* State-specific colors */
    .audio-button.speaking {
        --sound-color: var(--speech-color);
    }

    .audio-button.stopping {
        --sound-color: var(--color-negative);
    }

    .audio-button.listening {
        --sound-color: var(--listen-color);
    }

    .audio-button.error {
        --sound-color: var(--color-negative);
    }
    
    /* Paused state - maintain default colors */
    .audio-button.is-paused {
        --sound-color: var(--idle-color);
        --sound-color-text: var(--idle-color-text);
    }
    
    /* Paused state hover - maintain colors, don't inherit toolbar styles */
    .audio-button.is-paused:hover {
        background-color: var(--idle-color);
        border-color: var(--idle-color);
        color: var(--idle-color-text);
        transform: scale(1.05);
        box-shadow: 0 1.6rem 1.2rem -0.8rem rgba(0, 0, 0, 0.4);
    }


    /* Running state (when recording) */
    .audio-button.is-running {
        background-color: var(--color-white);
        color: var(--sound-color);
    }

    .audio-button.is-running:hover {
        color: var(--color-negative);
        border-color: var(--color-negative);
    }

    /* Icon styling */
    .microphone-icon {
        width: 60%;
        height: 60%;
        fill: currentColor;
    }

    /* Loading animation */
    .loading-dots {
        display: flex;
        gap: 0.4rem;
    }

    .loading-dots span {
        width: 0.6rem;
        height: 0.6rem;
        background-color: currentColor;
        border-radius: 50%;
        animation: loading-bounce 1.4s infinite ease-in-out;
    }

    .loading-dots span:nth-child(1) {
        animation-delay: -0.32s;
    }

    .loading-dots span:nth-child(2) {
        animation-delay: -0.16s;
    }

    @keyframes loading-bounce {
        0%, 80%, 100% {
            transform: scale(0);
            opacity: 0.5;
        }
        40% {
            transform: scale(1);
            opacity: 1;
        }
    }

    /* Microphone activity animation */
    .audio-button-container :global(.animate) {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 100%;
        height: 100%;
        border-radius: 50%;
        background-color: var(--sound-color);
        transform: translate(-50%, -50%) scale(1);
        animation: mic-pulse var(--animation-duration) cubic-bezier(0.1, 0.8, 0.57, 0.98);
        pointer-events: none;
        z-index: 1001; /* Behind button but visible above everything else */
    }

    .audio-button-container :global(.animate.speaking) {
        background-color: var(--speech-color);
    }

    .audio-button-container :global(.animate.stopping),
    .audio-button-container :global(.animate.stopped) {
        background-color: var(--color-white);
    }

    @keyframes mic-pulse {
        0% {
            transform: translate(-50%, -50%) scale(1);
            opacity: var(--start-opacity, 0.7);
        }
        100% {
            transform: translate(-50%, -50%) scale(3);
            opacity: 0;
        }
    }

    /* Responsive adjustments */
    @media screen and (max-width: 768px) {
        .audio-button-container.position-center {
            --button-size: 16rem;
        }
    }

    @media screen and (max-width: 480px) {
        .audio-button-container.position-center {
            --button-size: 12.8rem;
        }
    }
</style>