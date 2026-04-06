/**
 * Focus, highlight, aura glow, and view state management for the 3D anatomy viewer.
 */
import * as THREE from 'three';
import TWEEN from '@tweenjs/tween.js';
import type { SceneState, ViewState } from './scene-state';
import { HIGHLIGHT_COLOR } from './scene-state';
import { getCachedMaterials } from './material-system';
import { createAuraShellMaterials } from './aura.shader';
import type { Writable } from 'svelte/store';

interface FocusedState {
    object?: string;
}

/**
 * Routes a highlight request by name string.
 * Returns the newly selected object (or null).
 */
export function setHighlight(
    state: SceneState,
    name: string | null,
    selected: THREE.Object3D | null,
    mapped: Record<string, string>
): THREE.Object3D | null {
    if (name) {
        if (name === selected?.name) return selected;
        return focusObject(state, mapped[name] || name, selected);
    } else {
        if (state.previousViewState) {
            setViewState(state, state.previousViewState);
        }
        highlight(state, null, selected);
        state.requestRender();
        return null;
    }
}

/**
 * Camera zoom to selected anatomy part(s).
 * Returns the focused object.
 */
export function focusObject(
    state: SceneState,
    objects: string | THREE.Object3D | (string | THREE.Object3D)[] | null,
    selected: THREE.Object3D | null
): THREE.Object3D | null {
    const processObjects: THREE.Object3D[] = [];

    if (!objects) return selected;
    if (!Array.isArray(objects)) objects = [objects];

    objects.forEach((o: any) => {
        if (typeof o === 'string') {
            const object = state.scene.getObjectByName(o);
            if (object) processObjects.push(object);
        } else {
            processObjects.push(o);
        }
    });

    if (processObjects.length === 0) return selected;
    if (processObjects.length > 1) {
        console.warn('Multiple objects to focus not supported yet');
    }

    const object = processObjects[0];

    // Ensure world matrices are up to date for accurate bounding box
    object.updateWorldMatrix(true, true);

    // Store original position and rotation
    if (!selected) {
        state.previousViewState = {
            position: state.camera.position.clone(),
            rotation: state.camera.rotation.clone(),
            target: state.controls.target.clone()
        };
    }

    highlight(state, object, selected);

    // Focus the object into view
    const aabb = new THREE.Box3().setFromObject(object);
    const sphere = aabb.getBoundingSphere(new THREE.Sphere(new THREE.Vector3()));

    const center = sphere.center;
    const radius = sphere.radius;

    // Adjust the distance as needed
    const fovInRadians = (state.camera.fov * Math.PI) / 180;
    const distance = radius / Math.sin(fovInRadians / 2);

    const targetPosition = new THREE.Vector3(
        center.x,
        center.y,
        center.z + distance * 2
    );

    // Position the camera at this distance
    state.camera.lookAt(center);
    state.camera.updateProjectionMatrix();

    new TWEEN.Tween(state.camera.position)
        .to({ x: targetPosition.x, y: targetPosition.y, z: targetPosition.z }, 2000)
        .easing(TWEEN.Easing.Quadratic.Out)
        .start();

    new TWEEN.Tween(state.controls.target)
        .to({ x: center.x, y: center.y, z: center.z }, 2000)
        .easing(TWEEN.Easing.Cubic.Out)
        .onUpdate(() => {
            state.controls.update();
        })
        .start();

    state.requestRender();
    return object;
}

/**
 * Material state management for focus/dim.
 * Updates all visible meshes and applies highlight to the target object.
 */
export function highlight(
    state: SceneState,
    object: THREE.Object3D | null,
    selected: THREE.Object3D | null
): void {
    // Restore previously selected object to unfocused state
    if (selected && selected !== object) {
        selected.traverse((child: any) => {
            if (child.isMesh) {
                const cached = getCachedMaterials(child, state.materialCache);
                child.material = object ? cached.unfocused : cached.original;
            }
        });
    }

    // Update all visible meshes to unfocused/original state using pre-built list
    if (object && !selected) {
        // Entering focus mode: dim all meshes
        for (const mesh of state.focusableMeshes) {
            if (mesh.visible) {
                const cached = state.materialCache.get(mesh.uuid);
                if (cached) mesh.material = cached.unfocused;
            }
        }
    } else if (!object && selected) {
        // Exiting focus mode: restore all meshes
        for (const mesh of state.focusableMeshes) {
            if (mesh.visible) {
                const cached = state.materialCache.get(mesh.uuid);
                if (cached) mesh.material = cached.original;
            }
        }
    }

    // Highlight the target object + aura glow
    if (object) {
        object.traverse((child: any) => {
            if (child.isMesh && child.material) {
                const cached = state.materialCache.get(child.uuid);
                if (cached) child.material = cached.highlighted;
            }
        });
        createAuraMesh(state, object);
    } else {
        removeAuraMesh(state);
    }
}

/**
 * Creates 3 concentric glow shells per child mesh for a soft halo effect.
 * No post-processing needed — shells use BackSide + AdditiveBlending.
 */
export function createAuraMesh(state: SceneState, object: THREE.Object3D): void {
    removeAuraMesh(state);

    state.auraShellMaterials = createAuraShellMaterials(new THREE.Color(HIGHLIGHT_COLOR));
    state.auraClock.start();
    state.auraActive = true;

    object.traverse((child: any) => {
        if (!child.isMesh) return;
        for (let i = 0; i < state.auraShellMaterials.length; i++) {
            const clone = child.clone();
            // Remove cloned CSS2DObject children (labels) to prevent duplicate DOM elements
            const css2dChildren: any[] = [];
            clone.traverse((c: any) => { if (c.isCSS2DObject) css2dChildren.push(c); });
            for (const c of css2dChildren) c.removeFromParent();
            clone.material = state.auraShellMaterials[i];
            clone.renderOrder = 999 + i;
            clone.raycast = () => {};
            clone.name = `__aura_${i}__${child.name}`;
            child.parent!.add(clone);
            state.auraMeshes.push(clone);
        }
    });

    state.requestRender();
}

/**
 * Removes all aura clone meshes and stops the clock.
 */
export function removeAuraMesh(state: SceneState): void {
    for (const mesh of state.auraMeshes) {
        mesh.parent?.remove(mesh);
        mesh.geometry?.dispose();
    }
    state.auraMeshes = [];
    for (const mat of state.auraShellMaterials) {
        mat.dispose();
    }
    state.auraShellMaterials = [];
    state.auraClock.stop();
    state.auraActive = false;
}

/**
 * Tweens the camera to a saved position/target.
 */
export function setViewState(state: SceneState, viewState: ViewState): void {
    if (!viewState) return;
    new TWEEN.Tween(state.camera.position)
        .to(
            { x: viewState.position.x, y: viewState.position.y, z: viewState.position.z },
            2000
        )
        .easing(TWEEN.Easing.Quadratic.Out)
        .start();
    new TWEEN.Tween(state.controls.target)
        .to(
            { x: viewState.target.x, y: viewState.target.y, z: viewState.target.z },
            2000
        )
        .easing(TWEEN.Easing.Cubic.Out)
        .onUpdate(() => {
            state.controls.update();
        })
        .start();
    state.requestRender();
}

/**
 * Clears focus and restores the initial view.
 */
export function resetFocus(
    state: SceneState,
    focusedStore: Writable<FocusedState>
): void {
    focusedStore.set({ object: undefined });
    if (state.initialViewState) {
        setViewState(state, state.initialViewState);
    }
}
