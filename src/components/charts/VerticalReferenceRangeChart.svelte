<script lang="ts">
    import { select, scaleTime, scaleLinear, axisLeft, line, zoom as d3Zoom, zoomIdentity, type Selection, type ScaleTime, type ScaleLinear } from 'd3';
    import { onMount } from 'svelte';
    import { get } from 'svelte/store';
    import { t } from '$lib/i18n';
    import AskButton from '$components/chat/AskButton.svelte';
    import ReferenceRange from '$components/charts/ReferenceRange.svelte';
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
        margin?: { top: number; right: number; bottom: number; left: number };
        timeRange?: [Date, Date];
        profileId?: string;
        onScaleReady?: (getY: (date: Date) => number, chartHeight: number) => void;
        highlightedPoint?: { signalName: string; value: number; documentId?: string } | null;
    }

    let {
        series = [],
        margin = { top: 10, right: 52, bottom: LABEL_HEIGHT + 4, left: 60 },
        timeRange,
        profileId,
        onScaleReady,
        highlightedPoint = null,
    }: Props = $props();

    let svgElement: SVGSVGElement | undefined = $state();
    let menu = $state<MenuState>({ visible: false, x: 0, y: 0, dotX: 0, placement: 'top', point: null, series: null });

    // Module-level zoom state — persists between renders
    let yBase: ScaleTime<number, number> | null = null;
    let xDomain: [number, number] = [-0.5, 1.5];
    let zoomBehavior: ReturnType<typeof d3Zoom<SVGSVGElement, unknown>> | null = null;
    let focusedSeriesName: string | null = null;
    let lastAutoFocusedKey: string | null = null;

    function closeMenu() {
        menu = { ...menu, visible: false };
    }

    function highlightKey(h: typeof highlightedPoint): string | null {
        return h ? `${h.signalName}:${h.value}:${h.documentId ?? ''}` : null;
    }

    function applyFocusStyles(focusedName: string | null) {
        if (!svgElement) return;
        const container = select(svgElement)
            .select<SVGGElement>('g.chart-main g.series-container');

        container.selectAll<SVGGElement, SignalSeries>('g.series')
            .each(function(s) {
                const isFocused = !focusedName || s.name === focusedName;
                const g = select(this);

                g.attr('opacity', isFocused ? 1 : 0.5)
                 .style('filter', !isFocused ? 'saturate(50%)' : null);

                g.select<SVGPathElement>('path.series-line')
                 .style('stroke-width', focusedName && isFocused ? '6px' : null);

                g.selectAll<SVGCircleElement, SignalSeries['values'][number]>('.dot')
                 .attr('r', (d) => {
                     const isHL = highlightedPoint
                         && s.name === highlightedPoint.signalName
                         && Math.abs(d.value - highlightedPoint.value) < 0.001
                         && (!highlightedPoint.documentId || d.documentId === highlightedPoint.documentId);
                     const baseR = isHL ? 7 : 4;
                     return focusedName && isFocused ? baseR * 1.5 : baseR;
                 });
            });
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
        axisGroup.attr('transform', 'translate(-8, 0)');

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
        zebraGroup.selectAll<SVGRectElement, typeof zebraData[0]>('rect')
            .data(zebraData.filter(d => d.odd))
            .join('rect')
            .attr('class', 'zebra-band')
            .attr('x', 0).attr('y', d => d.y0)
            .attr('width', width + margin.right).attr('height', d => d.y1 - d.y0);

        // Series lines + dots
        const valueLine = line<{ date: Date; normalized: number }>()
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

            if (sorted.length > 1) {
                g.selectAll<SVGPathElement, null>('path.series-line').data([null]).join('path')
                    .attr('class', 'series-line')
                    .attr('stroke', s.color)
                    .attr('d', valueLine(sorted) ?? '')
                    .style('cursor', 'pointer')
                    .on('click', function(event: MouseEvent) {
                        event.stopPropagation();
                        focusedSeriesName = focusedSeriesName === s.name ? null : s.name;
                        if (!focusedSeriesName) lastAutoFocusedKey = highlightKey(highlightedPoint);
                        applyFocusStyles(focusedSeriesName);
                    });
            } else {
                g.selectAll('path.series-line').remove();
            }

            g.selectAll<SVGCircleElement, SignalSeries['values'][number]>('.dot-highlight-ring')
                .data(sorted.filter(d => isHighlighted(currentSeries, d)), d => `${d.date.getTime()}-${d.value}`)
                .join('circle')
                .attr('class', 'dot-highlight-ring')
                .attr('cx', d => x(d.normalized)).attr('cy', d => y(d.date))
                .attr('r', 11).attr('fill', 'none')
                .attr('stroke', s.color).attr('stroke-width', 2).attr('opacity', 0.5);

            g.selectAll<SVGCircleElement, SignalSeries['values'][number]>('.dot')
                .data(sorted, d => `${d.date.getTime()}-${d.value}`)
                .join(
                    enter => enter.append('circle')
                        .attr('class', 'dot')
                        .on('mouseover', function() {
                            if (isHoverDevice) select(this).attr('r', 6).style('filter', 'drop-shadow(0 0 4px rgba(0,0,0,0.35))');
                        })
                        .on('mouseout', function(_event: MouseEvent, d: SignalSeries['values'][number]) {
                            if (isHoverDevice) {
                                select(this)
                                    .attr('r', isHighlighted(currentSeries, d) ? 7 : 4)
                                    .style('filter', 'drop-shadow(0 0.1rem 0.2rem rgba(0,0,0,0.2))');
                            }
                        })
                        .on('click', function(event: MouseEvent, d: SignalSeries['values'][number]) {
                            event.stopPropagation();
                            focusedSeriesName = currentSeries.name;
                            applyFocusStyles(focusedSeriesName);
                            const dotX = x(d.normalized) + margin.left;
                            const dotY = y(d.date) + margin.top;
                            const chartWidth  = svgElement!.clientWidth;
                            const MENU_W = 260;
                            const MENU_H = 210;
                            const ARROW  = 10;
                            const edgePad = 8;
                            const placement = (dotY - margin.top) >= (MENU_H + ARROW) ? 'top' : 'bottom';
                            const clampedX  = Math.max(MENU_W / 2 + edgePad, Math.min(dotX, chartWidth - MENU_W / 2 - edgePad));
                            menu = { visible: true, x: clampedX, y: dotY, dotX, placement, point: d, series: currentSeries };
                        }),
                    update => update,
                    exit => exit.remove()
                )
                .attr('cx', d => x(d.normalized)).attr('cy', d => y(d.date))
                .attr('r', d => isHighlighted(currentSeries, d) ? 7 : 4)
                .attr('fill', s.color)
                .attr('stroke', 'white')
                .attr('stroke-width', d => isHighlighted(currentSeries, d) ? 2 : 1.5);
        });

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
            { id: 'high',   cls: 'band-high',   x: x(1),          width: Math.max(0, width + margin.right - x(1))   },
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
            { name: 'high',   x1: x(1),          x2: width + margin.right   },
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
        select(svgElement).on('click', () => {
            menu = { ...menu, visible: false };
            focusedSeriesName = null;
            lastAutoFocusedKey = highlightKey(highlightedPoint); // prevent re-focus on next render
            applyFocusStyles(null);
        });

        // Set up D3 zoom — Y axis only, scaleExtent 1..20
        zoomBehavior = d3Zoom<SVGSVGElement, unknown>()
            .scaleExtent([1, 20])
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
            if (!menu.visible) return;
            const wrap = svgElement?.closest('.chart-wrap');
            if (wrap && !wrap.contains(e.target as Node)) {
                menu = { ...menu, visible: false };
            }
        }
        window.addEventListener('pointerdown', handleOutsideClick);

        return () => {
            clearTimeout(rTimer);
            observer.disconnect();
            select(svgElement!).on('.zoom', null).on('click', null);
            window.removeEventListener('pointerdown', handleOutsideClick);
        };
    });
