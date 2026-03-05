<script lang="ts">
    import { select, scaleTime, scaleLinear, axisLeft, line } from 'd3';
    import { onMount } from 'svelte';
    import { get } from 'svelte/store';
    import { t } from '$lib/i18n';
    import AskButton from '$components/chat/AskButton.svelte';

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
        margin = { top: 10, right: 20, bottom: LABEL_HEIGHT + 4, left: 60 },
        timeRange,
        profileId,
        onScaleReady,
        highlightedPoint = null,
    }: Props = $props();

    let svgElement: SVGSVGElement | undefined = $state();
    let menu = $state<MenuState>({ visible: false, x: 0, y: 0, point: null, series: null });

    function closeMenu() {
        menu = { ...menu, visible: false };
    }

    function renderChart(data: SignalSeries[], highlighted: typeof highlightedPoint = null) {
        function isHighlighted(s: SignalSeries, d: SignalSeries['values'][number]): boolean {
            if (!highlighted) return false;
            if (s.name !== highlighted.signalName) return false;
            const valueMatch = Math.abs(d.value - highlighted.value) < 0.001;
            return highlighted.documentId
                ? valueMatch && d.documentId === highlighted.documentId
                : valueMatch;
        }
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

        const y = scaleTime()
            .domain([
                new Date(domainMax.getTime() + dateSpan * 0.05), // top of chart = newest
                new Date(domainMin.getTime() - dateSpan * 0.05)  // bottom = oldest
            ])
            .range([0, height]);

        if (onScaleReady) {
            onScaleReady((date: Date) => y(date) + margin.top, height);
        }

        // X axis: normalized space — 0 = refMin, 1 = refMax
        const x = scaleLinear()
            .domain([-0.5, 1.5])
            .range([0, width]);

        // Reference bands — keyed join
        const bandData = [
            { id: 'low',    cls: 'band-low',    x: x(-0.5), width: Math.max(0, x(0) - x(-0.5)) },
            { id: 'normal', cls: 'band-normal', x: x(0),    width: Math.max(0, x(1) - x(0))    },
            { id: 'high',   cls: 'band-high',   x: x(1),    width: Math.max(0, x(1.5) - x(1))  },
        ];
        bandsGroup.selectAll<SVGRectElement, typeof bandData[0]>('rect')
            .data(bandData, d => d.id)
            .join('rect')
            .attr('class', d => d.cls)
            .attr('x', d => d.x).attr('y', 0)
            .attr('width', d => d.width).attr('height', height);

        // Reference boundary lines — join
        refLinesGroup.selectAll<SVGLineElement, number>('line')
            .data([x(0), x(1)])
            .join('line')
            .attr('class', 'ref-line')
            .attr('x1', d => d).attr('x2', d => d)
            .attr('y1', 0).attr('y2', height);

        // Y axis (time) — D3 handles tick enter/update/exit
        const tickCount = Math.max(2, Math.floor(height / 40));
        axisGroup.call(
            axisLeft(y)
                .ticks(tickCount)
                .tickFormat((d) => {
                    const date = d as Date;
                    return date.getMonth() === 0
                        ? date.getFullYear().toString()
                        : date.toLocaleString('default', { month: 'short' });
                })
        );
        axisGroup.attr('transform', 'translate(-8, 0)');

        // Style year ticks with background pill, month ticks lighter
        axisGroup.selectAll<SVGGElement, Date>('.tick').each(function(d) {
            const g = select(this);
            const isYear = d.getMonth() === 0;
            const textEl = g.select<SVGTextElement>('text');
            textEl.attr('class', isYear ? 'tick-label tick-year' : 'tick-label tick-month');
            const bbox = textEl.node()?.getBBox();
            if (bbox) {
                g.selectAll<SVGRectElement, null>('rect.tick-bg').data([null]).join('rect')
                    .attr('class', isYear ? 'tick-bg tick-year-bg' : 'tick-bg tick-month-bg')
                    .attr('x', bbox.x - 4).attr('y', bbox.y - 2)
                    .attr('width', bbox.width + 8).attr('height', bbox.height + 4)
                    .attr('rx', 3)
                    .lower();
            }
        });

        // Zebra bands between ticks
        const tickValues = y.ticks(tickCount);
        const boundaries = [0, ...tickValues.map((d: Date) => y(d)), height];
        const zebraData = boundaries.slice(0, -1).map((y0, i) => ({
            y0, y1: boundaries[i + 1], odd: i % 2 === 1
        }));
        zebraGroup.selectAll<SVGRectElement, typeof zebraData[0]>('rect')
            .data(zebraData.filter(d => d.odd))
            .join('rect')
            .attr('class', 'zebra-band')
            .attr('x', 0).attr('y', d => d.y0)
            .attr('width', width).attr('height', d => d.y1 - d.y0);

        // Zone label boxes — LOW / NORMAL / HIGH
        const zones = [
            { name: 'low',    x1: x(-0.5), x2: x(0)   },
            { name: 'normal', x1: x(0),    x2: x(1)   },
            { name: 'high',   x1: x(1),    x2: x(1.5) },
        ] as const;

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

        // Series lines + dots
        const valueLine = line<{ date: Date; normalized: number }>()
            .x(d => x(d.normalized))
            .y(d => y(d.date));

        const isHoverDevice = typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches;

        // Series groups keyed by name — enter/exit handled by D3
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

            // Line path
            if (sorted.length > 1) {
                g.selectAll<SVGPathElement, null>('path.series-line').data([null]).join('path')
                    .attr('class', 'series-line')
                    .attr('stroke', s.color)
                    .attr('d', valueLine(sorted) ?? '');
            } else {
                g.selectAll('path.series-line').remove();
            }

            // Highlight ring — full join so exit removes stale rings
            g.selectAll<SVGCircleElement, SignalSeries['values'][number]>('.dot-highlight-ring')
                .data(sorted.filter(d => isHighlighted(currentSeries, d)), d => `${d.date.getTime()}-${d.value}`)
                .join('circle')
                .attr('class', 'dot-highlight-ring')
                .attr('cx', d => x(d.normalized)).attr('cy', d => y(d.date))
                .attr('r', 11).attr('fill', 'none')
                .attr('stroke', s.color).attr('stroke-width', 2).attr('opacity', 0.5);

            // Dots — event handlers on enter only, attrs applied to enter + update
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
                            menu = { visible: true, x: x(d.normalized) + margin.left, y: y(d.date) + margin.top, point: d, series: currentSeries };
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
    }

    $effect(() => {
        renderChart(series, highlightedPoint);
    });

    onMount(() => {
        if (!svgElement) return;

        // SVG click handler lives here to avoid re-attachment on every render
        select(svgElement).on('click', () => { menu = { ...menu, visible: false }; });

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
            select(svgElement!).on('click', null);
            window.removeEventListener('pointerdown', handleOutsideClick);
        };
    });
</script>

<div class="chart-wrap">
    <svg bind:this={svgElement}></svg>

    {#if menu.visible && menu.point && menu.series}
    <div
        class="dot-menu"
        style="left: {menu.x}px; top: {menu.y}px"
        role="menu"
    >
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
        transform: translate(-50%, calc(-100% - 0.6rem));
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
        min-width: 10rem;
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
