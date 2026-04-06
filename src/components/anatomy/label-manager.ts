/**
 * Label management for the 3D anatomy viewer.
 *
 * Labels are CSS2D overlays positioned on anatomy meshes, showing document links.
 */
import type * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { tick } from 'svelte';
import { isObject } from '$lib/context/objects';
import objects3d from '$lib/context/objects';
import { groupByTags } from '$lib/documents/tools';
import type { Profile } from '$lib/types.d';
import type { LabelEntry } from './model-loader';
import type { SceneState } from './scene-state';
import { checkObject } from './model-loader';

export interface LabelHandlers {
    handleLabelMouseDown: (event: MouseEvent) => void;
    handleLabelMouseUp: (event: MouseEvent) => void;
    handleActionPointerDown: (event: PointerEvent) => void;
    handleActionPointerUp: (event: PointerEvent) => void;
    handleButtonPointerDown: (event: PointerEvent) => void;
    handleButtonPointerUp: (event: PointerEvent) => void;
}

const mapped: Record<string, string> = {
    //'cholesterol': 'heart',
};

const objectToFileMapping = Object.entries(objects3d).reduce(
    (acc, [k, v]) => {
        v.objects.forEach((f) => {
            acc[f] = k;
        });
        return acc;
    },
    {} as Record<string, string>
);

/**
 * Object-to-name mapping for anatomy parts.
 * Exported for use in highlight routing.
 */
export { mapped as anatomyMapped };

/**
 * Builds the label data from documents grouped by anatomy tags.
 * Returns the labels and any layers that need to be added.
 */
export function getLabelsMap(
    profile: Profile,
    activeLayers: string[]
): { labels: LabelEntry[]; layersToAdd: string[] } {
    if (!profile?.id) return { labels: [], layersToAdd: [] };

    const layersToAdd: string[] = [];

    const entries = Object.entries(groupByTags(profile.id))
        .filter(([k, _v]) => {
            if (mapped[k]) {
                return isObject(mapped[k], 'anatomy');
            } else {
                return isObject(k, 'anatomy');
            }
        })
        .map(([k, v]) => {
            const id: string = mapped[k] || k;

            const fileGroup = objectToFileMapping[id];
            if (fileGroup && !activeLayers.includes(fileGroup)) {
                layersToAdd.push(fileGroup);
            }

            return {
                type: v[0].metadata.category,
                id,
                tag: k,
                count: v.length,
                documents: v,
                geometry: null,
                object: null,
                label: undefined as any
            };
        });

    // Merge labels that map to the same anatomy object
    const merged = new Map<string, (typeof entries)[0]>();
    for (const entry of entries) {
        const existing = merged.get(entry.id);
        if (existing) {
            const existingIds = new Set(existing.documents.map((d: any) => d.id));
            const newDocs = entry.documents.filter((d: any) => !existingIds.has(d.id));
            existing.documents = [...existing.documents, ...newDocs];
            existing.count = existing.documents.length;
        } else {
            merged.set(entry.id, entry);
        }
    }

    return { labels: [...merged.values()], layersToAdd };
}

/**
 * Returns true if the label content has changed (by id, tag, or count).
 */
export function labelsContentChanged(a: LabelEntry[], b: LabelEntry[]): boolean {
    if (a.length !== b.length) return true;
    return a.some((la, i) => la.id !== b[i].id || la.tag !== b[i].tag || la.count !== b[i].count);
}

/**
 * Attaches CSS2D label overlays to anatomy meshes.
 */
export function loadLabels(
    labels: LabelEntry[],
    labelContainer: HTMLDivElement,
    handlers: LabelHandlers
): void {
    if (!labelContainer) return;

    for (const [index, labelEl] of [...labelContainer.children].entries()) {
        if (labels[index].label) continue;
        if (labels[index].geometry) {
            const geom = labels[index].geometry as THREE.BufferGeometry;
            if (!geom.boundingSphere) geom.computeBoundingSphere();
            const label = new CSS2DObject(labelEl as HTMLElement);
            const position = geom.boundingSphere!.center.toArray() as [number, number, number];
            label.position.set(...position);
            label.center.set(0, 1);
            (labels[index].object as any)?.add(label);
            label.layers.set(0);
            (labelEl as HTMLElement).addEventListener('mousedown', handlers.handleLabelMouseDown, false);
            (labelEl as HTMLElement).addEventListener('mouseup', handlers.handleLabelMouseUp, false);
            for (const actionEl of (labelEl as HTMLElement).querySelectorAll<HTMLAnchorElement>(
                '.action[href]'
            )) {
                actionEl.addEventListener('pointerdown', handlers.handleActionPointerDown, false);
                actionEl.addEventListener('pointerup', handlers.handleActionPointerUp, false);
            }
            for (const btnEl of (labelEl as HTMLElement).querySelectorAll<HTMLButtonElement>(
                '.ask-btn'
            )) {
                btnEl.addEventListener('pointerdown', handlers.handleButtonPointerDown, false);
                btnEl.addEventListener('pointerup', handlers.handleButtonPointerUp, false);
            }
            labels[index].label = label;
        }
    }

    labels.forEach((label) => {
        if (label.label) {
            label.label.visible = !!label.geometry;
        }
    });
}

/**
 * Re-syncs labels after layer changes: updates visibility and re-attaches overlays.
 */
export async function refreshLabels(
    state: SceneState,
    labels: LabelEntry[],
    activeLayers: string[],
    labelContainer: HTMLDivElement,
    handlers: LabelHandlers
): Promise<void> {
    const labelIds = [...new Set(labels.map((l) => l.id))];
    const objectsToShow = activeLayers.reduce((acc, l) => {
        return [...acc, ...objects3d[l as keyof typeof objects3d].objects];
    }, [] as string[]);

    state.objects.forEach((object) => {
        object.traverse(function (child: any) {
            checkObject(child, objectsToShow, labelIds, labels);
        });
    });

    await tick();
    loadLabels(labels, labelContainer, handlers);
    state.requestRender();
}

/**
 * Removes label DOM elements and detaches CSS2DObjects from the scene.
 */
export function cleanupLabels(labels: LabelEntry[]): void {
    for (const label of labels) {
        if (label.label) {
            label.label.element?.remove();
            label.label.removeFromParent();
            label.label = undefined;
        }
    }
}

/**
 * Prepares data for the AskButton on label menus.
 */
export function getBodyPartAskData(
    label: LabelEntry,
    translateAnatomyFn: (id: string, t: any) => string,
    tFn: any
): any {
    return {
        bodyPart: translateAnatomyFn(label.id, tFn),
        tag: label.tag,
        documents: label.documents.map((d: any) => ({
            id: d.id,
            title: d.content?.title || d.metadata?.title,
            category: d.metadata?.category || d.type,
            date: d.created_at,
            content: d.content,
            report: d.report
        }))
    };
}
