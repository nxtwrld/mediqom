/**
 * Supabase Realtime invalidation for the cache.
 *
 * Subscribes to Postgres Changes on:
 *  - profiles_links (parent_id = userId) → invalidate profile cache + reload
 *  - documents (all; RLS filters to user's documents) → invalidate doc cache + reload
 *
 * Requires both tables to be in the supabase_realtime publication.
 */

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { invalidateCache, invalidateCachePattern } from './index';

let channel: RealtimeChannel | null = null;

export function startRealtimeSync(supabase: SupabaseClient, userId: string): void {
	stopRealtimeSync();

	channel = supabase
		.channel(`cache-sync:${userId}`)
		.on(
			'postgres_changes',
			{
				event: '*',
				schema: 'public',
				table: 'profiles_links',
				filter: `parent_id=eq.${userId}`
			},
			() => {
				invalidateCachePattern('profiles:');
				// Lazy import to avoid circular dependency (realtime → profiles → cache)
				import('$lib/profiles').then(({ loadProfiles }) => loadProfiles(true)).catch(() => {});
			}
		)
		.on(
			'postgres_changes',
			{ event: '*', schema: 'public', table: 'documents' },
			(payload) => {
				const profileId =
					(payload.new as Record<string, unknown>)?.user_id ||
					(payload.old as Record<string, unknown>)?.user_id;
				if (typeof profileId === 'string') {
					invalidateCache(`documents:${profileId}`);
					// Lazy import to avoid circular dependency
					import('$lib/profiles').then(({ loadProfileDocuments, invalidateProfileDocuments }) => {
						invalidateProfileDocuments(profileId);
						loadProfileDocuments(profileId);
					}).catch(() => {});
				}
			}
		)
		.subscribe((status) => {
			if (status === 'CHANNEL_ERROR') {
				console.warn('[Cache Realtime] Channel error — realtime sync inactive');
			}
		});
}

export function stopRealtimeSync(): void {
	if (channel) {
		channel.unsubscribe();
		channel = null;
	}
}
