/**
 * In-memory cache store (module-level Map).
 * Survives SvelteKit navigation; cleared on logout.
 * Works on both web and mobile — no persistence.
 */

interface CacheEntry {
	data: unknown;
	fetchedAt: number;
}

const store = new Map<string, CacheEntry>();

export function getMemory<T>(key: string): T | null {
	const entry = store.get(key);
	return entry ? (entry.data as T) : null;
}

/** Returns the raw entry (with fetchedAt) for TTL checks. */
export function getMemoryEntry(key: string): CacheEntry | null {
	return store.get(key) ?? null;
}

export function setMemory<T>(key: string, data: T): void {
	store.set(key, { data, fetchedAt: Date.now() });
}

/** Sets data without updating fetchedAt — entry is immediately stale. */
export function setMemoryStale<T>(key: string, data: T): void {
	store.set(key, { data, fetchedAt: 0 });
}

export function invalidateMemory(key: string): void {
	store.delete(key);
}

export function invalidateMemoryPattern(prefix: string): void {
	for (const key of store.keys()) {
		if (key.startsWith(prefix)) {
			store.delete(key);
		}
	}
}

export function clearMemory(): void {
	store.clear();
}

export function memoryKeys(): string[] {
	return [...store.keys()];
}
