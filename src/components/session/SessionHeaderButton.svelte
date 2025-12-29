<script lang="ts">
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import { audioState, sessionState, SessionState, AudioState, unifiedSessionActions } from '$lib/session/stores/unified-session-store';
    import { t } from '$lib/i18n';
    import { logger } from '$lib/logging/logger';
    import AudioButton from '$components/layout/AudioButton.svelte';
    import EndSessionModal from './EndSessionModal.svelte';
    
    interface Props {
        profileId: string;
        patientId?: string;
        performerId?: string;
        performerName?: string;
        isActive?: boolean;
    }
    
    let { profileId, patientId, performerId, performerName, isActive = false }: Props = $props();
    
    // Container reference for header button
    let headerAudioContainer = $state<HTMLDivElement>();
    
    // Session state reactive values
    let currentSessionState = $derived($sessionState);
    let audioStateValue = $derived($audioState.state);
    let showEndSessionModal = $state(false);
    
    // Detect if user is currently on session page
    let isOnSessionPage = $derived($page.url.pathname.includes('/session-moe'));
    
    // Check if session has data (transcript or analysis)
    let sessionHasData = $derived(
        currentSessionState === SessionState.Running || 
        currentSessionState === SessionState.Paused
    );
    
    // Determine which text state to show
    let currentTextState = $derived(
        !sessionHasData ? 'new-session' :
        !isOnSessionPage ? 'continue' :
        currentSessionState === SessionState.Paused ? 'paused' :
        audioStateValue === AudioState.Listening ? 'listening' :
        audioStateValue === AudioState.Speaking ? 'recording' :
        'recording'
    );
    
    // Check if we're in recording mode (states that auto-swap)
    let isRecordingMode = $derived(
        currentSessionState === SessionState.Running &&
        (audioStateValue === AudioState.Listening || 
         audioStateValue === AudioState.Speaking)
    );
    
    // For sprite mode, determine which recording state to show (0 = listening, 1 = speaking/recording)
    let recordingSpriteIndex = $derived(
        audioStateValue === AudioState.Speaking ? 1 : 0
    );
    
    // Compute the transform string properly - move by 50% since we're moving the parent of 2 children
    let sliderTransform = $derived(`translateY(${-recordingSpriteIndex * 50}%)`);
    
    // Debug logging
    $effect(() => {
        if (isRecordingMode) {
            console.log('Recording mode - Audio state:', audioStateValue, 'Sprite index:', recordingSpriteIndex, 'Transform:', sliderTransform);
        }
    });
    
    // Audio button visibility - only show in header when session has data
    let showAudioButtonInHeader = $derived(sessionHasData);
    
    // Show End Session button only when session has data
    let showEndSessionButton = $derived(sessionHasData);

    onMount(() => {
        // Component mounted
        logger.audio.debug('SessionHeaderButton mounted');
    });
    
    function handleEndSession() {
        logger.session.info('End session button clicked');
        showEndSessionModal = true;
    }
    
    function closeEndSessionModal() {
        showEndSessionModal = false;
    }
</script>

