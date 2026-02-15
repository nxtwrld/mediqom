<script lang="ts">
    import { AudioState } from '$lib/audio/microphone';
    import { getAudioManager } from '$lib/audio/AudioManager';
    // @ts-ignore - throttle-debounce has type issues but works fine
    import { throttle } from 'throttle-debounce';
    import { onDestroy, onMount } from 'svelte';
    import shortcuts from '$lib/shortcuts';
    import type { PartialTranscript } from '$lib/session/manager';
    import { log } from '$lib/logging/logger';

    interface Props {
        hasResults?: boolean;
        speechChunks?: Float32Array[];
        state?: AudioState;
        sessionId?: string;
        useRealtime?: boolean;
        language?: string;
        models?: string[];
        onspeechstart?: () => void;
        onspeechend?: (event: { speechChunks: Float32Array[] }) => void;
        onfeatures?: (features: any) => void;
        ontranscript?: (transcript: PartialTranscript) => void;
        onanalysis?: (analysis: any) => void;
        onsessioncreated?: (sessionId: string) => void;
    }

    let {
        hasResults = false,
        speechChunks = $bindable([]),
        state = $bindable(AudioState.Ready),
        sessionId = $bindable(),
        useRealtime = false,
        language = 'en',
        models = ['GP'],
        onspeechstart,
        onspeechend,
        onfeatures,
        ontranscript,
        onanalysis,
        onsessioncreated
    }: Props = $props();

    let micAnimationContainer: HTMLDivElement;

    let isRunning = $derived(state === AudioState.Listening || state === AudioState.Speaking);
    let isRealtimeReady = $derived(useRealtime && sessionId); // Simplified - SSE handled by session store

    // Add comprehensive logging
    $effect(() => {
        log.audio.debug('AudioButton State Update:', {
            state,
            useRealtime,
            sessionId,
            isRealtimeReady,
            audioManagerInitialized: getAudioManager().getIsInitialized()
        });
    });

    const micTick = throttle(200, (energy: number) => {
        const tickElement = document.createElement('div');
        tickElement.addEventListener("animationend", () => {
            tickElement.remove();
        });
        tickElement.style.opacity = `${Math.min(Math.max(energy, .1),.8)}`;
        tickElement.classList.add(state);
        if (micAnimationContainer) micAnimationContainer.appendChild(tickElement);
        tickElement.classList.add('animate');
        
    });

    // Visual feedback for AudioManager events
    function handleAudioFeatures(features: any) {
        const data = features.detail || features;
        const { energy } = data;
        if (energy && energy > 0.001) {
            micTick(energy);
        }
        onfeatures?.(data);
    }

    function handleSpeechStart() {
        log.audio.info('Speech started - visual feedback');
        // State updates handled by handleStateChange from AudioManager
        onspeechstart?.();
    }

    function handleSpeechEnd(audioData: Float32Array) {
        log.audio.info('Speech ended - visual feedback');
        // State updates handled by handleStateChange from AudioManager
        
        // For backward compatibility with parent components
        speechChunks.push(audioData);
        onspeechend?.({
            speechChunks
        });
    }

    function handleStateChange(audioState: AudioState) {
        log.audio.debug('AudioButton state change:', { from: state, to: audioState });
        state = audioState;
    }

    onMount(() => {
        log.audio.debug('AudioButton mounted - subscribing to AudioManager events');
        
        // Subscribe to AudioManager events for visual feedback
        getAudioManager().on('features', handleAudioFeatures);
        getAudioManager().on('speech-start', handleSpeechStart);  
        getAudioManager().on('speech-end', handleSpeechEnd);
        getAudioManager().on('state-change', handleStateChange);
        
        // TODO: Remove shortcuts - now handled by parent components
        // return shortcuts.listen('Space', () => {
        //     // Audio control handled by unified session store
        // });
        
        return () => {
            // Cleanup event listeners
            getAudioManager().off('features', handleAudioFeatures);
            getAudioManager().off('speech-start', handleSpeechStart);
            getAudioManager().off('speech-end', handleSpeechEnd);
            getAudioManager().off('state-change', handleStateChange);
        };
    });

    onDestroy(() => {
        log.audio.debug('AudioButton destroying - visual component only');
        // AudioManager cleanup handled by session store
    })

