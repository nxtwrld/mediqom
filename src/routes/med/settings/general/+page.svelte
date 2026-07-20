<script lang="ts">
	import { t } from '$lib/i18n';
	import { locale } from 'svelte-i18n';
	import user from '$lib/user';
	import Select from '$components/forms/Select.svelte';
	import SUPPORTED_LANGUAGES from '$lib/languages';
	import { apiFetch } from '$lib/api/client';
	import { themePreference, initTheme, type ThemePreference } from '$lib/theme/store';
	import { isFeatureEnabled } from '$lib/config/feature-flags';

	// Read language from $user store
	let selectedLanguage = $state($user?.language || 'en');
	let saving = $state(false);
	let message = $state<{ type: 'success' | 'error'; text: string } | null>(null);

	let selectedRole = $state(($user as any)?.role ?? 'individual');
	let savingRole = $state(false);
	let roleMessage = $state<{ type: 'success' | 'error'; text: string } | null>(null);

	const languageOptions = $derived(
		Object.entries(SUPPORTED_LANGUAGES).map(([code]) => ({
			key: code,
			value: $t('languages.' + code)
		}))
	);

	const roleOptions = $derived([
		{ key: 'individual', value: $t('app.settings.general.role.individual') },
		{ key: 'medical', value: $t('app.settings.general.role.medical') }
	]);

	// Theme
	initTheme();
	let selectedTheme = $state<ThemePreference>('system');
	const unsubTheme = themePreference.subscribe((v) => (selectedTheme = v));

	const themeOptions = $derived([
		{ key: 'system', value: $t('app.settings.general.appearance.system') },
		{ key: 'light', value: $t('app.settings.general.appearance.light') },
		{ key: 'dark', value: $t('app.settings.general.appearance.dark') }
	]);

	$effect(() => {
		themePreference.set(selectedTheme as ThemePreference);
	});

	// Care Plan: show certainty labels inline (user-level preference, row 18)
	let showCertaintyInline = $state(Boolean(($user as any)?.settings?.showCertaintyLabelsInline));
	let savingCertainty = $state(false);

	async function saveCertaintyInline() {
		savingCertainty = true;
		try {
			const response = await apiFetch('/v1/user/settings', {
				method: 'POST',
				body: JSON.stringify({ showCertaintyLabelsInline: showCertaintyInline })
			});
			const result = await response.json();
			if (result.success) {
				user.update((u) => (u ? { ...u, settings: result.settings } : u));
			} else {
				// Revert the toggle on failure
				showCertaintyInline = !showCertaintyInline;
			}
		} catch (error) {
			console.error('[Settings] Certainty preference error:', error);
			showCertaintyInline = !showCertaintyInline;
		} finally {
			savingCertainty = false;
		}
	}

	async function saveLanguage() {
		saving = true;
		message = null;

		try {
			const response = await apiFetch('/v1/user/language', {
				method: 'POST',
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
				message = { type: 'error', text: result.error || $t('app.settings.general.error.update-failed') };
			}
		} catch (error) {
			console.error('[Settings] Language update error:', error);
			message = { type: 'error', text: $t('app.settings.general.error.network') };
		} finally {
			saving = false;
		}
	}

	async function saveRole() {
		savingRole = true;
		roleMessage = null;

		try {
			const response = await apiFetch('/v1/user/language', {
				method: 'POST',
				body: JSON.stringify({ language: selectedLanguage, user_role: selectedRole })
			});

			const result = await response.json();

			if (result.success) {
				user.update((u) => u ? { ...u, role: selectedRole, isMedical: selectedRole === 'medical' } : u);
				roleMessage = { type: 'success', text: $t('app.settings.general.role.saved') };
			} else {
				roleMessage = { type: 'error', text: result.error || $t('app.settings.general.error.update-failed') };
			}
		} catch (error) {
			console.error('[Settings] Role update error:', error);
			roleMessage = { type: 'error', text: $t('app.settings.general.error.network') };
		} finally {
			savingRole = false;
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

	<div class="section-divider"></div>

	<section>
		<h3 class="h3">{$t('app.settings.general.role.label')}</h3>
		<p class="description">{$t('app.settings.general.role.description')}</p>

		<form class="form">
			<Select
				bind:value={selectedRole}
				options={roleOptions}
				label={$t('app.settings.general.role.label')}
			/>

			<div class="form-actions">
				<button class="button -primary" type="button" onclick={saveRole} disabled={savingRole}>
					{savingRole ? '...' : $t('app.settings.general.role.save')}
				</button>
			</div>
		</form>

		{#if roleMessage}
			<p class="message -{roleMessage.type}">{roleMessage.text}</p>
		{/if}
	</section>

	<div class="section-divider"></div>

	<section>
		<h3 class="h3">{$t('app.settings.general.appearance.title')}</h3>
		<p class="description">{$t('app.settings.general.appearance.description')}</p>

		<form class="form">
			<Select
				bind:value={selectedTheme}
				options={themeOptions}
				label={$t('app.settings.general.appearance.title')}
			/>
		</form>
	</section>

	{#if isFeatureEnabled('CARE_PLAN')}
	<div class="section-divider"></div>

	<section>
		<h3 class="h3">{$t('app.settings.general.careplan.title')}</h3>
		<p class="description">{$t('app.settings.general.careplan.certainty-description')}</p>

		<label class="toggle-row">
			<input
				type="checkbox"
				bind:checked={showCertaintyInline}
				disabled={savingCertainty}
				onchange={saveCertaintyInline}
			/>
			<span>{$t('app.settings.general.careplan.certainty-label')}</span>
		</label>
	</section>
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

	.toggle-row {
		display: flex;
		align-items: center;
		gap: var(--ui-pad-small);
		margin-top: var(--ui-pad-medium);
		cursor: pointer;
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

	.section-divider {
		border-top: 1px solid var(--color-border);
		margin: var(--ui-pad-large) 0;
	}

	section h3 {
		margin-bottom: var(--ui-pad-small);
	}

	@media (max-width: 768px) {
		.settings-panel {
			padding: var(--ui-pad-medium);
		}
	}
</style>
