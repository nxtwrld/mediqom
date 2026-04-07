/**
 * Model loading, transporter effects, shade/skin, and object management
 * for the 3D anatomy viewer.
 */
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { isTouchDevice } from '$lib/device';
import { createMuscleMaterial, createMuscleMatcapMaterial, isMuscularSystem } from './muscle-materials';
import {
    injectTransporterEffect,
    animateTransporterMeshes,
    updateTransporterTime
} from './transporter.shader';
import {
    createTransporterRing,
    updateTransporterRing,
    removeTransporterRing
} from './transporter-ring';
import { precacheMaterials, updateMaterial } from './material-system';
import type { SceneState } from './scene-state';
import { DEFAULT_OPACITY, FOCUS_COLOR } from './scene-state';
import type { DefaultState } from './scene-setup';

export interface LabelEntry {
    type: string;
    id: string;
    tag: string;
    count: number;
    documents: any[];
    geometry: THREE.BufferGeometry | null;
    object: THREE.Object3D | null;
    label: any;
}

interface LoadObjSetup {
    id: string;
    name: string;
    color?: number;
    opacity?: number;
    rename?: string;
    material?: THREE.Material;
}

/**
 * Main model loading orchestrator.
 * Handles transporter effects for showing/hiding meshes, loads new OBJ files,
 * and wires up labels and material caching.
 *
 * @param onSetHighlight - callback to apply pending highlight after load
 * @param onLoadLabels - callback to attach CSS2D label overlays
 * @param dispatch - event dispatcher callback
 */
