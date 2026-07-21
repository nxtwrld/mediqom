/**
 * Material caching and utility functions for the 3D anatomy viewer.
 *
 * Provides:
 * - updateMaterial: clone + modify materials (color, opacity, transparency)
 * - getCachedMaterials: lazy-create 3 variants per mesh (original, unfocused, highlighted)
 * - precacheMaterials: warm the cache for all meshes in scene
 */
import * as THREE from 'three';
import type { SceneState, MaterialCacheEntry } from './scene-state';
import { UNFOCUSED_OPACITY, HIGHLIGHT_COLOR } from './scene-state';

interface MaterialOptions {
    color?: number;
    transparent?: boolean;
    opacity?: number;
}

/**
 * Clones a material (or array of materials) and applies the given property overrides.
 */
export function updateMaterial(
    material: THREE.Material | THREE.Material[],
    options: MaterialOptions
): THREE.Material | THREE.Material[] {
    if (Array.isArray(material)) {
        return material.map((m: THREE.Material) => {
            return updateMaterial(m, options) as THREE.Material;
        }) as THREE.Material[];
    } else {
        const newMaterial = material.clone();
        Object.keys(options).forEach((key) => {
            if ((newMaterial as any)[key] && (newMaterial as any)[key].set) {
                (newMaterial as any)[key].set((options as any)[key]);
            } else if ((newMaterial as any)[key] !== undefined) {
                (newMaterial as any)[key] = (options as any)[key];
            }
        });
        return newMaterial;
    }
}

/**
 * Gets cached material variants for a mesh.
 * Creates and caches the variants on first access.
 * Returns original, unfocused (dimmed), and highlighted material variants.
 */
export function getCachedMaterials(
    child: THREE.Mesh,
    cache: Map<string, MaterialCacheEntry>
): MaterialCacheEntry {
    const key = child.uuid;
    if (!cache.has(key)) {
        const original = child.material;
        cache.set(key, {
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
    return cache.get(key)!;
}

const OPACITY_BUCKETS = [0.2, 0.4, 0.6, 0.8, 1.0];

/**
 * Snaps an opacity value to the nearest bucket to bound cache size.
 */
export function bucketOpacity(opacity: number): number {
    let closest = OPACITY_BUCKETS[0];
    for (const b of OPACITY_BUCKETS) {
        if (Math.abs(b - opacity) < Math.abs(closest - opacity)) closest = b;
    }
    return closest;
}

/**
 * Cache key for a multi-highlight material variant.
 */
export function multiVariantKey(meshUuid: string, colorHex: string, bucket: number): string {
    return `${meshUuid}:${colorHex}:${bucket}`;
}

/**
 * Gets or creates a bucketed material variant for multi-highlight use.
 * Normalises the CSS color string and snaps opacity to the nearest bucket.
 */
export function getMultiVariantMaterial(
    mesh: THREE.Mesh,
    colorCss: string,
    opacity: number,
    cache: Map<string, THREE.Material | THREE.Material[]>
): THREE.Material | THREE.Material[] {
    const colorHex = new THREE.Color(colorCss).getHexString();
    const bucket = bucketOpacity(opacity);
    const key = multiVariantKey(mesh.uuid, colorHex, bucket);
    if (!cache.has(key)) {
        cache.set(
            key,
            updateMaterial(mesh.material as THREE.Material, {
                color: parseInt(colorHex, 16),
                opacity: bucket,
                transparent: true
            })
        );
    }
    return cache.get(key)!;
}

/**
 * Disposes and clears the multi-variant cache. Called in onDestroy.
 */
export function clearMultiVariantCache(
    cache: Map<string, THREE.Material | THREE.Material[]>
): void {
    for (const mat of cache.values()) {
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
    }
    cache.clear();
}

/**
 * Pre-caches materials for all meshes and builds the focusableMeshes list.
 * Called after model loading to ensure highlight() is fast.
 */
export function precacheMaterials(state: SceneState): void {
    state.focusableMeshes = [];
    state.scene.traverse((child: any) => {
        if (child.isMesh && child.material) {
            if (child.parent?.name !== 'shade_skin') {
                state.focusableMeshes.push(child);
                getCachedMaterials(child, state.materialCache);
            }
        }
    });
}
