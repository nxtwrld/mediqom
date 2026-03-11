/**
 * Image loading utility for mobile-compatible image fetching.
 *
 * On mobile (Capacitor), relative URLs resolve against `capacitor://localhost`
 * and native <img> elements don't send auth headers. This utility wraps
 * apiFetch to handle both platforms correctly.
 */

import { apiFetch } from './client';

/**
 * Fetch an image via apiFetch and return a blob URL for use in <img src={...}>.
 *
 * Works on both web (cookies) and mobile (Bearer token + absolute URL).
 * Callers are responsible for calling URL.revokeObjectURL() when done.
 *
 * @param url - API endpoint (e.g. '/v1/med/profiles/123/avatar?path=...')
 * @returns A blob URL string, or null on failure
 */
export async function imgSrc(url: string): Promise<string | null> {
	try {
		const response = await apiFetch(url);
		if (!response.ok) return null;
		const blob = await response.blob();
		return URL.createObjectURL(blob);
	} catch {
		return null;
	}
}
