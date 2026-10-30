<!-- src/routes/+page.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms'
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import type { ActionData, SubmitFunction } from './$types.js'
	import { isNativePlatform } from '$lib/config/platform';
	import { signInWithMagicLink } from '$lib/capacitor/auth';
	import { apiFetch } from '$lib/api/client';
	import { keyboardScroll } from '$lib/capacitor/keyboard-scroll';
	import { t } from '$lib/i18n';

	interface Props {
		form: ActionData;
	}

	let { form = $bindable() }: Props = $props();

	let loading: boolean = $state(false);
	let submitted: boolean = $state(false);
	let email: string = $state('');
	let submittedEmail: string = $state('');
	let errorMessage: string = $state('');
	let successMessage: string = $state('');

	// Check if running on mobile platform
	const isMobile = browser && isNativePlatform();

	// Invite code redemption (new-user registration — the only self-service
	// path that can create an account)
	let inviteCode: string = $state($page.url.searchParams.get('invite') ?? '');
	let inviteEmail: string = $state('');
	let inviteLoading: boolean = $state(false);
	let inviteResult: { type: 'success' | 'error'; text: string } | null = $state(null);

	// Only one of the three forms is shown at a time; an ?invite= link opens the invite tab
	type Mode = 'signin' | 'invite' | 'waitlist';
	let mode: Mode = $state(inviteCode ? 'invite' : 'signin');
	const tabs: { mode: Mode; label: string }[] = [
		{ mode: 'signin', label: 'app.auth.tabs.sign-in' },
		{ mode: 'invite', label: 'app.auth.tabs.invite' },
		{ mode: 'waitlist', label: 'app.auth.tabs.waitlist' }
	];

	async function submitInvite(event: Event) {
		event.preventDefault();
		if (inviteLoading) return;

		if (!inviteCode.trim()) {
			inviteResult = { type: 'error', text: $t('app.auth.invite.code-required') };
			return;
		}
		if (!inviteEmail || !inviteEmail.includes('@')) {
			inviteResult = { type: 'error', text: $t('app.auth.invalid-email') };
			return;
		}

		inviteLoading = true;
		inviteResult = null;

		try {
			const response = await apiFetch('/v1/invite/redeem', {
				method: 'POST',
				body: JSON.stringify({ code: inviteCode.trim(), email: inviteEmail })
			});
			const result = await response.json();

			if (response.ok && result.success) {
				inviteResult = { type: 'success', text: result.message };
			} else {
				inviteResult = { type: 'error', text: result.message || $t('app.auth.unexpected-error') };
			}
		} catch (err) {
			console.error('[Auth Form] Invite redeem error:', err);
			inviteResult = { type: 'error', text: $t('app.auth.unexpected-error') };
		} finally {
			inviteLoading = false;
		}
	}

	// Waiting list (no invite code yet)
	let waitlistEmail: string = $state('');
	let waitlistLoading: boolean = $state(false);
	let waitlistResult: { type: 'success' | 'error'; text: string } | null = $state(null);

	async function submitWaitlist(event: Event) {
		event.preventDefault();
		if (waitlistLoading) return;

		if (!waitlistEmail || !waitlistEmail.includes('@')) {
			waitlistResult = { type: 'error', text: $t('app.auth.invalid-email') };
			return;
		}

		waitlistLoading = true;
		waitlistResult = null;

		try {
			const response = await apiFetch('/v1/waitlist/join', {
				method: 'POST',
				body: JSON.stringify({ email: waitlistEmail })
			});
			const result = await response.json();

			if (response.ok && result.success) {
				waitlistResult = { type: 'success', text: $t('app.auth.waitlist.joined') };
			} else {
				waitlistResult = { type: 'error', text: result.message || $t('app.auth.unexpected-error') };
			}
		} catch (err) {
			console.error('[Auth Form] Waitlist join error:', err);
			waitlistResult = { type: 'error', text: $t('app.auth.unexpected-error') };
		} finally {
			waitlistLoading = false;
		}
	}

	/**
	 * Handle mobile form submission (client-side auth)
	 */
	async function handleMobileSubmit(event: Event) {
		event.preventDefault();

		if (loading || submitted) return;

		// Validate email
		if (!email || !email.includes('@')) {
			errorMessage = $t('app.auth.invalid-email');
			return;
		}

		loading = true;
		errorMessage = '';

		console.log('[Auth Form] Mobile submit:', email);

		try {
			const { error } = await signInWithMagicLink(email);

			if (error) {
				console.error('[Auth Form] Mobile auth error:', error);
				errorMessage = error.message || $t('app.auth.magic-link-failed');
				loading = false;
				return;
			}

			submitted = true;
			submittedEmail = email;
			successMessage = $t('app.auth.magic-link-sent');
			loading = false;
		} catch (err) {
			console.error('[Auth Form] Mobile auth exception:', err);
			errorMessage = $t('app.auth.unexpected-error');
			loading = false;
		}
	}

	/**
	 * Handle web form submission (server-side form action)
	 */
	const handleWebSubmit: SubmitFunction = ({ formData, cancel }) => {
		console.log('[Auth Form] Submit attempt - loading:', loading, 'submitted:', submitted);

		// Prevent multiple submissions
		if (loading || submitted) {
			console.log('[Auth Form] Blocking duplicate submission');
			cancel(); // This actually prevents the submission
			return;
		}

		submittedEmail = formData.get('email') as string;
		loading = true;
		submitted = true;

		console.log('[Auth Form] Submitting email:', formData.get('email'));

		return async ({ result, update }) => {
			console.log('[Auth Form] Form result:', result);

			await update();

			loading = false;

			// Only reset submitted state if there was an error
			if (result.type === 'failure') {
				submitted = false;
				console.log('[Auth Form] Resetting submitted state due to error');
			} else {
				console.log('[Auth Form] Keeping submitted state - success');
			}
		}
	}

	function resetForm() {
		form = null;
		submitted = false;
		loading = false;
		errorMessage = '';
		successMessage = '';
	}
