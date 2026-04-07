/**
 * Context management for the 3D anatomy viewer.
 *
 * Contexts activate specific layers and animations (e.g. Immunity visualization).
 */
import type { IContext } from './context/types.d';
import type { SceneState } from './scene-state';
import contexts from './context/index';

interface ContextResult {
    currentContext: IContext | null;
    activeLayers: string[];
}

/**
 * Activates a context — sets layers, starts animations, and assigns info component.
 *
 * Returns the new currentContext and activeLayers so Body.svelte can assign them
 * (preserving Svelte reactivity).
 */
export function setContext(
    state: SceneState,
    context: string | IContext,
    currentContext: IContext | null,
    activeLayers: string[],
    originalLayers: { layers: string[] | null }
): ContextResult {
    // Clear existing context first
    const cleared = clearContext(state, currentContext, activeLayers, originalLayers);
    let newActiveLayers = cleared.activeLayers;

    if (!context) {
        return { currentContext: null, activeLayers: newActiveLayers };
    }
    if (typeof context === 'string' && !(contexts as any)[context]) {
        return { currentContext: null, activeLayers: newActiveLayers };
    }

    const contextToRun = typeof context === 'string' ? (contexts as any)[context] : context;
    const storeState: boolean = currentContext == null;

    const newContext: IContext = {
        name: contextToRun.name
    };

    if (contextToRun.layers) {
        if (storeState) originalLayers.layers = newActiveLayers;
        newActiveLayers = contextToRun.layers;
    }

    if (contextToRun.animation) {
        newContext.animation = new contextToRun.animation(state.scene);
        state.requestRender();
    }

    if (contextToRun.info) {
        newContext.info = contextToRun.info;
    }

    return { currentContext: newContext, activeLayers: newActiveLayers };
}

/**
 * Clears the active context — destroys animations and restores original layers.
 *
 * Returns the updated activeLayers.
 */
export function clearContext(
    state: SceneState,
    currentContext: IContext | null,
    activeLayers: string[],
    originalLayers: { layers: string[] | null }
): ContextResult {
    if (currentContext) {
        if (currentContext.animation) {
            currentContext.animation.destroy();
        }
    }

    let newActiveLayers = activeLayers;
    if (originalLayers.layers) {
        newActiveLayers = originalLayers.layers;
        originalLayers.layers = null;
    }

    return { currentContext: null, activeLayers: newActiveLayers };
}