export async function updateModel(
    state: SceneState,
    filesToLoad: string[],
    objectsToShow: string[],
    labels: LabelEntry[],
    model: string,
    defaultState: DefaultState,
    onSetHighlight: (name: string | null) => void,
    onLoadLabels: () => void,
    dispatch: (event: string, detail?: any) => void
): Promise<{ modelLoaded: boolean; pendingFocus: string | null }> {
    let pendingFocus: string | null = null;

    try {
        // Collect visible meshes that are about to be hidden (for dematerialization)
        const meshesToDematerialize: THREE.Mesh[] = [];
        state.objects.forEach((object: any) => {
            object.traverse((child: any) => {
                if (
                    child.isMesh &&
                    child.visible &&
                    !objectsToShow.includes(child.name) &&
                    child.parent?.name !== 'shade_skin'
                ) {
                    meshesToDematerialize.push(child);
                }
            });
        });

        // Start dematerialization animation
        if (meshesToDematerialize.length > 0) {
            for (const mesh of meshesToDematerialize) {
                const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                for (const mat of mats) injectTransporterEffect(mat as THREE.Material);
            }
            state.transporterActive++;
            state.transporterMeshes = [...state.transporterMeshes, ...meshesToDematerialize];
            const dRing = createTransporterRing(meshesToDematerialize, state.scene, state.shade);
            state.requestRender();
            animateTransporterMeshes(
                meshesToDematerialize,
                'dematerialize',
                3000,
                () => {
                    for (const mesh of meshesToDematerialize) mesh.visible = false;
                    state.transporterActive--;
                    state.transporterMeshes = state.transporterMeshes.filter(
                        (m) => !meshesToDematerialize.includes(m)
                    );
                    removeTransporterRing(dRing);
                    precacheMaterials(state);
                    state.requestRender();
                },
                (y, bw, p) => updateTransporterRing(dRing, y, bw, p)
            );
        }

        // Collect currently hidden meshes that will become visible (re-shown)
        const meshesToRematerialize: THREE.Mesh[] = [];
        state.objects.forEach((object: any) => {
            object.traverse((child: any) => {
                if (
                    child.isMesh &&
                    !child.visible &&
                    objectsToShow.includes(child.name) &&
                    child.parent?.name !== 'shade_skin'
                ) {
                    meshesToRematerialize.push(child);
                }
            });
        });

        // Create ring immediately as loading feedback (before await)
        let preloadRing: ReturnType<typeof createTransporterRing> | null = null;
        if (filesToLoad.length > 0 && state.shade) {
            preloadRing = createTransporterRing([], state.scene, state.shade);
            preloadRing.material.uniforms.uFade.value = 1.0;
            state.idleRings.push(preloadRing);
            state.requestRender();
        }

        const newObjects = await Promise.all(
            filesToLoad.map((f: string) => loadObj(state, { id: f, name: f }, model))
        );

        const labelIds = [...new Set(labels.map((l) => l.id))];

        insertObject(newObjects, objectsToShow, labelIds, state.group, defaultState, labels);

        // Update visibility for all objects, but skip meshes being dematerialized
        const dematerializeSet = new Set(meshesToDematerialize.map((m) => m.uuid));
        state.objects.forEach((object) => {
            object.traverse(function (child: any) {
                if (dematerializeSet.has(child.uuid)) return;
                checkObject(child, objectsToShow, labelIds, labels);
            });
        });

        // Re-inject transporter on meshes whose materials were cloned by checkObject
        for (const mesh of meshesToRematerialize) {
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const mat of mats) injectTransporterEffect(mat as THREE.Material);
        }

        // Animate re-shown meshes
        if (meshesToRematerialize.length > 0) {
            state.transporterActive++;
            state.transporterMeshes = [...state.transporterMeshes, ...meshesToRematerialize];
            const reRing = createTransporterRing(meshesToRematerialize, state.scene, state.shade);
            state.requestRender();
            animateTransporterMeshes(
                meshesToRematerialize,
                'materialize',
                3000,
                () => {
                    state.transporterActive--;
                    state.transporterMeshes = state.transporterMeshes.filter(
                        (m) => !meshesToRematerialize.includes(m)
                    );
                    removeTransporterRing(reRing);
                },
                (y, bw, p) => updateTransporterRing(reRing, y, bw, p)
            );
        }

        // Inject transporter beam effect on newly loaded meshes and animate
        if (newObjects.length > 0) {
            const newMeshes: THREE.Mesh[] = [];
            for (const obj of newObjects as any[]) {
                obj.traverse((child: any) => {
                    if (
                        child.isMesh &&
                        child.material &&
                        child.parent?.name !== 'shade_skin'
                    ) {
                        const mats = Array.isArray(child.material)
                            ? child.material
                            : [child.material];
                        for (const mat of mats) injectTransporterEffect(mat);
                        newMeshes.push(child);
                    }
                });
            }
            if (newMeshes.length > 0) {
                const newRing =
                    preloadRing || createTransporterRing(newMeshes, state.scene, state.shade);
                if (preloadRing) {
                    state.idleRings = state.idleRings.filter((r) => r !== preloadRing);
                    preloadRing = null;
                }
                state.transporterActive++;
                state.transporterMeshes = [...state.transporterMeshes, ...newMeshes];
                animateTransporterMeshes(
                    newMeshes,
                    'materialize',
                    3000,
                    () => {
                        state.transporterActive--;
                        state.transporterMeshes = state.transporterMeshes.filter(
                            (m) => !newMeshes.includes(m)
                        );
                        removeTransporterRing(newRing);
                    },
                    (y, bw, p) => updateTransporterRing(newRing, y, bw, p)
                );
            }
        }

        // Clean up preload ring if no new meshes ended up needing it
        if (preloadRing) {
            state.idleRings = state.idleRings.filter((r) => r !== preloadRing);
            removeTransporterRing(preloadRing);
        }

        state.objects = [...state.objects, ...newObjects];

        // Pre-cache materials and build focusable mesh list for fast highlight()
        if (state.destroyed) return { modelLoaded: true, pendingFocus: null };
        precacheMaterials(state);

        state.requestRender();
        onLoadLabels();

        if (!state.initialViewState) {
            state.initialViewState = {
                position: state.camera.position.clone(),
                rotation: state.camera.rotation.clone(),
                target: state.controls.target.clone()
            };
        }
    } catch (error) {
        console.error('🧍', 'updateModel error:', error);
    }

    dispatch('ready');
    return { modelLoaded: true, pendingFocus };
}

/**
 * Loads a single OBJ+MTL file pair.
 */
