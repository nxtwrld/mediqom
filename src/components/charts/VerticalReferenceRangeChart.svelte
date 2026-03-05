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
        margin = { top: 10, right: 20, bottom: LABEL_HEIGHT + 4, left: 52 },
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
        svgElement.innerHTML = '';

        const allPoints = data.flatMap(s => s.values);
        if (allPoints.length === 0 && !timeRange) return;

        const width = svgElement.clientWidth - margin.left - margin.right;
        const height = svgElement.clientHeight - margin.top - margin.bottom;
        if (width <= 0 || height <= 0) return;

        const svg = select(svgElement)
            .append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        // Close menu when clicking outside dots
        select(svgElement).on('click', () => { menu = { ...menu, visible: false }; });

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

        // Reference bands
        const bands = svg.append('g').attr('class', 'bands');

        bands.append('rect')
            .attr('x', x(-0.5)).attr('y', 0)
            .attr('width', Math.max(0, x(0) - x(-0.5))).attr('height', height)
            .attr('class', 'band-low');

        bands.append('rect')
            .attr('x', x(0)).attr('y', 0)
            .attr('width', Math.max(0, x(1) - x(0))).attr('height', height)
            .attr('class', 'band-normal');

        bands.append('rect')
            .attr('x', x(1)).attr('y', 0)
            .attr('width', Math.max(0, x(1.5) - x(1))).attr('height', height)
            .attr('class', 'band-high');

        // Reference boundary lines at normalized 0 and 1
        svg.append('line')
            .attr('x1', x(0)).attr('x2', x(0)).attr('y1', 0).attr('y2', height)
            .attr('class', 'ref-line');
        svg.append('line')
            .attr('x1', x(1)).attr('x2', x(1)).attr('y1', 0).attr('y2', height)
            .attr('class', 'ref-line');

        // Y axis (time)
        svg.append('g').attr('class', 'axis')
            .call(axisLeft(y).ticks(5));

        // Zone label boxes — LOW / NORMAL / HIGH — drawn below the chart area
        const zones = [
            { name: 'low',    x1: x(-0.5), x2: x(0)   },
            { name: 'normal', x1: x(0),    x2: x(1)   },
            { name: 'high',   x1: x(1),    x2: x(1.5) },
        ] as const;

        const labelsGroup = svg.append('g').attr('class', 'zone-labels');

        zones.forEach(z => {
            const w = Math.max(0, z.x2 - z.x1);
            const g = labelsGroup.append('g');

            g.append('rect')
                .attr('x', z.x1).attr('y', height + 4)
                .attr('width', w).attr('height', LABEL_HEIGHT)
                .attr('rx', 3)
                .attr('class', `rangeLabelBack ${z.name}`);

            g.append('text')
                .attr('x', (z.x1 + z.x2) / 2)
                .attr('y', height + 4 + LABEL_HEIGHT / 2)
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'middle')
                .attr('class', `rangeLabelText ${z.name}`)
                .text(getRangeLabel(z.name));
        });

        // Series lines + dots
        const valueLine = line<{ date: Date; normalized: number }>()
            .x(d => x(d.normalized))
            .y(d => y(d.date));

        const isHoverDevice = typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches;

        data.forEach(s => {
            if (s.values.length === 0) return;
            const sorted = [...s.values].sort((a, b) => a.date.getTime() - b.date.getTime());
            const g = svg.append('g').attr('class', `series series-${s.name}`);

            if (sorted.length > 1) {
                g.append('path')
                    .datum(sorted)
                    .attr('class', 'series-line')
                    .attr('stroke', s.color)
                    .attr('d', valueLine);
            }

            const currentSeries = s;

            // Highlight ring behind the highlighted dot
            const highlightedValues = sorted.filter(d => isHighlighted(currentSeries, d));
            if (highlightedValues.length > 0) {
                g.selectAll('.dot-highlight-ring')
                    .data(highlightedValues)
                    .enter()
                    .append('circle')
                    .attr('class', 'dot-highlight-ring')
                    .attr('cx', d => x(d.normalized))
                    .attr('cy', d => y(d.date))
                    .attr('r', 11)
                    .attr('fill', 'none')
                    .attr('stroke', s.color)
                    .attr('stroke-width', 2)
                    .attr('opacity', 0.5);
            }

            g.selectAll('.dot')
                .data(sorted)
                .enter()
                .append('circle')
                .attr('class', 'dot')
                .attr('cx', d => x(d.normalized))
                .attr('cy', d => y(d.date))
                .attr('r', (d: SignalSeries['values'][number]) => isHighlighted(currentSeries, d) ? 7 : 4)
                .attr('fill', s.color)
                .attr('stroke', 'white')
                .attr('stroke-width', (d: SignalSeries['values'][number]) => isHighlighted(currentSeries, d) ? 2 : 1.5)
                .on('mouseover', function() {
                    if (isHoverDevice) {
                        select(this).attr('r', 6).style('filter', 'drop-shadow(0 0 4px rgba(0,0,0,0.35))');
                    }
                })
                .on('mouseout', function(event: MouseEvent, d: SignalSeries['values'][number]) {
                    if (isHoverDevice) {
                        select(this).attr('r', isHighlighted(currentSeries, d) ? 7 : 4).style('filter', 'drop-shadow(0 0.1rem 0.2rem rgba(0,0,0,0.2))');
                    }
                })
                .on('click', function(event: MouseEvent, d: SignalSeries['values'][number]) {
                    event.stopPropagation();
                    const cx = x(d.normalized) + margin.left;
                    const cy = y(d.date) + margin.top;
                    menu = { visible: true, x: cx, y: cy, point: d, series: currentSeries };
                });
        });
    }

    $effect(() => {
        renderChart(series, highlightedPoint);
    });

    onMount(() => {
        if (!svgElement) return;
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

    .chart-wrap svg :global(.axis) {
        font-size: 0.65rem;
        opacity: 0.6;
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