<!-- Single multi-state button (always present) -->
<a href="/med/p/{profileId}/session-moe" 
   class="sub-item session-status-btn"
   class:-active={isActive}
   class:listening={showAudioButtonInHeader && audioStateValue === AudioState.Listening}
   class:speaking={showAudioButtonInHeader && audioStateValue === AudioState.Speaking}
   class:paused={showAudioButtonInHeader && currentSessionState === SessionState.Paused}
   class:has-audio={showAudioButtonInHeader}>
    {#if sessionHasData}
        <!-- Container for audio button in header (only rendered when session has data) -->
        <!-- Note: hidden class is removed by animation logic in session-moe page -->
        <div bind:this={headerAudioContainer} id="header-audio-button" class="audio-button-header-container hidden">
            <AudioButton />
        </div>
    {/if}
    <!-- Conditional sprite mode - only for recording states -->
    {#if isRecordingMode}
        <!-- Sprite container for listening/recording (prevents jumping) -->
        <span class="button-text-container sprite-mode">
            <span class="button-text-slider" style="transform: {sliderTransform}">
                <span class="button-text sprite-text">
                    {$t('session.status.listening')}
                </span>
                <span class="button-text sprite-text">
                    {$t('session.status.recording')}
                </span>
            </span>
        </span>
    {:else}
        <!-- Normal single text (natural sizing) -->
        <span class="button-text">
            {#if currentTextState === 'new-session'}
                {$t('app.nav.new-session')}
            {:else if currentTextState === 'continue'}
                {$t('session.status.continue')}
            {:else if currentTextState === 'paused'}
                {$t('session.status.paused')}
            {:else}
                {$t('session.status.recording')}
            {/if}
        </span>
    {/if}
</a>

<!-- End Session button (only when session has data) -->
{#if showEndSessionButton}
    <button 
        type="button" 
        class="sub-item end-session-btn"
        onclick={handleEndSession}
        title={$t('session.actions.end')}
    >
        {$t('session.actions.end')}
    </button>
{/if}


{#if showEndSessionModal}
    <EndSessionModal 
        onclose={closeEndSessionModal}
        {patientId}
        {performerId}
        {performerName}
    />
{/if}


<style>
    .session-status-btn {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 1rem;
        color: var(--color-black);
        border-radius: var(--radius);
        font-weight: var(--text-bold);
        z-index: 1001;
        text-decoration: none;
        cursor: pointer;
        position: relative;
    }


    .session-status-btn.listening .button-text {
        color: var(--color-interactivity);
        transition: color 0.3s ease;
    }

    .session-status-btn.speaking .button-text {
        color: var(--color-positive);
        transition: color 0.3s ease;
    }
    
    .session-status-btn.paused .button-text {
        color: var(--color-gray-700);
        transition: color 0.3s ease;
    }

    /* Sprite mode - only for recording states */
    .button-text-container.sprite-mode {
        position: relative;
        display: inline-block;
        overflow: hidden;
        height: 1.2em; /* Fixed height for single line */
        line-height: 1.2em; /* Match height for proper alignment */
        vertical-align: middle;
    }
    
    .button-text-slider {
        position: relative; /* Required for transform to work */
        display: block;
        /* No transition - instant jump between states */
        will-change: transform;
        transform-origin: top left;
    }
    
    .button-text.sprite-text {
        display: block;
        height: 1.2em;
        line-height: 1.2em;
    }
    
    /* Normal text mode - natural sizing */
    .button-text {
        font-size: 0.9rem;
        white-space: nowrap;
    }
    
    /* When button has audio, adjust layout */
    .session-status-btn.has-audio {
        padding-left: 0.5rem;
    }

    .audio-button-header-container {
        width: 2.5rem;
        height: 2.5rem;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: opacity 0.3s ease, visibility 0.3s ease;
    }
    
    .audio-button-header-container.hidden {
        opacity: 0;
        visibility: hidden;
    }

    .end-session-btn {
        background: var(--color-error, #dc2626);
        color: var(--color-error-text, #fff);
        border: none;
        padding: 0.5rem 1rem;
        font-size: 0.875rem;
        border-radius: var(--radius);
        cursor: pointer;
        transition: all 0.2s ease;
        font-weight: 500;
        white-space: nowrap;
        display: flex;
        align-items: center;
        justify-content: center;
        text-decoration: none;
    }

    .end-session-btn:hover {
        background: var(--color-error-hover, #b91c1c);
        transform: translateY(-1px);
    }

    .end-session-btn:active {
        transform: translateY(0);
    }

    /* Ensure AudioButton inherits container size and animation timing */
    .session-status-btn :global(.audio-button-container) {
        --button-size: 2.5rem;
        --animation-duration: 0.8s; /* Faster animation for smaller header button */
    }
</style>