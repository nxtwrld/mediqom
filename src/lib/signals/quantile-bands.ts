/**
 * Quantile band computation with outlier detection for HealthKit-style continuous signals.
 *
 * Pipeline:
 * 1. Assign samples into time buckets
 * 2. Detect outliers (clinical thresholds + baseline deviation)
 * 3. Separate normal from abnormal values
 * 4. Compute quantiles from normal values only
 * 5. Return buckets + outlier points for rendering
 */

import { getDefaultReference } from '$data/signal-catalog';

// =====================================================
// Types
// =====================================================

export interface QuantileBucket {
	bucketStart: number;  // ms timestamp
	bucketEnd: number;
	bucketMid: number;
	sampleCount: number;
	p10: number;
	p25: number;
	p50: number;
	p75: number;
	p90: number;
	// Raw (non-normalized) quantiles for display
	rawP10: number;
	rawP25: number;
	rawP50: number;
	rawP75: number;
	rawP90: number;
	abnormalCount: number;
	abnormalMaxSeverity?: number;
}

export type OutlierKind = 'clinical-high' | 'clinical-low' | 'baseline-high' | 'baseline-low';

export interface OutlierPoint {
	timestamp: number;  // ms
	value: number;
	normalizedValue: number;
	severity: number;
	kind: OutlierKind;
	bucketStart: number;
	/** The original data point, for rendering */
	original: unknown;
}

export interface QuantileBandResult {
	buckets: QuantileBucket[];
	outliers: OutlierPoint[];
	/** Original data points from buckets with < 3 normal samples (too sparse for bands) */
	sparseOriginals: unknown[];
}

export interface ClinicalThresholds {
	clinicalLow?: number;
	clinicalHigh?: number;
	/** How far outside clinical range before severity = 1.0 */
	clinicalTolerance: number;
	/** Minimum spread floor for baseline deviation denominator */
	minSpreadFloor: number;
	/** Severity score above which a point is classified as outlier */
	severityThreshold: number;
}

// =====================================================
// Clinical threshold configs per signal
// =====================================================

/**
 * Hard-coded clinical thresholds for common HealthKit vitals.
 * These go beyond the "normal" reference range to define
 * truly alarming values.
 */
const CLINICAL_THRESHOLDS: Record<string, ClinicalThresholds> = {
	heart_rate: {
		clinicalLow: 40,
		clinicalHigh: 180,
		clinicalTolerance: 10,
		minSpreadFloor: 5,
		severityThreshold: 1.5,
	},
	resting_heart_rate: {
		clinicalLow: 35,
		clinicalHigh: 120,
		clinicalTolerance: 8,
		minSpreadFloor: 4,
		severityThreshold: 1.5,
	},
	heart_rate_variability: {
		clinicalLow: 5,
		clinicalHigh: 300,
		clinicalTolerance: 20,
		minSpreadFloor: 8,
		severityThreshold: 1.5,
	},
	oxygen_saturation: {
		clinicalLow: 90,
		clinicalHigh: undefined,
		clinicalTolerance: 2,
		minSpreadFloor: 1,
		severityThreshold: 1.5,
	},
	respiratory_rate: {
		clinicalLow: 8,
		clinicalHigh: 30,
		clinicalTolerance: 3,
		minSpreadFloor: 2,
		severityThreshold: 1.5,
	},
	blood_pressure_systolic: {
		clinicalLow: 80,
		clinicalHigh: 180,
		clinicalTolerance: 10,
		minSpreadFloor: 5,
		severityThreshold: 1.5,
	},
	blood_pressure_diastolic: {
		clinicalLow: 50,
		clinicalHigh: 120,
		clinicalTolerance: 8,
		minSpreadFloor: 4,
		severityThreshold: 1.5,
	},
	body_temperature: {
		clinicalLow: 35.0,
		clinicalHigh: 38.5,
		clinicalTolerance: 0.5,
		minSpreadFloor: 0.3,
		severityThreshold: 1.5,
	},
	blood_sugar: {
		clinicalLow: 50,
		clinicalHigh: 200,
		clinicalTolerance: 15,
		minSpreadFloor: 5,
		severityThreshold: 1.5,
	},
};

/** Default thresholds used when no signal-specific config exists */
const DEFAULT_THRESHOLDS: ClinicalThresholds = {
	clinicalTolerance: 10,
	minSpreadFloor: 3,
	severityThreshold: 1.5,
};

