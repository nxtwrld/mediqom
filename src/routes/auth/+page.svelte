<!-- src/routes/+page.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms'
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import type { ActionData, SubmitFunction } from './$types.js'
	import { isNativePlatform } from '$lib/config/platform';
	import { signInWithMagicLink } from '$lib/capacitor/auth';
	import { apiFetch } from '$lib/api/client';
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

<div class="auth-page">
{#if isMobile}
	<!-- Mobile: Client-side form submission -->
	<form class="flex -column form modal" onsubmit={handleMobileSubmit}>
		<img src="/icon.svg" loading="lazy" alt="Mediqom app" class="logo" />

		<h1 class="h1">{$t('app.auth.title')}</h1>
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
	<form class="flex -column form modal" method="POST" use:enhance={handleWebSubmit} onsubmit={(e) => {
		if (loading || submitted) {
			console.log('[Auth Form] Preventing form submit via event listener');
			e.preventDefault();
			return false;
		}
	}}>
		<img src="/icon.svg" loading="lazy" alt="Mediqom app" class="logo" />

		<h1 class="h1">{$t('app.auth.title')}</h1>
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

<div class="auth-secondary">
	<div class="divider"><span>{$t('app.auth.or')}</span></div>

	<form class="flex -column form modal" onsubmit={submitInvite}>
		<h2 class="h2">{$t('app.auth.invite.title')}</h2>
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

	<div class="divider"><span>{$t('app.auth.or')}</span></div>

	<form class="flex -column form modal" onsubmit={submitWaitlist}>
		<h2 class="h2">{$t('app.auth.waitlist.title')}</h2>
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
			<button class="button -block" disabled={waitlistLoading} type="submit">
				{ waitlistLoading ? $t('app.auth.sending') : $t('app.auth.waitlist.submit') }
			</button>
		</div>
		{/if}
	</form>
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

	.auth-secondary {
		width: 100%;
	}

	.divider {
		display: flex;
		align-items: center;
		text-align: center;
		color: var(--color-text-secondary);
		margin: var(--ui-pad-large) 0;
	}

	.divider::before,
	.divider::after {
		content: '';
		flex: 1;
		border-top: 1px solid var(--color-border);
	}

	.divider span {
		padding: 0 var(--ui-pad-medium);
	}

	.logo {
		width: 8rem;
		margin: 0 auto;
		display: block;
	}
	.beta-notice {
		background-color: #f8f9fa;
		border: 1px solid #dee2e6;
		border-radius: 8px;
		padding: 1.5rem;
		margin-top: 1rem;
	}

	.beta-notice h3 {
		margin-top: 0;
		margin-bottom: 1rem;
		color: #495057;
		font-size: 1.125rem;
	}

	.beta-notice p {
		margin-bottom: 0.5rem;
		color: #6c757d;
	}


</style>