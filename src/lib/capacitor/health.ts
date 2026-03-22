// =====================================================
// Device Health Data Service (cordova-plugin-health)
// =====================================================
// Syncs Apple HealthKit / Google Health Connect data
// into our Signal system. Follows the RevenueCat pattern
// for lazy import and platform guards.
// =====================================================

import { browser } from '$app/environment';
import { isNativePlatform, getPlatform } from '$lib/config/platform';
import { log } from '$lib/logging/logger';
import {
	normalizeHealthData,
	aggregateByHour,
	shouldAggregate,
	computeBMI,
	type NormalizedSignalEntry
} from './health-normalize';
import { addSignalEntriesBatch } from '$lib/health/signal-crud';
import { getMockHealthPlugin } from './health-mock-plugin';
import { profiles, updateProfile } from '$lib/profiles';
import type { Profile, Signal } from '$lib/types.d';
import { normalizeSignalEntry } from '$lib/signals/normalize';

const healthLog = log.namespace('Health.Device', '📱');

// =====================================================
// Types
// =====================================================

export type HealthDataType =
	| 'heart_rate'
	| 'resting_heart_rate'
	| 'heart_rate_variability'
	| 'blood_pressure'
	| 'blood_glucose'
	| 'weight'
	| 'height'
	| 'body_fat_percentage';

export interface HealthSyncConfig {
	enabled: boolean;
	dataTypes: HealthDataType[];
	lastSyncDate?: string;
}

export interface SyncResult {
	success: boolean;
	entriesSynced: number;
	errors?: string[];
}

/** Maps our data type names to cordova-plugin-health query strings */
const PLUGIN_TYPE_MAP: Record<HealthDataType, string> = {
	heart_rate: 'heart_rate',
	resting_heart_rate: 'heart_rate.resting',
	heart_rate_variability: 'heart_rate.variability',
	blood_pressure: 'blood_pressure',
	blood_glucose: 'blood_glucose',
	weight: 'weight',
	height: 'height',
	body_fat_percentage: 'fat_percentage'
};

/** All supported data types */
export const ALL_DATA_TYPES: HealthDataType[] = [
	'heart_rate',
	'resting_heart_rate',
	'heart_rate_variability',
	'blood_pressure',
	'blood_glucose',
	'weight',
	'height',
	'body_fat_percentage'
];

let initialized = false;

// =====================================================
// Plugin Access
// =====================================================

function getHealthPlugin(): any {
	// Real plugin on native
	if (isNativePlatform() && typeof navigator !== 'undefined' && (navigator as any).health) {
		return (navigator as any).health;
	}
	// Mock plugin in dev mode on web (tree-shaken in production)
	if (import.meta.env.DEV && !isNativePlatform()) {
		return getMockHealthPlugin();
	}
	return null;
}

/** Whether health features should be active (native OR dev mock) */
function isHealthEnabled(): boolean {
	return isNativePlatform() || import.meta.env.DEV;
}

// =====================================================
// Public API
// =====================================================

/**
 * Check if health data is available on this device.
 */
export async function isHealthAvailable(): Promise<boolean> {
	if (!browser || !isHealthEnabled()) return false;

	const plugin = getHealthPlugin();
	if (!plugin) return false;

	return new Promise<boolean>((resolve) => {
		plugin.isAvailable(
			() => resolve(true),
			() => resolve(false)
		);
	});
}

/**
 * Request read-only health permissions for the specified data types.
 */
export async function requestHealthPermissions(
	dataTypes: HealthDataType[]
): Promise<boolean> {
	if (!browser || !isHealthEnabled()) return false;

	const plugin = getHealthPlugin();
	if (!plugin) return false;

	const readTypes = dataTypes.map((dt) => ({
		read: [PLUGIN_TYPE_MAP[dt]]
	}));

	// Flatten into a single request
	const datatypesFlat = readTypes.flatMap((r) => r.read);

	return new Promise<boolean>((resolve) => {
		plugin.requestAuthorization(
			datatypesFlat,
			[], // no write permissions
			() => {
				initialized = true;
				healthLog.info('Health permissions granted', { dataTypes });
				resolve(true);
			},
			(err: any) => {
				healthLog.warn('Health permissions denied', { error: err });
				resolve(false);
			}
		);
	});
}

/**
 * Full sync cycle: query health data, normalize, dedup, and batch-insert.
 */
