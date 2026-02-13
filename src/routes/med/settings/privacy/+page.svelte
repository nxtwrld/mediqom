<script lang="ts">
	import { t } from '$lib/i18n';
	import user from '$lib/user';

	// Read user data from store (using $user auto-subscription)
	const encryptionEnabled = !!($user?.privateKey && $user?.publicKey);
	const encryptionMethod = $user?.key_derivation_method || 'passphrase';
	const userEmail = $user?.email || '';
	const createdAt = ($user as any)?.created_at || new Date().toISOString();

	const formatDate = (dateString: string) => {
		return new Date(dateString).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	};
</script>

<div class="settings-panel">
	<header>
		<h2 class="h2">{$t('app.settings.privacy.title')}</h2>
	</header>

	<!-- Encryption Status Section -->
	<section class="privacy-section">
		<h3 class="h3">{$t('app.settings.privacy.encryption.title')}</h3>

		{#if encryptionEnabled}
			<div class="info-box">
				<div class="status-item">
					<span class="status-icon">✓</span>
					<span class="status-text">{$t('app.settings.privacy.encryption.enabled')}</span>
				</div>
				<div class="info-item">
					<strong>{$t('app.settings.privacy.encryption.method')}:</strong>
					{encryptionMethod === 'passkey_prf'
						? $t('app.settings.privacy.encryption.passkey')
						: $t('app.settings.privacy.encryption.passphrase')}
				</div>
			</div>
		{:else}
			<div class="info-box -warning">
				<p>{$t('app.settings.privacy.encryption.not-enabled')}</p>
			</div>
		{/if}

		<div class="actions">
			<a href="/account" class="button">
				{$t('app.settings.privacy.encryption.change')}
			</a>
		</div>
	</section>

	<!-- Account Information Section -->
	<section class="privacy-section">
		<h3 class="h3">{$t('app.settings.privacy.account.title')}</h3>

		<div class="info-box">
			<div class="info-item">
				<strong>{$t('app.settings.privacy.account.created')}:</strong>
				{formatDate(createdAt)}
			</div>
			<div class="info-item">
				<strong>{$t('app.settings.privacy.account.email')}:</strong>
				{userEmail}
			</div>
		</div>
	</section>

	<!-- Data Management Section -->
	<section class="privacy-section">
		<h3 class="h3">{$t('app.settings.privacy.data.title')}</h3>

		<div class="actions">
			<button class="button" disabled>
				{$t('app.settings.privacy.data.export')}
			</button>
			<button class="button -negative" disabled>
				{$t('app.settings.privacy.data.delete')}
			</button>
		</div>
		<p class="note">{$t('app.settings.privacy.data.coming-soon')}</p>
	</section>
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

	.privacy-section {
		margin-bottom: var(--ui-pad-xlarge);
	}

	.privacy-section:last-child {
		margin-bottom: 0;
	}

	.privacy-section h3 {
		margin-bottom: var(--ui-pad-medium);
	}

	.info-box {
		background: var(--color-background);
		border: 1px solid var(--color-border);
		border-radius: var(--ui-radius-small);
		padding: var(--ui-pad-medium);
		margin-bottom: var(--ui-pad-medium);
	}

	.info-box.-warning {
		background: var(--color-warning-light);
		border-color: var(--color-warning);
	}

	.status-item {
		display: flex;
		align-items: center;
		gap: var(--ui-pad-small);
		margin-bottom: var(--ui-pad-small);
	}

	.status-icon {
		color: var(--color-positive);
		font-size: 1.25rem;
		font-weight: bold;
	}

	.status-text {
		font-weight: 600;
		color: var(--color-positive);
	}

	.info-item {
		margin: var(--ui-pad-small) 0;
	}

	.info-item strong {
		color: var(--color-text-primary);
	}

	.actions {
		display: flex;
		gap: var(--ui-pad-medium);
		flex-wrap: wrap;
	}

	.note {
		margin-top: var(--ui-pad-small);
		color: var(--color-text-secondary);
		font-size: 0.875rem;
		font-style: italic;
	}

	@media (max-width: 768px) {
		.settings-panel {
			padding: var(--ui-pad-medium);
		}

		.actions {
			flex-direction: column;
		}

		.actions .button {
			width: 100%;
		}
	}
</style>
