<!-- src/routes/+page.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms'
	import { browser } from '$app/environment';
	import type { ActionData, SubmitFunction } from './$types.js'
	import { isNativePlatform } from '$lib/config/platform';
	import { signInWithMagicLink } from '$lib/capacitor/auth';
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
				{#if form?.message?.includes('Beta access required')}
					<div class="beta-notice">
						<h3>{$t('app.auth.beta-need-access')}</h3>
						<p>{$t('app.auth.beta-in-beta')}</p>
						<ol>
							<li>{$t('app.auth.beta-step-apply')} <a href="/www/en/beta">{$t('app.auth.beta-page')}</a></li>
							<li>{$t('app.auth.beta-step-wait')}</li>
							<li>{$t('app.auth.beta-step-check')}</li>
						</ol>
					</div>
				{:else if form?.message?.includes('application is under review')}
					<div class="beta-notice">
						<h3>{$t('app.auth.beta-under-review')}</h3>
						<p>{$t('app.auth.beta-review-message')}</p>
						<p>{$t('app.auth.beta-check-spam')}</p>
					</div>
				{:else if form?.message?.includes('application was not approved')}
					<div class="beta-notice">
						<h3>{$t('app.auth.beta-status')}</h3>
						<p>{$t('app.auth.beta-not-approved')} <a href="mailto:beta@mediqom.com">beta@mediqom.com</a>.</p>
					</div>
				{/if}
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
</div>


<style>

	.auth-page {
		padding-top: var(--safe-area-top);
		padding-bottom: var(--safe-area-bottom);
		padding-left: var(--safe-area-left);
		padding-right: var(--safe-area-right);
		min-height: 100%;
		display: flex;
		align-items: center;
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

	.beta-notice ol {
		margin: 0.5rem 0;
		padding-left: 1.5rem;
		color: #6c757d;
	}

	.beta-notice li {
		margin-bottom: 0.25rem;
	}

	.beta-notice a {
		color: #007bff;
		text-decoration: none;
	}

	.beta-notice a:hover {
		text-decoration: underline;
	}


</style>