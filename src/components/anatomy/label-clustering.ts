/**
 * Screen-space label clustering for the 3D anatomy viewer.
 *
 * Projects label positions to 2D screen space and groups nearby labels
 * into cluster badges. Clicking a cluster zooms into that area.
 */
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { LabelEntry } from './model-loader';
import type { SceneState } from './scene-state';

// ─── Types ───────────────────────────────────────────────────────

export interface LabelCluster {
    id: string;
    members: LabelEntry[];
    centroidScreen: { x: number; y: number };
    worldCenter: THREE.Vector3;
    radius: number;
}

export interface ClusterState {
    clusters: LabelCluster[];
    clusterObjects: { css2d: CSS2DObject; id: string }[];
    lastCameraPos: THREE.Vector3;
    lastCameraQuat: THREE.Quaternion;
    dirty: boolean;
    thresholdPx: number;
    /** Label IDs whose clustering is suppressed (expanded by click) */
    suppressedLabelIds: Set<string>;
    /** Timer to clear suppression */
    suppressionTimer: ReturnType<typeof setTimeout> | null;
}

// ─── Constants ───────────────────────────────────────────────────

const DEFAULT_THRESHOLD_PX = 90;
const CAMERA_MOVE_TOLERANCE = 0.01;

// ─── Factory ─────────────────────────────────────────────────────

export function createClusterState(): ClusterState {
    return {
        clusters: [],
        clusterObjects: [],
        lastCameraPos: new THREE.Vector3(),
        lastCameraQuat: new THREE.Quaternion(),
        dirty: true,
        thresholdPx: DEFAULT_THRESHOLD_PX,
        suppressedLabelIds: new Set(),
        suppressionTimer: null
    };
}

/**
 * Suppress a cluster so its members show as individual labels immediately.
 * Called when a cluster badge is clicked (zoom-in).
 */
const SUPPRESSION_DURATION_MS = 5000;

export function suppressCluster(clusterState: ClusterState, cluster: LabelCluster, ss: SceneState): void {
    // Track individual member IDs
    for (const member of cluster.members) {
        clusterState.suppressedLabelIds.add(member.id);
        if (member.label) {
            member.label.visible = true;
        }
    }
    // Remove the badge immediately
    const objIndex = clusterState.clusterObjects.findIndex((o) => o.id === cluster.id);
    if (objIndex >= 0) {
        const obj = clusterState.clusterObjects[objIndex];
        obj.css2d.visible = false;
        obj.css2d.removeFromParent();
        obj.css2d.element.remove();
        clusterState.clusterObjects.splice(objIndex, 1);
    }
    // Reset timer — clear suppression after duration
    if (clusterState.suppressionTimer) clearTimeout(clusterState.suppressionTimer);
    clusterState.suppressionTimer = setTimeout(() => {
        clusterState.suppressedLabelIds.clear();
        clusterState.suppressionTimer = null;
        clusterState.dirty = true;
    }, SUPPRESSION_DURATION_MS);
    clusterState.dirty = true;
}

// ─── Projection helpers ──────────────────────────────────────────

interface ProjectedLabel {
    label: LabelEntry;
    screen: { x: number; y: number };
    world: THREE.Vector3;
}

function projectToScreen(
    label: LabelEntry,
    camera: THREE.PerspectiveCamera,
    width: number,
    height: number
): ProjectedLabel | null {
    const geom = label.geometry as THREE.BufferGeometry | null;
    const obj = label.object as THREE.Object3D | null;
    if (!geom || !obj) return null;

    if (!geom.boundingSphere) geom.computeBoundingSphere();
    const center = geom.boundingSphere!.center.clone();
    const world = obj.localToWorld(center);

    const ndc = world.clone().project(camera);
    // Behind camera
    if (ndc.z > 1) return null;

    const x = (ndc.x * 0.5 + 0.5) * width;
    const y = (-ndc.y * 0.5 + 0.5) * height;

    return { label, screen: { x, y }, world };
}

