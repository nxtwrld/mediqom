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
	if (typeof navigator !== 'undefined' && (navigator as any).health) {
		return (navigator as any).health;
	}
	return null;
}

// =====================================================
// Public API
// =====================================================

/**
 * Check if health data is available on this device.
 */
export async function isHealthAvailable(): Promise<boolean> {
	if (!browser || !isNativePlatform()) return false;

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
	if (!browser || !isNativePlatform()) return false;

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
	if (!browser || !isNativePlatform()) {
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

	const platform = getPlatform() as 'ios' | 'android';
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

	// Batch insert with dedup
	const batchEntries = allEntries.map((e) => ({
		signal: e.signal,
		entry: {
			value: e.value,
			unit: e.unit,
			date: e.date,
			source: e.source,
			reference: ''
		}
	}));

	const result = await addSignalEntriesBatch(profileId, batchEntries);

	if (!result.success) {
		errors.push(result.error || 'Batch insert failed');
	}

	healthLog.info('Health sync complete', {
		profileId,
		entriesSynced: result.entriesInserted ?? allEntries.length,
		errors: errors.length
	});

	return {
		success: errors.length === 0,
		entriesSynced: result.entriesInserted ?? allEntries.length,
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
