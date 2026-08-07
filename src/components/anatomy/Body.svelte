<!-- @migration-task Error while migrating Svelte code: can't migrate `let loadedLayers: string[] = [];` to `$state` because there's a variable named state.
     Rename the variable and try again or migrate by hand. -->
<script lang="ts">
    import { goto } from '$app/navigation';
    import { onMount, createEventDispatcher } from 'svelte';
    import * as THREE from 'three';
    import ui, { state } from '$lib/ui';
    import objects3d from '$data/objects.json';
    import { fade } from 'svelte/transition';
    import TWEEN from '@tweenjs/tween.js';
    import focused from '$lib/focused';
    import { profile } from '$lib/profiles';
    import type { SexEnum } from '$lib/types.d';
    import { documents } from '$lib/documents';
    import store from './store';
    import { updateTransporterTime } from './transporter.shader';
    import { sounds } from '$components/ui/Sounds.svelte';
    import { t } from '$lib/i18n';
    import { translateAnatomy } from '$lib/i18n/anatomy';
    import AskButton from '$components/chat/AskButton.svelte';
    import { date } from '$lib/datetime';

    // Extracted modules
    import { createSceneState, MAX_IDLE_FRAMES } from './scene-state';
    import { initScene, resize, clearObjects, disposeScene, computeDefaultState } from './scene-setup';
    import type { DefaultState } from './scene-setup';
    import { precacheMaterials, clearMultiVariantCache } from './material-system';
    import {
        setHighlight as doSetHighlight,
        setMultiHighlight as doSetMultiHighlight,
        focusObject,
        focusArea,
        focusMeshGroup,
        highlight,
        removeAuraMesh,
        setViewState,
        resetFocus as doResetFocus
    } from './highlight-system';
    import type { CameraPreset } from './highlight-system';
    import type { MultiHighlightRegion } from './scene-state';
    import {
        updateModel as doUpdateModel,
        loadShade,
        toggleShade
    } from './model-loader';
    import type { LabelEntry } from './model-loader';
    import {
        getLabelsMap as doGetLabelsMap,
        labelsContentChanged,
        loadLabels as doLoadLabels,
        refreshLabels as doRefreshLabels,
        cleanupLabels,
        getBodyPartAskData,
        anatomyMapped as mapped
    } from './label-manager';
    import type { LabelHandlers } from './label-manager';
    import {
        setContext as doSetContext,
        clearContext as doClearContext
    } from './context-manager';
    import type { IContext } from './context/types.d';
    import {
        createClusterState,
        updateClusters,
        suppressCluster,
        disposeClusterState
    } from './label-clustering';
    import type { LabelCluster } from './label-clustering';

    const dispatch = createEventDispatcher();

    // ─── Props ────────────────────────────────────────────────────
    export let model: SexEnum = $profile?.health?.biologicalSex || 'male';
    export let activeLayers: string[] = [];
    export let activeTools: string[] = [];
    export let showShade: boolean = true;
    export let fullscreen: boolean = false;
    export let viewportRect: { x: number; y: number; width: number; height: number } | null = null;
    export let selected: THREE.Object3D | null = null;
    // Care Plan multi-region highlights (build row 13). When set, the model
    // paints these regions; clicking one dispatches `carePlanRegionClick`.
    export let carePlanRegions: MultiHighlightRegion[] = [];

    // ─── Shared State ─────────────────────────────────────────────
    const ss = createSceneState();
    const clusterState = createClusterState();

    function handleClusterClick(cluster: LabelCluster) {
        sounds.focus?.play();
        suppressCluster(clusterState, cluster, ss);
        focusArea(ss, cluster.worldCenter, cluster.radius);
    }

    // ─── Svelte-reactive variables ────────────────────────────────
    let loadedLayers: string[] = [];
    let ready: boolean = false;
    let pendingFocus: string | null = null;
    let modelLoaded: boolean = false;
    let container: HTMLDivElement;
    let labelContainer: HTMLDivElement;
    let resizeObserverListener: ResizeObserver;
    let currentContext: IContext | null = null;
    let showContextInfo: boolean = false;
    let originalState: { layers: string[] | null } = { layers: null };

    // ─── Labels ───────────────────────────────────────────────────
    let labels: LabelEntry[] = [];
    let previousLabels: LabelEntry[] = [];

    $: void $documents, void $profile, (() => {
        const result = doGetLabelsMap($profile, activeLayers);
        if (labels.length > 0 && !labelsContentChanged(result.labels, labels)) return;
        labels = result.labels;
        if (result.layersToAdd.length > 0) {
            activeLayers = [...activeLayers, ...result.layersToAdd];
        }
    })();

    // ─── Computed defaults ────────────────────────────────────────
    let defaultState: DefaultState;
    $: defaultState = computeDefaultState(model);

    // ─── Exported functions ───────────────────────────────────────
    export function reset() {
        resetFocus();
        ss.previousViewState = ss.initialViewState ?? null;
        if (ss.initialViewState) setViewState(ss, ss.initialViewState);
    }

    /** Frames a group of meshes — e.g. the meshes of a Care Plan region or a
     *  `show_anatomy` result. Moves the camera only; pair with `carePlanRegions`
     *  to paint them. */
    export function showRegion(meshNames: string[], preset: CameraPreset = 'anterior') {
        return focusMeshGroup(ss, meshNames, preset);
    }

    /** Moves the camera to a named view of the whole model. */
    export function setCamera(preset: CameraPreset) {
        return focusMeshGroup(ss, [], preset);
    }

    // ─── Label handlers (stay in component — tightly coupled to DOM/stores) ──
    const labelHandlers: LabelHandlers = {
        handleLabelMouseDown,
        handleLabelMouseUp,
        handleActionPointerDown,
        handleActionPointerUp,
        handleButtonPointerDown,
        handleButtonPointerUp
    };

    function handleGlobalPointerDown(event: MouseEvent | TouchEvent) {
        if (!ss.openedLabel) return;
        const target = event.target as HTMLElement;
        if (ss.openedLabel.contains(target)) return;
        ss.openedLabel.classList.remove('-open');
        ss.openedLabel.style.zIndex = '';
        ss.openedLabel = null;
    }

    function handleActionPointerDown(event: PointerEvent) {
        event.stopPropagation();
        event.preventDefault();
    }

    function handleActionPointerUp(event: PointerEvent) {
        event.stopPropagation();
        event.preventDefault();
        const action = event.currentTarget as HTMLAnchorElement;
        const labelEl = action.closest<HTMLElement>('.label');
        if (labelEl) {
            labelEl.classList.remove('-open');
            labelEl.style.zIndex = '';
        }
        ss.openedLabel = null;
        ui.emit('viewer:close');
        goto(action.getAttribute('href')!);
    }

    function handleButtonPointerDown(event: PointerEvent) {
        event.stopPropagation();
        event.preventDefault();
    }

    function handleButtonPointerUp(event: PointerEvent) {
        event.stopPropagation();
        event.preventDefault();
        (event.currentTarget as HTMLButtonElement).click();
        const labelEl = (event.currentTarget as HTMLElement).closest<HTMLElement>('.label');
        if (labelEl) {
            labelEl.classList.remove('-open');
            labelEl.style.zIndex = '';
        }
        ss.openedLabel = null;
    }

    function handleLabelMouseDown(event: MouseEvent) {
        event.stopPropagation();
        sounds.focus?.play();
        ($state as any).focusView = true;
        // Close previously opened label
        if (ss.openedLabel) {
            ss.openedLabel.classList.remove('-open');
            ss.openedLabel.style.zIndex = '';
        }
        ss.openedLabel = (event.target as HTMLElement)?.closest('.label');
        if (ss.openedLabel) {
            ss.openedLabel.classList.add('-open');
            // Override CSS2DRenderer's depth-based zIndex
            ss.openedLabel.style.zIndex = '10000';
        }
    }

    function handleLabelMouseUp(event: MouseEvent) {
        event.stopPropagation();
        ($state as any).focusView = true;
    }

    // ─── Pointer / raycaster interaction ──────────────────────────
    let tap: number = 0;
    function onPointerClick(event: MouseEvent) {
        if (ss.dragged) return;

        let now = Date.now();
        if (tap && now - tap < 300) {
            tap = now;
            return;
        } else {
            tap = now;
        }

        if (!activeTools.includes('selection')) return;

        var rect = container.getBoundingClientRect();
        var x = event.clientX - rect.left;
        var y = event.clientY - rect.top;

        ss.pointer.x = (x / rect.width) * 2 - 1;
        ss.pointer.y = -(y / rect.height) * 2 + 1;

        ss.raycaster.setFromCamera(ss.pointer, ss.camera);
        const intersects = ss.raycaster.intersectObjects(ss.group.children, true);
        if (intersects.length > 0) {
            while (intersects.length > 0 && !intersects[0].object?.visible) {
                intersects.shift();
            }
            if (intersects.length === 0) return;

            const object = intersects[0].object;
            if (object.name) {
                sounds.focus?.play();
                // Care Plan mode: a click on a painted region navigates the plan.
                if (carePlanRegions.length > 0) {
                    dispatch('carePlanRegionClick', { mesh: object.name });
                }
                focused.set({ object: object.name });
                selected = object;
            }
        } else {
            focused.set({ object: undefined });
            selected = null;
        }
    }

    // ─── Internal helpers ─────────────────────────────────────────
    function setHighlight(name: string | null) {
        selected = doSetHighlight(ss, name, selected, mapped);
        requestRender();
    }

    // Care Plan multi-region painting — recompute only when the prop changes
    // (the caller throttles to once per page-load / merge).
    let lastCarePlanKey = '';
    $: if (ss?.scene && carePlanRegions) {
        const key = carePlanRegions.map((r) => `${r.mesh}:${r.color}:${r.opacity}`).join('|');
        if (key !== lastCarePlanKey) {
            lastCarePlanKey = key;
            doSetMultiHighlight(ss, carePlanRegions);
            requestRender();
        }
    }

    function resetFocus() {
        doResetFocus(ss, focused);
        clearContextLocal();
        if (ss.initialViewState) setViewState(ss, ss.initialViewState);
    }

    function setContextLocal(context: string | IContext) {
        clearContextLocal();
        if (!context) return;
        const result = doSetContext(ss, context, currentContext, activeLayers, originalState);
        currentContext = result.currentContext;
        activeLayers = result.activeLayers;
    }

    function clearContextLocal() {
        const result = doClearContext(ss, currentContext, activeLayers, originalState);
        currentContext = result.currentContext;
        activeLayers = result.activeLayers;
    }

    function toggleContextInfo() {
        showContextInfo = !showContextInfo;
    }

    // ─── Render loop (stays in component — central heartbeat) ─────
    function requestRender() {
        ss.idleFrames = 0;
        if (ss.animationFrameId === null) {
            ss.animationFrameId = requestAnimationFrame(animate);
        }
    }

    function animate() {
        if (!ss.controls || !ss.renderer) {
            ss.animationFrameId = null;
            return;
        }

        const hasTweens = TWEEN.getAll().length > 0;
        const hasAnimation = !!(currentContext && currentContext.animation);

        // Update aura shader time uniform on all shell materials
        if (ss.auraActive && ss.auraShellMaterials.length) {
            const t = ss.auraClock.getElapsedTime();
            for (const mat of ss.auraShellMaterials) {
                mat.uniforms.uTime.value = t;
            }
        }

        // Update transporter beam time for sparkle animation
        if (ss.transporterActive > 0 && ss.transporterMeshes.length > 0) {
            updateTransporterTime(ss.transporterMeshes);
        }

        // Update idle rings (waiting for objects to load)
        for (const ring of ss.idleRings) {
            ring.material.uniforms.uTime.value = performance.now() / 1000;
        }

        if (hasTweens) TWEEN.update();
        const controlsChanged = ss.controls.update();
        if (hasAnimation) currentContext!.animation!.update();

        if (controlsChanged || hasTweens || hasAnimation || ss.auraActive || ss.transporterActive > 0 || ss.idleRings.length > 0) {
            render();
            ss.idleFrames = 0;
        } else {
            ss.idleFrames++;
        }

        if (ss.idleFrames < MAX_IDLE_FRAMES || hasTweens || hasAnimation || ss.auraActive || ss.transporterActive > 0 || ss.idleRings.length > 0) {
            ss.animationFrameId = requestAnimationFrame(animate);
        } else {
            render(); // final clean frame
            ss.animationFrameId = null;
        }
    }

    function render() {
        if (ss.renderer) {
            ss.renderer.render(ss.scene, ss.camera);
        }
        if (ss.labelRenderer) ss.labelRenderer.render(ss.scene, ss.camera);
        // Re-apply z-index after CSS2DRenderer overwrites it each frame
        if (ss.openedLabel) {
            ss.openedLabel.style.zIndex = '10000';
        }
        updateClusters(labels, ss, clusterState, handleClusterClick);
    }

    // ─── Reactive blocks ──────────────────────────────────────────

    // Layer loading
    $: {
        if (ready && activeLayers != loadedLayers) {
            let toLoad = activeLayers.filter(l => l && !loadedLayers.includes(l));
            let filesToLoad = toLoad
                .filter(l => objects3d[l as keyof typeof objects3d])
                .reduce((acc, l) => {
                    return [...acc, ...objects3d[l as keyof typeof objects3d].files];
                }, [] as string[])
                .filter(f => !ss.loadedFiles.includes(f));
            let objectsToShow = activeLayers
                .filter(l => objects3d[l as keyof typeof objects3d])
                .reduce((acc, l) => {
                    return [...acc, ...objects3d[l as keyof typeof objects3d].objects];
                }, [] as string[]);
            loadedLayers = activeLayers;
            doUpdateModel(
                ss,
                filesToLoad,
                objectsToShow,
                labels,
                model,
                defaultState,
                (name) => {
                    if (!modelLoaded) {
                        pendingFocus = name;
                        return;
                    }
                    setHighlight(name);
                },
                () => doLoadLabels(labels, labelContainer, labelHandlers),
                dispatch
            ).then((result) => {
                modelLoaded = result.modelLoaded;
                clusterState.dirty = true;
                if (pendingFocus) {
                    setHighlight(pendingFocus);
                    pendingFocus = null;
                } else {
                    setHighlight($focused.object ?? null);
                }
            });
        }

        if (ready) toggleShade(ss, showShade);
    }

    // When pill offset changes, push new modelY to all loaded objects
    $: if (ready && ss.group) {
        ss.group.children.forEach(obj => { obj.position.y = defaultState.modelY; });
        requestRender?.();
    }

    // Label reactivity
    $: {
        if (ready && labels !== previousLabels) {
            const oldLabels = previousLabels;
            previousLabels = labels;
            if (oldLabels.length > 0 && labelsContentChanged(labels, oldLabels)) {
                cleanupLabels(oldLabels);
                clusterState.dirty = true;
                if (activeLayers === loadedLayers) {
                    doRefreshLabels(ss, labels, activeLayers, labelContainer, labelHandlers);
                }
            }
        }
    }

    // React to viewportRect / fullscreen changes
    $: void viewportRect, void fullscreen, (() => {
        if (ss.renderer && ss.camera) {
            resize(ss, container, fullscreen);
            requestRender();
        }
    })();

    // ─── Lifecycle ────────────────────────────────────────────────
    let destroyed = false;

    onMount(() => {
        console.log('🧍', 'Mounted');
        destroyed = false;
        ss.destroyed = false;

        // Set the requestRender callback so modules can trigger renders
        ss.requestRender = requestRender;

        // Capture initial store values before any async operations
        let initialStore = $store;

        // Wait for valid dimensions before initializing Three.js
        const waitForDimensions = (): Promise<void> => {
            return new Promise((resolve) => {
                let timeout: ReturnType<typeof setTimeout>;

                const done = () => {
                    clearTimeout(timeout);
                    resolve();
                };

                if (container.offsetWidth > 0 && container.offsetHeight > 0) {
                    done();
                    return;
                }

                timeout = setTimeout(() => {
                    console.warn('🧍', 'waitForDimensions timed out, using fallback');
                    observer.disconnect();
                    done();
                }, 2000);

                const observer = new ResizeObserver((entries) => {
                    const entry = entries[0];
                    if (entry && entry.contentRect.width > 0 && entry.contentRect.height > 0) {
                        observer.disconnect();
                        done();
                    }
                });
                observer.observe(container);
            });
        };

        const initializeViewer = async () => {
            await waitForDimensions();
            if (destroyed) return;

            // Initialize scene
            resizeObserverListener = new ResizeObserver(() => {
                resize(ss, container, fullscreen);
                requestRender();
            });
            resizeObserverListener.observe(container);

            await initScene(ss, container, defaultState, fullscreen, onPointerClick);

            // Load shade and mark ready
            await loadShade(ss, model, defaultState, showShade);
            requestRender();

            console.log('🧍', 'Ready');
            ready = true;

            // Ensure camera aspect is correct after CSS transition settles
            requestAnimationFrame(() => {
                resize(ss, container, fullscreen);
                requestRender();
            });

            if (destroyed) return;

            // Apply captured initial context
            if (initialStore && initialStore.context) {
                setContextLocal(initialStore.context);
            }

            if ($store.context) setContextLocal($store.context);
        };

        if (container) initializeViewer();

        // Store subscriptions
        const unsubscibeFocus = focused.subscribe((f) => {
            if (!modelLoaded) {
                pendingFocus = f.object ?? null;
                return;
            }
            setHighlight(f.object ?? null);
        });

        const unsubscibeContext = store.subscribe((s) => {
            if (!ready) return;
            if (s.context) {
                setContextLocal(s.context);
            } else {
                clearContextLocal();
            }
        });

        const unsubscribeProfileSwitch = ui.listen('chat:profile_switch', () => {
            if (!ready) return;
            cleanupLabels(labels);
            loadedLayers = [];
            ss.loadedFiles = [];
            resetFocus();
        });

        window.addEventListener('mousedown', handleGlobalPointerDown);
        window.addEventListener('touchstart', handleGlobalPointerDown as any);

        return () => {
            destroyed = true;
            ss.destroyed = true;
            window.removeEventListener('mousedown', handleGlobalPointerDown);
            window.removeEventListener('touchstart', handleGlobalPointerDown as any);
            unsubscibeFocus();
            unsubscibeContext();
            unsubscribeProfileSwitch();

            if (ss.animationFrameId !== null) {
                cancelAnimationFrame(ss.animationFrameId);
                ss.animationFrameId = null;
            }

            removeAuraMesh(ss);
            disposeClusterState(clusterState, ss);

            if (ss.scene) clearObjects(ss.scene);

            disposeScene(ss);

            clearContextLocal();
            if (resizeObserverListener) resizeObserverListener.disconnect();
            if (labelContainer) {
                for (const labelEl of labelContainer.children) {
                    (labelEl as HTMLElement).removeEventListener('mousedown', handleLabelMouseDown);
                    (labelEl as HTMLElement).removeEventListener('mouseup', handleLabelMouseUp);
                    for (const actionEl of (labelEl as HTMLElement).querySelectorAll<HTMLAnchorElement>('.action[href]')) {
                        actionEl.removeEventListener('pointerdown', handleActionPointerDown);
                        actionEl.removeEventListener('pointerup', handleActionPointerUp);
                    }
                    for (const btnEl of (labelEl as HTMLElement).querySelectorAll<HTMLButtonElement>('.ask-btn')) {
                        btnEl.removeEventListener('pointerdown', handleButtonPointerDown);
                        btnEl.removeEventListener('pointerup', handleButtonPointerUp);
                    }
                }
            }

            ss.loadedFiles = [];
            loadedLayers = [];
            ss.materialCache.clear();
            clearMultiVariantCache(ss.multiVariantCache);
            ss.previousMultiHighlight.clear();
            ss.focusableMeshes = [];
            ss.objects = [];
            console.log('🧍', 'Destroyed');
        };
    });