export function loadObj(
    state: SceneState,
    setup: LoadObjSetup,
    model: string
): Promise<THREE.Object3D> {
    return new Promise((resolve, reject) => {
        const opts = Object.assign({ opacity: DEFAULT_OPACITY }, setup);

        function onProgress(_xhr: any) {
            // Progress tracking placeholder
        }

        function onError(error: any) {
            console.error('🧍', '3D model load error', error);
            reject(error);
        }

        const mtlLoader = new MTLLoader();
        mtlLoader.load(
            '/anatomy_models/' + model + '_' + opts.id + '_obj/' + opts.id + '.mtl',
            function (materialsCreator) {
                materialsCreator.preload();

                const objLoader = new OBJLoader();
                if (opts.material) {
                    const material = opts.material;
                    Object.keys(materialsCreator.materials).forEach((key) => {
                        materialsCreator.materials[key] = material;
                    });
                }

                // For non-muscular systems, use the MTL materials as-is
                if (!isMuscularSystem(opts.id) || opts.material) {
                    objLoader.setMaterials(materialsCreator);
                }

                objLoader.load(
                    '/anatomy_models/' +
                        model +
                        '_' +
                        opts.id +
                        '_obj/' +
                        opts.id +
                        '.obj',
                    function (object) {
                        object.name = opts.rename || opts.name;

                        const useMuscle = isMuscularSystem(opts.id) && !opts.material;

                        object.traverse(function (child: any) {
                            if (child.isMesh) {
                                child.geometry.computeVertexNormals();

                                if (useMuscle) {
                                    if (isTouchDevice() && state.muscleMatcapTexture) {
                                        child.material = createMuscleMatcapMaterial(
                                            child.name,
                                            state.muscleMatcapTexture
                                        );
                                    } else {
                                        child.material = createMuscleMaterial(child.name);
                                    }
                                }

                                if (opts.opacity) {
                                    child.material.transparent = true;
                                    child.material.opacity = opts.opacity;
                                }
                            }
                        });

                        state.loadedFiles.push(opts.rename || opts.id);
                        resolve(object);
                    },
                    onProgress,
                    onError
                );
            }
        );
    });
}

/**
 * Adds loaded objects to the scene group with correct positioning.
 */
export function insertObject(
    o: any[],
    objectsToShow: string[],
    labelIds: string[],
    group: THREE.Group,
    defaultState: DefaultState,
    labels: LabelEntry[]
): void {
    o.forEach((object: any) => {
        object.traverse(function (child: any) {
            if (objectsToShow) checkObject(child, objectsToShow, labelIds, labels);

            if (object.name === 'integumentary_system' && child.name === 'body') {
                child.visible = false;
            }
        });
        object.position.y = defaultState.modelY;
        object.position.z = defaultState.modelZ;
        object.layers.enableAll();

        group.add(object);
    });
}

/**
 * Updates visibility and materials for a single mesh based on active layers and labels.
 */
export function checkObject(
    child: any,
    objectsToShow: string[],
    labelIds: string[],
    labels: LabelEntry[]
): void {
    if (!child.isMesh) return;

    if (objectsToShow.includes(child.name)) {
        if (child.name === 'body' && child.parent.name === 'integumentary_system') {
            child.visible = false;
        } else {
            child.visible = true;
        }

        if (labelIds.includes(child.name)) {
            child.material = updateMaterial(child.material, {
                color: FOCUS_COLOR
            });
            const label = labels.find((l) => l.id === child.name);
            if (label) {
                label.geometry = child.geometry;
                label.object = child;
            }
        }
    } else {
        child.visible = false;
        if (labelIds.includes(child.name)) {
            const label = labels.find((l) => l.id === child.name);
            if (label) {
                label.geometry = null;
                label.object = null;
            }
        }
    }
}

/**
 * Loads the integumentary system shade/skin mesh.
 */
export async function loadShade(
    state: SceneState,
    model: string,
    defaultState: DefaultState,
    showShade: boolean
): Promise<void> {
    insertObject(
        [
            await loadObj(
                state,
                {
                    id: 'integumentary_system',
                    name: 'integumentary_system',
                    color: 3,
                    opacity: 0.3,
                    rename: 'shade_skin',
                    material: new THREE.MeshPhysicalMaterial({
                        metalness: 0.2,
                        roughness: 0.5,
                        transmission: 0.8,
                        color: 0xcccccc,
                        reflectivity: 0.5,
                        side: THREE.BackSide,
                        depthWrite: false
                    })
                },
                model
            )
        ],
        ['body'],
        [],
        state.scene as any,
        defaultState,
        []
    );
    toggleShade(state, showShade);
}

/**
 * Toggles visibility of the shade/skin mesh.
 */
export function toggleShade(state: SceneState, visible: boolean): void {
    if (state.scene && !state.shade)
        state.shade = state.scene.getObjectByName('shade_skin') as any;
    if (state.shade) state.shade.visible = visible;
}
