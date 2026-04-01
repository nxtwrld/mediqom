<script lang="ts">
	import { t } from '$lib/i18n';
	import { isNativePlatform } from '$lib/config/platform';
	import {
		isHealthAvailable,
		syncHealthData,
		getDefaultSyncConfig,
		ALL_DATA_TYPES,
		type HealthSyncConfig,
		type HealthDataType
	} from '$lib/capacitor/health';

	interface Props {
		profileId: string;
		config: HealthSyncConfig;
		onchange?: (config: HealthSyncConfig) => void;
	}

	let { profileId, config = $bindable(), onchange }: Props = $props();

	let available = $state<boolean | null>(null);
	let syncing = $state(false);
	let syncResult = $state<{ count: number; errors?: string[] } | null>(null);

	// Check availability on mount (works on native + dev mock)
	if (isNativePlatform() || import.meta.env.DEV) {
		isHealthAvailable().then((v) => {
			available = v;
		});
	}

	// Initialize config if needed
	if (!config) {
		config = getDefaultSyncConfig();
	}

	function handleToggle() {
		config = { ...config, enabled: !config.enabled };
		onchange?.(config);
	}

	function handleDataTypeToggle(dt: HealthDataType) {
		const types = config.dataTypes.includes(dt)
			? config.dataTypes.filter((t) => t !== dt)
			: [...config.dataTypes, dt];
		config = { ...config, dataTypes: types };
		onchange?.(config);
	}

	async function handleSync() {
		syncing = true;
		syncResult = null;

		try {
			const result = await syncHealthData(profileId, config);
			syncResult = { count: result.entriesSynced, errors: result.errors };

			if (result.success) {
				config = { ...config, lastSyncDate: new Date().toISOString() };
				onchange?.(config);
			}
		} finally {
			syncing = false;
		}
	}

	const DATA_TYPE_LABELS: Record<HealthDataType, string> = {
		heart_rate: 'profile.health-connect.data-types.heart-rate',
		resting_heart_rate: 'profile.health-connect.data-types.resting-heart-rate',
		heart_rate_variability: 'profile.health-connect.data-types.hrv',
		blood_pressure: 'profile.health-connect.data-types.blood-pressure',
		blood_glucose: 'profile.health-connect.data-types.blood-glucose',
		weight: 'profile.health-connect.data-types.weight',
		height: 'profile.health-connect.data-types.height',
		body_fat_percentage: 'profile.health-connect.data-types.body-fat'
	};

	function formatLastSync(dateStr?: string): string {
		if (!dateStr) return '';
		const date = new Date(dateStr);
		return date.toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

{#if (isNativePlatform() || import.meta.env.DEV) && available !== false}
	<div class="health-connect">
		<h3 class="h3 heading">{$t('profile.health-connect.title')}</h3>
		<p class="description">{$t('profile.health-connect.description')}</p>

		{#if available === null}
			<p class="loading">{$t('general.loading')}</p>
		{:else if !available}
			<p class="not-available">{$t('profile.health-connect.not-available')}</p>
		{:else}
			<div class="toggle-row">
				<label class="toggle-label">
					<input
						type="checkbox"
						checked={config.enabled}
						onchange={handleToggle}
					/>
					<span>{config.enabled ? $t('profile.health-connect.disable') : $t('profile.health-connect.enable')}</span>
				</label>
			</div>

			{#if config.enabled}
				<div class="data-types">
					{#each ALL_DATA_TYPES as dt}
						<label class="data-type-option">
							<input
								type="checkbox"
								checked={config.dataTypes.includes(dt)}
								onchange={() => handleDataTypeToggle(dt)}
							/>
							<span>{$t(DATA_TYPE_LABELS[dt])}</span>
						</label>
					{/each}
				</div>

				<div class="sync-section">
					<button
						class="button -primary"
						onclick={handleSync}
						disabled={syncing || config.dataTypes.length === 0}
					>
						{syncing ? $t('profile.health-connect.syncing') : $t('profile.health-connect.sync-now')}
					</button>

					{#if config.lastSyncDate}
						<p class="last-sync">
							{$t('profile.health-connect.last-sync')}: {formatLastSync(config.lastSyncDate)}
						</p>
					{/if}

					{#if syncResult}
						<p class="sync-result" class:has-errors={syncResult.errors && syncResult.errors.length > 0}>
							{$t('profile.health-connect.sync-complete', { values: { count: syncResult.count } })}
						</p>
						{#if syncResult.errors}
							{#each syncResult.errors as error}
								<p class="sync-error">{error}</p>
							{/each}
						{/if}
					{/if}
				</div>
			{/if}
		{/if}
	</div>
{/if}

<style>
	.health-connect {
		margin-top: var(--ui-pad-large);
		padding: var(--ui-pad-medium);
		border: 1px solid var(--color-border);
		border-radius: var(--ui-radius-medium);
	}

	.heading {
		margin-bottom: var(--ui-pad-small);
	}

	.description {
		color: var(--color-text-secondary);
		margin-bottom: var(--ui-pad-medium);
		font-size: 0.9rem;
	}

	.toggle-row {
		margin-bottom: var(--ui-pad-medium);
	}

	.toggle-label {
		display: flex;
		align-items: center;
		gap: var(--ui-pad-small);
		cursor: pointer;
	}

	.data-types {
		display: flex;
		flex-direction: column;
		gap: var(--ui-pad-small);
		margin-bottom: var(--ui-pad-medium);
		padding: var(--ui-pad-small) 0;
	}

	.data-type-option {
		display: flex;
		align-items: center;
		gap: var(--ui-pad-small);
		cursor: pointer;
	}

	.sync-section {
		display: flex;
		flex-direction: column;
		gap: var(--ui-pad-small);
		align-items: flex-start;
	}

	.last-sync {
		color: var(--color-text-secondary);
		font-size: 0.85rem;
	}

	.sync-result {
		color: var(--color-positive);
		font-size: 0.9rem;
	}

	.sync-result.has-errors {
		color: var(--color-warning);
	}

	.sync-error {
		color: var(--color-negative);
		font-size: 0.85rem;
	}

	.not-available {
		color: var(--color-text-secondary);
		font-style: italic;
	}

	.loading {
		color: var(--color-text-secondary);
	}
</style>
