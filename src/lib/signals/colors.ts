/**
 * Deterministic signal-to-color mapping.
 * Same signal name → same color everywhere (timeline, signal rows, etc.).
 */

/** 30 hex values matching --color-categ2-1 … --color-categ2-30 in core.css */
export const SIGNAL_PALETTE: string[] = [
    '#d98a8a', '#d99e8a', '#d9b28a', '#d9c68a', '#d5d98a',
    '#c1d98a', '#add98a', '#99d98a', '#8ad98f', '#8ad9a3',
    '#8ad9b7', '#8ad9cb', '#8ad5d9', '#8ac1d9', '#8aadd9',
    '#8a99d9', '#8f8ad9', '#a38ad9', '#b78ad9', '#cb8ad9',
    '#d98ad5', '#d98ac1', '#d98aad', '#d98a99', '#c47070',
    '#70a8c4', '#70c488', '#c4a870', '#a870c4', '#70c4b8',
];

/** djb2 hash → 0-based index into SIGNAL_PALETTE */
export function hashSignalName(name: string): number {
    let hash = 5381;
    for (let i = 0; i < name.length; i++) {
        hash = ((hash << 5) + hash + name.charCodeAt(i)) | 0;
    }
    return ((hash % SIGNAL_PALETTE.length) + SIGNAL_PALETTE.length) % SIGNAL_PALETTE.length;
}

/** Hex color string for D3/SVG attribute use */
export function getSignalColor(name: string): string {
    return SIGNAL_PALETTE[hashSignalName(name)];
}

/** CSS variable reference for style/class use */
export function getSignalColorVar(name: string): string {
    return `var(--color-categ2-${hashSignalName(name) + 1})`;
}

/** 1-based index into the palette */
export function getSignalColorIndex(name: string): number {
    return hashSignalName(name) + 1;
}
