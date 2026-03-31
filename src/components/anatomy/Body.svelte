<!-- @migration-task Error while migrating Svelte code: can't migrate `let loadedLayers: string[] = [];` to `$state` because there's a variable named state.
     Rename the variable and try again or migrate by hand. -->
<script lang="ts">
    import { goto } from '$app/navigation';
    import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
    import * as THREE from 'three';
    import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
    import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
    import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
    import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
    import ui, { state } from '$lib/ui';
    import objects3d, { isObject } from '$lib/context/objects';
    import Label from '$components/documents/Label.svelte';
    import { fade } from 'svelte/transition';
    import TWEEN from '@tweenjs/tween.js';
    import { isTouchDevice  } from '$lib/device';
    import focused from '$lib/focused';
    import { profile } from '$lib/profiles';
    //import profile from '$lib/user/profile';
    //import type { Figure } from '$lib/user/profile';
    import type { Profile, SexEnum } from '$lib/types.d';
    import { groupByTags } from '$lib/documents/tools';
    //import reports from '$lib/report/store';
    import shaders from './shaders';
    import { createAuraShellMaterials } from './aura.shader';
    import { createParticleSwarm, updateParticleSwarm, removeParticleSwarm } from './particle-swarm';
    import type { IContext } from './context/types.d';
    import contexts from './context/index';
	import store from './store';
    import { createMuscleMaterial, createMuscleMatcapMaterial, isMuscularSystem } from './muscle-materials';
    import { injectTransporterEffect, animateTransporterMeshes, updateTransporterTime } from './transporter.shader';
    import { createTransporterRing, updateTransporterRing, removeTransporterRing, type TransporterRing } from './transporter-ring';
	//import { linkPage } from '$lib/app';
    //import { addExperience } from '$lib/xp/store';
	import { sounds } from '$components/ui/Sounds.svelte';
    import { t } from '$lib/i18n';
    import { translateAnatomy } from '$lib/i18n/anatomy';
    import AskButton from '$components/chat/AskButton.svelte';
    import { date } from '$lib/datetime';
	//import Error from '../../../routes/+error.svelte';

    const dispatch = createEventDispatcher();

    type ViewState = {
        position: THREE.Vector3;
        rotation: THREE.Euler;
        target: THREE.Vector3;
    }
    const DEFAULT_OPACITY = .9;
    const UNFOCUSED_OPACITY = .5;

/*

    console.log('🧍', 'Body', Object.entries(objects3d).reduce((acc, [k,v]) => {
        return [...acc, ...v.objects]
    }, [])).reduce((acc, o) => {
        return {...acc, [o]: o}
    }, {});
*/

    let FOCUS_COLOR = 0x16d3dd;
    let HIGHLIGHT_COLOR = 0xffbf40;
        
    //console.log('🧍', 'Body', objects3d);
    //console.log('profile', $profile);
    export let model: SexEnum = $profile?.health?.biologicalSex || 'male';

    export let activeLayers: string[] = [];
    export let activeTools: string[] = [];

    export let showShade: boolean = true;
    export let fullscreen: boolean = false;
    export let viewportRect: { x: number; y: number; width: number; height: number } | null = null;

    export let selected: THREE.Object3D | null = null;

    let shade: THREE.Group;

    export function reset() {
        resetFocus();
        previousViewState = initialViewState;
        setViewState(initialViewState);
    }


    const originalMaterials = new Map<string, THREE.Material>();

    // Material cache: stores original and highlight-variant materials per mesh
    // This avoids cloning materials on every focus change (472 meshes × ~0.18ms = ~85ms)
    const materialCache = new Map<string, {
        original: THREE.Material | THREE.Material[];
        unfocused: THREE.Material | THREE.Material[];  // opacity 0.5
        highlighted: THREE.Material | THREE.Material[]; // highlight color + opacity 1
    }>();

    // Pre-built list of meshes to update on focus (excludes shade_skin)
    // Avoids expensive scene.traverse() on every highlight call
    let focusableMeshes: THREE.Mesh[] = [];

    // Aura glow effect state (multi-shell, no post-processing)
    let auraMeshes: THREE.Mesh[] = [];
    let auraShellMaterials: THREE.ShaderMaterial[] = [];
    let auraActive = false;
    const auraClock = new THREE.Clock(false);

    // Transporter beam materialization effect state
    let transporterActive = 0; // count of active transporter animations
    let transporterMeshes: THREE.Mesh[] = []; // meshes with active transporter effect
    let idleRings: TransporterRing[] = []; // rings waiting for objects to load

    const objectToFileMapping = Object.entries(objects3d).reduce((acc, [k,v]) => {
        v.objects.forEach(f => {
            acc[f] = k;
        });
        return acc;
    }, {} as {
        [key: string]: string
    });
    
    const mapped: {
        [key: string]: string
    } = {
        //'cholesterol': 'heart',
    }
//  TODO: switch offf
    $: labels = getLabelsMap($profile);

    function getLabelsMap($profile: Profile) {
        if (!$profile?.id) return [];

        return Object.entries(groupByTags($profile.id))
        .filter(([k,v]) => {
            if (mapped[k]) {
                return isObject(mapped[k], 'anatomy')
            } else {
                return isObject(k, 'anatomy')
            }
        })
        .map(([k,v]) => {
            const id: string = mapped[k] || k;

            const fileGroup = objectToFileMapping[id];
            if (fileGroup && !activeLayers.includes(fileGroup)) activeLayers = [...activeLayers, fileGroup];

            return {
                type: v[0].metadata.category,
                id,
                tag: k,
                count: v.length,
                documents: v,
                geometry: null,
                object: null,
                label: undefined as any
            }
        });
    }




    let loadedLayers: string[] = [];
    let loadedFiles: string[] = [];
    let ready: boolean = false;
    let pendingFocus: string | null = null;
    let modelLoaded: boolean = false;

    let container: HTMLDivElement;
    let labelContainer: HTMLDivElement;
    let resizeObserverListener: ResizeObserver;

    let camera: THREE.PerspectiveCamera;
    let scene: THREE.Scene;
    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControls;
    let labelRenderer: CSS2DRenderer | null = null;
    let raycaster: THREE.Raycaster;
    let pointer: THREE.Vector2 = new THREE.Vector2();
    let group: THREE.Group = new THREE.Group();
    let dragged: boolean = false;

    let objects: any[] = [];
    let currentContext: IContext | null = null;
    let muscleMatcapTexture: THREE.Texture | null = null;
    let openedLabel: HTMLDivElement | null = null;

    let animationFrameId: number | null = null;
    let idleFrames: number = 0;
    const MAX_IDLE_FRAMES: number = 60; // ~1s at 60fps


    let initialViewState: ViewState;
    let previousViewState: ViewState | null = null;


