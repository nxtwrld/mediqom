/**
 * Universal Cache — public API.
 *
 * Two storage tiers:
 *  - Memory (both platforms): module-level Map, lives for the browser session.
 *  - Preferences (mobile only): Capacitor Preferences → OS-encrypted storage.
 *
 * Key conventions:
 *   profiles:list:{userId}       basic profile list
 *   profiles:enrich:{profileId}  enriched profile (vcard/health/insurance)
 *   documents:{profileId}        document list for one profile
 */

import {
	getMemory,
	getMemoryEntry,
	setMemory,
	invalidateMemory,
	invalidateMemoryPattern,
	clearMemory
} from './memory';
import { persistCache, restoreCache, clearPersisted } from './mobile';
import { isCapacitorBuild } from '$lib/config/platform';

const DEFAULT_TTL = 10 * 60 * 1000; // 10 minutes

const isOnline = () => (typeof navigator !== 'undefined' ? navigator.onLine : true);

/** Currently authenticated user ID — needed for Preferences namespacing. */
let _userId: string | null = null;

/**
 * Stale-while-revalidate cache wrapper.
 *
 * - Cache hit within TTL → returns cached data immediately (no background fetch).
 * - Cache hit beyond TTL → returns cached data immediately + background re-fetch.
 * - Cache miss → awaits fresh fetch, caches result, returns it.
 *
 * The `processFn` receives the raw Response and must return the final (possibly
 * decrypted) data. Side effects inside processFn (e.g. updating Svelte stores)
 * run on every fetch, including background refreshes.
 */
export async function fetchCached<T>(
	key: string,
	fetchFn: () => Promise<Response>,
	processFn: (r: Response) => Promise<T>,
	options?: { ttl?: number }
): Promise<T | null> {
	const ttl = options?.ttl ?? DEFAULT_TTL;

	const refresh = async (): Promise<T> => {
		const response = await fetchFn();
		const data = await processFn(response);
		setMemory(key, data);
		if (_userId && isCapacitorBuild()) {
			persistCache(_userId, key, data).catch(() => {});
		}
		return data;
	};

	const entry = getMemoryEntry(key);
	if (entry !== null) {
		if (isOnline()) {
			// Online: always trigger background refresh (stale-while-revalidate with effective TTL=0)
			refresh().catch((e) => console.warn('[Cache] Background refresh failed for', key, e));
		}
		// Online or offline: return cached data immediately
		return entry.data as T;
	}

	// No cache entry
	if (!isOnline()) return null; // Offline with no cache — can't fetch

	// Online — await fresh data.
	try {
		return await refresh();
	} catch (e) {
		console.error('[Cache] Failed to fetch', key, e);
		return null;
	}
}

export function getCache<T>(key: string): T | null {
	return getMemory<T>(key);
}

export function setCache<T>(key: string, data: T): void {
	setMemory(key, data);
	if (_userId && isCapacitorBuild()) {
		persistCache(_userId, key, data).catch(() => {});
	}
}

export function invalidateCache(key: string): void {
	invalidateMemory(key);
}

export function invalidateCachePattern(prefix: string): void {
	invalidateMemoryPattern(prefix);
}

/**
 * Called after login.
 * On mobile: restores all persisted cache entries for this user into memory.
 * On web: sets the userId for future Preferences writes (which are no-ops on web).
 */
export async function initCache(userId: string): Promise<void> {
	_userId = userId;
	await restoreCache(userId);
}

/**
 * Called on logout.
 * Wipes the in-memory store and removes all Preferences entries for this user.
 */
export async function clearCache(userId: string): Promise<void> {
	_userId = null;
	clearMemory();
	await clearPersisted(userId);
}
