import { writable, derived } from 'svelte/store';

export type ThemePreference = 'system' | 'light' | 'dark';
export type EffectiveTheme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

function getStoredPreference(): ThemePreference {
	if (typeof localStorage === 'undefined') return 'system';
	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored === 'light' || stored === 'dark') return stored;
	return 'system';
}

function getOsDark(): boolean {
	if (typeof window === 'undefined') return false;
	return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme(effective: EffectiveTheme) {
	if (typeof document !== 'undefined') {
		document.documentElement.setAttribute('data-theme', effective);
	}
}

/** User's explicit preference: 'system', 'light', or 'dark' */
export const themePreference = writable<ThemePreference>(getStoredPreference());

/** Tracks OS dark mode when preference is 'system' */
const osDark = writable<boolean>(getOsDark());

/** The resolved theme actually applied to the page */
export const theme = derived<[typeof themePreference, typeof osDark], EffectiveTheme>(
	[themePreference, osDark],
	([$pref, $osDark]) => {
		if ($pref === 'system') return $osDark ? 'dark' : 'light';
		return $pref;
	}
);

// Side-effects: persist + apply
let initialized = false;

export function initTheme() {
	if (initialized) return;
	initialized = true;

	// Listen for OS dark mode changes
	if (typeof window !== 'undefined') {
		const mq = window.matchMedia('(prefers-color-scheme: dark)');
		const handler = (e: MediaQueryListEvent) => osDark.set(e.matches);
		mq.addEventListener('change', handler);
	}

	// Persist preference and apply theme on every change
	themePreference.subscribe(($pref) => {
		if (typeof localStorage !== 'undefined') {
			if ($pref === 'system') {
				localStorage.removeItem(STORAGE_KEY);
			} else {
				localStorage.setItem(STORAGE_KEY, $pref);
			}
		}
	});

	theme.subscribe(($theme) => {
		applyTheme($theme);
	});
}

/** Cycle through: system → light → dark → system */
export function toggleTheme() {
	themePreference.update(($pref) => {
		if ($pref === 'system') return 'light';
		if ($pref === 'light') return 'dark';
		return 'system';
	});
}