</script>

<svelte:head>
	<title>{$t('app.auth.title')}</title>
</svelte:head>

<div class="auth-page" use:keyboardScroll>
<div class="modal auth-card">
	<img src="/icon.svg" loading="lazy" alt="Mediqom app" class="logo" />
	<h1 class="h1">{$t('app.auth.title')}</h1>

	<nav class="tab-heads" role="tablist" aria-label={$t('app.auth.tabs.label')}>
		{#each tabs as tab}
		<button
			type="button"
			role="tab"
			aria-selected={mode === tab.mode}
			class:-active={mode === tab.mode}
			onclick={() => (mode = tab.mode)}
		>{$t(tab.label)}</button>
		{/each}
	</nav>

{#if mode === 'signin'}
{#if isMobile}
	<!-- Mobile: Client-side form submission -->
	<form class="flex -column form" onsubmit={handleMobileSubmit}>
		{#if submitted && successMessage}
		<div class="success">
			<p class="form-instructions -success">{successMessage}</p>
			<p class="form-instructions">{$t('app.auth.email-sent-to')} <strong>{email}</strong></p>
			<div class="form-actions">
				<button class="button -block" type="button" onclick={resetForm}>{$t('app.auth.send-again')}</button>
			</div>
		</div>
		{:else}
			<p class="form-instructions">{$t('app.auth.magic-link-instruction')}</p>

			{#if errorMessage}
			<div class="fail">
				<p class="form-instructions -error">{errorMessage}</p>
			</div>
			{/if}

			<div class="input">
				<label for="email">{$t('app.auth.email-label')}</label>
				<input
					id="email"
					name="email"
					class="inputField"
					type="email"
					autocomplete="email"
					placeholder={$t('app.auth.email-placeholder')}
					bind:value={email}
					disabled={loading}
				/>
			</div>
			<div class="form-actions">
				<button class="button -primary -block" disabled={loading || submitted} type="submit">
					{ loading ? $t('app.auth.sending') : submitted ? $t('app.auth.email-sent') : $t('app.auth.send-magic-link') }
				</button>
			</div>
		{/if}
	</form>
{:else}
	<!-- Web: Server-side form action -->
	<form class="flex -column form" method="POST" use:enhance={handleWebSubmit} onsubmit={(e) => {
		if (loading || submitted) {
			console.log('[Auth Form] Preventing form submit via event listener');
			e.preventDefault();
			return false;
		}
	}}>
		{#if form?.success}
		<div class="success">
			<p class="form-instructions -success">{form?.message}</p>
			<p class="form-instructions">{$t('app.auth.email-sent-to')} <strong>{form?.email}</strong></p>
			<div class="form-actions">
				<button class="button -block" type="button" onclick={resetForm}>{$t('app.auth.send-again')}</button>
			</div>
		</div>
		{:else}
			<p class="form-instructions">{$t('app.auth.magic-link-instruction')}</p>

			{#if form?.message !== undefined}
			<div class="{form?.success ? '' : 'fail'}">
				<p class="form-instructions -error">{form?.message}</p>
				<div class="beta-notice">
					<h3>{$t('app.auth.new-here-title')}</h3>
					<p>{$t('app.auth.new-here-message')}</p>
					<div class="beta-notice-actions">
						<button class="button" type="button" onclick={() => (mode = 'invite')}>{$t('app.auth.invite.title')}</button>
						<button class="button" type="button" onclick={() => (mode = 'waitlist')}>{$t('app.auth.waitlist.title')}</button>
					</div>
				</div>
			</div>
			{/if}

			<!-- Hidden field to pass redirect path -->
			<input type="hidden" name="redirectPath" value="/med" />

			<div class="input">
				<label for="email">{$t('app.auth.email-label')}</label>
				<input
					id="email"
					name="email"
					class="inputField"
					type="email"
					placeholder={$t('app.auth.email-placeholder')}
					value={form?.email ?? submittedEmail}
					disabled={loading}
				/>
			</div>
			{#if form?.errors?.email}
			<span class="flex items-center text-sm error">
				{form?.errors?.email}
			</span>
			{/if}
			<div class="form-actions">
				<button class="button -primary -block" disabled={loading || submitted} type="submit">
					{ loading ? $t('app.auth.sending') : submitted ? $t('app.auth.email-sent') : $t('app.auth.send-magic-link') }
				</button>
			</div>
		{/if}
	</form>
{/if}
{:else if mode === 'invite'}
	<form class="flex -column form" onsubmit={submitInvite}>
		<p class="form-instructions">{$t('app.auth.invite.instruction')}</p>

		{#if inviteResult}
		<p class="form-instructions {inviteResult.type === 'success' ? '-success' : '-error'}">{inviteResult.text}</p>
		{/if}

		{#if !inviteResult || inviteResult.type !== 'success'}
		<div class="input">
			<label for="invite-code">{$t('app.auth.invite.code-label')}</label>
			<input
				id="invite-code"
				name="invite-code"
				class="inputField"
				type="text"
				placeholder={$t('app.auth.invite.code-placeholder')}
				bind:value={inviteCode}
				disabled={inviteLoading}
			/>
		</div>
		<div class="input">
			<label for="invite-email">{$t('app.auth.email-label')}</label>
			<input
				id="invite-email"
				name="invite-email"
				class="inputField"
				type="email"
				placeholder={$t('app.auth.email-placeholder')}
				bind:value={inviteEmail}
				disabled={inviteLoading}
			/>
		</div>
		<div class="form-actions">
			<button class="button -primary -block" disabled={inviteLoading} type="submit">
				{ inviteLoading ? $t('app.auth.sending') : $t('app.auth.invite.submit') }
			</button>
		</div>
		{/if}
	</form>
{:else}
	<form class="flex -column form" onsubmit={submitWaitlist}>
		<p class="form-instructions">{$t('app.auth.waitlist.instruction')}</p>

		{#if waitlistResult}
		<p class="form-instructions {waitlistResult.type === 'success' ? '-success' : '-error'}">{waitlistResult.text}</p>
		{/if}

		{#if !waitlistResult || waitlistResult.type !== 'success'}
		<div class="input">
			<label for="waitlist-email">{$t('app.auth.email-label')}</label>
			<input
				id="waitlist-email"
				name="waitlist-email"
				class="inputField"
				type="email"
				placeholder={$t('app.auth.email-placeholder')}
				bind:value={waitlistEmail}
				disabled={waitlistLoading}
			/>
		</div>
		<div class="form-actions">
			<button class="button -primary -block" disabled={waitlistLoading} type="submit">
				{ waitlistLoading ? $t('app.auth.sending') : $t('app.auth.waitlist.submit') }
			</button>
		</div>
		{/if}
	</form>
{/if}
</div>
</div>


<style>

	.auth-page {
		padding-top: var(--safe-area-top);
		padding-bottom: var(--safe-area-bottom);
		padding-left: var(--safe-area-left);
		padding-right: var(--safe-area-right);
		min-height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
	}

	.auth-card {
		width: 100%;
		max-width: 56rem;
		display: flex;
		flex-direction: column;
		gap: var(--ui-pad-medium);
	}

	.auth-card .tab-heads > button {
		font-size: inherit;
	}

	.logo {
		width: 12.8rem;
		margin: 0 auto;
		display: block;
	}
	.beta-notice {
		background-color: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--ui-radius-medium);
		padding: var(--ui-pad-large);
		margin-top: var(--ui-pad-medium);
	}

	.beta-notice h3 {
		margin-top: 0;
		margin-bottom: var(--ui-pad-medium);
		font-size: 1.8rem;
	}

	.beta-notice p {
		margin-bottom: var(--ui-pad-small);
		color: var(--color-text-secondary);
	}

	.beta-notice-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--ui-pad-small);
	}

	@media (max-width: 768px) {
		.auth-card {
			min-width: 0;
			max-height: none;
			padding: var(--ui-pad-large) var(--ui-pad-medium);
			border-radius: var(--radius-16);
		}

		.logo {
			width: 6.4rem;
		}

		.auth-card input {
			font-size: 16px;
		}
	}

</style>