/*
    function applyShaderEffect(objectName: string, shaderName: string, options: any = {}): void {
        const object = scene.getObjectByName(objectName);
        //list all object in scene
        console.log('scene', scene.children.map(c => c.name));
        console.log('object', objectName, object);
        if (object instanceof THREE.Mesh && shaders[shaderName]) {
            // Store the original material
            if (!originalMaterials.has(objectName)) {
                originalMaterials.set(objectName, object.material);
            }

            const originalColor = (object.material as THREE.MeshBasicMaterial).color;
            const shaderMaterial = new THREE.ShaderMaterial({
                ...extras,
                ...shaders[shaderName],
                uniforms: {
                    ...shaders[shaderName].uniforms,
                    ...options,
                    originalColor: { value: originalColor }
                }
            });

            // Apply the shader material
            object.material = shaderMaterial;
            object.material.needsUpdate = true;
        }
    }

    function removeShaderEffect(objectName: string): void {
        const object = scene.getObjectByName(objectName);
        const originalMaterial = originalMaterials.get(objectName);
        if (object instanceof THREE.Mesh && originalMaterial) {
            object.material = originalMaterial;
            object.material.needsUpdate = true;
            originalMaterials.delete(objectName); // Remove the entry from the map
        }
    }

    */

    $: defaultState = (model === 'female') ? {
        minZoom : 160,
        maxZoom : 0,
        modelY : isTouchDevice() ? -105 : -95,
        modelZ : 0,
        cameraY : 35,
        cameraX : 70
    } : {
        minZoom : 1500,
        maxZoom : 300,
        modelY : (isTouchDevice() ? -1215  : -960),
        modelZ : isTouchDevice() ? 500 : 600,
        cameraY : 500,
        cameraX : 800
    }

    $: {

        if (ready && activeLayers != loadedLayers) {
            let toLoad = activeLayers.filter(l => l && !loadedLayers.includes(l));
            //console.log('toLoad', toLoad);
            let filesToLoad = toLoad.filter(l => objects3d[l as keyof typeof objects3d]).reduce((acc, l) => {
                return [...acc, ...objects3d[l as keyof typeof objects3d].files]
            }, [] as string[]).filter(f => !loadedFiles.includes(f));
            let objectsToShow = activeLayers.filter(l => objects3d[l as keyof typeof objects3d]).reduce((acc, l) => {
                return [...acc, ...objects3d[l as keyof typeof objects3d].objects]
            }, [] as string[]);
            loadedLayers = activeLayers;
            updateModel(filesToLoad, objectsToShow);
        }

        if (ready) toggleShade(showShade);

    }

    // When the pill offset changes (viewportRect updated after model loaded),
    // push the new modelY to all loaded objects in the group.
    $: if (ready && group) {

        group.children.forEach(obj => { obj.position.y = defaultState.modelY; });
        requestRender?.();
    }

    let previousLabels: typeof labels = [];

    function labelsContentChanged(a: typeof labels, b: typeof labels): boolean {
        if (a.length !== b.length) return true;
        return a.some((la, i) => la.id !== b[i].id || la.tag !== b[i].tag || la.count !== b[i].count);
    }

    $: {
        if (ready && labels !== previousLabels) {
            const oldLabels = previousLabels;
            previousLabels = labels;
            if (oldLabels.length > 0 && labelsContentChanged(labels, oldLabels)) {
                cleanupLabels(oldLabels);
                if (activeLayers === loadedLayers) {
                    refreshLabels();
                }
            }
        }
    }




    // React to viewportRect / fullscreen changes
    $: void viewportRect, void fullscreen, (() => {
        if (renderer && camera) {
            resize();
            requestRender();
        }
    })();

    function  setHighlight(name: string | null) {
        if (name) {
            if (name == selected?.name) return;
            focusObject(mapped[name] || name);
        } else {
            if (previousViewState) {
                setViewState(previousViewState);
            }
            highlight(null);
            selected = null;
            requestRender();
        }
    }
    

    function setViewState(state: ViewState) {
        if (!state) return;
        new TWEEN.Tween(camera.position)
                    .to({ x: state.position.x, y: state.position.y, z: state.position.z }, 2000)
                    .easing(TWEEN.Easing.Quadratic.Out)
                    .start();
                new TWEEN.Tween(controls.target)
                    .to({ x: state.target.x, y: state.target.y, z: state.target.z }, 2000) // duration in milliseconds
                    .easing(TWEEN.Easing.Cubic.Out)
                    .onUpdate(() => {
                        controls.update(); // Update the controls on each tween update
                    })
                    .start();
        requestRender();
    }


    let destroyed = false;

    onMount(() => {
        console.log('🧍', 'Mounted');
        destroyed = false;

        // Capture initial store values immediately before any async operations
        let initialFocused = $focused;
        let initialStore = $store;

        // Wait for valid dimensions before initializing Three.js
        const waitForDimensions = (): Promise<void> => {
            return new Promise((resolve) => {
                let timeout: ReturnType<typeof setTimeout>;

                const done = () => {
                    clearTimeout(timeout);
                    resolve();
                };

                // Check if dimensions are already valid
                if (container.offsetWidth > 0 && container.offsetHeight > 0) {
                    done();
                    return;
                }

                // Fallback timeout so init never hangs
                timeout = setTimeout(() => {
                    console.warn('🧍', 'waitForDimensions timed out, using fallback');
                    observer.disconnect();
                    done();
                }, 2000);

                // Wait for ResizeObserver to report valid dimensions
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

        // Initialize once dimensions are valid
        const initializeViewer = async () => {
            await waitForDimensions();
            if (destroyed) return;
            await init();
            if (destroyed) return;

            // Apply captured initial context AFTER init completes with valid dimensions
            // Note: Focus is deferred to updateModel() when actual body models are loaded
            if (initialStore && initialStore.context) {
                setContext(initialStore.context);
            }
        };

        if (container) initializeViewer();

        // Store subscription - queue focus if models not yet loaded
        const unsubscibeFocus = focused.subscribe((f) => {
            if (!modelLoaded) {
                pendingFocus = f.object ?? null;
                return;
            }
            setHighlight(f.object ?? null);
        });

        const unsubscibeContext = store.subscribe((state) => {
            if (!ready) return;
           if (state.context) {
               setContext(state.context);
           } else {
                clearContext();
           }
        });

        const unsubscribeProfileSwitch = ui.listen("chat:profile_switch", () => {
            if (!ready) return;
            resetFocus();
        });

        window.addEventListener('mousedown', handleGlobalPointerDown);
        window.addEventListener('touchstart', handleGlobalPointerDown as any);

        return () => {
            destroyed = true;
            window.removeEventListener('mousedown', handleGlobalPointerDown);
            window.removeEventListener('touchstart', handleGlobalPointerDown as any);
            unsubscibeFocus();
            unsubscibeContext();
            unsubscribeProfileSwitch();

            if (animationFrameId !== null) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }

            removeAuraMesh();

            // clear all three.js objects from the scene
            if (scene) clearObjects(scene);

            if (renderer) {
                renderer.forceContextLoss();
                renderer.dispose();
                (renderer as any).context = null;
                (renderer as any).domElement = null;
                renderer = null;
            }

            (labelRenderer as any).context = null;
            (labelRenderer as any).domElement = null;
            labelRenderer = null;


            
            clearContext();
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
                };
            }

            loadedFiles = [];
            loadedLayers = [];
            materialCache.clear();
            focusableMeshes = [];
            console.log('🧍', 'Destroyed');
        }

    });


    function clearObjects(scene: THREE.Scene) {

        for(let i=scene.children.length-1; i>=0; i--){
            let obj = scene.children[i];
            //dispose all object geometries and materials
            if ((obj as any).geometry) (obj as any).geometry.dispose();
            if ((obj as any).material) {
                if ((obj as any).material instanceof Array) {
                    (obj as any).material.forEach((m: any) => m.dispose());
                } else {
                    (obj as any).material.dispose();
                }
            }
            scene.remove(obj);
        }
    }

    async function updateModel(filesToLoad: string[], objectsToShow: string[]) {
        try {
            //console.log('updateModel', filesToLoad, objectsToShow);

            // Collect visible meshes that are about to be hidden (for dematerialization)
            const meshesToDematerialize: THREE.Mesh[] = [];
            objects.forEach((object: any) => {
                object.traverse((child: any) => {
                    if (child.isMesh && child.visible && !objectsToShow.includes(child.name) && child.parent?.name !== 'shade_skin') {
                        meshesToDematerialize.push(child);
                    }
                });
            });

            // Start dematerialization animation (meshes stay visible during animation)
            if (meshesToDematerialize.length > 0) {
                // Ensure all meshes have shader injected (they should from initial load)
                for (const mesh of meshesToDematerialize) {
                    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                    for (const mat of mats) injectTransporterEffect(mat as THREE.Material);
                }
                transporterActive++;
                transporterMeshes = [...transporterMeshes, ...meshesToDematerialize];
                const dRing = createTransporterRing(meshesToDematerialize, scene, shade);
                requestRender();
                animateTransporterMeshes(meshesToDematerialize, 'dematerialize', 3000, () => {
                    for (const mesh of meshesToDematerialize) mesh.visible = false;
                    transporterActive--;
                    transporterMeshes = transporterMeshes.filter(m => !meshesToDematerialize.includes(m));
                    removeTransporterRing(dRing);
                    precacheMaterials();
                    requestRender();
                }, (y, bw, p) => updateTransporterRing(dRing, y, bw, p));
            }

            // Collect currently hidden meshes that will become visible (re-shown)
            const meshesToRematerialize: THREE.Mesh[] = [];
            objects.forEach((object: any) => {
                object.traverse((child: any) => {
                    if (child.isMesh && !child.visible && objectsToShow.includes(child.name) && child.parent?.name !== 'shade_skin') {
                        meshesToRematerialize.push(child);
                    }
                });
            });

            // Create ring immediately as loading feedback (before await)
            let preloadRing: TransporterRing | null = null;
            if (filesToLoad.length > 0 && shade) {
                preloadRing = createTransporterRing([], scene, shade);
                // Position at bottom of body, fade in
                preloadRing.material.uniforms.uFade.value = 1.0;
                idleRings.push(preloadRing);
                requestRender();
            }

            let newObjects = await Promise.all(filesToLoad.map((f: string) => loadObj({
                id: f,
                name: f
            })));


            let labelIds = [... new Set(labels.map(l => l.id))];

            insertObject(newObjects, objectsToShow, labelIds, group);

            // Update visibility for all objects, but skip meshes being dematerialized
            const dematerializeSet = new Set(meshesToDematerialize.map(m => m.uuid));
            objects.forEach(object => {
                object.traverse( function ( child: any ) {
                    if (dematerializeSet.has(child.uuid)) return;
                    checkObject(child, objectsToShow, labelIds);
                } );
            })

            // Re-inject transporter on meshes whose materials were cloned by checkObject
            for (const mesh of meshesToRematerialize) {
                const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                for (const mat of mats) injectTransporterEffect(mat as THREE.Material);
            }

            // Animate re-shown meshes
            if (meshesToRematerialize.length > 0) {
                transporterActive++;
                transporterMeshes = [...transporterMeshes, ...meshesToRematerialize];
                const reRing = createTransporterRing(meshesToRematerialize, scene, shade);
                requestRender();
                animateTransporterMeshes(meshesToRematerialize, 'materialize', 3000, () => {
                    transporterActive--;
                    transporterMeshes = transporterMeshes.filter(m => !meshesToRematerialize.includes(m));
                    removeTransporterRing(reRing);
                }, (y, bw, p) => updateTransporterRing(reRing, y, bw, p));
            }

            // Inject transporter beam effect on newly loaded meshes and animate
            // (Re-inject after checkObject which may have cloned materials for labeled objects)
            if (newObjects.length > 0) {
                const newMeshes: THREE.Mesh[] = [];
                for (const obj of newObjects as any[]) {
                    obj.traverse((child: any) => {
                        if (child.isMesh && child.material && child.parent?.name !== 'shade_skin') {
                            const mats = Array.isArray(child.material) ? child.material : [child.material];
                            for (const mat of mats) injectTransporterEffect(mat);
                            newMeshes.push(child);
                        }
                    });
                }
                if (newMeshes.length > 0) {
                    // Reuse preload ring or create new one
                    const newRing = preloadRing || createTransporterRing(newMeshes, scene, shade);
                    if (preloadRing) {
                        idleRings = idleRings.filter(r => r !== preloadRing);
                        preloadRing = null;
                    }
                    transporterActive++;
                    transporterMeshes = [...transporterMeshes, ...newMeshes];
                    animateTransporterMeshes(newMeshes, 'materialize', 3000, () => {
                        transporterActive--;
                        transporterMeshes = transporterMeshes.filter(m => !newMeshes.includes(m));
                        removeTransporterRing(newRing);
                    }, (y, bw, p) => updateTransporterRing(newRing, y, bw, p));
                }
            }

            // Clean up preload ring if no new meshes ended up needing it
            if (preloadRing) {
                idleRings = idleRings.filter(r => r !== preloadRing);
                removeTransporterRing(preloadRing);
            }

            objects = [...objects, ...newObjects];

            // Pre-cache materials and build focusable mesh list for fast highlight()
            if (destroyed) return;
            precacheMaterials();

            requestRender();
            loadLabels();

            // Mark model as loaded and apply any pending focus
            modelLoaded = true;
            if (pendingFocus) {
                setHighlight(pendingFocus);
                pendingFocus = null;
            } else {
                setHighlight($focused.object ?? null);
            }

            if (!initialViewState) initialViewState = {
                position: camera.position.clone(),
                rotation: camera.rotation.clone(),
                target: controls.target.clone()
            }
        } catch (error) {
            console.error('🧍', 'updateModel error:', error);
            modelLoaded = true;
        }

        dispatch('ready');
    }

    //let names = {}
    function insertObject(o: any[], objectsToShow: string[], labelIds: string[], group: THREE.Group) {

        //let onames = [];

        o.forEach((object: any) => {
            //console.log(object);
            object.traverse( function ( child: any ) {
                // mark labeled objects
                //onames.push(child.name);
                //console.log('child', child.name, child)
                
                if (objectsToShow) checkObject(child, objectsToShow, labelIds);

                if (object.name === 'integumentary_system' && child.name === 'body') {
                    child.visible = false;
                }
            } );
            //console.log('onames', onames);
            object.position.y = defaultState.modelY;
            object.position.z = defaultState.modelZ;
            object.layers.enableAll();

            //console.log('object', object.name, object)
            //names[o[0].name] = onames;

            group.add( object );
        })

        
        //console.log('names', JSON.stringify(names, null, 2))
    }



    function checkObject(child: any, objectsToShow: string[], labelIds: string[]) {
        if (!child.isMesh)  return;

        if ( objectsToShow.includes(child.name)) {
            //console.log('SHOW', child.name, labelIds);

            if (child.name === 'body' && child.parent.name === 'integumentary_system') {                
                child.visible = false;
            } else {
                //console.log('body', child)
                child.visible = true;
            }



            if ( labelIds.includes(child.name)) {
                // material needs to cloned to distinguish from original
                child.material = updateMaterial(child.material , {
                    color: FOCUS_COLOR
                });
                /*const material = child.material.clone();
                material.color.set( FOCUS_COLOR );
                child.material = material;*/
                let label = labels.find(l => l.id === child.name)
                if (label) {
                    label.geometry = child.geometry;
                    label.object = child;
                }


            }
        } else {
            //console.log('HIDE', child.name, labelIds);
            child.visible = false;
            if ( labelIds.includes(child.name)) {
                let label = labels.find(l => l.id === child.name)
                if (label) {
                    label.geometry = null;
                    label.object = null;
                }
            }

        }

    
    }
    // update material or material array with a given set of properties
    function updateMaterial(material: THREE.Material,
        options: {
            color?: number,
            transparent?: boolean,
            opacity?: number
        }
    ): THREE.Material | THREE.Material[] {
        if (Array.isArray(material )) {
            return material.map((m: THREE.Material) => {
                return updateMaterial(m, options);
            }) as THREE.Material[];
        } else {
            const newMaterial = material.clone();
            Object.keys(options).forEach(key => {
                if ((newMaterial as any)[key] && (newMaterial as any)[key].set) {
                    (newMaterial as any)[key].set((options as any)[key]);
                } else if ((newMaterial as any)[key]) {
                    (newMaterial as any)[key] = (options as any)[key];
                }
            });
            //options.color && newMaterial.color.set( options.color );
            return newMaterial;
        }


    }

    /**
     * Gets cached material variants for a mesh.
     * Creates and caches the variants on first access.
     * Returns original, unfocused (dimmed), and highlighted material variants.
     */
    function getCachedMaterials(child: THREE.Mesh): {
        original: THREE.Material | THREE.Material[];
        unfocused: THREE.Material | THREE.Material[];
        highlighted: THREE.Material | THREE.Material[];
    } {
        const key = child.uuid;
        if (!materialCache.has(key)) {
            const original = child.material;
            materialCache.set(key, {
                original,
                unfocused: updateMaterial(original as THREE.Material, {
                    opacity: UNFOCUSED_OPACITY,
                    transparent: true
                }),
                highlighted: updateMaterial(original as THREE.Material, {
                    color: HIGHLIGHT_COLOR,
                    opacity: 1
                })
            });
        }
        return materialCache.get(key)!;
    }

    /**
     * Pre-caches materials for all meshes and builds the focusableMeshes list.
     * Called after model loading to ensure highlight() is fast.
     */
    function precacheMaterials() {
        focusableMeshes = [];
        scene.traverse((child: any) => {
            if (child.isMesh && child.material) {
                if (child.parent?.name !== 'shade_skin') {
                    focusableMeshes.push(child);
                    // Pre-populate the cache
                    getCachedMaterials(child);
                }
            }
        });
    }

    function loadObj(setup: {
            id: string,
            name: string,
            color?: number,
            opacity?: number,
            rename?: string,
            material?: THREE.Material
        }) {

        return new Promise((resolve, reject) => {

            setup = Object.assign({
                opacity: DEFAULT_OPACITY,
            }, setup);

            function onProgress( xhr: any ) {
                if ( xhr.lengthComputable ) {
                    //const percentComplete = xhr.loaded / xhr.total * 100;
                    //console.log( 'model ' + Math.round( percentComplete, 2 ) + '% downloaded' );
                }
            }

            function onError(error: any) {
                console.error('🧍', '3D model load error', error);
                reject(error)
            }

            const mtlLoader = new MTLLoader();
            mtlLoader.load('/anatomy_models/' + model + '_' + setup.id + '_obj/' + setup.id + '.mtl', function(materialsCreator) {
                materialsCreator.preload();

                const objLoader = new OBJLoader( );
                if (setup.material) {
                    const material = setup.material;
                    Object.keys(materialsCreator.materials).forEach(key => {
                        materialsCreator.materials[key] = material;
                    });
                }

                // For non-muscular systems, use the MTL materials as-is
                if (!isMuscularSystem(setup.id) || setup.material) {
                    objLoader.setMaterials( materialsCreator );
                }

                objLoader.load( '/anatomy_models/' + model + '_' + setup.id + '_obj/' + setup.id + '.obj', function ( object ) {
                        object.name = setup.rename || setup.name;

                        const useMuscle = isMuscularSystem(setup.id) && !setup.material;

                        object.traverse( function ( child: any ) {
                            if ( child.isMesh ) {
                                child.geometry.computeVertexNormals();

                                if (useMuscle) {
                                    // Per-muscle adaptive PBR material
                                    if (isTouchDevice() && muscleMatcapTexture) {
                                        child.material = createMuscleMatcapMaterial(child.name, muscleMatcapTexture);
                                    } else {
                                        child.material = createMuscleMaterial(child.name);
                                    }
                                }

                                if (setup.opacity) {
                                    child.material.transparent = true;
                                    child.material.opacity = setup.opacity;
                                }
                            }
                        });

                        loadedFiles.push(setup.rename || setup.id);
                        resolve(object);
                }, onProgress, onError );
            });
        });
    }


    function cleanupLabels(labelsToClean: typeof labels) {
        for (const label of labelsToClean) {
            if (label.label) {
                label.label.removeFromParent();
                label.label = undefined;
            }
        }
    }

    async function refreshLabels() {
        const labelIds = [...new Set(labels.map(l => l.id))];
        const objectsToShow = activeLayers.reduce((acc, l) => {
            return [...acc, ...objects3d[l as keyof typeof objects3d].objects];
        }, [] as string[]);

        objects.forEach(object => {
            object.traverse(function (child: any) {
                checkObject(child, objectsToShow, labelIds);
            });
        });

        await tick();
        loadLabels();
        requestRender();
    }

    function loadLabels() {
        if (!labelContainer) return;
//        console.log(labelContainer.children);
        for (const [index, labelEl] of [...labelContainer.children].entries()) {
            if(labels[index].geometry) {
                const geom = labels[index].geometry as THREE.BufferGeometry;
                if (!geom.boundingSphere) geom.computeBoundingSphere();
                const label = new CSS2DObject( labelEl as HTMLElement );
                const position = geom.boundingSphere!.center.toArray() as [number, number, number];
                label.position.set( ...position );
                label.center.set( 0, 1 );
                (labels[index].object as any)?.add( label );
                label.layers.set( 0 );
                (labelEl as HTMLElement).addEventListener('mousedown', handleLabelMouseDown, false);
                (labelEl as HTMLElement).addEventListener('mouseup', handleLabelMouseUp, false);
                for (const actionEl of (labelEl as HTMLElement).querySelectorAll<HTMLAnchorElement>('.action[href]')) {
                    actionEl.addEventListener('pointerdown', handleActionPointerDown, false);
                    actionEl.addEventListener('pointerup', handleActionPointerUp, false);
                }
                for (const btnEl of (labelEl as HTMLElement).querySelectorAll<HTMLButtonElement>('.ask-btn')) {
                    btnEl.addEventListener('pointerdown', handleButtonPointerDown, false);
                    btnEl.addEventListener('pointerup', handleButtonPointerUp, false);
                }
                labels[index].label = label;
            }
        };

        labels.forEach(label => {
            if (label.label){
                if (label.geometry) {
                    label.label.visible = true;
                } else {
                    label.label.visible = false;
                }
            }
        });
    }


    async function init () {

        resizeObserverListener = new ResizeObserver(() => { resize(); requestRender(); });
        resizeObserverListener.observe(container);
        let w = fullscreen ? window.innerWidth : (container.offsetWidth || 300);
        let h = fullscreen ? window.innerHeight : (container.offsetHeight || 400);
        const minZoom = defaultState.minZoom;
        const maxZoom = defaultState.maxZoom;

        camera = new THREE.PerspectiveCamera( 70, w / h, 1, 10000 );
        camera.position.z = minZoom;
        camera.position.y = defaultState.cameraY;
        camera.position.x =  defaultState.cameraX;

        // scene

        scene = new THREE.Scene();
        raycaster = new THREE.Raycaster();

        scene.add(group);

        // Hemisphere light for natural ambient fill (warm sky, cool ground)
        const hemiLight = new THREE.HemisphereLight( 0xffeedd, 0x8899aa, 0.5 );
        scene.add( hemiLight );

        const ambientLight = new THREE.AmbientLight( 0xffffff, 0.25 );
        scene.add( ambientLight );

        const light = new THREE.PointLight( 0xffffff, 1.0 );
        light.position.set( 1, 1, 1 ).normalize();
        camera.add( light );
        scene.add( camera );

        // Renderer
        //THREE.WebGLRenderer.useLegacyLights = true;
        renderer = new THREE.WebGLRenderer( { alpha: true, antialias: true } );
        renderer.setClearColor( 0x000000, 0 ); // the default
        renderer.setPixelRatio( Math.min(window.devicePixelRatio, 2) );
        renderer.setSize( w, h );
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;
        container.appendChild( renderer.domElement );

        // Bloom post-processing — lazily initialized when aura activates
        // (kept off by default to avoid alpha/background issues)

        // CSS2DRenderer

        labelRenderer = new CSS2DRenderer();
        labelRenderer.setSize( w, h );
        labelRenderer.domElement.style.position = 'absolute';
        labelRenderer.domElement.style.top = '0px';
        container.appendChild( labelRenderer.domElement );
        labelRenderer.domElement.addEventListener('mouseup', onPointerClick, false);


        // Controls
        controls = new OrbitControls( camera, labelRenderer.domElement );
        controls.listenToKeyEvents( container ); // optional

        controls.enableDamping = true; // an animation loop is required when either damping or auto-rotation are enabled
        controls.dampingFactor = 0.05;
        controls.screenSpacePanning = true;
        controls.zoomSpeed = (isTouchDevice()) ? 0.8 : 0.1;
        //controls.minDistance = maxZoom;
        controls.maxDistance = minZoom;

        // Offset rotation center
        controls.target.set( 
            0,0,0
        );

        controls.addEventListener('start', () => {
            //console.log('start');
            dragged = true;
            requestRender();
        });
        
        /*
        controls.addEventListener('change', (a) => {
            console.log('change')
        });
        */

        controls.addEventListener('end', () => {
            //console.log('end');
            dragged = false;
        });

        controls.maxPolarAngle = Math.PI / 2;

        // Preload matcap texture for mobile muscle rendering
        if (isTouchDevice()) {
            const texLoader = new THREE.TextureLoader();
            texLoader.load('/anatomy_models/matcaps/muscle.png', (tex) => {
                muscleMatcapTexture = tex;
            });
        }

        await loadShade();
        requestRender();
        //window.scene = scene;

        console.log('🧍', 'Ready');

        // TODO: better way to handle this - more generic
        /*
        ui.on('context', (context) => {
            setContext(context);
        });
        setContext(ui.context);
        */


        ready = true;

        // Ensure camera aspect is correct after CSS transition settles
        requestAnimationFrame(() => {
            resize();
            requestRender();
        });

        if ($store.context) setContext($store.context);

        //dispatch('ready');

    };

        /**
         * Setting context for particular section or context passed
         * @param context
         */
    let showContextInfo: boolean = false;

    function toggleContextInfo() {
        
        showContextInfo = !showContextInfo;
        //if (showContextInfo) addExperience('curiosity');
    }
    
    let originalState: any = {
        layers : null
    };

    function setContext(context: string | IContext)  {
        clearContext();
        //console.log('🧍', 'Setting Context', context);

        if (!context) return;
        if (typeof context === 'string' && !(contexts as any)[context]) return;

        const contextToRun = (typeof context === 'string') ? (contexts as any)[context] : context;
        const storeState: boolean = currentContext == null

        currentContext = {
            name: contextToRun.name,
        };

        if (contextToRun.layers) {
            if (storeState) originalState.layers = activeLayers;
            activeLayers = contextToRun.layers;
        }

        if (contextToRun.shader) {
            //applyShaderEffect(contexts[context].object, contexts[context].shader, contexts[context].options);
        }
        if (contextToRun.animation) {
            currentContext.animation = new contextToRun.animation(scene);
            requestRender();
        }

/*        if (contextToRun.focus) {
            // TODO - support multiple objects
            console.log('focus', contextToRun.focus[0]);
            focusObject(contextToRun.focus[0]);
        }*/

        if (contextToRun.info) {
            currentContext.info = contextToRun.info;
        }
        
    }
    function clearContext() {

        if (currentContext) {
            if (currentContext.shader) {
                //removeShaderEffect(contexts[context].object);
            }
            if (currentContext.animation) {
                currentContext.animation.destroy();
            }

            if (currentContext.info) {
                currentContext.info = null;
            }
        }
        if (originalState.layers) {
            activeLayers = originalState.layers;
            originalState.layers = null;
        }
        currentContext = null;
    }





    async function loadShade() {
        insertObject([await loadObj({
            id: 'integumentary_system',
            name: 'integumentary_system',
            color: 3,
            opacity: .3,
            rename: 'shade_skin',
            material:  new THREE.MeshPhysicalMaterial({
                metalness: 0.2,
                roughness: 0.5,
                //envMapIntensity: 0.9,
                //clearcoat: 1,
                transmission: .8,
                color: 0xCCCCCC,
                reflectivity: 0.5,
                //refractionRatio: 0.985,
                //ior: 0.1,
                side: THREE.BackSide,
                depthWrite: false,
            })
        })], ['body'], [], scene as any);
        toggleShade(showShade);
    }

    function toggleShade(state: boolean) {
        if (scene && !shade) shade = scene.getObjectByName('shade_skin') as any;
        if (shade) shade.visible = state;
    }


    function resize () {
        if (!container || !renderer) return;

        if (fullscreen) {
            const fw = window.innerWidth;
            const fh = window.innerHeight;
            camera.aspect = fw / fh;
            camera.clearViewOffset();
            camera.updateProjectionMatrix();
            renderer.setSize(fw, fh);
            if (labelRenderer) labelRenderer.setSize(fw, fh);
        } else {
            camera.clearViewOffset();
            camera.aspect = container.offsetWidth / container.offsetHeight;
            camera.updateProjectionMatrix();
            renderer.setSize( container.offsetWidth, container.offsetHeight );
            if (labelRenderer) labelRenderer.setSize( container.offsetWidth, container.offsetHeight );
        }
    }

    function requestRender() {
        idleFrames = 0;
        if (animationFrameId === null) {
            animationFrameId = requestAnimationFrame(animate);
        }
    }

    function animate() {
        if (!controls || !renderer) {
            animationFrameId = null;
            return;
        }

        const hasTweens = TWEEN.getAll().length > 0;
        const hasAnimation = !!(currentContext && currentContext.animation);

        // Update aura shader time uniform on all shell materials
        if (auraActive && auraShellMaterials.length) {
            const t = auraClock.getElapsedTime();
            for (const mat of auraShellMaterials) {
                mat.uniforms.uTime.value = t;
            }
            // updateParticleSwarm();
        }

        // Update transporter beam time for sparkle animation
        if (transporterActive > 0 && transporterMeshes.length > 0) {
            updateTransporterTime(transporterMeshes);
        }

        // Update idle rings (waiting for objects to load)
        for (const ring of idleRings) {
            ring.material.uniforms.uTime.value = performance.now() / 1000;
        }

        if (hasTweens) TWEEN.update();
        const controlsChanged = controls.update();
        if (hasAnimation) currentContext!.animation!.update();

        if (controlsChanged || hasTweens || hasAnimation || auraActive || transporterActive > 0 || idleRings.length > 0) {
            render();
            idleFrames = 0;
        } else {
            idleFrames++;
        }

        if (idleFrames < MAX_IDLE_FRAMES || hasTweens || hasAnimation || auraActive || transporterActive > 0 || idleRings.length > 0) {
            animationFrameId = requestAnimationFrame(animate);
        } else {
            render(); // final clean frame
            animationFrameId = null;
        }
    }

    function render() {
        if (renderer) {
            renderer.render( scene, camera );
        }
        if (labelRenderer) labelRenderer.render( scene, camera );
    }


    function handleGlobalPointerDown(event: MouseEvent | TouchEvent) {
        if (!openedLabel) return;
        const target = event.target as HTMLElement;
        if (openedLabel.contains(target)) return;
        openedLabel.classList.remove('-open');
        openedLabel = null;
    }

    function handleActionPointerDown(event: PointerEvent) {
        event.stopPropagation(); // prevents OrbitControls from capturing the pointer
        event.preventDefault();  // suppresses compat mouse events to avoid double-fire
    }

    function handleActionPointerUp(event: PointerEvent) {
        event.stopPropagation();
        event.preventDefault();
        const action = event.currentTarget as HTMLAnchorElement;
        action.closest<HTMLElement>('.label')?.classList.remove('-open');
        openedLabel = null;
        ui.emit('viewer:close');
        goto(action.getAttribute('href')!);
    }

    function handleButtonPointerDown(event: PointerEvent) {
        event.stopPropagation();
        event.preventDefault(); // suppress compat mousedown (matches action link pattern)
    }

    function handleButtonPointerUp(event: PointerEvent) {
        event.stopPropagation();
        event.preventDefault();
        // Programmatically fire click so Svelte's onclick handler runs
        (event.currentTarget as HTMLButtonElement).click();
        (event.currentTarget as HTMLElement).closest<HTMLElement>('.label')?.classList.remove('-open');
        openedLabel = null;
    }

    function handleLabelMouseDown(event: MouseEvent) {
        event.stopPropagation();
        sounds.focus.play();
        ($state as any).focusView = true;
        openedLabel = (event.target as HTMLElement)?.closest('.label');
        if (openedLabel) openedLabel.classList.add('-open');
    }

    function handleLabelMouseUp(event: MouseEvent) {
        event.stopPropagation();
        ($state as any).focusView = true;
    }




    function focusObject (objects: string | THREE.Object3D | (string | THREE.Object3D)[] | null) {

        const processObjects: THREE.Object3D[] = [];

        if (!objects) return;
        if (!Array.isArray(objects)) objects = [objects];

        objects.forEach((o: any) => {
            if (typeof o === 'string') {
                const object = scene.getObjectByName(o);
                if (object) processObjects.push(object);
            } else {
                processObjects.push(o);
            }
        });


        if (processObjects.length === 0) return;
        if (processObjects.length > 1) {
            console.warn('Multiple objects to focus not supported yet');
        }

        const object = processObjects[0];

        // Ensure world matrices are up to date for accurate bounding box
        object.updateWorldMatrix(true, true);

        // store original position and rotation
        if (!selected) {
            previousViewState = {
                position: camera.position.clone(),
                rotation: camera.rotation.clone(),
                target: controls.target.clone()
            }
        }

        //console.log('focusObject', object);
        highlight(object);
        selected = object;

        // let's focus the object into view
        

        const aabb = new THREE.Box3().setFromObject(object);
        const sphere = aabb.getBoundingSphere(new THREE.Sphere(new THREE.Vector3()));
        //console.log('sphere', sphere);
  
        const center = sphere.center;
        const radius = sphere.radius;

        // Adjust the distance as needed
        const fovInRadians = (camera.fov * Math.PI) / 180;
        const distance = radius / Math.sin(fovInRadians / 2);


        const targetPosition = new THREE.Vector3(
            center.x,
            center.y,
            center.z + (distance * 2)
        );



        // Position the camera at this distance
        camera.lookAt(center);
        camera.updateProjectionMatrix();

        new TWEEN.Tween(camera.position)
            .to({ x: targetPosition.x, y: targetPosition.y, z: targetPosition.z }, 2000) // 2000 milliseconds
            .easing(TWEEN.Easing.Quadratic.Out)
            .start();


        // twen the controls target to the center of the object
        new TWEEN.Tween(controls.target)
            .to({ x: center.x, y: center.y, z: center.z }, 2000) // duration in milliseconds
            .easing(TWEEN.Easing.Cubic.Out)
            .onUpdate(() => {
                controls.update(); // Update the controls on each tween update
            })
            .start();

        requestRender();
    }

    //let pointTimer: ReturnType<typeof setTimeout>;
    let tap: number = 0;
    function onPointerClick (event: MouseEvent) {

            if (dragged) return;

            let now = Date.now();
            if (tap && (now - tap) < 300) {
//                    $state.focusView = !$state.focusView;
                    tap = now;
                return;
            } else {
                tap = now;
            }

            if (!activeTools.includes('selection')) return;


            var rect = container.getBoundingClientRect();
            var x = event.clientX - rect.left; //x position within the element.
            var y = event.clientY - rect.top;  //y position within the element.
            //pointer.x = ( event.clientX / window.innerWidth ) * 2 - 1;
            //pointer.y = - ( event.clientY / window.innerHeight ) * 2 + 1;

            pointer.x = ( x / rect.width ) * 2 - 1;
            pointer.y = - ( y / rect.height ) * 2 + 1;

            raycaster.setFromCamera( pointer, camera );
            //const intersects = raycaster.intersectObject( group, true );
            const intersects = raycaster.intersectObjects( group.children, true);
            if ( intersects.length > 0 ) {
                while(intersects.length > 0 && !intersects[ 0 ].object?.visible) {
                    intersects.shift();
                }
                if (intersects.length === 0) return;

                const object = intersects[ 0 ].object;
                if (object.name) {
                    sounds.focus.play();
                    focused.set({ object: object.name });
                    selected = object;
                }
            } else {
                //highlight(null)
                focused.set({ object: undefined });
                selected = null;
            }
    }

    /**
     * Creates 3 concentric glow shells per child mesh for a soft halo effect.
     * No post-processing needed — shells use BackSide + AdditiveBlending.
     */
    function createAuraMesh(object: THREE.Object3D) {
        removeAuraMesh();

        auraShellMaterials = createAuraShellMaterials(new THREE.Color(HIGHLIGHT_COLOR));
        auraClock.start();
        auraActive = true;

        object.traverse((child: any) => {
            if (!child.isMesh) return;
            for (let i = 0; i < auraShellMaterials.length; i++) {
                const clone = child.clone();
                clone.material = auraShellMaterials[i];
                clone.renderOrder = 999 + i;
                clone.raycast = () => {};
                clone.name = `__aura_${i}__${child.name}`;
                child.parent!.add(clone);
                auraMeshes.push(clone);
            }
        });

        // createParticleSwarm(object, scene, new THREE.Color(HIGHLIGHT_COLOR));
        requestRender();
    }

    /**
     * Removes all aura clone meshes and stops the clock.
     */
    function removeAuraMesh() {
        // removeParticleSwarm();
        for (const mesh of auraMeshes) {
            mesh.parent?.remove(mesh);
            mesh.geometry?.dispose();
        }
        auraMeshes = [];
        for (const mat of auraShellMaterials) {
            mat.dispose();
        }
        auraShellMaterials = [];
        auraClock.stop();
        auraActive = false;
    }

    function highlight (object: THREE.Object3D | null) {
        // Restore previously selected object to unfocused state
        if (selected && selected !== object) {
            selected.traverse((child: any) => {
                if (child.isMesh) {
                    const cached = getCachedMaterials(child);
                    child.material = object ? cached.unfocused : cached.original;
                }
            });
        }

        // Update all visible meshes to unfocused/original state using pre-built list
        // This avoids expensive scene.traverse() calls
        if (object && !selected) {
            // Entering focus mode: dim all meshes
            for (const mesh of focusableMeshes) {
                if (mesh.visible) {
                    const cached = materialCache.get(mesh.uuid);
                    if (cached) mesh.material = cached.unfocused;
                }
            }
        } else if (!object && selected) {
            // Exiting focus mode: restore all meshes
            for (const mesh of focusableMeshes) {
                if (mesh.visible) {
                    const cached = materialCache.get(mesh.uuid);
                    if (cached) mesh.material = cached.original;
                }
            }
        }

        // Highlight the target object + aura glow
        if (object) {
            object.traverse((child: any) => {
                if (child.isMesh && child.material) {
                    const cached = materialCache.get(child.uuid);
                    if (cached) child.material = cached.highlighted;
                }
            });
            createAuraMesh(object);
        } else {
            removeAuraMesh();
        }
    }

    function getBodyPartAskData(label: (typeof labels)[0]) {
        return {
            bodyPart: translateAnatomy(label.id, $t),
            tag: label.tag,
            documents: label.documents.map(d => ({
                id: d.id,
                title: d.content?.title || d.metadata?.title,
                category: d.metadata?.category || d.type,
                date: d.created_at,
                content: d.content,
                report: d.report
            }))
        };
    }

    function resetFocus() {
        focused.set({ object: undefined });
        clearContext();
        setViewState(initialViewState);
    }   

