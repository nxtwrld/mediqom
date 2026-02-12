<!-- @migration-task Error while migrating Svelte code: can't migrate `let showLayers: boolean = false;` to `$state` because there's a variable named state.
     Rename the variable and try again or migrate by hand. -->
<script lang="ts">
    import Body from '$components/anatomy/Body.svelte';
    import { profile } from '$lib/profiles';
    import objects from '$components/anatomy/objects.json';
	import { onDestroy, onMount } from 'svelte';
	import Loading from '$components/ui/Loading.svelte';
    import { fade } from 'svelte/transition';
    import { sounds } from '$components/ui/Sounds.svelte';
    import { state } from '$lib/ui';
    import { t } from '$lib/i18n';

    let showLayers: boolean = false;
    let model: Body;
    let firstLoad: boolean = true;

    export let activeLayers: string[] = [
        //'skin',
        'skeleton'
    ];

    export let activeTools: string[] = [];
    
    let showShade: boolean = true;
    let modelLoaded: boolean = false;

    const layers: string[] = ['shade',...Object.keys(objects)];
    console.log('layers', layers);
    const tools: string[] = [
        'selection',
        //'marker'
    ]

    function toggleLayer(layer: string) {
        if (layer === 'shade') {
            //console.log('toggle shade', showShade);
            showShade = !showShade;
            return;
        }

        if (activeLayers.includes(layer)) {
            activeLayers = activeLayers.filter(l => l !== layer);
        } else {
            activeLayers = [...activeLayers, layer];
        }
        sounds.focus.play();
     //   console.log('activeLayers', activeLayers);
    }

    function toggleTool(tool: string) {
        if (activeTools.includes(tool)) {
            activeTools = activeTools.filter(t => t !== tool);
        } else {
            activeTools = [...activeTools, tool];
        }
        sounds.focus.play();
       // console.log('activeTools', activeTools);
       showLayers = false;
    }

    onMount(() => {
        firstLoad = true;
        window.addEventListener('mousedown', (e) => {
            showLayers = false;
        })
    });

    onDestroy(() => {
        window.removeEventListener('mousedown', (e) => {
            showLayers = false;
        })
    })

    function ready() {
        modelLoaded = true;
        if (firstLoad) sounds.model.play();
        firstLoad = false;
    }


    function resetModel() {
        sounds.focus.play();
        model.reset();
    }
    function closeModel() {
        $state.viewer = false;
    }
</script>