/**
 * Get clinical thresholds for a signal. Falls back to deriving from
 * the signal catalog reference ranges if no hard-coded config exists.
 */
export function getClinicalThresholds(signalKey: string): ClinicalThresholds {
	if (CLINICAL_THRESHOLDS[signalKey]) {
		return CLINICAL_THRESHOLDS[signalKey];
	}

	// Try to derive from signal catalog reference range
	const refStr = getDefaultReference(signalKey);
	if (refStr) {
		const parts = refStr.split('-');
		if (parts.length === 2) {
			const low = parseFloat(parts[0]);
			const high = parseFloat(parts[1]);
			if (!isNaN(low) && !isNaN(high)) {
				const range = high - low;
				return {
					clinicalLow: low - range * 0.5,
					clinicalHigh: high + range * 0.5,
					clinicalTolerance: range * 0.15 || 5,
					minSpreadFloor: range * 0.05 || 1,
					severityThreshold: 1.5,
				};
			}
		}
	}

	return DEFAULT_THRESHOLDS;
}

// =====================================================
// Minimum band width
// =====================================================

/**
 * Minimum half-width (in normalized 0-1 space) enforced around the median
 * so that quantile bands remain visible even when data is tightly clustered.
 * 0.04 ≈ 7px on a 180px-wide chart — enough to see past the median line.
 */
const MIN_BAND_HALF_WIDTH_OUTER = 0.04;
const MIN_BAND_HALF_WIDTH_INNER = 0.025;

/** Clamp a value to [0, 1] */
function clamp01(v: number): number {
	return Math.max(0, Math.min(1, v));
}

/**
 * Enforce minimum band width around the median.
 * Expands p10/p90 and p25/p75 symmetrically if they're too close to p50.
 */
function enforceMinBandWidth(bucket: QuantileBucket): void {
	const { p50 } = bucket;

	// Outer band: p10–p90
	const outerHalf = Math.max((bucket.p90 - bucket.p10) / 2, MIN_BAND_HALF_WIDTH_OUTER);
	bucket.p10 = clamp01(p50 - outerHalf);
	bucket.p90 = clamp01(p50 + outerHalf);

	// Inner band: p25–p75
	const innerHalf = Math.max((bucket.p75 - bucket.p25) / 2, MIN_BAND_HALF_WIDTH_INNER);
	bucket.p25 = clamp01(p50 - innerHalf);
	bucket.p75 = clamp01(p50 + innerHalf);
}

// =====================================================
// Quantile math
// =====================================================

function quantile(sorted: number[], q: number): number {
	if (sorted.length === 0) return 0;
	if (sorted.length === 1) return sorted[0];
	const pos = (sorted.length - 1) * q;
	const base = Math.floor(pos);
	const rest = pos - base;
	if (sorted[base + 1] !== undefined) {
		return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
	}
	return sorted[base];
}

// =====================================================
// Main computation
// =====================================================

interface InputPoint {
	timestamp: number;      // ms
	value: number;          // actual value
	normalizedValue: number; // 0-1 normalized
	original: unknown;      // original data point for rendering
}

/**
 * Compute quantile buckets + outlier points from a set of continuous observations.
 *
 * @param points - Array of data points (must have timestamp, value, normalizedValue)
 * @param bucketMs - Bucket duration in ms
 * @param domainStartMs - Start of the time domain in ms
 * @param signalKey - Canonical signal key (e.g. 'heart_rate') for clinical thresholds
 */
