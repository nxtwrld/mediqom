<script lang="ts">
    import { select, scaleTime, scaleLinear, axisLeft, line, area, curveNatural, curveMonotoneY, zoom as d3Zoom, zoomIdentity, type Selection, type ScaleTime, type ScaleLinear } from 'd3';
    import { onMount } from 'svelte';
    import { get } from 'svelte/store';
    import { t } from '$lib/i18n';
    import AskButton from '$components/chat/AskButton.svelte';
    import ReferenceRange from '$components/charts/ReferenceRange.svelte';
    import Popover from '$components/ui/Popover.svelte';
    import MedicationCard from '$components/medications/MedicationCard.svelte';
    import type { MedicationDocument, Medication } from '$lib/medications/types';
    import { dateTime } from '$lib/datetime';

    const LABEL_HEIGHT = 20;

    function getRangeLabel(name: string): string {
        const translate = get(t);
        const labels: Record<string, string> = {
            low:    translate('charts.reference-range.low'),
            normal: translate('charts.reference-range.normal'),
            high:   translate('charts.reference-range.high'),
        };
        return labels[name] ?? name;
    }

    export interface MedicationLane {
        id: string;
        name: string;
        startDate: Date;
        endDate: Date | null;   // null = ongoing
        isOnce: boolean;        // frequency === 'once'
        status: string;
    }

    export interface SignalSeries {
        name: string;
        label: string;
        values: {
            date: Date;
            value: number;
            normalized: number;
            documentId?: string;
            documentTitle?: string;
            unit?: string;
            rawData?: any;
        }[];
        color: string;
    }

    interface MenuState {
        visible: boolean;
        x: number;
        y: number;
        dotX: number;
        placement: 'top' | 'bottom';
        point: SignalSeries['values'][number] | null;
        series: SignalSeries | null;
    }

    interface Props {
        series?: SignalSeries[];
        medications?: MedicationLane[];
        medicationData?: Map<string, { medication?: MedicationDocument; extracted?: Partial<Medication> }>;
        margin?: { top: number; right: number; bottom: number; left: number };
        timeRange?: [Date, Date];
        profileId?: string;
        onScaleReady?: (getY: (date: Date) => number, chartHeight: number) => void;
        highlightedPoint?: { signalName: string; value: number; documentId?: string } | null;
        documentCount?: number;
    }

    let {
        series = [],
        medications = [],
        medicationData,
        margin: marginProp = { top: 10, right: 52, bottom: LABEL_HEIGHT + 4, left: 60 },
        timeRange,
        profileId,
        onScaleReady,
        highlightedPoint = null,
        documentCount = 0,
    }: Props = $props();

    // Medication lane packing & margin computation
    const LANE_WIDTH = 14;
    const LANE_GAP = 2;
    const MED_COLOR_COUNT = 10;
    const DOC_ZONE_WIDTH = 5;

    interface PackedMedLane {
        item: MedicationLane;
        lane: number;
        colorIndex: number;
    }

    function packMedLanes(meds: MedicationLane[]): PackedMedLane[] {
        if (meds.length === 0) return [];
        const sorted = [...meds].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
        const laneEnds: number[] = [];
        const nameIndexMap = new Map<string, number>();
        let nextIndex = 0;
        return sorted.map(item => {
            const start = item.startDate.getTime();
            let lane = laneEnds.findIndex(end => end < start);
            if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
            laneEnds[lane] = (item.endDate ?? new Date(8640000000000000)).getTime();
            if (!nameIndexMap.has(item.name)) {
                nameIndexMap.set(item.name, (nextIndex++ % MED_COLOR_COUNT) + 1);
            }
            return { item, lane, colorIndex: nameIndexMap.get(item.name)! };
        });
    }

    const _packedLanes = $derived(packMedLanes(medications));
    const _numMedLanes = $derived(_packedLanes.length > 0 ? Math.max(..._packedLanes.map(p => p.lane)) + 1 : 0);

    // Dynamic margin based on medication lanes (left) and document zone (right)
    const margin = $derived({
        ...marginProp,
        left: marginProp.left + (_numMedLanes > 0 ? _numMedLanes * (LANE_WIDTH + LANE_GAP) + 14 : 0),
        right: marginProp.right + (documentCount > 0 ? DOC_ZONE_WIDTH : 0),
    });

    interface MedMenuState {
        visible: boolean;
        x: number;
        y: number;
        barX: number;
        placement: 'top' | 'bottom';
        laneData: PackedMedLane | null;
    }

    let svgElement: SVGSVGElement | undefined = $state();
    let menu = $state<MenuState>({ visible: false, x: 0, y: 0, dotX: 0, placement: 'top', point: null, series: null });
    let medMenu = $state<MedMenuState>({ visible: false, x: 0, y: 0, barX: 0, placement: 'top', laneData: null });

    // Module-level zoom state — persists between renders
    let yBase: ScaleTime<number, number> | null = null;
    let xDomain: [number, number] = [-0.5, 1.5];
    let zoomBehavior: ReturnType<typeof d3Zoom<SVGSVGElement, unknown>> | null = null;
    let focusedSeriesName: string | null = null;
    let lastAutoFocusedKey: string | null = null;

    function closeMenu() {
        menu = { ...menu, visible: false };
    }

    function closeMedMenu() {
        medMenu = { ...medMenu, visible: false };
    }

    function highlightKey(h: typeof highlightedPoint): string | null {
        return h ? `${h.signalName}:${h.value}:${h.documentId ?? ''}` : null;
    }

    function isContinuousSource(point: SignalSeries['values'][number]): boolean {
        const src = point.rawData?.source;
        return src === 'healthkit' || src === 'health_connect';
    }

    interface BucketedPoint {
        bucketMid: Date;
        minNormalized: number;
        maxNormalized: number;
        meanNormalized: number;
        count: number;
        representative: SignalSeries['values'][number];
    }

    function getBucketSizeMs(visibleSpanMs: number): number | null {
        if (visibleSpanMs > 2 * 365 * 86400000) return 30 * 86400000;   // month
        if (visibleSpanMs > 180 * 86400000)      return 7 * 86400000;    // week
        if (visibleSpanMs > 60 * 86400000)       return 86400000;        // day
        if (visibleSpanMs > 14 * 86400000)       return 6 * 3600000;     // 6 hours
        if (visibleSpanMs > 3 * 86400000)        return 3600000;         // 1 hour
        return null; // individual points mode
    }

    function bucketContinuousPoints(
        points: SignalSeries['values'],
        bucketMs: number,
        domainStartMs: number
    ): BucketedPoint[] {
        if (points.length === 0) return [];
        const bucketMap = new Map<number, { sum: number; min: number; max: number; count: number; timeSum: number; points: SignalSeries['values'] }>();

        for (const p of points) {
            const t = p.date.getTime();
            const idx = Math.floor((t - domainStartMs) / bucketMs);
            const existing = bucketMap.get(idx);
            if (existing) {
                existing.sum += p.normalized;
                existing.timeSum += t;
                existing.count++;
                existing.points.push(p);
                if (p.normalized < existing.min) existing.min = p.normalized;
                if (p.normalized > existing.max) existing.max = p.normalized;
            } else {
                bucketMap.set(idx, { sum: p.normalized, min: p.normalized, max: p.normalized, count: 1, timeSum: t, points: [p] });
            }
        }

        const result: BucketedPoint[] = [];
        for (const [idx, b] of bucketMap) {
            const mean = b.sum / b.count;
            let closest = b.points[0];
            let closestDist = Math.abs(closest.normalized - mean);
            for (let i = 1; i < b.points.length; i++) {
                const dist = Math.abs(b.points[i].normalized - mean);
                if (dist < closestDist) { closest = b.points[i]; closestDist = dist; }
            }
            result.push({
                bucketMid: new Date(b.timeSum / b.count),
                minNormalized: b.min,
                maxNormalized: b.max,
                meanNormalized: mean,
                count: b.count,
                representative: closest,
            });
        }
        result.sort((a, b) => a.bucketMid.getTime() - b.bucketMid.getTime());
        return result;
    }

    function applyFocusStyles(focusedName: string | null) {
        if (!svgElement) return;
        const container = select(svgElement)
            .select<SVGGElement>('g.chart-main g.series-container');

        container.selectAll<SVGGElement, SignalSeries>('g.series')
            .each(function(s) {
                const isFocused = !focusedName || s.name === focusedName;
                const g = select(this);

                if (focusedName && isFocused) g.raise();

                g.attr('opacity', isFocused ? 1 : 0.5)
                 .style('filter', !isFocused ? 'saturate(50%)' : null);

                g.select<SVGPathElement>('path.series-line')
                 .style('stroke-width', focusedName && isFocused ? '6px' : null);

                g.select<SVGPathElement>('path.series-band')
                 .attr('opacity', isFocused ? 0.2 : 0.05);

                g.selectAll<SVGCircleElement, SignalSeries['values'][number]>('.dot')
                 .attr('r', (d) => {
                     const isHL = highlightedPoint
                         && s.name === highlightedPoint.signalName
                         && Math.abs(d.value - highlightedPoint.value) < 0.001
                         && (!highlightedPoint.documentId || d.documentId === highlightedPoint.documentId);
                     const baseR = isHL ? 10 : isContinuousSource(d) ? 4 : 6;
                     return focusedName && isFocused ? baseR * 1.5 : baseR;
                 })
                 .attr('opacity', (d) => {
                     const isHL = highlightedPoint
                         && s.name === highlightedPoint.signalName
                         && Math.abs(d.value - highlightedPoint.value) < 0.001
                         && (!highlightedPoint.documentId || d.documentId === highlightedPoint.documentId);
                     if (isHL) return 1;
                     return isContinuousSource(d) ? 0 : 1;
                 });
            });
    }

    // Reusable interaction handlers for click + tap
    function handleDotInteraction(d: SignalSeries['values'][number], currentSeries: SignalSeries) {
        medMenu = { ...medMenu, visible: false };
        focusedSeriesName = currentSeries.name;
        applyFocusStyles(focusedSeriesName);
        if (!svgElement || !yBase) return;
        const width = svgElement.clientWidth - margin.left - margin.right;
        const x = scaleLinear<number, number>().domain(xDomain).range([0, width]);
        // Recompute y from current zoom state
        const currentTransform = select(svgElement).property('__zoom') ?? zoomIdentity;
        const y = currentTransform.rescaleY(yBase);
        const dotX = x(d.normalized) + margin.left;
        const dotY = y(d.date) + margin.top;
        const chartWidth = svgElement.clientWidth;
        const MENU_W = 260;
        const MENU_H = 210;
        const ARROW = 10;
        const edgePad = 8;
        const placement = (dotY - margin.top) >= (MENU_H + ARROW) ? 'top' as const : 'bottom' as const;
        const clampedX = Math.max(MENU_W / 2 + edgePad, Math.min(dotX, chartWidth - MENU_W / 2 - edgePad));
        menu = { visible: true, x: clampedX, y: dotY, dotX, placement, point: d, series: currentSeries };
    }

    function handleMedInteraction(d: PackedMedLane, laneX: number) {
        menu = { ...menu, visible: false };
        if (!svgElement || !yBase) return;
        const currentTransform = select(svgElement).property('__zoom') ?? zoomIdentity;
        const y = currentTransform.rescaleY(yBase);
        const barX = laneX + LANE_WIDTH / 2 + margin.left;
        const barY = y(d.item.startDate) + margin.top;
        const chartWidth = svgElement.clientWidth;
        const MENU_W = 260;
        const MENU_H = 180;
        const ARROW = 10;
        const edgePad = 8;
        const placement: 'top' | 'bottom' = (barY - margin.top) >= (MENU_H + ARROW) ? 'top' : 'bottom';
        const clampedX = Math.max(MENU_W / 2 + edgePad, Math.min(barX, chartWidth - MENU_W / 2 - edgePad));
        medMenu = { visible: true, x: clampedX, y: barY, barX, placement, laneData: d };
    }

    function handleSeriesLineClick(seriesName: string) {
        focusedSeriesName = focusedSeriesName === seriesName ? null : seriesName;
        if (!focusedSeriesName) lastAutoFocusedKey = highlightKey(highlightedPoint);
        applyFocusStyles(focusedSeriesName);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function renderDynamic(y: ScaleTime<number, number>, data: SignalSeries[], highlighted: typeof highlightedPoint, width: number, height: number, x: ScaleLinear<number, number>, axisGroup: Selection<SVGGElement, any, any, any>, zebraGroup: Selection<SVGGElement, any, any, any>, seriesContainer: Selection<SVGGElement, any, any, any>) {
        function isHighlighted(s: SignalSeries, d: SignalSeries['values'][number]): boolean {
            if (!highlighted) return false;
            if (s.name !== highlighted.signalName) return false;
            const valueMatch = Math.abs(d.value - highlighted.value) < 0.001;
            return highlighted.documentId
                ? valueMatch && d.documentId === highlighted.documentId
                : valueMatch;
        }

        // Y axis ticks — compute once, reuse for zebra bands
        const tickCount = Math.max(2, Math.floor(height / 40));
        const tickValues = y.ticks(tickCount) as Date[];

        // Derive format from actual tick interval (not domain span)
        const tickInterval = tickValues.length >= 2
            ? Math.abs(tickValues[1].getTime() - tickValues[0].getTime())
            : Math.abs((y.domain()[1] as Date).getTime() - (y.domain()[0] as Date).getTime());

        const isYearInterval  = tickInterval >= 365 * 86400000;
        const isMonthInterval = !isYearInterval && tickInterval >= 28 * 86400000;
        const isDayInterval   = !isYearInterval && !isMonthInterval && tickInterval >= 86400000;

        function tickFormat(date: Date): string {
            if (isYearInterval) return date.getFullYear().toString();
            if (isMonthInterval) {
                return date.getMonth() === 0
                    ? date.getFullYear().toString()
                    : date.toLocaleString('default', { month: 'short' });
            }
            if (isDayInterval) return date.toLocaleString('default', { month: 'short', day: 'numeric' });
            return date.toLocaleString('default', { hour: '2-digit', minute: '2-digit' });
        }

        axisGroup.call(
            axisLeft(y)
                .tickValues(tickValues)
                .tickFormat(d => tickFormat(d as Date))
        );
        // Position axis to the left of medication lanes (or just left of chart if no meds)
        const axisOffset = _numMedLanes > 0 ? -(margin.left - marginProp.left) - 4 : -8;
        axisGroup.attr('transform', `translate(${axisOffset}, 0)`);

        // Tick background pills
        axisGroup.selectAll<SVGGElement, Date>('.tick').each(function(d) {
            const g = select(this);
            const isYearMarker = isYearInterval || (isMonthInterval && d.getMonth() === 0);
            const textEl = g.select<SVGTextElement>('text');
            textEl.attr('class', isYearMarker ? 'tick-label tick-year' : isDayInterval ? 'tick-label tick-day' : 'tick-label tick-month');
            const bbox = textEl.node()?.getBBox();
            if (bbox) {
                g.selectAll<SVGRectElement, null>('rect.tick-bg').data([null]).join('rect')
                    .attr('class', isYearMarker ? 'tick-bg tick-year-bg' : isDayInterval ? 'tick-bg tick-day-bg' : 'tick-bg tick-month-bg')
                    .attr('x', bbox.x - 4).attr('y', bbox.y - 2)
                    .attr('width', bbox.width + 8).attr('height', bbox.height + 4)
                    .attr('rx', 3)
                    .lower();
            }
        });

        // Zebra bands between ticks (reuse tickValues — no second .ticks() call)
        const boundaries = [0, ...tickValues.map((d: Date) => y(d)), height];
        const zebraData = boundaries.slice(0, -1).map((y0, i) => ({
            y0, y1: boundaries[i + 1], odd: i % 2 === 1
        }));
        const zebraLeft = _numMedLanes > 0 ? -(margin.left - marginProp.left) : 0;
        zebraGroup.selectAll<SVGRectElement, typeof zebraData[0]>('rect')
            .data(zebraData.filter(d => d.odd))
            .join('rect')
            .attr('class', 'zebra-band')
            .attr('x', zebraLeft).attr('y', d => d.y0)
            .attr('width', width + margin.right - zebraLeft).attr('height', d => d.y1 - d.y0);

        // Series lines + dots
        const valueLine = line<{ date: Date; normalized: number }>()
            .curve(curveNatural)
            .x(d => x(d.normalized))
            .y(d => y(d.date));

        const isHoverDevice = typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches;

        const seriesGroups = seriesContainer
            .selectAll<SVGGElement, SignalSeries>('g.series')
            .data(data.filter(s => s.values.length > 0), d => d.name)
            .join(
                enter => enter.append('g').attr('class', d => `series series-${d.name}`),
                update => update,
                exit => exit.remove()
            );

        seriesGroups.each(function(s) {
            const g = select(this);
            const sorted = [...s.values].sort((a, b) => a.date.getTime() - b.date.getTime());
            const currentSeries = s;

            // Split by source type
            const continuousPoints = sorted.filter(d => isContinuousSource(d));
            const documentPoints = sorted.filter(d => !isContinuousSource(d));

            // Determine banding mode from visible time span
            const yDomain = y.domain() as Date[];
            const visibleSpanMs = Math.abs(yDomain[0].getTime() - yDomain[1].getTime());
            const bucketMs = continuousPoints.length > 10 ? getBucketSizeMs(visibleSpanMs) : null;
            const useBanding = bucketMs !== null && continuousPoints.length > 0;

            if (useBanding) {
                // === BAND MODE ===
                const domainStartMs = Math.min(yDomain[0].getTime(), yDomain[1].getTime());
                const buckets = bucketContinuousPoints(continuousPoints, bucketMs, domainStartMs);

                // Confidence band: area(min→max) with curveMonotoneY
                const bandGenerator = area<BucketedPoint>()
                    .curve(curveMonotoneY)
                    .x0(d => x(d.minNormalized))
                    .x1(d => x(d.maxNormalized))
                    .y(d => y(d.bucketMid));

                g.selectAll<SVGPathElement, null>('path.series-band').data([null]).join('path')
                    .attr('class', 'series-band')
                    .attr('fill', s.color)
                    .attr('opacity', 0.15)
                    .attr('d', bandGenerator(buckets) ?? '');

                // Mean line with curveMonotoneY
                const meanLine = line<BucketedPoint>()
                    .curve(curveMonotoneY)
                    .x(d => x(d.meanNormalized))
                    .y(d => y(d.bucketMid));

                if (buckets.length > 1) {
                    g.selectAll<SVGPathElement, null>('path.series-line').data([null]).join('path')
                        .attr('class', 'series-line')
                        .attr('stroke', s.color)
                        .attr('d', meanLine(buckets) ?? '')
                        .style('cursor', 'pointer');
                } else {
                    g.selectAll('path.series-line').remove();
                }

                // Dots: document-source + highlighted continuous + one per bucket
                const highlightedContinuous = continuousPoints.filter(d => isHighlighted(currentSeries, d));
                const highlightedSet = new Set(highlightedContinuous);
                const bucketDots = buckets
                    .map(b => b.representative)
                    .filter(d => !highlightedSet.has(d));
                const visibleDots = [...documentPoints, ...highlightedContinuous, ...bucketDots];

                function dotRadius(d: SignalSeries['values'][number]): number {
                    if (isHighlighted(currentSeries, d)) return 10;
                    return isContinuousSource(d) ? 4 : 6;
                }

                function dotOpacity(d: SignalSeries['values'][number]): number {
                    if (isHighlighted(currentSeries, d)) return 1;
                    return isContinuousSource(d) ? 0.5 : 1;
                }

                g.selectAll<SVGCircleElement, SignalSeries['values'][number]>('.dot')
                    .data(visibleDots, d => `${d.date.getTime()}-${d.value}`)
                    .join(
                        enter => enter.append('circle')
                            .attr('class', 'dot')
                            .on('mouseover', function(_event: MouseEvent, d: SignalSeries['values'][number]) {
                                if (isHoverDevice) {
                                    select(this)
                                        .attr('r', 9)
                                        .attr('opacity', 1)
                                        .style('filter', 'drop-shadow(0 0 4px rgba(0,0,0,0.35))');
                                }
                            })
                            .on('mouseout', function(_event: MouseEvent, d: SignalSeries['values'][number]) {
                                if (isHoverDevice) {
                                    select(this)
                                        .attr('r', dotRadius(d))
                                        .attr('opacity', dotOpacity(d))
                                        .style('filter', 'drop-shadow(0 0.1rem 0.2rem rgba(0,0,0,0.2))');
                                }
                            }),
                        update => update,
                        exit => exit.remove()
                    )
                    .attr('cx', d => x(d.normalized)).attr('cy', d => y(d.date))
                    .attr('r', d => dotRadius(d))
                    .attr('fill', s.color)
                    .attr('opacity', d => dotOpacity(d))
                    .attr('stroke', d => isContinuousSource(d) ? 'none' : 'white')
                    .attr('stroke-width', d => {
                        if (isHighlighted(currentSeries, d)) return 2;
                        return isContinuousSource(d) ? 0 : 1.5;
                    })
                    .style('filter', d => isContinuousSource(d) ? 'none' : 'drop-shadow(0 0.1rem 0.2rem rgba(0,0,0,0.2))');

            } else {
                // === INDIVIDUAL MODE (current behavior) ===
                g.selectAll('path.series-band').remove();

                if (sorted.length > 1) {
                    g.selectAll<SVGPathElement, null>('path.series-line').data([null]).join('path')
                        .attr('class', 'series-line')
                        .attr('stroke', s.color)
                        .attr('d', valueLine(sorted) ?? '')
                        .style('cursor', 'pointer');
                } else {
                    g.selectAll('path.series-line').remove();
                }

                function dotRadius(d: SignalSeries['values'][number]): number {
                    if (isHighlighted(currentSeries, d)) return 10;
                    return isContinuousSource(d) ? 4 : 6;
                }

                function dotOpacity(d: SignalSeries['values'][number]): number {
                    if (isHighlighted(currentSeries, d)) return 1;
                    return isContinuousSource(d) ? 0 : 1;
                }

                g.selectAll<SVGCircleElement, SignalSeries['values'][number]>('.dot')
                    .data(sorted, d => `${d.date.getTime()}-${d.value}`)
                    .join(
                        enter => enter.append('circle')
                            .attr('class', 'dot')
                            .on('mouseover', function(_event: MouseEvent, d: SignalSeries['values'][number]) {
                                if (isHoverDevice) {
                                    select(this)
                                        .attr('r', 9)
                                        .attr('opacity', 1)
                                        .style('filter', 'drop-shadow(0 0 4px rgba(0,0,0,0.35))');
                                }
                            })
                            .on('mouseout', function(_event: MouseEvent, d: SignalSeries['values'][number]) {
                                if (isHoverDevice) {
                                    select(this)
                                        .attr('r', dotRadius(d))
                                        .attr('opacity', dotOpacity(d))
                                        .style('filter', isContinuousSource(d) ? 'none' : 'drop-shadow(0 0.1rem 0.2rem rgba(0,0,0,0.2))');
                                }
                            }),
                        update => update,
                        exit => exit.remove()
                    )
                    .attr('cx', d => x(d.normalized)).attr('cy', d => y(d.date))
                    .attr('r', d => dotRadius(d))
                    .attr('fill', s.color)
                    .attr('opacity', d => dotOpacity(d))
                    .attr('stroke', d => isContinuousSource(d) ? 'none' : 'white')
                    .attr('stroke-width', d => {
                        if (isHighlighted(currentSeries, d)) return 2;
                        return isContinuousSource(d) ? 0 : 1.5;
                    })
                    .style('filter', d => isContinuousSource(d) ? 'none' : 'drop-shadow(0 0.1rem 0.2rem rgba(0,0,0,0.2))');
            }

            // Highlight rings — always individual, unchanged
            g.selectAll<SVGCircleElement, SignalSeries['values'][number]>('.dot-highlight-ring')
                .data(sorted.filter(d => isHighlighted(currentSeries, d)), d => `${d.date.getTime()}-${d.value}`)
                .join('circle')
                .attr('class', 'dot-highlight-ring')
                .attr('cx', d => x(d.normalized)).attr('cy', d => y(d.date))
                .attr('r', 16).attr('fill', 'none')
                .attr('stroke', s.color).attr('stroke-width', 2).attr('opacity', 0.5);
        });

        // Medication lanes — rendered in the left margin area
        const chartMain = select(svgElement!).select<SVGGElement>('g.chart-main');
        const medGroup = chartMain.selectAll<SVGGElement, null>('g.medication-lanes').data([null]).join('g').attr('class', 'medication-lanes');

        if (_packedLanes.length > 0) {
            const medBaseX = -margin.left + marginProp.left; // start of med area within chart-main
            const now = new Date();

            const medItems = medGroup.selectAll<SVGGElement, PackedMedLane>('g.med-item')
                .data(_packedLanes, d => d.item.id)
                .join(
                    enter => enter.append('g').attr('class', 'med-item'),
                    update => update,
                    exit => exit.remove()
                );

            medItems.each(function(d) {
                const g = select(this);
                const laneX = medBaseX + d.lane * (LANE_WIDTH + LANE_GAP) + 4;
                const isActive = d.item.status === 'active';
                const endDate = d.item.endDate ?? now;

                g.style('cursor', 'pointer');

                if (d.item.isOnce) {
                    // Dot for single-occurrence meds
                    g.selectAll('rect').remove();
                    g.selectAll<SVGCircleElement, null>('circle.med-dot').data([null]).join('circle')
                        .attr('class', 'med-dot')
                        .attr('cx', laneX + LANE_WIDTH / 2)
                        .attr('cy', y(d.item.startDate))
                        .attr('r', 7)
                        .style('fill', `var(--color-categ1-${d.colorIndex})`)
                        .attr('stroke', 'white')
                        .attr('stroke-width', 1.5)
                        .attr('opacity', isActive ? 1 : 0.75);
                } else {
                    // Bar for duration meds
                    g.selectAll('circle.med-dot').remove();
                    const yStart = y(d.item.startDate);
                    const yEnd = y(endDate);
                    const yTop = Math.min(yStart, yEnd);
                    const barHeight = Math.max(10, Math.abs(yStart - yEnd));

                    g.selectAll<SVGRectElement, null>('rect.med-bar').data([null]).join('rect')
                        .attr('class', 'med-bar')
                        .attr('x', laneX + (LANE_WIDTH - 10) / 2)
                        .attr('y', yTop)
                        .attr('width', 10)
                        .attr('height', barHeight)
                        .attr('rx', 5)
                        .style('fill', `var(--color-categ1-${d.colorIndex})`)
                        .attr('opacity', isActive ? 1 : 0.75);

                    // Ongoing indicator — vertical dashed line from bar top to chart top
                    if (!d.item.endDate) {
                        const centerX = laneX + LANE_WIDTH / 2;
                        g.selectAll<SVGLineElement, null>('line.med-ongoing').data([null]).join('line')
                            .attr('class', 'med-ongoing')
                            .attr('x1', centerX).attr('x2', centerX)
                            .attr('y1', yTop).attr('y2', 0)
                            .style('stroke', `var(--color-categ1-${d.colorIndex})`)
                            .attr('stroke-width', 5.5)
                            .attr('line-cap', 'round')
                            .attr('stroke-dasharray', '5 3')
                            .attr('opacity', 0.6);
                    } else {
                        g.selectAll('line.med-ongoing').remove();
                    }
                }

                // Tooltip via <title>
                g.selectAll<SVGTitleElement, null>('title').data([null]).join('title')
                    .text(d.item.name);
            });
            // Vertical separator line between med zone and reference chart
            medGroup.selectAll<SVGLineElement, null>('line.med-separator').data([null]).join('line')
                .attr('class', 'med-separator')
                .attr('x1', -3).attr('x2', -3)
                .attr('y1', 0).attr('y2', height);
        } else {
            medGroup.selectAll('*').remove();
        }

        if (onScaleReady) {
            onScaleReady((date: Date) => y(date) + margin.top, height);
        }

        // Auto-focus when highlightedPoint is new (key changed)
        const currentKey = highlightKey(highlighted);
        if (!highlighted) {
            lastAutoFocusedKey = null; // reset so next highlight auto-focuses
        } else if (currentKey !== lastAutoFocusedKey) {
            focusedSeriesName = highlighted.signalName;
            lastAutoFocusedKey = currentKey;
        }
        applyFocusStyles(focusedSeriesName);
    }

    function renderChart(data: SignalSeries[], highlighted: typeof highlightedPoint = null) {
        if (!svgElement) return;

        const allPoints = data.flatMap(s => s.values);
        if (allPoints.length === 0 && !timeRange) {
            select(svgElement).selectAll('g.chart-main').remove();
            return;
        }

        const width = svgElement.clientWidth - margin.left - margin.right;
        const height = svgElement.clientHeight - margin.top - margin.bottom;
        if (width <= 0 || height <= 0) return;

        // Persistent root group — created once, updated on resize
        const svg = select(svgElement)
            .selectAll<SVGGElement, null>('g.chart-main')
            .data([null])
            .join('g')
            .attr('class', 'chart-main')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        // Persistent sub-groups (SVG painter's order — later = on top)
        const bandsGroup      = svg.selectAll<SVGGElement, null>('g.bands').data([null]).join('g').attr('class', 'bands');
        const zebraGroup      = svg.selectAll<SVGGElement, null>('g.zebra-bands').data([null]).join('g').attr('class', 'zebra-bands');
        const refLinesGroup   = svg.selectAll<SVGGElement, null>('g.ref-lines').data([null]).join('g').attr('class', 'ref-lines');
        const axisGroup       = svg.selectAll<SVGGElement, null>('g.axis').data([null]).join('g').attr('class', 'axis');
        const labelsGroup     = svg.selectAll<SVGGElement, null>('g.zone-labels').data([null]).join('g').attr('class', 'zone-labels');
        const seriesContainer = svg.selectAll<SVGGElement, null>('g.series-container').data([null]).join('g').attr('class', 'series-container');

        // Y axis: time — newest at top, oldest at bottom
        const allDates = allPoints.map(p => p.date);
        const dataMinDate = allDates.length > 0
            ? new Date(Math.min(...allDates.map(d => d.getTime())))
            : timeRange![0];
        const dataMaxDate = allDates.length > 0
            ? new Date(Math.max(...allDates.map(d => d.getTime())))
            : timeRange![1];
        const domainMin = timeRange ? timeRange[0] : dataMinDate;
        const domainMax = timeRange ? timeRange[1] : dataMaxDate;
        const dateSpan = Math.max(domainMax.getTime() - domainMin.getTime(), 86400000);

        yBase = scaleTime<number, number>()
            .domain([
                new Date(domainMax.getTime() + dateSpan * 0.05), // top of chart = newest
                new Date(domainMin.getTime() - dateSpan * 0.05)  // bottom = oldest
            ])
            .range([0, height]);

        // X axis: normalized space — 0 = refMin, 1 = refMax
        // Compute dynamic domain from actual normalized values, minimum [-0.5, 1.5]
        const allNorm = allPoints.map(p => p.normalized);
        const normMin = allNorm.length > 0 ? Math.min(...allNorm) : 0;
        const normMax = allNorm.length > 0 ? Math.max(...allNorm) : 1;
        const pad = Math.max((normMax - normMin) * 0.1, 0.1);
        xDomain = [
            Math.min(-0.5, normMin - pad),
            Math.max(1.5,  normMax + pad),
        ];
        const x = scaleLinear<number, number>()
            .domain(xDomain)
            .range([0, width]);

        // Reference bands — keyed join (static, X-axis only)
        const bandData = [
            { id: 'low',    cls: 'band-low',    x: x(xDomain[0]), width: Math.max(0, x(0) - x(xDomain[0]))         },
            { id: 'normal', cls: 'band-normal', x: x(0),          width: Math.max(0, x(1) - x(0))                   },
            { id: 'high',   cls: 'band-high',   x: x(1),          width: Math.max(0, width - x(1))   },
        ];
        bandsGroup.selectAll<SVGRectElement, typeof bandData[0]>('rect')
            .data(bandData, d => d.id)
            .join('rect')
            .attr('class', d => d.cls)
            .attr('x', d => d.x).attr('y', 0)
            .attr('width', d => d.width).attr('height', height);

        // Reference boundary lines — static, X positions
        refLinesGroup.selectAll<SVGLineElement, number>('line')
            .data([x(0), x(1)])
            .join('line')
            .attr('class', 'ref-line')
            .attr('x1', d => d).attr('x2', d => d)
            .attr('y1', 0).attr('y2', height);

        // Zone label boxes — LOW / NORMAL / HIGH (static, bottom of chart)
        const zones = [
            { name: 'low',    x1: x(xDomain[0]), x2: x(0)                  },
            { name: 'normal', x1: x(0),          x2: x(1)                   },
            { name: 'high',   x1: x(1),          x2: width   },
        ];

        labelsGroup.selectAll<SVGGElement, typeof zones[number]>('g.zone')
            .data(zones, d => d.name)
            .join('g')
            .attr('class', d => `zone zone-${d.name}`)
            .each(function(z) {
                const g = select(this);
                const w = Math.max(0, z.x2 - z.x1);
                g.selectAll<SVGRectElement, null>('rect').data([null]).join('rect')
                    .attr('x', z.x1).attr('y', height + 4)
                    .attr('width', w).attr('height', LABEL_HEIGHT).attr('rx', 3)
                    .attr('class', `rangeLabelBack ${z.name}`);
                g.selectAll<SVGTextElement, null>('text').data([null]).join('text')
                    .attr('x', (z.x1 + z.x2) / 2).attr('y', height + 4 + LABEL_HEIGHT / 2)
                    .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
                    .attr('class', `rangeLabelText ${z.name}`)
                    .text(getRangeLabel(z.name));
            });

        // Medication zone label — rendered below chart, aligned with zone labels
        if (_numMedLanes > 0) {
            const medBaseX = -margin.left + marginProp.left;
            const medZoneWidth = _numMedLanes * (LANE_WIDTH + LANE_GAP) + 4;
            const medCenterX = medBaseX - 2 + medZoneWidth / 2;
            const medLabelGroup = svg.selectAll<SVGGElement, null>('g.med-zone-label').data([null]).join('g').attr('class', 'med-zone-label');
            medLabelGroup.selectAll<SVGRectElement, null>('rect').data([null]).join('rect')
                .attr('x', medBaseX - 2).attr('y', height + 4)
                .attr('width', medZoneWidth).attr('height', LABEL_HEIGHT).attr('rx', 3)
                .attr('class', 'med-label-back');
            const iconSize = 14;
            medLabelGroup.selectAll<SVGUseElement, null>('use.med-label-icon').data([null]).join('svg:use')
                .attr('class', 'med-label-icon')
                .attr('href', '/icons.svg#pills')
                .attr('x', medCenterX - iconSize / 2).attr('y', height + 4 + (LABEL_HEIGHT - iconSize) / 2)
                .attr('width', iconSize).attr('height', iconSize);
        } else {
            svg.selectAll('g.med-zone-label').remove();
        }

        // Document zone label — rendered below chart on the right, mirrors medication zone on the left
        if (documentCount > 0) {
            const docZoneX = width + 3;
            const docZoneW = margin.right - 3; // from separator to right edge of margin

            // Vertical separator line
            svg.selectAll<SVGLineElement, null>('line.doc-separator').data([null]).join('line')
                .attr('class', 'doc-separator')
                .attr('x1', docZoneX).attr('x2', docZoneX)
                .attr('y1', 0).attr('y2', height);

            // Zone label at bottom with document icon
            const docLabelGroup = svg.selectAll<SVGGElement, null>('g.doc-zone-label').data([null]).join('g').attr('class', 'doc-zone-label');
            docLabelGroup.selectAll<SVGRectElement, null>('rect').data([null]).join('rect')
                .attr('x', docZoneX).attr('y', height + 4)
                .attr('width', docZoneW).attr('height', LABEL_HEIGHT).attr('rx', 3)
                .attr('class', 'doc-label-back');
            const iconSize = 14;
            const docCenterX = docZoneX + docZoneW / 2;
            docLabelGroup.selectAll<SVGUseElement, null>('use.doc-label-icon').data([null]).join('svg:use')
                .attr('class', 'doc-label-icon')
                .attr('href', '/icons.svg#report')
                .attr('x', docCenterX - iconSize / 2).attr('y', height + 4 + (LABEL_HEIGHT - iconSize) / 2)
                .attr('width', iconSize).attr('height', iconSize);
        } else {
            svg.selectAll('line.doc-separator').remove();
            svg.selectAll('g.doc-zone-label').remove();
        }

        // Update zoom translate extent for new chart height
        zoomBehavior?.translateExtent([[0, 0], [0, height]]);

        // Reset zoom to identity when data/timeRange changes
        if (zoomBehavior) {
            select(svgElement).call(zoomBehavior.transform, zoomIdentity);
        }

        // Initial dynamic render with unzoomed scale
        renderDynamic(yBase, data, highlighted, width, height, x, axisGroup, zebraGroup, seriesContainer);
    }

    $effect(() => {
        renderChart(series, highlightedPoint);
    });

    onMount(() => {
        if (!svgElement) return;

        // SVG click handler lives here to avoid re-attachment on every render
        function dismissAll() {
            menu = { ...menu, visible: false };
            medMenu = { ...medMenu, visible: false };
            focusedSeriesName = null;
            lastAutoFocusedKey = highlightKey(highlightedPoint);
            applyFocusStyles(null);
        }

        // Native delegated tap detection — bypasses D3's event system entirely.
        // Uses capture phase so handlers fire BEFORE D3 zoom's bubble-phase handlers.
        // This solves mobile touch issues where D3 .on() handlers don't work in WKWebView.
        let tapStartX = 0, tapStartY = 0, tapStartTime = 0;
        let tapTarget: Element | null = null;
        let bgTapStartX = 0, bgTapStartY = 0, bgTapStartTime = 0;

        // After a successful tap on an interactive element, the browser synthesizes a
        // click event from the pointer pair. That click would bubble to window and
        // trigger Popover's handleClickOutside, instantly closing the popover we just
        // opened. This one-shot capture handler eats that synthesized click.
        function suppressNextClick() {
            svgElement!.addEventListener('click', (ev) => { ev.stopPropagation(); }, { capture: true, once: true });
        }

        function onPointerDown(e: PointerEvent) {
            const target = e.target as Element;
            // Track background taps (no stopPropagation — D3 zoom can still pan)
            bgTapStartX = e.clientX;
            bgTapStartY = e.clientY;
            bgTapStartTime = Date.now();
            // Check if tapping an interactive element
            if (target.classList.contains('dot')
                || target.classList.contains('series-line')
                || target.classList.contains('med-bar')
                || target.classList.contains('med-dot')
                || target.closest('.med-item')) {
                tapStartX = e.clientX;
                tapStartY = e.clientY;
                tapStartTime = Date.now();
                tapTarget = target;
                e.stopPropagation(); // prevent D3 zoom from capturing this
            }
        }

        function onPointerUp(e: PointerEvent) {
            if (tapTarget) {
                const dx = e.clientX - tapStartX;
                const dy = e.clientY - tapStartY;
                const dt = Date.now() - tapStartTime;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const wasTap = dist < 10 && dt < 300;
                const capturedTarget = tapTarget;
                tapTarget = null;
                if (!wasTap) return;
                e.stopPropagation();

                // Determine what was tapped and dispatch
                if (capturedTarget.classList.contains('dot')) {
                    const d = select(capturedTarget).datum() as SignalSeries['values'][number];
                    const seriesG = capturedTarget.closest('g.series');
                    const s = seriesG ? select(seriesG).datum() as SignalSeries : null;
                    if (d && s) { handleDotInteraction(d, s); suppressNextClick(); }
                } else if (capturedTarget.classList.contains('series-line')) {
                    const seriesG = capturedTarget.closest('g.series');
                    const s = seriesG ? select(seriesG).datum() as SignalSeries : null;
                    if (s) { handleSeriesLineClick(s.name); suppressNextClick(); }
                } else if (capturedTarget.classList.contains('med-bar')
                           || capturedTarget.classList.contains('med-dot')
                           || capturedTarget.closest('.med-item')) {
                    const medG = capturedTarget.closest('.med-item');
                    const d = medG ? select(medG).datum() as PackedMedLane : null;
                    if (d) {
                        const medBaseX = -margin.left + marginProp.left;
                        const laneX = medBaseX + d.lane * (LANE_WIDTH + LANE_GAP) + 4;
                        handleMedInteraction(d, laneX);
                        suppressNextClick();
                    }
                }
            } else {
                // Background tap — dismiss popovers
                const dx = e.clientX - bgTapStartX;
                const dy = e.clientY - bgTapStartY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const dt = Date.now() - bgTapStartTime;
                if (dist < 10 && dt < 300) {
                    dismissAll();
                }
            }
        }

        svgElement.addEventListener('pointerdown', onPointerDown, true);
        svgElement.addEventListener('pointerup', onPointerUp, true);

        // Set up D3 zoom — Y axis only, scaleExtent 1..20
        zoomBehavior = d3Zoom<SVGSVGElement, unknown>()
            .scaleExtent([1, 20])
            .filter((event: any) => {
                if (event.type === 'wheel' || event.type === 'dblclick') return true;
                if (event.touches?.length >= 2) return true;
                const target = event.target as Element;
                // Don't let zoom capture taps on interactive elements
                if (target.classList.contains('dot')
                    || target.classList.contains('series-line')
                    || target.classList.contains('med-bar')
                    || target.classList.contains('med-dot')
                    || target.closest?.('.med-item')) return false;
                return true;
            })
            .on('zoom', (event) => {
                if (!yBase || !svgElement) return;
                const yZoomed = event.transform.rescaleY(yBase);
                const width = svgElement.clientWidth - margin.left - margin.right;
                const height = svgElement.clientHeight - margin.top - margin.bottom;
                if (width <= 0 || height <= 0) return;
                const svg = select(svgElement).select<SVGGElement>('g.chart-main');
                const axisGroup = svg.select<SVGGElement>('g.axis');
                const zebraGroup = svg.select<SVGGElement>('g.zebra-bands');
                const seriesContainer = svg.select<SVGGElement>('g.series-container');
                const x = scaleLinear<number, number>().domain(xDomain).range([0, width]);
                renderDynamic(yZoomed, series, highlightedPoint, width, height, x, axisGroup, zebraGroup, seriesContainer);
            });

        select(svgElement).call(zoomBehavior);

        // Prevent page scroll when mouse is over the chart
        svgElement.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });

        let rTimer: ReturnType<typeof setTimeout>;
        const observer = new ResizeObserver(() => {
            clearTimeout(rTimer);
            rTimer = setTimeout(() => renderChart(series, highlightedPoint), 100);
        });
        observer.observe(svgElement);

        function handleOutsideClick(e: PointerEvent) {
            if (!menu.visible && !medMenu.visible) return;
            const wrap = svgElement?.closest('.chart-wrap');
            if (wrap && !wrap.contains(e.target as Node)) {
                menu = { ...menu, visible: false };
                medMenu = { ...medMenu, visible: false };
            }
        }
        window.addEventListener('pointerdown', handleOutsideClick);

        return () => {
            clearTimeout(rTimer);
            observer.disconnect();
            select(svgElement!).on('.zoom', null);
            svgElement!.removeEventListener('pointerdown', onPointerDown, true);
            svgElement!.removeEventListener('pointerup', onPointerUp, true);
            window.removeEventListener('pointerdown', handleOutsideClick);
        };
    });