</script>

<div class="labels" bind:this={labelContainer}>
    {#each labels as label}

    <div class="label" id="label-id-{label.id}">
        <div class="highlight"  data-id={label.id}>
            <div class="icon {label.type}  category-{label.type}">
                <svg>
                    <use href="/icons-o.svg#report-{label.type}" />
                </svg>
                <span class="label-name">{translateAnatomy(label.id, $t)}</span>
                <div class="label-menu">
                    <AskButton
                        className="action"
                        type="anatomy"
                        showIcon={false}
                        label={translateAnatomy(label.id, $t)}
                        data={getBodyPartAskData(label, translateAnatomy, $t)}
                        documentId={label.documents?.[0]?.id}
                        documentTitle={label.documents?.[0]?.content?.title || label.documents?.[0]?.metadata?.title}
                    />
                    {#if label.count > 10}
                        <a class="action" href="/med/p/{$profile.id}/documents/?tags={label.tag}" data-sveltekit-preload-data="false">Documents</a>
                    {:else}
                        {#each label.documents as doc}
                            <a class="action -doc" href="/med/p/{$profile.id}/documents/{doc.id}" data-sveltekit-preload-data="false">
                                <span class="doc-title">{doc.content?.title || doc.metadata?.title || doc.id}</span>
                                <span class="doc-date">{date(doc.metadata?.date || doc.created_at)}</span>
                            </a>
                        {/each}
                    {/if}
                </div>
            </div>
        </div>
    </div>
    {/each}
</div>

<div class="model" class:-fullscreen={fullscreen} bind:this={container}></div>

{#if selected}
    {#key selected}
    <div class="selected" transition:fade >
        {translateAnatomy(selected.name, $t)}
        <button on:click={resetFocus} aria-label="Reset focus">
            <svg>
                <use href="/icons.svg#close"></use>
            </svg>
        </button>
    </div>
    {/key}
{/if}


{#if currentContext && currentContext.info}
    <div class="context-info" transition:fade|local>
        <button class="close" on:click={toggleContextInfo}>
            {#if showContextInfo}
            <svg>
                <use href="/icons.svg#close"></use>
            </svg>
            {:else}
            <svg>
                <use href="/icons.svg#info"></use>
            </svg>
            {/if}

        </button>
        {#if showContextInfo}
        <svelte:component this={currentContext.info} />
        {/if}
    </div>
{/if}


<style>
    .model {
        position: relative;
        width: 100%;
        height: 100%;
        transform: translateX(0);
    }
    .model.-fullscreen {
        position: fixed;
        inset: 0;
        z-index: 998;
        transform: none;
        pointer-events: auto;
    }
    .selected {
        position: absolute;
        top: 1rem;
        right: 1rem;
        padding: 0 0 0 1rem;
        pointer-events: none;
        display: flex;
        justify-content: center;
        align-items: center;
        font-size: 1.1rem;
        background-color: rgba(0,0,0,.3);
        color: #FFF;
        border-radius: var(--radius-16);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        text-transform: uppercase;
        pointer-events: all;
        display: flex;
        justify-content: center;
        align-items: center;
        overflow: hidden;
    }
    .selected button {
        margin-left: .5rem;
        transition: background-color .2s ease-in-out;
    }
    @media (hover: hover) {
        .selected button:hover {
            background-color: var(--color-negative);
        }
    }
    .selected button svg {
        width: 2rem;
        height: 2rem;
        padding: .2rem;
        fill: currentColor;
    }
    @media only screen and (max-width: 768px) {
        .selected {
            display: none;
        }
        :global(.focus) .selected {
            display: flex;
            top: calc(var(--top-offset) + 1rem);
            left: auto;
            right: 1rem;

        }
    }

    .labels {
        display: none;
    }

    .model :global(.label) {
        left: 0;
        top: 0;
        width: 1px;
        height: 1px;
        --radius: 2rem;
        position: relative;
        z-index: 1;
    }

    .model :global(.label.-open) {
        z-index: 100;
    }

    .model :global(.label-name) {
        display: none;
        text-align: center;
        font-size: 0.8rem;
        color: #FFF;
        padding: 0.25rem 0.5rem;
        white-space: nowrap;
        text-transform: uppercase;
    }
    .model :global(.label.-open .label-name) {
        display: block;
    }

    .model :global(.label.-open .highlight) {
        width: 13rem;
        height: auto;
        border-radius: var(--radius-16);
    }

    .model :global(.label-menu) {
        overflow: hidden;
        display: flex;
        flex-direction: column;
        gap: .5rem;
        height: auto;
        max-height: 0;
        transition: all .2s ease-in-out;
        width: 100%;
        padding: 0;

    }
    .model :global(.label.-open .label-menu) {
        max-height: 20rem;
        overflow-y: auto;
        padding: .5rem 1rem;
    }
    .model :global(.action.-doc) {
        display: flex;
        justify-content: space-between;
        gap: 0.5rem;
        font-size: 0.8rem;
    }
    .model :global(.action.-doc .doc-title) {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
        min-width: 0;
    }
    .model :global(.action.-doc .doc-date) {
        flex-shrink: 0;
        opacity: 0.7;
        font-size: 0.75rem;
    }
    .model :global(.highlight) {
        display: block;
        transform: translate(-50%, -50%);
        width: 3rem;
        height: 3rem;
        border-radius: var(--radius-16);
        border: 1px solid #FFF;
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        background: transparent;
        padding: .7rem;
        transition: all .2s ease-in-out;
    }
    .model :global(.highlight .icon) {
        display: block;
        height: 100%;
        width: 100%;
        border-radius: var(--radius-16);
        border: 1px solid var(--color-white);
        box-shadow: 1px 1px 6px 0 rgba(0,0,0,0.3);
        transform: scale(.5);
        transition: transform .2s ease-in-out;
        background-color: var(--color);
        color: var(--color-text-primary);
        overflow: hidden;
        aspect-ratio: 1/1;
    }

    .model :global(.action) {
        display: flex;
        color: inherit;
        text-align: center;
        padding: .3rem .5rem;
        border-radius: var(--radius-16);
        border: 1px solid var(--color-white);
        font-size: inherit;
    }
    .model :global(.highlight .icon svg) {
        width: 100%;
        height: 100%;
        max-height: 3rem;
        transform: scale(.6);
        opacity: 0;
        transition: opacity .2s ease-in-out;
        fill: currentColor;
    }


    .model :global(.highlight:hover),
    .model :global(.-open .highlight) {
        padding: .5rem;
        backdrop-filter: blur(2px);
        -webkit-backdrop-filter: blur(2px);
        width: 4rem;
        height: 4rem;
    }
    .model :global(.highlight:hover .icon),
    .model :global(.-open .highlight .icon) {
        transform: scale(1);
    }
    .model :global(.-open .highlight .icon) {
        aspect-ratio: unset;
    }
    .model :global(.highlight:hover .icon svg),
    .model :global(.-open .highlight .icon svg) {
        opacity: 1
    }


    .context-info {
        position: absolute;

        left: 3rem;
        max-width: calc(var(--width) - 6rem);
        min-width: 2.5rem;
        max-height: calc(var(--height) - 2rem);
        min-height: 2.5rem;;
        bottom: 1rem;
        background-color: rgba(230, 231, 234, .6);
        text-align: left;
        backdrop-filter: blur(2px);
        border-radius: var(--radius-16);
        box-shadow: 2px 2px 10px rgba(0,0,0,.2);
    }
    .context-info :global(.close svg) {
        width: 100%;
        height: 100%;

    }
    .context-info .close {
        position: absolute;
        top: 0;
        right: 0;
        padding: .5rem;
        width: 2.5rem;
        height: 2.5rem;
        cursor: pointer;
    }
    .context-info :global(.h2) {
        padding: 1rem .5rem .5rem;
    }
    .context-info :global(.p) {
        background-color: var(--color-background);
        padding: 1rem;
        margin: 0;
        text-align: justify;
    }

    /* Cluster badge styles */
    .model :global(.cluster-label) {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 3.5rem;
        height: 3.5rem;
        border-radius: 50%;
        border: 1px solid #FFF;
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        background: rgba(0, 0, 0, 0.3);
        cursor: pointer;
        transform: translate(-50%, -50%);
        transition: transform .2s ease-in-out, background .2s ease-in-out;
        z-index: 10;
        box-shadow:
            2px 2px 0 rgba(255, 255, 255, 0.15),
            4px 4px 0 rgba(255, 255, 255, 0.1),
            6px 6px 0 rgba(255, 255, 255, 0.05);
    }
    .model :global(.cluster-label:hover) {
        transform: translate(-50%, -50%) scale(1.15);
        background: rgba(0, 0, 0, 0.5);
    }
    .model :global(.cluster-count) {
        color: #FFF;
        font-size: 1.1rem;
        font-weight: 600;
        pointer-events: none;
    }
</style>
