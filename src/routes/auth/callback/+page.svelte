<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { getClient } from '$lib/supabase';
	import { session as CurrentSession } from '$lib/user';
	import { t } from '$lib/i18n';

	let status = $state('Processing authentication...');
	let error = $state('');

	onMount(async () => {
		try {
			const hash = window.location.hash.substring(1);
			const search = window.location.search;
			const hashParams = new URLSearchParams(hash);
			const searchParams = new URLSearchParams(search);

			const accessToken = hashParams.get('access_token') || searchParams.get('access_token');
			const refreshToken = hashParams.get('refresh_token') || searchParams.get('refresh_token');
			const tokenHash = searchParams.get('token_hash');
			const otpType = searchParams.get('type') as 'email' | 'magiclink' | 'email_change' | null;
			const code = searchParams.get('code');

			const supabase = getClient();

			if (accessToken && refreshToken) {
				status = $t('app.auth.setting-up-session');
				const { data, error: sessionError } = await supabase.auth.setSession({
					access_token: accessToken,
					refresh_token: refreshToken,
				});

				if (sessionError) {
					error = sessionError.message;
					return;
				}

				if (data.session) {
					CurrentSession.set(data.session);
					goto('/med');
					return;
				}
			} else if (tokenHash) {
				status = $t('app.auth.setting-up-session');
				const { data, error: otpError } = await supabase.auth.verifyOtp({
					token_hash: tokenHash,
					type: otpType ?? 'email',
				});

				if (otpError) {
					error = otpError.message;
					return;
				}

				if (data.session) {
					CurrentSession.set(data.session);
					goto('/med');
					return;
				}
			} else if (code) {
				status = $t('app.auth.exchanging-code');
				const { data, error: codeError } = await supabase.auth.exchangeCodeForSession(code);

				if (codeError) {
					error = codeError.message;
					return;
				}

				if (data.session) {
					CurrentSession.set(data.session);
					goto('/med');
					return;
				}
			} else {
				error = $t('app.auth.no-auth-params');
			}
		} catch (e) {
			error = e instanceof Error ? e.message : $t('app.auth.unexpected-error');
		}
	});
</script>

<div class="auth-callback">
	{#if error}
		<h2>{$t('app.auth.auth-failed')}</h2>
		<p>{error}</p>
		<a href="/auth">{$t('app.auth.try-again')}</a>
	{:else}
		<p>{status}</p>
	{/if}
</div>

<style>
	.auth-callback {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		padding: 2rem;
		text-align: center;
	}

	h2 {
		color: var(--color-error, #e53e3e);
		margin-bottom: 1rem;
	}

	a {
		margin-top: 1rem;
		color: var(--color-primary, #3182ce);
	}
</style>