</script>



<div class="record-audio {state}" class:-has-results={hasResults} bind:this={micAnimationContainer}>
    <!-- Visual-only button - audio control handled by parent components -->
    <div class="control {state}" class:-running={isRunning}>
        {#if state == AudioState.Stopping}
        ....
        {:else if state === AudioState.Listening ||  state === AudioState.Speaking}
            <svg>
                <use href="/icons.svg#mic-off"></use>
            </svg>
        {:else}
            <svg>
                <use href="/icons.svg#mic"></use>
            </svg>
        {/if}
    </div>
    {#if true || (!isRunning && hasResults)}
        <!--button class="finalize" >
            Finalize Report
        </button-->
    {/if}
</div>

<style>

.record-audio {
        --idle-color: var(--color-interactivity);
        --idle-color-text: var(--color-interactivity-text);
        --speech-color: var(--color-positive);
        --listen-color: var(--color-purple);
        --sound-color: var(--idle-color);
        --sound-color-text: var(--idle-color-text);
        width: 100%;
        height: 100%;
    }

    .record-audio.speaking {
        --sound-color: var(--speech-color);
    }
    .record-audio.stopping {
        --sound-color: var(--color-negative);
    }
    .record-audio.listening {
        --sound-color: var(--listen-color);
    }

    .record-audio :global(> *) {
        position: absolute;
        left: 50%;
        top: 50%;
        width: 12rem;
        height: 12rem;
        border-radius: 50%;
        transform: translate(-50%, -50%);
        transition: width .5s, height .5s;
        transition-timing-function: ease-in;
    }
    .record-audio.-has-results :global(> *) {
        width: 6rem;
        height: 6rem;
    }
    .record-audio .control {
        background-color: var(--sound-color);
        border: .2rem solid var(--sound-color);
        color: var(--sound-color-text);
        font-weight: var(--text-bold);
        font-size: 1.5rem;
        z-index: 1001;
        pointer-events: all;
        padding: 1rem;
        box-shadow: 0 .6rem .6rem -.2rem rgba(0,0,0,.5);
        transition: all .5s;
    }   
    .record-audio .control:hover,
    .record-audio .control:active {
        transform: translate(-50%, calc(-50% + .2rem)) scale(1.05);
        box-shadow: 0 1rem .8rem -.5rem rgba(0,0,0,.4)
    }
    .record-audio .control.-running {
        background-color: var(--color-white);
        color: var(--sound-color);
    }


    .record-audio.speaking .control.-running {
        color: var(--sound-color);
        border-color: var(--sound-color);
    }
    
    .record-audio .control.-running:hover,
    .record-audio .control.-running:active,
    .record-audio .control.-running.speaking:hover,
    .record-audio .control.-running.speaking:active {
        color: var(--color-negative);
        border-color: var(--color-negative);
    }

    .record-audio .control svg {
        width: 100%;
        height: 100%;
        fill: currentColor;
    }


    .record-audio :global(.animate) {
        background-color: var(--sound-color);
        transition: scale 1s cubic-bezier(.1,.8,.57,.98), opacity 1s cubic-bezier(.1,.8,.57,.98);
        /*box-shadow: inner 0 0 6rem var(--color-white);*/
        animation: pulse 2s;
        animation-iteration-count: 1;
    }
    .record-audio :global(.animate.speaking) {
        background-color: var(--speech-color);
    }
    .record-audio :global(.animate.stopping),
    .record-audio :global(.animate.stopped) {
        background-color: var(--color-white);
    }
    @keyframes pulse {
        0% {
            transform: translate(-50%, -50%) scale(1);
        }
        100% {
            transform: translate(-50%, -50%) scale(3);
            opacity: 0;
        }
    }


</style>