</script>

<div class="chart-wrap">
    <svg bind:this={svgElement}></svg>

    {#if menu.visible && menu.point && menu.series}
    <div
        class="dot-menu"
        class:-top={menu.placement === 'top'}
        class:-bottom={menu.placement === 'bottom'}
        style="left: {menu.x}px; top: {menu.y}px; --arrow-offset: {menu.dotX - menu.x}px"
        role="menu"
    >
        <div class="dot-menu-header">
            <div class="dot-menu-title">{menu.series.label}</div>
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
            <div class="dot-menu-date">{dateTime(menu.point.date)}</div>
        </div>
        <hr class="dot-menu-divider" />
        {#if menu.point.documentId && profileId}
            <a
                class="dot-menu-action"
                href="/med/p/{profileId}/documents/{menu.point.documentId}"
                data-sveltekit-preload-data="false"
                onclick={closeMenu}
            >
                <svg width="12" height="12"><use href="/icons.svg#document" /></svg>
                {$t('viewer.documents.view-document')}
            </a>
        {:else if profileId}
            <a
                class="dot-menu-action"
                href="/med/p/{profileId}/documents/?tags={menu.series.name}"
                data-sveltekit-preload-data="false"
                onclick={closeMenu}
            >
                <svg width="12" height="12"><use href="/icons.svg#document" /></svg>
                {$t('viewer.search.commands.view-documents')}
            </a>
        {/if}
        <div class="dot-menu-action">
            <AskButton
                type="signal"
                label={menu.series.label}
                data={menu.point.rawData ?? { signal: menu.series.name, value: menu.point.value, unit: menu.point.unit, date: menu.point.date }}
                documentId={menu.point.documentId}
                documentTitle={menu.point.documentTitle}
            />
        </div>
    </div>
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

    .chart-wrap svg :global(.dot) {
        filter: drop-shadow(0 0.1rem 0.2rem rgba(0,0,0,0.2));
        cursor: pointer;
        transition: r 0.15s ease;
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

    /* Dot context menu */
    .dot-menu {
        position: absolute;
        background: rgba(var(--color-background-rgb, 255, 255, 255), 0.95);
        border: 1px solid var(--color-border);
        border-radius: var(--ui-radius-medium);
        backdrop-filter: blur(4px);
        box-shadow: 2px 4px 12px rgba(0,0,0,0.2);
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        padding: 0.3rem;
        z-index: 10;
        min-width: 16rem;
    }

    .dot-menu.-top {
        transform: translate(-50%, calc(-100% - 20px));
    }

    .dot-menu.-bottom {
        transform: translate(-50%, 20px);
    }

    /* Arrow — two pseudo-elements for border + fill */
    .dot-menu::before,
    .dot-menu::after {
        content: '';
        position: absolute;
        left: calc(50% + var(--arrow-offset, 0px));
        transform: translateX(-50%);
        border: 9px solid transparent;
        pointer-events: none;
    }

    /* Arrow pointing DOWN (menu is above dot) */
    .dot-menu.-top::before {
        top: 100%;
        border-top-color: var(--color-border);
    }

    .dot-menu.-top::after {
        top: 100%;
        margin-top: -2px;
        border: 8px solid transparent;
        border-top-color: rgba(var(--color-background-rgb, 255, 255, 255), 0.95);
    }

    /* Arrow pointing UP (menu is below dot) */
    .dot-menu.-bottom::before {
        bottom: 100%;
        border-bottom-color: var(--color-border);
    }

    .dot-menu.-bottom::after {
        bottom: 100%;
        margin-bottom: -2px;
        border: 8px solid transparent;
        border-bottom-color: rgba(var(--color-background-rgb, 255, 255, 255), 0.95);
    }

    .dot-menu-header {
        padding: 0.4rem 0.5rem 0.2rem;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }

    .dot-menu-title {
        font-size: 0.75rem;
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

    .dot-menu-header :global(.range) {
        min-width: unset;
        margin: 0.1rem 0;
    }

    .dot-menu-header :global(.range.-value) {
        padding-top: 1.6rem;
    }

    .dot-menu-action {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        font-size: 0.75rem;
        padding: 0.3rem 0.5rem;
        border-radius: var(--ui-radius-small);
        color: var(--color-text-primary);
        text-decoration: none;
        white-space: nowrap;
        cursor: pointer;
    }

    .dot-menu-action:hover {
        background: var(--color-surface);
    }
</style>
