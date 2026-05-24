import { writable } from 'svelte/store';

/** Current keyboard height in pixels (0 when hidden). Updated by Capacitor keyboard events. */
export const keyboardHeight = writable(0);
