<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { onMount } from 'svelte';
	import '../css/app.css';
	import '../css/index.css';
	import { isNativePlatform, isCapacitorBuild } from '$lib/config/platform';
	import { session as CurrentSession } from '$lib/user';

	let { data, children } = $props();

	// Break reactive loop: use $derived.by to avoid self-reference
	let session = $derived(data?.session || null);
	let supabase = $derived(data?.supabase);

	onMount(() => {
		const currentSupabase = data?.supabase;
		if (!currentSupabase) return;

		const isMobile = isNativePlatform() || isCapacitorBuild();

		// Initialize mobile auth (deep link listeners, cold start handling)
		if (isMobile) {
			import('$lib/capacitor/auth').then(({ initMobileAuth }) => {
				initMobileAuth();
			});
		}

		let lastUserId: string | null = data?.session?.user?.id || null;
		let invalidateScheduled = false;

		const authListener = currentSupabase.auth.onAuthStateChange((event, sessionData) => {
			const newUserId = sessionData?.user?.id || null;

			if (isMobile) {
				// Mobile: update session store directly, never call invalidate
				// (invalidate triggers __data.json fetch which fails in static SPA)
				if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
					if (sessionData) {
						CurrentSession.set(sessionData);
					}
				} else if (event === 'SIGNED_OUT') {
					CurrentSession.set(null);
				}
			} else {
				// Web: only invalidate when the user logs out (transition from some id to null)
				const didLogout = lastUserId !== null && newUserId === null;

				if (didLogout && !invalidateScheduled) {
					invalidateScheduled = true;
					queueMicrotask(() => {
						invalidate('supabase:auth');
						invalidateScheduled = false;
					});
				}
			}

			// Update last seen user id
			lastUserId = newUserId;
		});

		return () => authListener.data.subscription.unsubscribe();
	});
</script>

{@render children()}