export function computeQuantileBuckets(
	points: InputPoint[],
	bucketMs: number,
	domainStartMs: number,
	signalKey: string,
): QuantileBandResult {
	if (points.length === 0) return { buckets: [], outliers: [], sparseOriginals: [] };

	const thresholds = getClinicalThresholds(signalKey);
	const { clinicalLow, clinicalHigh, clinicalTolerance, minSpreadFloor, severityThreshold } = thresholds;

	// Compute global baseline (all values)
	const allValues = points.map(p => p.value).sort((a, b) => a - b);
	const globalMedian = quantile(allValues, 0.5);
	const globalP10 = quantile(allValues, 0.1);
	const globalP90 = quantile(allValues, 0.9);
	const expectedSpread = Math.max(minSpreadFloor, globalP90 - globalP10);

	// Assign to buckets and detect outliers
	const bucketMap = new Map<number, { normalValues: number[]; normalNormalized: number[]; normalOriginals: unknown[]; allTimestamps: number[] }>();
	const outliers: OutlierPoint[] = [];

	for (const p of points) {
		const idx = Math.floor((p.timestamp - domainStartMs) / bucketMs);
		if (!bucketMap.has(idx)) {
			bucketMap.set(idx, { normalValues: [], normalNormalized: [], normalOriginals: [], allTimestamps: [] });
		}
		const bucket = bucketMap.get(idx)!;
		bucket.allTimestamps.push(p.timestamp);

		// Compute severity
		const baselineDeviation = Math.abs(p.value - globalMedian) / expectedSpread;

		let clinicalDeviation = 0;
		if (clinicalLow !== undefined && p.value < clinicalLow) {
			clinicalDeviation = (clinicalLow - p.value) / clinicalTolerance;
		} else if (clinicalHigh !== undefined && p.value > clinicalHigh) {
			clinicalDeviation = (p.value - clinicalHigh) / clinicalTolerance;
		}

		const severity = Math.max(baselineDeviation, clinicalDeviation);

		if (severity >= severityThreshold) {
			let kind: OutlierKind;
			if (clinicalLow !== undefined && p.value < clinicalLow) kind = 'clinical-low';
			else if (clinicalHigh !== undefined && p.value > clinicalHigh) kind = 'clinical-high';
			else if (p.value < globalMedian) kind = 'baseline-low';
			else kind = 'baseline-high';

			outliers.push({
				timestamp: p.timestamp,
				value: p.value,
				normalizedValue: p.normalizedValue,
				severity,
				kind,
				bucketStart: domainStartMs + idx * bucketMs,
				original: p.original,
			});
		} else {
			bucket.normalValues.push(p.value);
			bucket.normalNormalized.push(p.normalizedValue);
			bucket.normalOriginals.push(p.original);
		}
	}

	// Build quantile buckets from normal values only
	const buckets: QuantileBucket[] = [];

	for (const [idx, b] of bucketMap) {
		const start = domainStartMs + idx * bucketMs;
		const end = start + bucketMs;

		// Even if no normal values, we need the bucket for outlier association
		if (b.normalValues.length === 0 && b.allTimestamps.length > 0) {
			// Sparse bucket — outliers only
			const abnormalInBucket = outliers.filter(o => o.bucketStart === start);
			buckets.push({
				bucketStart: start,
				bucketEnd: end,
				bucketMid: start + bucketMs / 2,
				sampleCount: 0,
				p10: 0, p25: 0, p50: 0, p75: 0, p90: 0,
				rawP10: 0, rawP25: 0, rawP50: 0, rawP75: 0, rawP90: 0,
				abnormalCount: abnormalInBucket.length,
				abnormalMaxSeverity: abnormalInBucket.length > 0
					? Math.max(...abnormalInBucket.map(o => o.severity))
					: undefined,
			});
			continue;
		}

		if (b.normalNormalized.length === 0) continue;

		const sortedNorm = [...b.normalNormalized].sort((a, b) => a - b);
		const sortedRaw = [...b.normalValues].sort((a, b) => a - b);
		const abnormalInBucket = outliers.filter(o => o.bucketStart === start);

		const bucket: QuantileBucket = {
			bucketStart: start,
			bucketEnd: end,
			bucketMid: start + bucketMs / 2,
			sampleCount: b.normalValues.length,
			p10: quantile(sortedNorm, 0.1),
			p25: quantile(sortedNorm, 0.25),
			p50: quantile(sortedNorm, 0.5),
			p75: quantile(sortedNorm, 0.75),
			p90: quantile(sortedNorm, 0.9),
			rawP10: quantile(sortedRaw, 0.1),
			rawP25: quantile(sortedRaw, 0.25),
			rawP50: quantile(sortedRaw, 0.5),
			rawP75: quantile(sortedRaw, 0.75),
			rawP90: quantile(sortedRaw, 0.9),
			abnormalCount: abnormalInBucket.length,
			abnormalMaxSeverity: abnormalInBucket.length > 0
				? Math.max(...abnormalInBucket.map(o => o.severity))
				: undefined,
		};
		enforceMinBandWidth(bucket);
		buckets.push(bucket);
	}

	buckets.sort((a, b) => a.bucketStart - b.bucketStart);

	// Collect original points from sparse buckets (too few for statistical bands)
	const sparseOriginals: unknown[] = [];
	for (const [, b] of bucketMap) {
		if (b.normalOriginals.length > 0 && b.normalOriginals.length < 3) {
			sparseOriginals.push(...b.normalOriginals);
		}
	}

	return { buckets, outliers, sparseOriginals };
}