{#if $profile}
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="model" on:mousedown={() => showLayers = false}>
    {#key $profile.health.biologicalSex}
    <Body bind:this={model} on:ready={ready} on:focus bind:activeLayers={activeLayers} {activeTools} {showShade} />
    {/key}

    <div class="model-profile-name">
        {$profile.fullName}
    </div>

    <div class="model-layers" class:-active={showLayers}>
        <em>{activeLayers.length}</em>

        <button class="toggle" on:mousedown|stopPropagation on:click|stopPropagation={() => showLayers = !showLayers}>
            {#if showLayers}
            <svg>
                <use href="/icons.svg#arrow-nav-up" />
            </svg>
            {:else}
            <svg>
                <use href="/icons.svg#arrow-nav-down" />
            </svg>
            {/if}
        </button>

        {#if showLayers}
            {#each layers as layer}
                <button class="layer" 
                    on:mousedown|stopPropagation
                    on:click={() => toggleLayer(layer)} 
                    class:-active={activeLayers.includes(layer)}>
                    <svg>
                        <use href="/anatomy_models/layers.svg#figure" />
                    </svg>
                    <svg>
                        <use href="/anatomy_models/layers.svg#{layer.toLowerCase()}" />
                    </svg>
                    <span>{$t('anatomy.layers.'+layer)}</span>
                </button>
            {/each} 
        {/if}
    </div>

    <div class="model-tools">
        {#each tools as tool}
            <button class="tool" 
                on:mousedown|stopPropagation
                on:click={() => toggleTool(tool)} 
                class:-active={activeTools.includes(tool)}>
                <svg>
                    <use href="/icons.svg#{tool.toLowerCase()}" />
                </svg>
                <span>{$t('anatomy.tools.'+tool)}</span>
            </button>
        {/each}
        <button class="tool"
        on:mousedown|stopPropagation
        on:click={resetModel} 
        >
            <svg>
                <use href="/icons.svg#anatomy-reset" />
            </svg>
            <span>{$t('anatomy.tools.reset')}</span>
        </button>
        <button class="tool"
        on:mousedown|stopPropagation
        on:click={closeModel} 
        >
            <svg>
                <use href="/icons.svg#close" />
            </svg>
            <span>{$t('anatomy.tools.close')}</span>
        </button>
    </div>

    {#if modelLoaded === false}    
        <div class="loading-shade" out:fade>
            <Loading />
        </div>
    {/if}
</div>
{/if}

<style>
    .loading-shade {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 100000;
        background-color: var(--background);
    }

    .model {
        position: relative;
        width: 100%;
        height: 100%;
/*
        background-image: linear-gradient(90deg, var(--color-shade) 0%, var(--color-shade) 5%, transparent 35%, #FFF 50%, transparent 65%, var(--color-shade) 95%, var(--color-shade) 100%);*/
    }

    .model-tools,
    .model-layers {
        --size: 3.5rem;
        --radius: 0;
        position: absolute;
        top: 1rem;
        left: 1rem;
        width: var(--size);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 1;
        opacity: 0;
        pointer-events: none;
        transition: opacity .2s ease-in-out .2s;
        box-shadow: 0px 0px 0px 1px rgba(255,255,255,.4), 2px 2px 2px 0px rgba(0,0,0,.4);
        border-radius: var(--radius);
    }


    .model-layers {
        max-height: 2rem;
        transition: max-height .2s ease-in-out ;
    }
    .model-layers.-active {
        max-height: 100rem;
    }
    .model-tools {
        right: 1rem;
        left: auto;
        flex-direction: column;
        bottom: 1rem;
        top: auto;
    }

    @media only screen and (max-width: 768px) { 

        .model-layers {
            position: fixed;
            left: 1rem;
            /*top: calc(var(--top-offset) + 1rem);*/
            z-index: 100000;
        }

        .model-tools {
            left: auto;
            right: 1rem;
        }
    }

    .model-tools,
    .model-layers {
        pointer-events: all;
        opacity: 1;
    }


    .model-layers em {
        position: absolute;
        top: -.6rem;
        right: -.6rem;
        width: 1.5rem;
        height: 1.5rem;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        background-color: var(--color-highlight);
        color: var(--color-highlight-text);
        z-index: 3;
        box-shadow: 1px 1px 2px rgba(0,0,0,0.2);
    }
    .model-tools button,
    .model-layers button {
        position: relative;
        width: 100%;
        overflow: hidden;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        background-color: var(--color-gray-300);
        color: #333;
    }
    .model-tools button,
    .model-layers button {
        margin-bottom: 1px;
    }
    

    .model-tools button:hover,
    .model-layers button:hover {
        background-color: var(--color-white);
    }
    

    .model-tools button.-active,
    .model-layers button.-active {
        background-color: var(--color-highlight);
        color: var(--color-highlight-text);
        box-shadow: inset 0 0 0 .1rem var(--color-primary);
        z-index: 2;
    }

    .model-tools button.-active svg,
    .model-layers button.-active svg {
        filter: drop-shadow(1px 1px 2px rgb(0 0 0/ 0.3));
    }
    .model-tools button.tool,
    .model-layers button.layer {
        aspect-ratio: 1/1;
    }
    .model-layers button.toggle {
        height: 2rem;
        color: #333;
        padding: .3rem 0;
    }
    .model-layers button.toggle svg {
        top: 50%;
        width: 30%;
        height: 1rem;
        fill: currentColor;
    }
    .model-tools button:last-child,
    .model-layers button:last-child {
        margin-bottom: 0;
        border-bottom-left-radius: var(--radius);
        border-bottom-right-radius: var(--radius);
    }
    .model-tools button:first-of-type,
    .model-layers button:first-of-type {
        border-top-left-radius: var(--radius);
        border-top-right-radius: var(--radius);
    }
    .model-tools button svg,
    .model-layers button svg {
        position: absolute;
        width: 60%;
        height: 60%;
        top: 40%;
        left: 50%;
        transform: translate(-50%, -50%);
        fill: currentColor;
        stroke-width: 0.2rem;
        stroke: currentColor;
        filter: drop-shadow(1px 1px 1px rgb(255 255 255/ 0.7));
    }
    .model-tools button svg {
        stroke-width: 0;
        height: 50%;
        width: 50%;
    }
    
    .model-tools button span,
    .model-layers button span {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        text-align: center;
        font-size: .6rem;
        padding: .2rem;
    }



    .model-profile-name {
        position: absolute;
        bottom: 1rem;
        left: 1rem;
        padding: .3rem .8rem;
        font-size: .8rem;
        color: #FFF;
        background-color: rgba(0, 0, 0, .3);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        border-radius: var(--border-radius);
        pointer-events: none;
        z-index: 1;
        text-transform: uppercase;
        letter-spacing: .05em;
    }

    @keyframes rotate {
        0% {
            transform: translate(-50%, -50%) rotate(0deg);
            opacity: 0;
        }
        10% {
            opacity: 1;
        }
        90% {
            opacity: 1;
        }
        100% {
            transform: translate(-50%, -50%) rotate(360deg);
        }
    }
</style>
