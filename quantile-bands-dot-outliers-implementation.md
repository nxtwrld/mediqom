# Quantile Bands and Dot Outliers — Implementation Instructions

## Goal

Implement a long-range health timeline visualization that:

- shows the typical trend of a vital over months or years
- preserves ordinary variability using a quantile band
- preserves important abnormalities as explicit dot markers
- supports correlation with other timeline events such as medication, diagnosis, supplements, or lifestyle changes

This pattern is especially useful for HealthKit-style signals such as:

- resting heart rate
- walking heart rate average
- heart rate variability
- respiratory rate
- oxygen saturation
- sleep metrics
- body temperature
- blood pressure
- glucose
- weight-related signals

It is less useful for yearly lab values like HDL or vitamin D if there are only a few samples. Those can still remain as line or dot series on the same timeline.

---

## Core Visual Model

Each metric is rendered as three layers:

1. Median line
   - the typical value in each time bucket

2. Quantile band
   - the normal spread of values in each time bucket
   - visually communicates stability vs instability
   - narrow band = stable period
   - wide band = unstable period

3. Outlier dots
   - explicit points for abnormal or notable observations
   - must not be averaged away
   - should remain visible even at multi-year scale

Recommended rendering order:

```text
background
→ quantile bands
→ median lines
→ outlier dots
→ clinical/event markers
→ hover / focus states
```

---

## Recommended Time Aggregation Strategy

Use different bucket sizes depending on zoom level.

### Multi-year overview
For 2–5 years:
- use monthly buckets

### Mid-range view
For 3–12 months:
- use weekly buckets

### Short-range detail
For days to weeks:
- use daily buckets or even raw observations

For the long-term timeline requested here, monthly buckets are the best default.

---

## Data Processing Pipeline

Process raw observations in this order:

1. collect raw samples
2. assign samples into buckets
3. detect outliers from raw samples
4. separate normal values from abnormal values
5. compute quantiles from normal values
6. attach abnormal points as a separate output
7. render both layers together

This sequence is important.

Do not compute the band from all points if strong abnormalities are present, because a few spikes can make the band so wide that it stops representing ordinary behavior.

---

## Suggested Data Model

### Raw observation

```ts
type RawObservation = {
  timestamp: string
  value: number
  source?: string
  unit?: string
  metadata?: Record<string, unknown>
}
```

### Time bucket summary

```ts
type QuantileBucket = {
  bucketStart: string
  bucketEnd: string
  sampleCount: number

  p10: number
  p25?: number
  p50: number
  p75?: number
  p90: number

  minNormal?: number
  maxNormal?: number

  abnormalCount: number
  abnormalMaxSeverity?: number
}
```

### Outlier point

```ts
type OutlierPoint = {
  timestamp: string
  value: number
  severity: number
  kind: "clinical-high" | "clinical-low" | "baseline-high" | "baseline-low" | "sudden-change"
  bucketStart: string
  sourceObservationIndex?: number
}
```

### Final chart series

```ts
type QuantileBandSeries = {
  metricId: string
  label: string
  unit: string
  color: string
  buckets: QuantileBucket[]
  outliers: OutlierPoint[]
}
```

---

## Bucket Construction

For each raw sample:

1. convert timestamp to the chart timezone
2. map the sample into a time bucket
3. store the value in that bucket

Example monthly bucket key:

```ts
function monthKey(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, "0")
  return `${y}-${m}`
}
```

Store a list of values for each bucket before calculating statistics.

---

## Quantile Calculation

For each bucket, after excluding outliers, calculate:

- p10
- p50 (median)
- p90

Optional:
- p25
- p75

### Recommended default
Use:

- outer band = p10 to p90
- median line = p50

Optional detail mode:
- inner band = p25 to p75

### Why these quantiles
They are more robust than mean and standard deviation, especially for physiological data that is not perfectly Gaussian and may contain skew, bursts, and artifacts.

### Band thickness

```ts
bandWidth = p90 - p10
```

Interpretation:

- smaller width → more stable period
- larger width → more variable period

This is the key visual meaning of the band.

---

## Outlier Detection Strategy

Do not rely on only one method. Combine:

1. clinical thresholds
2. patient baseline deviation
3. optional sudden-change detection

### 1. Clinical thresholds
Use medically meaningful cutoffs where appropriate.

Examples:
- resting heart rate too low or too high
- oxygen saturation below a threshold
- temperature above fever threshold

This captures values that matter clinically even if they are not statistically rare for that month.

### 2. Patient baseline deviation
Use the patient’s own historical distribution.

Example approach:
- compute rolling baseline median
- compute rolling expected spread
- mark values that deviate strongly from the baseline

This is important because some users have a stable personal norm outside the population average.

### 3. Sudden-change detection
Detect abrupt shifts relative to nearby values.

Example:
- large jump compared with previous 3–7 day local window
- useful for detecting episodes that do not cross absolute thresholds but still represent a meaningful change

---

## Recommended Severity Formula

Use a combined score that considers both clinical range and personal baseline.

```ts
severity = Math.max(
  baselineDeviationScore,
  clinicalDeviationScore
)
```

Where:

```ts
baselineDeviationScore =
  Math.abs(value - rollingMedian) / expectedSpread
```

and

```ts
clinicalDeviationScore =
  distanceOutsideClinicalRange / clinicalTolerance
```

Interpretation:
- severity below 1.0 → probably normal
- severity around 1.5–2.0 → moderate abnormality
- severity above 2.0 → strong abnormality

These thresholds should be tuned per metric.

---

## Recommended Baseline Calculation

For each metric, create a longer rolling baseline over raw observations.

Example:
- use a 60–90 day rolling window
- compute:
  - rolling median
  - rolling interquantile spread such as p90 - p10

Then define expected spread:

```ts
expectedSpread = max(minSpreadFloor, rollingP90 - rollingP10)
```

Use a minimum floor so the denominator never collapses for very stable users.

Example:

```ts
expectedSpread = Math.max(3, rollingP90 - rollingP10)
```

The floor must be metric-specific.

---

## Important Rule: Do Not Let Outliers Define the Band

### Correct approach
- detect outliers first
- remove them from the band calculation
- render them separately

### Incorrect approach
- compute quantiles from all values
- then also render dots

This often causes:
- inflated bands
- false impression that instability was normal
- reduced visual salience of true abnormalities

---

## Handling Sparse Buckets

Some buckets will contain too few samples.

### Suggested rules

#### Fewer than 3 samples
- do not render a band
- optionally render only a point or a thin line segment

#### 3–7 samples
- render band, but consider lower confidence
- optionally reduce opacity

#### 8+ samples
- render normally

Add:

```ts
sampleCount
```

to each bucket and let the rendering layer adjust opacity or style accordingly.

---

## Suggested Visual Encoding

### Quantile band
- use the metric’s existing color
- low opacity fill
- no heavy border

### Median line
- same hue, darker or more saturated
- should remain crisp above the band

### Outlier dots
- same color family as the metric
- stronger opacity than the band
- optional white or dark stroke for contrast
- size can encode severity

### Optional severity mapping
- small dot = mild deviation
- medium dot = moderate deviation
- large dot = strong deviation

### Optional outlier shape mapping
- circle = high
- inverted triangle = low
- diamond = sudden change

Use shape carefully. Size is usually enough for overview mode.

---

## Multi-Metric Timeline Recommendation

If many metrics are shown together, prefer stacked lanes over a single overlaid chart.

### Why
- avoids scale conflicts
- keeps each band readable
- makes cross-correlation easier through shared time axis

### Layout
Each lane contains:
- quantile band
- median line
- outlier dots

Shared across all lanes:
- same x-axis
- same medication/event markers
- hover cursor synced vertically

---

## Tooltip Recommendation

When hovering a bucket, show:

- metric name
- bucket period
- sample count
- median
- p10 / p90
- band width
- abnormal count

Example:

```text
Resting Heart Rate
Jan 2025
Median: 63 bpm
P10–P90: 58–68 bpm
Band width: 10 bpm
Abnormal points: 3
Samples: 412
```

When hovering an outlier dot, show:

- exact timestamp
- exact value
- severity
- abnormality kind
- optional related context such as nearby medication change