// ─── Clustering algorithm ────────────────────────────────────────

export function computeClusters(
    labels: LabelEntry[],
    camera: THREE.PerspectiveCamera,
    rendererSize: { width: number; height: number },
    openedLabelId: string | null,
    thresholdPx: number = DEFAULT_THRESHOLD_PX
): LabelCluster[] {
    const projected: ProjectedLabel[] = [];
    for (const label of labels) {
        if (!label.label || !label.geometry) continue;
        // Skip label with open menu
        if (openedLabelId && label.id === openedLabelId) continue;
        const p = projectToScreen(label, camera, rendererSize.width, rendererSize.height);
        if (p) projected.push(p);
    }

    if (projected.length === 0) return [];

    // Greedy agglomerative clustering
    const clusters: {
        members: ProjectedLabel[];
        centroidX: number;
        centroidY: number;
    }[] = [];

    for (const p of projected) {
        let bestCluster: (typeof clusters)[0] | null = null;
        let bestDist = Infinity;

        for (const c of clusters) {
            const dx = p.screen.x - c.centroidX;
            const dy = p.screen.y - c.centroidY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < thresholdPx && dist < bestDist) {
                bestDist = dist;
                bestCluster = c;
            }
        }

        if (bestCluster) {
            bestCluster.members.push(p);
            // Recompute centroid
            let sx = 0, sy = 0;
            for (const m of bestCluster.members) {
                sx += m.screen.x;
                sy += m.screen.y;
            }
            bestCluster.centroidX = sx / bestCluster.members.length;
            bestCluster.centroidY = sy / bestCluster.members.length;
        } else {
            clusters.push({
                members: [p],
                centroidX: p.screen.x,
                centroidY: p.screen.y
            });
        }
    }

    // Convert to LabelCluster format
    return clusters.map((c) => {
        const worldCenter = new THREE.Vector3();
        let maxRadius = 0;

        for (const m of c.members) {
            worldCenter.add(m.world);
        }
        worldCenter.divideScalar(c.members.length);

        // Compute bounding radius in world space
        for (const m of c.members) {
            const geom = m.label.geometry as THREE.BufferGeometry;
            const sphereRadius = geom.boundingSphere?.radius || 0;
            const dist = m.world.distanceTo(worldCenter) + sphereRadius;
            if (dist > maxRadius) maxRadius = dist;
        }

        const memberIds = c.members.map((m) => m.label.id).sort();
        return {
            id: memberIds.join('+'),
            members: c.members.map((m) => m.label),
            centroidScreen: { x: c.centroidX, y: c.centroidY },
            worldCenter,
            radius: maxRadius
        };
    });
}

// ─── Cluster badge DOM ───────────────────────────────────────────

function createClusterBadge(
    count: number,
    onClick: () => void
): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'cluster-label';
    el.style.pointerEvents = 'auto';
    el.style.cursor = 'pointer';
    el.innerHTML = `<span class="cluster-count">${count}</span>`;

    const handler = (e: Event) => {
        e.stopPropagation();
        e.preventDefault();
        console.log('🏷️ Cluster badge clicked', count);
        onClick();
    };

    el.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        console.log('🏷️ Cluster badge mousedown');
    });
    el.addEventListener('mouseup', handler);
    el.addEventListener('click', handler);
    el.addEventListener('touchend', handler);
    el.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        console.log('🏷️ Cluster badge pointerdown');
    });
    el.addEventListener('pointerup', (e) => {
        e.stopPropagation();
        e.preventDefault();
        console.log('🏷️ Cluster badge pointerup');
        onClick();
    });
    return el;
}

function updateClusterBadge(el: HTMLDivElement, count: number): void {
    const span = el.querySelector('.cluster-count');
    if (span) span.textContent = String(count);
}

// ─── Main update ─────────────────────────────────────────────────