</script>

<div class="labels" bind:this={labelContainer}>
    {#each labels as label}

    <div class="label" id="label-id-{label.id}">
        <div class="highlight"  data-id={label.id}>
            <div class="icon {label.type}  category-{label.type}">
                <svg>
                    <use href="/icons-o.svg#report-{label.type}" />
                </svg>
                <div class="label-menu">
                    <AskButton
                        className="action"
                        type="anatomy"
                        showIcon={false}
                        label={translateAnatomy(label.id, $t)}
                        data={getBodyPartAskData(label)}
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
    <!--div class="label" id="label-id-{label.id}">
        <a href="/med/p/{$profile.id}/documents/?tags={label.tag}" class="highlight" data-id={label.id} data-sveltekit-preload-data="false">
            <Label type={label.type} />
        </a>
    </div-->
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
        /*background-image: radial-gradient(ellipse at center, rgba(102, 255, 196, 100)  0%, rgba(102, 255, 196, 0) 100%);*/
    }
    .model.-fullscreen {
        position: fixed;
        inset: 0;
        z-index: 998;
        transform: none;
        pointer-events: auto;
    }
    /*
    @media only screen and (min-width: 769px) {
        .model {
            width: 200%;
            height: 100%;
            transform: translateX(-40%);
        }
    }*/
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
        border-radius: var(--border-radius);
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

    .model :global(.label.-open .highlight) {
        width: 13rem;
        height: auto;
        border-radius: var(--radius);
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
        border-radius: var(--radius);
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
        border-radius: calc(var(--radius) - .7rem);
        border: 1px solid var(--color-white);
        /*background: var(--label-color);*/
        box-shadow: 1px 1px 6px 0 rgba(0,0,0.3);
        transform: scale(.5);
        transition: transform .2s ease-in-out;
        background-color: var(--color);
        color: var(--color-text);
        overflow: hidden;
        aspect-ratio: 1/1;
    }

    .model :global(.action) {
        display: flex;
        color: inherit;
        text-align: center;
        padding: .3rem .5rem;
        border-radius: calc(var(--radius) - 1rem);
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
        background-color: rgba(var(--color-background-rgb), .6);
        text-align: left;
        backdrop-filter: blur(2px);
        border-radius: var(--border-radius);
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
</style>