export async function syncHealthData(
	profileId: string,
	config: HealthSyncConfig
): Promise<SyncResult> {
	if (!browser || !isHealthEnabled()) {
		return { success: false, entriesSynced: 0, errors: ['Not a native platform'] };
	}

	const plugin = getHealthPlugin();
	if (!plugin) {
		return { success: false, entriesSynced: 0, errors: ['Health plugin not available'] };
	}

	if (!initialized) {
		const granted = await requestHealthPermissions(config.dataTypes);
		if (!granted) {
			return { success: false, entriesSynced: 0, errors: ['Permissions not granted'] };
		}
	}

	const platform = (getPlatform() || 'ios') as 'ios' | 'android';
	const errors: string[] = [];
	let allEntries: NormalizedSignalEntry[] = [];

	// Determine date range
	const startDate = config.lastSyncDate
		? new Date(config.lastSyncDate)
		: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days ago
	const endDate = new Date();

	healthLog.info('Starting health sync', {
		profileId,
		dataTypes: config.dataTypes,
		from: startDate.toISOString(),
		to: endDate.toISOString()
	});

	// Query each data type
	for (const dataType of config.dataTypes) {
		const pluginType = PLUGIN_TYPE_MAP[dataType];

		try {
			const rawData = await queryHealthData(plugin, pluginType, startDate, endDate);
			let normalized = normalizeHealthData(rawData, pluginType, platform);

			// Aggregate high-frequency data
			if (shouldAggregate(pluginType)) {
				normalized = aggregateByHour(normalized);
			}

			allEntries = allEntries.concat(normalized);
			healthLog.debug(`Synced ${normalized.length} entries for ${dataType}`);
		} catch (err) {
			const msg = `Failed to sync ${dataType}: ${err instanceof Error ? err.message : String(err)}`;
			healthLog.error(msg);
			errors.push(msg);
		}
	}

	// Compute BMI if we have both weight and height
	const weightEntries = allEntries.filter((e) => e.signal === 'weight');
	const heightEntries = allEntries.filter((e) => e.signal === 'height');
	if (weightEntries.length > 0 && heightEntries.length > 0) {
		const latestWeight = weightEntries[weightEntries.length - 1];
		const latestHeight = heightEntries[heightEntries.length - 1];
		const bmi = computeBMI(latestWeight.value, latestHeight.value);
		allEntries.push({
			signal: 'bmi',
			value: bmi,
			unit: 'kg/m²',
			date: latestWeight.date,
			source: latestWeight.source
		});
	}

	if (allEntries.length === 0) {
		return { success: true, entriesSynced: 0, errors: errors.length > 0 ? errors : undefined };
	}

	// In dev mode with mock data: inject into in-memory store only (no DB write)
	const isMockPath = import.meta.env.DEV && !isNativePlatform();
	let inserted = allEntries.length;

	if (isMockPath) {
		const profile = (await profiles.get(profileId)) as Profile;
		if (profile) {
			// Derive age/sex for reference range lookup
			const profileAge = profile.health?.signals?.age?.values?.[0]?.value
				? Number(profile.health.signals.age.values[0].value)
				: undefined;
			const profileSex = profile.health?.signals?.biologicalSex?.values?.[0]?.value as string | undefined;

			const signals = { ...(profile.health?.signals || {}) };
			for (const e of allEntries) {
				const normalized = normalizeSignalEntry(
					{ signal: e.signal, value: e.value, unit: e.unit, date: e.date, source: e.source || '', reference: '' },
					profileAge,
					profileSex
				);
				const key = normalized.signal;
				if (!signals[key]) {
					signals[key] = { log: 'full', history: [], values: [] };
				}
				const fullEntry: Signal = {
					signal: key,
					value: normalized.value,
					unit: normalized.unit,
					date: normalized.date,
					source: normalized.source,
					reference: normalized.reference
				};
				// Dedup
				const isDuplicate = signals[key].values.some(
					(v: Signal) => v.date === fullEntry.date && v.source === fullEntry.source
				);
				if (!isDuplicate) {
					signals[key].values.push(fullEntry);
				}
			}
			// Sort newest first
			for (const key of Object.keys(signals)) {
				signals[key].values.sort(
					(a: Signal, b: Signal) =>
						new Date(b.date).getTime() - new Date(a.date).getTime()
				);
			}
			profile.health = { ...profile.health, signals };
			updateProfile(profile);
			healthLog.info('Mock health sync: injected into store (no DB write)', {
				profileId,
				entriesSynced: allEntries.length
			});
		}
	} else {
		// Real sync: persist to DB
		// Derive age/sex for reference range lookup
		const realProfile = (await profiles.get(profileId)) as Profile;
		const realAge = realProfile?.health?.signals?.age?.values?.[0]?.value
			? Number(realProfile.health.signals.age.values[0].value)
			: undefined;
		const realSex = realProfile?.health?.signals?.biologicalSex?.values?.[0]?.value as string | undefined;

		const batchEntries = allEntries.map((e) => {
			const normalized = normalizeSignalEntry(
				{ signal: e.signal, value: e.value, unit: e.unit, date: e.date, source: e.source || '', reference: '' },
				realAge,
				realSex
			);
			return {
				signal: normalized.signal,
				entry: {
					value: normalized.value,
					unit: normalized.unit,
					date: normalized.date,
					source: normalized.source,
					reference: normalized.reference
				}
			};
		});

		const result = await addSignalEntriesBatch(profileId, batchEntries);

		if (!result.success) {
			errors.push(result.error || 'Batch insert failed');
		}
		inserted = result.entriesInserted ?? allEntries.length;
	}

	healthLog.info('Health sync complete', {
		profileId,
		entriesSynced: inserted,
		errors: errors.length
	});

	return {
		success: errors.length === 0,
		entriesSynced: inserted,
		errors: errors.length > 0 ? errors : undefined
	};
}

// =====================================================
// Internal: Query Plugin
// =====================================================

function queryHealthData(
	plugin: any,
	dataType: string,
	startDate: Date,
	endDate: Date
): Promise<any[]> {
	return new Promise((resolve, reject) => {
		plugin.query(
			{
				startDate,
				endDate,
				dataType,
				limit: 10000
			},
			(data: any[]) => resolve(data),
			(err: any) => reject(new Error(String(err)))
		);
	});
}

/**
 * Get the default sync config.
 */
export function getDefaultSyncConfig(): HealthSyncConfig {
	return {
		enabled: false,
		dataTypes: ['heart_rate', 'blood_pressure', 'weight', 'height'],
		lastSyncDate: undefined
	};
}