export function updateClusters(
    labels: LabelEntry[],
    ss: SceneState,
    clusterState: ClusterState,
    onClusterClick: (cluster: LabelCluster) => void
): void {
    if (!ss.camera || !ss.renderer) return;

    // Check if camera moved
    const posDiff = clusterState.lastCameraPos.distanceToSquared(ss.camera.position);
    const quatDiff = 1 - Math.abs(clusterState.lastCameraQuat.dot(ss.camera.quaternion));

    if (!clusterState.dirty && posDiff < CAMERA_MOVE_TOLERANCE && quatDiff < CAMERA_MOVE_TOLERANCE) {
        return;
    }

    clusterState.lastCameraPos.copy(ss.camera.position);
    clusterState.lastCameraQuat.copy(ss.camera.quaternion);
    clusterState.dirty = false;

    const size = ss.renderer.getSize(new THREE.Vector2());

    // Get opened label ID if any
    const openedLabelId = ss.openedLabel
        ? ss.openedLabel.id?.replace('label-id-', '') || null
        : null;

    let newClusters = computeClusters(
        labels,
        ss.camera,
        { width: size.x, height: size.y },
        openedLabelId,
        clusterState.thresholdPx
    );

    // Break clusters that contain any suppressed label IDs
    if (clusterState.suppressedLabelIds.size > 0) {
        newClusters = newClusters.map((c) => {
            if (c.members.length > 1 && c.members.some((m) => clusterState.suppressedLabelIds.has(m.id))) {
                return c.members.map((m) => ({
                    id: m.id,
                    members: [m],
                    centroidScreen: c.centroidScreen,
                    worldCenter: c.worldCenter,
                    radius: 0
                }));
            }
            return c;
        }).flat();
    }

    // Restore visibility on all labels first
    for (const label of labels) {
        if (label.label) {
            label.label.visible = !!label.geometry;
        }
    }

    // Build a set of new multi-member cluster IDs
    const newClusterMap = new Map<string, LabelCluster>();
    for (const c of newClusters) {
        if (c.members.length > 1) {
            newClusterMap.set(c.id, c);
            // Hide individual labels in this cluster
            for (const member of c.members) {
                if (member.label) {
                    member.label.visible = false;
                }
            }
        }
    }

    // Reconcile CSS2DObjects: remove stale, update existing, create new
    const keptObjects: typeof clusterState.clusterObjects = [];
    for (const obj of clusterState.clusterObjects) {
        if (newClusterMap.has(obj.id)) {
            // Update existing badge
            const cluster = newClusterMap.get(obj.id)!;
            updateClusterBadge(obj.css2d.element as HTMLDivElement, cluster.members.length);
            obj.css2d.position.copy(cluster.worldCenter);
            obj.css2d.visible = true;
            keptObjects.push(obj);
            newClusterMap.delete(obj.id);
        } else {
            // Remove stale badge
            obj.css2d.removeFromParent();
            obj.css2d.element.remove();
        }
    }

    // Create new badges for remaining clusters
    newClusterMap.forEach((cluster, id) => {
        const el = createClusterBadge(cluster.members.length, () => {
            onClusterClick(cluster);
        });
        const css2d = new CSS2DObject(el);
        css2d.position.copy(cluster.worldCenter);
        css2d.center.set(0.5, 0.5);
        css2d.layers.set(0);
        ss.scene.add(css2d);
        keptObjects.push({ css2d, id });
    });

    clusterState.clusters = newClusters;
    clusterState.clusterObjects = keptObjects;
}

// ─── Disposal ────────────────────────────────────────────────────

export function disposeClusterState(clusterState: ClusterState, _ss: SceneState): void {
    for (const obj of clusterState.clusterObjects) {
        obj.css2d.removeFromParent();
        obj.css2d.element.remove();
    }
    clusterState.clusterObjects = [];
    clusterState.clusters = [];
    clusterState.suppressedLabelIds.clear();
    if (clusterState.suppressionTimer) {
        clearTimeout(clusterState.suppressionTimer);
        clusterState.suppressionTimer = null;
    }
}