---

## Recommended Interaction Behavior

### Default state
- all bands and lines visible
- outliers visible but not oversized

### Metric focus
When user selects a metric:
- keep the selected lane at full opacity
- dim unrelated lanes
- emphasize selected outlier dots
- optionally highlight correlated medication/event markers

### Outlier focus
When user selects an outlier:
- highlight the bucket it belongs to
- highlight nearby events within a configurable window
- show other metric anomalies in the same time period

This is where the timeline becomes clinically useful rather than just decorative.

---

## Smoothing Guidance

Do not smooth the raw data before quantile computation.

You may smooth the rendered median line visually if needed, but keep it subtle.

Recommended:
- compute quantiles from raw bucketed values
- render line with straight segments or mild interpolation
- avoid aggressive spline curves that imply nonexistent precision

---

## TypeScript Reference Implementation

### Utility functions

```ts
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) throw new Error("Empty array")
  if (sorted.length === 1) return sorted[0]

  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base

  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base])
  }
  return sorted[base]
}

function median(sorted: number[]): number {
  return quantile(sorted, 0.5)
}
```

### Bucketing

```ts
type BucketAccumulator = {
  bucketStart: string
  bucketEnd: string
  values: number[]
  raw: RawObservation[]
}
```

### Main aggregation function

```ts
type ClinicalRange = {
  low?: number
  high?: number
  tolerance?: number
}

type AggregationOptions = {
  timezone?: string
  bucket: "month" | "week" | "day"
  minSamplesForBand?: number
  clinicalRange?: ClinicalRange
  baselineWindowSize?: number
  minSpreadFloor?: number
  severityThreshold?: number
}

function aggregateQuantileBandSeries(
  metricId: string,
  label: string,
  unit: string,
  color: string,
  observations: RawObservation[],
  options: AggregationOptions
): QuantileBandSeries {
  const minSamplesForBand = options.minSamplesForBand ?? 3
  const severityThreshold = options.severityThreshold ?? 1.5
  const minSpreadFloor = options.minSpreadFloor ?? 1

  const sortedObs = [...observations].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )

  const allValues = sortedObs.map(o => o.value).sort((a, b) => a - b)
  const globalMedian = median(allValues)
  const globalP10 = quantile(allValues, 0.1)
  const globalP90 = quantile(allValues, 0.9)
  const expectedSpread = Math.max(minSpreadFloor, globalP90 - globalP10)

  const buckets = new Map<string, BucketAccumulator>()
  const outliers: OutlierPoint[] = []

  for (const obs of sortedObs) {
    const d = new Date(obs.timestamp)
    const bucketStart =
      options.bucket === "month"
        ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`
        : d.toISOString().slice(0, 10)

    const bucketEnd = bucketStart

    if (!buckets.has(bucketStart)) {
      buckets.set(bucketStart, {
        bucketStart,
        bucketEnd,
        values: [],
        raw: []
      })
    }

    const baselineDeviationScore = Math.abs(obs.value - globalMedian) / expectedSpread

    let clinicalDeviationScore = 0
    const low = options.clinicalRange?.low
    const high = options.clinicalRange?.high
    const tolerance = options.clinicalRange?.tolerance ?? 1

    if (low !== undefined && obs.value < low) {
      clinicalDeviationScore = (low - obs.value) / tolerance
    } else if (high !== undefined && obs.value > high) {
      clinicalDeviationScore = (obs.value - high) / tolerance
    }

    const severity = Math.max(baselineDeviationScore, clinicalDeviationScore)

    if (severity >= severityThreshold) {
      let kind: OutlierPoint["kind"] = "sudden-change"
      if (low !== undefined && obs.value < low) kind = "clinical-low"
      else if (high !== undefined && obs.value > high) kind = "clinical-high"
      else if (obs.value < globalMedian) kind = "baseline-low"
      else kind = "baseline-high"

      outliers.push({
        timestamp: obs.timestamp,
        value: obs.value,
        severity,
        kind,
        bucketStart
      })
    } else {
      const bucket = buckets.get(bucketStart)!
      bucket.values.push(obs.value)
      bucket.raw.push(obs)
    }
  }

  const summaries: QuantileBucket[] = []

  for (const bucket of buckets.values()) {
    const values = [...bucket.values].sort((a, b) => a - b)
    const abnormalInBucket = outliers.filter(o => o.bucketStart === bucket.bucketStart)

    if (values.length < minSamplesForBand) {
      continue
    }

    summaries.push({
      bucketStart: bucket.bucketStart,
      bucketEnd: bucket.bucketEnd,
      sampleCount: values.length,
      p10: quantile(values, 0.1),
      p25: quantile(values, 0.25),
      p50: quantile(values, 0.5),
      p75: quantile(values, 0.75),
      p90: quantile(values, 0.9),
      minNormal: values[0],
      maxNormal: values[values.length - 1],
      abnormalCount: abnormalInBucket.length,
      abnormalMaxSeverity:
        abnormalInBucket.length > 0
          ? Math.max(...abnormalInBucket.map(o => o.severity))
          : undefined
    })
  }

  summaries.sort((a, b) => a.bucketStart.localeCompare(b.bucketStart))

  return {
    metricId,
    label,
    unit,
    color,
    buckets: summaries,
    outliers
  }
}
```

---

## Rendering Notes

A chart library should receive:

- an ordered list of buckets
- a list of explicit outlier points

### Band path
Create an area from:
- top = p90
- bottom = p10

Optional inner band:
- top = p75
- bottom = p25

### Median path
Use:
- y = p50

### Outlier dots
Use:
- x = exact timestamp if the chart supports it
- otherwise x = bucket center for overview mode
- y = exact raw value

Using exact timestamps is better when there are multiple outliers in one month.

---

## Recommended Visual Rules for Dense Data

If there are many outliers:

### Option 1
Render all dots, but:
- reduce base size
- use alpha
- enlarge only on hover/focus

### Option 2
Cluster visually by month in overview mode:
- one larger dot with count badge
- expand into individual points on zoom

### Option 3
Use a hybrid:
- top N most severe dots visible individually
- remaining abnormalities represented as count markers

This can help prevent the chart from becoming noisy.

---

## Metric-Specific Tuning

Do not use the same thresholds for all vitals.

Each metric should define:
- clinical low/high range
- minimum spread floor
- severity threshold
- preferred bucket size
- preferred band quantiles

Example concept:

```ts
type MetricQuantileConfig = {
  metricId: string
  unit: string
  preferredBucket: "day" | "week" | "month"
  bandLowQuantile: number
  bandHighQuantile: number
  minSpreadFloor: number
  severityThreshold: number
  clinicalLow?: number
  clinicalHigh?: number
  clinicalTolerance: number
}
```

---

## Validation Checklist

Before shipping, verify:

- outliers are never silently removed
- quantile band still reads well when many buckets are empty
- sparse buckets are not rendered as misleading confidence
- the band opacity remains readable when multiple lanes are stacked
- tooltip values match the computed summaries
- exact timestamps of outliers are preserved
- event markers align correctly with bucketed metrics
- zooming switches bucket size appropriately

---

## Practical Defaults

For a first production version:

### Aggregation
- bucket size: month
- band: p10–p90
- line: p50

### Outlier logic
- combined baseline + clinical threshold
- severity threshold around 1.5

### Rendering
- one band
- one median line
- dots sized by severity

### Layout
- stacked lanes with shared time axis

This gives a strong result without making the implementation overly complex.

---

## Recommended Future Extensions

After the basic version works well, consider:

1. nested inner band p25–p75
2. anomaly clustering in overview mode
3. rolling baseline instead of global baseline
4. metric-specific clinical rules
5. anomaly type shapes
6. medication effect windows
7. cross-metric anomaly highlighting
8. density shading inside the band

---

## Summary

The recommended implementation pattern is:

- bucket raw values by month
- detect abnormal values before computing the band
- compute quantiles from normal values only
- render:
  - p50 as the median line
  - p10–p90 as the variability band
  - abnormal values as explicit outlier dots

This produces a chart that shows:

- long-term trend
- ordinary variability
- meaningful abnormalities

without sacrificing readability at multi-year scale.
