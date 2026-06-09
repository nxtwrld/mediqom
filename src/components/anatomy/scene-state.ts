/**
 * Shared mutable state for the 3D anatomy viewer.
 *
 * All extracted modules receive a SceneState reference and read/write through it.
 * Svelte-reactive variables (selected, ready, labels, activeLayers, etc.) stay as
 * top-level `let` in Body.svelte — only Three.js internals live here.
 */
import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import type { TransporterRing } from './transporter-ring';

export type ViewState = {
    position: THREE.Vector3;
    rotation: THREE.Euler;
    target: THREE.Vector3;
};

export interface MaterialCacheEntry {
    original: THREE.Material | THREE.Material[];
    unfocused: THREE.Material | THREE.Material[];
    highlighted: THREE.Material | THREE.Material[];
}

export interface MultiHighlightRegion {
    mesh: string;    // mesh name in the Three.js scene
    color: string;   // CSS color string e.g. '#3b82f6'
    opacity: number; // 0–1, will be bucketed
}

export interface SceneState {
    // Three.js core objects (populated by initScene)
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer | null;
    controls: OrbitControls;
    group: THREE.Group;
    raycaster: THREE.Raycaster;
    pointer: THREE.Vector2;
    labelRenderer: CSS2DRenderer | null;

    // Material cache
    materialCache: Map<string, MaterialCacheEntry>;
    focusableMeshes: THREE.Mesh[];

    // Multi-highlight (Care Plan region painting)
    multiHighlightRegions: MultiHighlightRegion[];
    multiVariantCache: Map<string, THREE.Material | THREE.Material[]>;
    previousMultiHighlight: Map<string, string>; // meshName → variantKey

    // Aura glow effect state
    auraMeshes: THREE.Mesh[];
    auraShellMaterials: THREE.ShaderMaterial[];
    auraActive: boolean;
    auraClock: THREE.Clock;

    // Transporter beam state
    transporterActive: number;
    transporterMeshes: THREE.Mesh[];
    idleRings: TransporterRing[];

    // Internal model/view state
    shade: THREE.Group | undefined;
    muscleMatcapTexture: THREE.Texture | null;
    dragged: boolean;
    openedLabel: HTMLDivElement | null;
    initialViewState: ViewState | undefined;
    previousViewState: ViewState | null;
    animationFrameId: number | null;
    idleFrames: number;
    loadedFiles: string[];
    objects: any[];
    destroyed: boolean;

    // Callbacks (set by Body.svelte after creation)
    requestRender: () => void;
}

export const DEFAULT_OPACITY = 0.9;
export const UNFOCUSED_OPACITY = 0.5;
export const FOCUS_COLOR = 0x16d3dd;
export const HIGHLIGHT_COLOR = 0xffbf40;
export const MAX_IDLE_FRAMES = 60; // ~1s at 60fps

export function createSceneState(): SceneState {
    return {
        // Three.js core — set to placeholder values; initScene populates them
        scene: null as unknown as THREE.Scene,
        camera: null as unknown as THREE.PerspectiveCamera,
        renderer: null,
        controls: null as unknown as OrbitControls,
        group: new THREE.Group(),
        raycaster: null as unknown as THREE.Raycaster,
        pointer: new THREE.Vector2(),
        labelRenderer: null,

        // Material cache
        materialCache: new Map(),
        focusableMeshes: [],

        // Multi-highlight
        multiHighlightRegions: [],
        multiVariantCache: new Map(),
        previousMultiHighlight: new Map(),

        // Aura
        auraMeshes: [],
        auraShellMaterials: [],
        auraActive: false,
        auraClock: new THREE.Clock(false),

        // Transporter
        transporterActive: 0,
        transporterMeshes: [],
        idleRings: [],

        // Internal state
        shade: undefined,
        muscleMatcapTexture: null,
        dragged: false,
        openedLabel: null,
        initialViewState: undefined,
        previousViewState: null,
        animationFrameId: null,
        idleFrames: 0,
        loadedFiles: [],
        objects: [],
        destroyed: false,

        // Callbacks — Body.svelte sets these in onMount
        requestRender: () => {},
    };
}
