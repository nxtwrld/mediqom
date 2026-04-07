<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';

	/** Only allow relative paths starting with `/` (prevent open redirects) */
	function sanitizeRedirect(value: string | null | undefined): string {
		if (!value) return '/med';
		if (!value.startsWith('/')) return '/med';
		if (value.startsWith('//')) return '/med';
		if (value.includes('://')) return '/med';
		return value;
	}

	let loading = true;
	let error = '';

	onMount(async () => {
		const code = $page.url.searchParams.get('code');
		const next = sanitizeRedirect($page.url.searchParams.get('next'));

		if (!code) {
			error = $t('app.auth.no-auth-code');
			loading = false;
			return;
		}
		
		try {
			// Check if we already have a session (this is safe during auth flow)
			// Note: We use getUser() for validation instead of relying on session cookies
			const { data: validUser, error: userError } = await $page.data.supabase.auth.getUser();

			if (validUser.user && !userError) {
				await invalidateAll();
				goto(next, { replaceState: true });
				return;
			}
			
			// Try exchangeCodeForSession if available (newer versions)
			if (typeof $page.data.supabase.auth.exchangeCodeForSession === 'function') {
				const { data, error: exchangeError } = await $page.data.supabase.auth.exchangeCodeForSession(code);
				
				if (exchangeError) {
					error = exchangeError.message;
					loading = false;
					return;
				}
				
				if (data.session) {
					await invalidateAll();
					goto(next, { replaceState: true });
					return;
				}
			}
			
			// For older versions, the session might be set asynchronously
			let attempts = 0;
			const maxAttempts = 10;
			
			while (attempts < maxAttempts) {
				await new Promise(resolve => setTimeout(resolve, 500));
				
				// Use getUser() for validated authentication check
				const { data: delayedUser, error: delayedError } = await $page.data.supabase.auth.getUser();

				if (delayedUser.user && !delayedError) {
					await invalidateAll();
					goto(next, { replaceState: true });
					return;
				}
				
				attempts++;
			}
			
			error = $t('app.auth.auth-timed-out');
			loading = false;

		} catch (err) {
			error = $t('app.auth.unexpected-error');
			loading = false;
		}
	});
</script>

<svelte:head>
	<title>{$t('app.auth.confirming-title')}</title>
</svelte:head>

{#if loading}
	<div class="confirmation-container">
		<div class="loading-spinner"></div>
		<h1>{$t('app.auth.confirming-authentication')}</h1>
		<p>{$t('app.auth.please-wait')}</p>
	</div>
{:else if error}
	<div class="confirmation-container error">
		<h1>{$t('app.auth.auth-failed')}</h1>
		<p>{error}</p>
		<a href="/auth" class="button">{$t('app.auth.try-again')}</a>
	</div>
{/if}

<style>
	.confirmation-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		padding: 2rem;
		text-align: center;
	}
	
	.loading-spinner {
		width: 3rem;
		height: 3rem;
		border: 3px solid #f3f3f3;
		border-top: 3px solid #3498db;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin-bottom: 1.5rem;
	}
	
	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}
	
	.error {
		color: #e74c3c;
	}
	
	.button {
		display: inline-block;
		padding: 0.75rem 1.5rem;
		background-color: #3498db;
		color: white;
		text-decoration: none;
		border-radius: 5px;
		margin-top: 1rem;
	}
	
	.button:hover {
		background-color: #2980b9;
	}
	
	h1 {
		margin-bottom: 1rem;
		font-size: 1.5rem;
	}
	
	p {
		margin-bottom: 0.5rem;
		color: #666;
	}
</style> 