</script>

<div class="chart-wrap">
    <svg bind:this={svgElement}></svg>

    <!-- Vitals popover -->
    {#if menu.point && menu.series}
    <Popover
        open={menu.visible}
        placement={menu.placement}
        x={menu.x}
        y={menu.y}
        arrowOffset={menu.dotX - menu.x}
        onclose={closeMenu}
    >
        <div class="dot-menu-content">
            <div class="dot-menu-header">
                <h4 class="h4 dot-menu-title">{menu.series.label}</h4>
                <div class="dot-menu-value">{menu.point.value}{menu.point.unit ? ` ${menu.point.unit}` : ''}</div>
                <div class="dot-menu-date">{dateTime(menu.point.date)}</div>
            </div>
            <hr class="dot-menu-divider" />
            {#if menu.point.rawData?.reference}
            <ReferenceRange
                value={menu.point.value}
                reference={menu.point.rawData.reference}
                referenceRange={{
                    low: { value: Number(menu.point.rawData.reference.split('-')[0]), unit: menu.point.unit ?? '' },
                    high: { value: Number(menu.point.rawData.reference.split('-')[1]), unit: menu.point.unit ?? '' }
                }}
                labels={false}
                showValue={true}
            />
            {/if}
            <hr class="dot-menu-divider" /><br/>
            {#if menu.point.documentId && profileId}
                <a
                    class="button"
                    href="/med/p/{profileId}/documents/{menu.point.documentId}"
                    data-sveltekit-preload-data="false"
                    onclick={closeMenu}
                >
                    {$t('app.documents.view-document')}
                </a>
            {:else if menu.point.rawData?.source}
                <div class="dot-menu-source">
                    <span class="source-label">{menu.point.rawData.source === 'healthkit' ? 'Apple Health' : menu.point.rawData.source === 'health_connect' ? 'Health Connect' : menu.point.rawData.source}</span>
                </div>
            {/if}
            <AskButton
                className="button"
                type="signal"
                label={menu.series.label}
                data={menu.point.rawData ?? { signal: menu.series.name, value: menu.point.value, unit: menu.point.unit, date: menu.point.date }}
                documentId={menu.point.documentId}
                documentTitle={menu.point.documentTitle}
            />
        </div>
    </Popover>
    {/if}

    <!-- Medication popover -->
    {#if medMenu.laneData}
        {@const data = medicationData?.get(medMenu.laneData.item.id)}
        <Popover
            open={medMenu.visible}
            placement={medMenu.placement}
            x={medMenu.x}
            y={medMenu.y}
            arrowOffset={medMenu.barX - medMenu.x}
            onclose={closeMedMenu}
        >
            <MedicationCard
                medication={data?.medication}
                extracted={data?.extracted}
                profileId={profileId ?? ''}
            />
        </Popover>
    {/if}
</div>

<style>
    .chart-wrap {
        position: relative;
        width: 100%;
        height: 100%;
        min-height: 16rem;
    }

    .chart-wrap svg {
        width: 100%;
        height: 100%;
        touch-action: none;
    }

    .chart-wrap svg :global(.band-low),
    .chart-wrap svg :global(.band-high) {
        fill: var(--color-negative, #e74c3c);
        opacity: 0.07;
    }

    .chart-wrap svg :global(.band-normal) {
        fill: var(--color-positive, #2ecc71);
        opacity: 0.09;
    }

    .chart-wrap svg :global(.zebra-band) {
        fill: rgba(0, 0, 0, 0.05);
        pointer-events: none;
    }

    .chart-wrap svg :global(.ref-line) {
        stroke: var(--color-border, #ccc);
        stroke-dasharray: 4 2;
        stroke-width: 1;
        opacity: 0.7;
    }

    .chart-wrap svg :global(.series-line) {
        fill: none;
        stroke-width: 4px;
        opacity: 0.8;
        cursor: pointer;
    }

    .chart-wrap svg :global(.series-band) {
        pointer-events: none;
        transition: opacity 0.3s ease;
    }

    .chart-wrap svg :global(.dot) {
        filter: drop-shadow(0 0.1rem 0.2rem rgba(0,0,0,0.2));
        cursor: pointer;
        transition: r 0.15s ease, opacity 0.15s ease;
    }

    .chart-wrap svg :global(.dot-highlight-ring) {
        animation: highlight-pulse 1.8s ease-in-out infinite;
    }

    @keyframes highlight-pulse {
        0%, 100% { opacity: 0.5; }
        50% { opacity: 0.15; }
    }

    .chart-wrap svg :global(.axis .domain),
    .chart-wrap svg :global(.axis .tick line) {
        opacity: 0.25;
    }

    .chart-wrap svg :global(.tick-year) {
        font-size: 0.7rem;
        font-weight: 700;
        fill: var(--color-white);
    }

    .chart-wrap svg :global(.tick-year-bg) {
        fill: var(--color-gray-900);
    }

    .chart-wrap svg :global(.tick-month-bg) {
        fill: var(--color-gray-400);
    }

    .chart-wrap svg :global(.tick-month) {
        font-size: 0.6rem;
        fill: var(--color-gray-900);
    }

    .chart-wrap svg :global(.tick-day-bg) {
        fill: var(--color-gray-200);
    }

    .chart-wrap svg :global(.tick-day) {
        font-size: 0.6rem;
        fill: var(--color-gray-900);
    }

    /* Zone label boxes */
    .chart-wrap svg :global(.rangeLabelBack.normal) {
        fill: var(--color-positive);
    }

    .chart-wrap svg :global(.rangeLabelBack.low),
    .chart-wrap svg :global(.rangeLabelBack.high) {
        fill: var(--color-negative);
    }

    .chart-wrap svg :global(.rangeLabelText) {
        fill: #fff;
        font-size: 0.6rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    /* Dot context menu content */
    .dot-menu-content {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        padding: 0.7rem;
        min-width: 14rem;
    }

    .dot-menu-header {
        padding: 0 0 .5rem 0;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }
    .dot-menu-header  > .h4 {
        margin: 0;
    }

    .dot-menu-value {
        font-size: 1.25rem;
        font-weight: 600;
        color: var(--color-text-primary);
    }

    .dot-menu-date {
        font-size: 0.7rem;
        color: var(--color-text-secondary);
    }

    .dot-menu-divider {
        border: none;
        border-top: 1px solid var(--color-border);
        margin: 0.1rem 0;
    }

    .dot-menu-content :global(.range) {
        min-width: unset;
        margin: 0.1rem 0;
    }

    .dot-menu-content :global(.range.-value) {
        padding-top: 1.6rem;
    }

    .dot-menu-source {
        font-size: 0.75rem;
        color: var(--color-text-secondary);
        padding: 0.2rem 0;
    }

    .dot-menu-source .source-label {
        font-weight: 600;
    }

    .dot-menu-content a.button {
        text-decoration: none;
    }

    /* Medication zone */
    .chart-wrap svg :global(.med-separator) {
        stroke: var(--color-border);
        stroke-width: 1;
        opacity: 0.4;
    }

    .chart-wrap svg :global(.med-label-back) {
        fill: var(--color-gray-300, #ddd);
    }

    .chart-wrap svg :global(.med-label-icon) {
        fill: var(--color-gray-700, #555);
    }

    /* Medication lanes */
    .chart-wrap svg :global(.med-bar) {
        transition: opacity 0.15s ease;
    }

    .chart-wrap svg :global(.med-bar:hover) {
        opacity: 1 !important;
    }

    .chart-wrap svg :global(.med-dot) {
        transition: opacity 0.15s ease;
    }

    .chart-wrap svg :global(.med-dot:hover) {
        opacity: 1 !important;
    }

    .chart-wrap svg :global(.med-item) {
        cursor: pointer;
    }

    /* Document zone */
    .chart-wrap svg :global(.doc-separator) {
        stroke: var(--color-border);
        stroke-width: 1;
        opacity: 0.4;
    }

    .chart-wrap svg :global(.doc-label-back) {
        fill: var(--color-gray-300, #ddd);
    }

    .chart-wrap svg :global(.doc-label-icon) {
        fill: var(--color-gray-700, #555);
    }
</style>
