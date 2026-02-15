<script lang="ts">
	import { t } from '$lib/i18n';
	import { profiles, profile } from '$lib/profiles';
	import ProfileEdit from '$components/profile/ProfileEdit.svelte';
	import { saveHealthProfile } from '$lib/health/save';
	import user from '$lib/user';
	import type { Profile } from '$lib/types.d';

	// Local state for editing
	let editingProfile: any = $state(null);
	let originalProfile: any = $state(null);
	let saving = $state(false);
	let message = $state<{ type: 'success' | 'error'; text: string } | null>(null);

	// Set the current user's profile as active when component mounts
	$effect(() => {
		const userId = $user?.id;
		if (userId && !$profile) {
			console.log('[ProfileSettings] Setting active profile for user:', userId);
			try {
				const userProfile = profiles.get(userId) as Profile;
				if (userProfile) {
					profile.set(userProfile);
					console.log('[ProfileSettings] Active profile set:', userProfile.id);
				} else {
					console.error('[ProfileSettings] User profile not found in profiles store');
				}
			} catch (e) {
				console.error('[ProfileSettings] Error setting active profile:', e);
			}
		}
	});

	// Initialize editing profile when profile becomes available
	$effect(() => {
		if ($profile && !editingProfile) {
			console.log('[ProfileSettings] Initializing editing profile from store');
			editingProfile = JSON.parse(JSON.stringify($profile));
			originalProfile = JSON.parse(JSON.stringify($profile));
		}
	});

	// Check if there are any changes
	function hasChanges() {
		if (!editingProfile || !originalProfile) return false;
		return JSON.stringify(editingProfile) !== JSON.stringify(originalProfile);
	}

	async function handleSave() {
		if (!hasChanges()) {
			message = { type: 'error', text: $t('app.settings.profile.no-changes') };
			return;
		}

		saving = true;
		message = null;

		try {
			if (editingProfile?.id && editingProfile?.health) {
				await saveHealthProfile({
					profileId: editingProfile.id,
					formData: editingProfile.health
				});

				// Update the store with edited data
				profile.set(editingProfile);

				// Update original to reflect saved state
				originalProfile = JSON.parse(JSON.stringify(editingProfile));

				message = { type: 'success', text: $t('app.settings.profile.saved') };
			}
		} catch (error) {
			console.error('[Settings] Profile save error:', error);
			message = { type: 'error', text: $t('app.settings.profile.save-error') };
		} finally {
			saving = false;
		}
	}

	function handleReset() {
		if (originalProfile) {
			editingProfile = JSON.parse(JSON.stringify(originalProfile));
			message = null;
		}
	}
</script>

<div class="settings-panel">
	<header>
		<h2 class="h2">{$t('app.settings.profile.title')}</h2>
		<p class="description">{$t('app.settings.profile.description')}</p>
	</header>

	{#if editingProfile}
		<ProfileEdit bind:profile={editingProfile} />

		<div class="form-actions">
			<button
				class="button -secondary"
				type="button"
				onclick={handleReset}
				disabled={saving || !hasChanges()}
			>
				{$t('app.settings.profile.reset')}
			</button>
			<button
				class="button -primary"
				type="button"
				onclick={handleSave}
				disabled={saving || !hasChanges()}
			>
				{saving ? '...' : $t('app.settings.profile.save')}
			</button>
		</div>

		{#if message}
			<div class="message -{message.type}">{message.text}</div>
		{/if}
	{:else}
		<p class="loading">{$t('app.settings.profile.loading')}</p>
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

	.form-actions {
		display: flex;
		gap: var(--ui-pad-medium);
		margin-top: var(--ui-pad-large);
		padding-top: var(--ui-pad-large);
		border-top: 1px solid var(--color-border);
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

	.loading {
		color: var(--color-text-secondary);
		text-align: center;
		padding: var(--ui-pad-xlarge);
	}

	@media (max-width: 768px) {
		.settings-panel {
			padding: var(--ui-pad-medium);
		}

		.form-actions {
			flex-direction: column;
		}
	}
</style>
