<script lang="ts">
	import { t } from '$lib/i18n';
	import { locale } from 'svelte-i18n';
	import user from '$lib/user';
	import Select from '$components/forms/Select.svelte';

	// Read language from $user store
	let selectedLanguage = $state($user?.language || 'en');
	let saving = $state(false);
	let message = $state<{ type: 'success' | 'error'; text: string } | null>(null);

	const languageOptions = [
		{ key: 'en', value: 'English' },
		{ key: 'cs', value: 'Čeština' },
		{ key: 'de', value: 'Deutsch' }
	];

	async function saveLanguage() {
		saving = true;
		message = null;

		try {
			const response = await fetch('/v1/user/language', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ language: selectedLanguage })
			});

			const result = await response.json();

			if (result.success) {
				// Update locale immediately
				locale.set(selectedLanguage);
				message = { type: 'success', text: $t('app.settings.general.language.saved') };

				// Reload to sync store with database
				setTimeout(() => {
					window.location.reload();
				}, 500);
			} else {
				message = { type: 'error', text: result.error || 'Failed to update' };
			}
		} catch (error) {
			console.error('[Settings] Language update error:', error);
			message = { type: 'error', text: 'Network error' };
		} finally {
			saving = false;
		}
	}
</script>

<div class="settings-panel">
	<header>
		<h2 class="h2">{$t('app.settings.general.title')}</h2>
		<p class="description">{$t('app.settings.general.language.description')}</p>
	</header>

	<form class="form">
		<Select
			bind:value={selectedLanguage}
			options={languageOptions}
			label={$t('app.settings.general.language.current')}
		/>

		<div class="form-actions">
			<button class="button -primary" type="button" onclick={saveLanguage} disabled={saving}>
				{saving ? '...' : $t('app.settings.general.language.save')}
			</button>
		</div>
	</form>

	{#if message}
		<p class="message -{message.type}">{message.text}</p>
	{/if}
</div>

<style>
	.settings-panel {
		background: var(--color-surface);
		border-radius: var(--ui-radius-medium);
		padding: var(--ui-pad-large);
		border: 1px solid var(--color-border);
	}

	header {
		margin-bottom: var(--ui-pad-large);
	}

	.description {
		color: var(--color-text-secondary);
		margin-top: var(--ui-pad-small);
	}

	.message {
		margin-top: var(--ui-pad-medium);
		padding: var(--ui-pad-small) var(--ui-pad-medium);
		border-radius: var(--ui-radius-small);
		font-weight: 500;
	}

	.message.-success {
		background: var(--color-positive-light);
		color: var(--color-positive);
		border: 1px solid var(--color-positive);
	}

	.message.-error {
		background: var(--color-negative-light);
		color: var(--color-negative);
		border: 1px solid var(--color-negative);
	}

	@media (max-width: 768px) {
		.settings-panel {
			padding: var(--ui-pad-medium);
		}
	}
</style>
