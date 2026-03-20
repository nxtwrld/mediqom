// =====================================================
// Health Data Normalization Layer
// =====================================================
// Converts raw cordova-plugin-health data points into
// our standard Signal format. Handles entity name mapping,
// unit conversion, and value aggregation.
// =====================================================

import type { Signal } from '$lib/types.d';

// =====================================================
// Types
// =====================================================

/** Raw data point from cordova-plugin-health */
export interface PluginDataPoint {
	startDate: Date;
	endDate: Date;
	value: any;
	unit: string;
	sourceName?: string;
	sourceBundleId?: string;
}

/** Normalized signal entry ready for batch insert */
export interface NormalizedSignalEntry {
	signal: string;
	value: number;
	unit: string;
	date: string;
	source: string;
}

/** Mapping from plugin data type to our signal */
interface HealthEntityMapping {
	pluginType: string;
	signal: string;
	targetUnit: string;
	sourceUnit?: string;
	platform?: 'ios' | 'android';
	extract?: (raw: any) => number | null;
}

// =====================================================
// Entity Mapping
// =====================================================

const ENTITY_MAP: HealthEntityMapping[] = [
	// Heart rate
	{ pluginType: 'heart_rate', signal: 'heart_rate', targetUnit: 'beats/min' },
	{ pluginType: 'heart_rate.resting', signal: 'resting_heart_rate', targetUnit: 'bpm' },
	{ pluginType: 'heart_rate.variability', signal: 'heart_rate_variability', targetUnit: 'ms' },

	// Blood pressure → two separate signals
	{
		pluginType: 'blood_pressure',
		signal: 'systolic',
		targetUnit: 'mmHg',
		extract: (r) => r.systolic ?? null
	},
	{
		pluginType: 'blood_pressure',
		signal: 'diastolic',
		targetUnit: 'mmHg',
		extract: (r) => r.diastolic ?? null
	},

	// Blood glucose — platform-specific source units
	{
		pluginType: 'blood_glucose',
		signal: 'blood_sugar',
		targetUnit: 'mg/dL',
		sourceUnit: 'mg/dL',
		platform: 'ios'
	},
	{
		pluginType: 'blood_glucose',
		signal: 'blood_sugar',
		targetUnit: 'mg/dL',
		sourceUnit: 'mmol/L',
		platform: 'android'
	},

	// Body measurements
	{ pluginType: 'weight', signal: 'weight', targetUnit: 'kg' },
	{ pluginType: 'height', signal: 'height', targetUnit: 'cm', sourceUnit: 'm' },
	{ pluginType: 'fat_percentage', signal: 'body_fat_percentage', targetUnit: '%' }
];

// =====================================================
// Unit Conversion
// =====================================================

type ConvertFn = (value: number) => number;

const UNIT_CONVERTERS: Record<string, Record<string, ConvertFn>> = {
	'mmol/L': { 'mg/dL': (v) => v * 18.01559 },
	'mg/dL': { 'mmol/L': (v) => v / 18.01559 },
	m: { cm: (v) => v * 100 },
	cm: { m: (v) => v / 100 },
	lbs: { kg: (v) => v * 0.453592 },
	kg: { lbs: (v) => v / 0.453592 },
	'°F': { '°C': (v) => ((v - 32) * 5) / 9 },
	'°C': { '°F': (v) => (v * 9) / 5 + 32 }
};

function convertUnit(value: number, from: string, to: string): number {
	if (from === to) return value;
	const converter = UNIT_CONVERTERS[from]?.[to];
	if (!converter) throw new Error(`No converter: ${from} → ${to}`);
	return converter(value);
}

// =====================================================
// High-frequency data types that need aggregation
// =====================================================

const HIGH_FREQUENCY_TYPES = new Set(['heart_rate']);

// =====================================================
// Main Normalization Function
// =====================================================

/**
 * Convert raw plugin data points into normalized signal entries.
 * May produce multiple signals from one plugin type (e.g., blood_pressure → systolic + diastolic).
 */
export function normalizeHealthData(
	rawDataPoints: PluginDataPoint[],
	pluginType: string,
	platform: 'ios' | 'android'
): NormalizedSignalEntry[] {
	const mappings = ENTITY_MAP.filter(
		(m) => m.pluginType === pluginType && (!m.platform || m.platform === platform)
	);

	if (mappings.length === 0) return [];

	const source = platform === 'ios' ? 'healthkit' : 'health_connect';
	const results: NormalizedSignalEntry[] = [];

	for (const point of rawDataPoints) {
		for (const mapping of mappings) {
			// Extract value
			let value: number | null;
			if (mapping.extract) {
				value = mapping.extract(point.value);
			} else {
				value = typeof point.value === 'number' ? point.value : parseFloat(point.value);
			}

			if (value === null || isNaN(value)) continue;

			// Convert units if needed
			if (mapping.sourceUnit && mapping.sourceUnit !== mapping.targetUnit) {
				value = convertUnit(value, mapping.sourceUnit, mapping.targetUnit);
			}

			// Round to 2 decimal places
			value = Math.round(value * 100) / 100;

			results.push({
				signal: mapping.signal,
				value,
				unit: mapping.targetUnit,
				date: point.startDate.toISOString(),
				source
			});
		}
	}

	return results;
}

// =====================================================
// Aggregation
// =====================================================

/**
 * Aggregate entries by hour — averages values within the same hour.
 * Use for high-frequency data (heart rate from Apple Watch).
 */
export function aggregateByHour(entries: NormalizedSignalEntry[]): NormalizedSignalEntry[] {
	if (entries.length === 0) return [];

	const groups = new Map<string, NormalizedSignalEntry[]>();

	for (const entry of entries) {
		const date = new Date(entry.date);
		// Group key: signal + YYYY-MM-DDTHH
		const hourKey = `${entry.signal}|${date.toISOString().slice(0, 13)}`;
		const group = groups.get(hourKey);
		if (group) {
			group.push(entry);
		} else {
			groups.set(hourKey, [entry]);
		}
	}

	const aggregated: NormalizedSignalEntry[] = [];
	for (const group of groups.values()) {
		const avg = group.reduce((sum, e) => sum + e.value, 0) / group.length;
		// Use the middle entry's date as representative
		const middleIdx = Math.floor(group.length / 2);
		aggregated.push({
			...group[middleIdx],
			value: Math.round(avg * 100) / 100
		});
	}

	return aggregated;
}

/**
 * Check if a plugin data type should be aggregated (high-frequency).
 */
export function shouldAggregate(pluginType: string): boolean {
	return HIGH_FREQUENCY_TYPES.has(pluginType);
}

// =====================================================
// BMI Computation
// =====================================================

/**
 * Compute BMI from weight (kg) and height (cm).
 */
export function computeBMI(weightKg: number, heightCm: number): number {
	const heightM = heightCm / 100;
	return Math.round((weightKg / (heightM * heightM)) * 100) / 100;
}
