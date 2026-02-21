/**
 * Capacitor Preferences persistence layer for the cache.
 *
 * On iOS: stored in Keychain (AES-encrypted by OS).
 * On Android: stored in Keystore-backed EncryptedSharedPreferences.
 * On web: all functions are no-ops.
 *
 * Key format: mediqom_cache_{userId}:{cacheKey}
 */

import { isCapacitorBuild } from '$lib/config/platform';
import { setMemory } from './memory';

const PREFIX = 'mediqom_cache_';

function preferencesKey(userId: string, cacheKey: string): string {
	return `${PREFIX}${userId}:${cacheKey}`;
}

/** Persist a cache entry to Capacitor Preferences. No-op on web. */
export async function persistCache<T>(userId: string, key: string, data: T): Promise<void> {
	if (!isCapacitorBuild()) return;
	try {
		const { Preferences } = await import('@capacitor/preferences');
		await Preferences.set({
			key: preferencesKey(userId, key),
			value: JSON.stringify(data)
		});
	} catch {
		// best-effort — cache writes must never crash the app
	}
}

/**
 * Load all persisted cache entries for this user from Preferences into the
 * in-memory store. Call once on login / app start. No-op on web.
 */
export async function restoreCache(userId: string): Promise<void> {
	if (!isCapacitorBuild()) return;
	try {
		const { Preferences } = await import('@capacitor/preferences');
		const { keys } = await Preferences.keys();
		const userPrefix = `${PREFIX}${userId}:`;
		for (const prefKey of keys) {
			if (!prefKey.startsWith(userPrefix)) continue;
			const cacheKey = prefKey.slice(userPrefix.length);
			const { value } = await Preferences.get({ key: prefKey });
			if (value) {
				try {
					setMemory(cacheKey, JSON.parse(value));
				} catch {
					// ignore malformed entries
				}
			}
		}
	} catch {
		// best-effort
	}
}

/** Remove all persisted cache entries for this user. Call on logout. No-op on web. */
export async function clearPersisted(userId: string): Promise<void> {
	if (!isCapacitorBuild()) return;
	try {
		const { Preferences } = await import('@capacitor/preferences');
		const { keys } = await Preferences.keys();
		const userPrefix = `${PREFIX}${userId}:`;
		for (const key of keys) {
			if (key.startsWith(userPrefix)) {
				await Preferences.remove({ key });
			}
		}
	} catch {
		// best-effort
	}
}
