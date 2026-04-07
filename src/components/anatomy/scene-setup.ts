/**
 * Scene initialization, resize, and disposal for the 3D anatomy viewer.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { isTouchDevice } from '$lib/device';
import type { SceneState } from './scene-state';

export interface DefaultState {
    minZoom: number;
    maxZoom: number;
    modelY: number;
    modelZ: number;
    cameraY: number;
    cameraX: number;
}

export function computeDefaultState(model: string): DefaultState {
    return model === 'female'
        ? {
              minZoom: 160,
              maxZoom: 0,
              modelY: isTouchDevice() ? -105 : -95,
              modelZ: 0,
              cameraY: 35,
              cameraX: 70
          }
        : {
              minZoom: 1500,
              maxZoom: 300,
              modelY: isTouchDevice() ? -1215 : -960,
              modelZ: isTouchDevice() ? 500 : 600,
              cameraY: 500,
              cameraX: 800
          };
}

/**
 * Initialize the Three.js scene, camera, renderer, controls, and lights.
 */
export async function initScene(
    state: SceneState,
    container: HTMLDivElement,
    defaultState: DefaultState,
    fullscreen: boolean,
    onPointerClick: (event: MouseEvent) => void
): Promise<void> {
    const w = fullscreen ? window.innerWidth : (container.offsetWidth || 300);
    const h = fullscreen ? window.innerHeight : (container.offsetHeight || 400);
    const minZoom = defaultState.minZoom;

    state.camera = new THREE.PerspectiveCamera(70, w / h, 1, 10000);
    state.camera.position.z = minZoom;
    state.camera.position.y = defaultState.cameraY;
    state.camera.position.x = defaultState.cameraX;

    // Scene
    state.scene = new THREE.Scene();
    state.raycaster = new THREE.Raycaster();
    state.scene.add(state.group);

    // Lights
    const hemiLight = new THREE.HemisphereLight(0xffeedd, 0x8899aa, 0.5);
    state.scene.add(hemiLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.25);
    state.scene.add(ambientLight);

    const light = new THREE.PointLight(0xffffff, 1.0);
    light.position.set(1, 1, 1).normalize();
    state.camera.add(light);
    state.scene.add(state.camera);

    // Renderer
    state.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    state.renderer.setClearColor(0x000000, 0);
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    state.renderer.setSize(w, h);
    state.renderer.outputColorSpace = THREE.SRGBColorSpace;
    state.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    state.renderer.toneMappingExposure = 1.0;
    container.appendChild(state.renderer.domElement);

    // CSS2DRenderer for label overlays
    state.labelRenderer = new CSS2DRenderer();
    state.labelRenderer.setSize(w, h);
    state.labelRenderer.domElement.style.position = 'absolute';
    state.labelRenderer.domElement.style.top = '0px';
    container.appendChild(state.labelRenderer.domElement);
    state.labelRenderer.domElement.addEventListener('mouseup', onPointerClick, false);

    // Controls
    state.controls = new OrbitControls(state.camera, state.labelRenderer.domElement);
    state.controls.listenToKeyEvents(container);
    state.controls.enableDamping = true;
    state.controls.dampingFactor = 0.05;
    state.controls.screenSpacePanning = true;
    state.controls.zoomSpeed = isTouchDevice() ? 0.8 : 0.1;
    state.controls.maxDistance = minZoom;
    state.controls.target.set(0, 0, 0);
    state.controls.maxPolarAngle = Math.PI / 2;

    state.controls.addEventListener('start', () => {
        state.dragged = true;
        state.requestRender();
    });

    state.controls.addEventListener('end', () => {
        state.dragged = false;
    });

    // Preload matcap texture for mobile muscle rendering
    if (isTouchDevice()) {
        const texLoader = new THREE.TextureLoader();
        texLoader.load('/anatomy_models/matcaps/muscle.png', (tex) => {
            state.muscleMatcapTexture = tex;
        });
    }
}

/**
 * Update camera aspect ratio and renderer size on container resize or fullscreen toggle.
 */
export function resize(
    state: SceneState,
    container: HTMLDivElement,
    fullscreen: boolean
): void {
    if (!container || !state.renderer) return;

    if (fullscreen) {
        const fw = window.innerWidth;
        const fh = window.innerHeight;
        state.camera.aspect = fw / fh;
        state.camera.clearViewOffset();
        state.camera.updateProjectionMatrix();
        state.renderer.setSize(fw, fh);
        if (state.labelRenderer) state.labelRenderer.setSize(fw, fh);
    } else {
        state.camera.clearViewOffset();
        state.camera.aspect = container.offsetWidth / container.offsetHeight;
        state.camera.updateProjectionMatrix();
        state.renderer.setSize(container.offsetWidth, container.offsetHeight);
        if (state.labelRenderer) state.labelRenderer.setSize(container.offsetWidth, container.offsetHeight);
    }
}

/**
 * Dispose and remove all children from a scene.
 */
export function clearObjects(scene: THREE.Scene): void {
    for (let i = scene.children.length - 1; i >= 0; i--) {
        const obj = scene.children[i];
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

/**
 * Full renderer disposal — call on component destroy.
 */
export function disposeScene(state: SceneState): void {
    if (state.renderer) {
        state.renderer.forceContextLoss();
        state.renderer.dispose();
        (state.renderer as any).context = null;
        (state.renderer as any).domElement = null;
        state.renderer = null;
    }

    if (state.labelRenderer) {
        (state.labelRenderer as any).context = null;
        (state.labelRenderer as any).domElement = null;
        state.labelRenderer = null;
    }
}
