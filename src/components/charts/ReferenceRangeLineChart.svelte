<script lang="ts">
    import { run } from 'svelte/legacy';

import { select, line, curveCardinal, scaleTime, scaleLinear, extent, min, max, axisBottom, axisLeft } from 'd3';
import { onMount } from 'svelte';
import { date }  from '$lib/datetime';
import { t } from '$lib/i18n';
import { get } from 'svelte/store';

// Type definitions
interface LabItem {
    date: Date;
    value: number;
    [key: string]: any;
}

interface Signal {
    date: Date;
    value: number;
    [key: string]: any;
}

interface Range {
    name: string;
    min: number;
    max: number;
}

// Translation lookup for range labels
const getRangeLabel = (name: string): string => {
    const translate = get(t);
    const labels: Record<string, string> = {
        'low': translate('charts.reference-range.low'),
        'normal': translate('charts.reference-range.normal'),
        'high': translate('charts.reference-range.high')
    };
    return labels[name] || name;
};


let currentDate = new Date();
let id = Math.random().toString(36).substring(7);

    interface Props {
        unit?: string;
        reference?: string;
        margin?: any;
        rangeGap?: number;
        series?: LabItem[];
        ranges?: Range[];
    }

    let {
        unit = 'unknown',
        reference = 'unknown',
        margin = {top: 20, right: 10, bottom: 40, left: 50},
        rangeGap = 2,
        series = []
    }: Props = $props();

    // Initialize these after props are available
    let referenceRange: [number, number] = [ Number(reference.split('-')[0]), Number(reference.split('-')[1]) ];
    let normalExtent = referenceRange[1] - referenceRange[0];

    // Set default ranges after referenceRange is calculated
    let ranges = $derived([
        { name: 'low', min: referenceRange[0] - normalExtent, max: referenceRange[0]},
        { name: 'normal', min: referenceRange[0], max: referenceRange[1] },
        { name: 'high', min: referenceRange[1], max: referenceRange[1] + normalExtent }
    ]);

    console.log(series, referenceRange, normalExtent);

let svgElement: SVGSVGElement | undefined = $state();

function renderChart(series: Signal[] = []) {

    if (!svgElement) return;
    svgElement.innerHTML = '';

    if (series.length == 0) {
        return;
    }

    const width: number = svgElement.clientWidth - margin.left - margin.right;
    const height: number = 300 - margin.top - margin.bottom;


    const svg = select(svgElement)
                .append("g")
                .attr("transform", "translate(" + margin.left + "," + margin.top + ")");




    // set the ranges
    const x = scaleTime().range([0, width]);
    const y = scaleLinear().range([height, 0]);

    // format the data
    series.forEach(function(d) {
        d.date = new Date(d.date);
        d.value = +d.value;
    });

    // Remove duplicate entries with same date and value (after formatting)
    const deduplicatedSeries = series.filter((item, index, arr) => {
        return !arr.slice(0, index).some(prevItem => 
            prevItem.date.getTime() === item.date.getTime() && 
            prevItem.value === item.value
        );
    });

    console.log(`Original series: ${series.length}, After deduplication: ${deduplicatedSeries.length}`);
    
    // Use deduplicated data for the rest of the function
    series = deduplicatedSeries;

    const xExtent = extent(series, function(d: LabItem) { return d.date; });
    const xRange = (xExtent[1] && xExtent[0]) ?
        (xExtent[1] as Date).getTime() - (xExtent[0] as Date).getTime() : 0;

    const xPadding = xRange * .05;

    const xArea: [Date, Date] = [
        xExtent[0] ? new Date((xExtent[0] as Date).getTime() - xPadding) : new Date(),
        xExtent[1] ? new Date((xExtent[1] as Date).getTime() + xPadding) : new Date()
    ];
    const yMin = min(ranges, function(d: Range) { return d.min; });
    const yMax = max(ranges, function(d: Range) { return d.max; });
    const yArea: [number, number] = [
        yMin !== undefined ? yMin : 0,
        yMax !== undefined ? yMax : 100
    ];
    // Scale the range of the data
    x.domain(xArea);
    y.domain(yArea);



    if (ranges.length > 0) {

        const normalMin: number = ranges[1].min;
        const normalMax: number = ranges[1].max;

        // Calculate data bounds
        const dataMin = min(series, d => d.value) ?? normalMin - 10;
        const dataMax = max(series, d => d.value) ?? normalMax + 10;
        //const dataMin = ranges[0].min
        //const dataMax = ranges[ranges.length-1].max;

        //console.log('Normal Min', normalMin, 'Normal Max', normalMax);
        //console.log('Data Min', dataMin, 'Data Max', dataMax);

        // Calculate percentage positions from data bounds on dataMin and dataMax
        const normalMinPercentage = Math.max((normalMin - dataMin) / (dataMax - dataMin) * 100, 0);
        const normalMaxPercentage = Math.min((normalMax - dataMin) / (dataMax - dataMin) * 100, 100);

        //console.log('Min', normalMinPercentage, 'Max', normalMaxPercentage);

        let grLevels = []

        // if dataMin and dataMax are withing one range just use single color
        if (dataMin > normalMin && dataMax < normalMax) {
            grLevels = [
                { offset: "0%", color: 'var(--color-positive)' },
                { offset: "100%", color: 'var(--color-positive)' }
            ]
        } else if (dataMax < normalMin || dataMin > normalMax) {
            grLevels = [
                { offset: "0%", color: 'var(--color-negative)' },
                { offset: "100%", color: 'var(--color-negative)' }
            ]

        } else {
            grLevels = []

            if (normalMinPercentage > 0) {
                grLevels.push({ offset: "0%", color: 'var(--color-negative)' });
                grLevels.push({ offset: `${Math.max(normalMinPercentage - 15, 0)}%`, color: 'var(--color-negative)' });
            } else {
                grLevels.push({ offset: "0%", color: 'var(--color-positive)' });
            }
            grLevels.push({ offset: `${normalMinPercentage + 15}%`, color: 'var(--color-positive)' });
            grLevels.push({ offset: `${normalMaxPercentage  - 15}%`, color: 'var(--color-positive)' });

            if (normalMaxPercentage < 100) {
                grLevels.push({ offset: `${Math.min(normalMaxPercentage + 15, 100)}%`, color: 'var(--color-negative)' });
                grLevels.push({ offset: "100%", color: 'var(--color-negative)' });
            } else {
                grLevels.push({ offset: "100%", color: 'var(--color-positive)' });
            }
            //console.log(grLevels)
        }


        const gradient = select(svgElement).append("defs")
            .append("linearGradient")
            .attr("id", "gradient-"+id)
            .attr("gradientUnits", "userSpaceOnUse")
            .attr("gradientTransform", "rotate(180)")
            .attr("x1", x(xArea[0]) + 'px')
            .attr("y1", y(dataMax) + 'px')
            .attr("x2", x(xArea[0]) + 'px')
            .attr("y2", y(dataMin) + 'px')
            .selectAll("stop")

        
        gradient
            .data(grLevels)
            .enter().append("stop")
            .attr("offset", d => d.offset)
            .attr("stop-color", d => d.color);
        

    }

    const axis = svg.append('g')
        .attr('class', 'axis');

    // Add the x Axis
    axis.append("g")
        .attr("transform", "translate(0," + height + ")")
        .call(axisBottom(x).ticks(5));

    // Add the y Axis
    axis.append("g")
        .call(axisLeft(y).ticks(5));


                
    const rangeGroup = svg.append('g')
        .attr('class', 'ranges');

    const seriesGroup = svg.append('g')
        .attr('class', 'series');


    // define the line
    const valueline = line<LabItem>()
        .curve(curveCardinal.tension(0))
        .x(function(d: LabItem) { return x(d.date); })
        .y(function(d: LabItem) { return y(d.value); });




    // draw shapes for ranges under the line
    ranges.forEach(r => {
        rangeGroup.append('rect')
            .attr('x', 0 + rangeGap*2)
            .attr('y', y(r.max) - rangeGap)
            .attr('width', width - rangeGap*2)
            .attr('height', y(r.min) - y(r.max) - rangeGap)
            .attr('rx', 3)
            .attr('class', 'range ' +  r.name)
    })

    // draw shapes for ranges on left side for label values
    ranges.forEach(r => {
        rangeGroup.append('rect')
            .attr('x', 0 - margin.left + rangeGap)
            .attr('y', y(r.max) - rangeGap)
            .attr('width', margin.left - 25)
            .attr('height', y(r.min) - y(r.max) - rangeGap)
            .attr('rx', 3)
            .attr('class', 'rangeLabelBack ' +  r.name);
        // generate range text labels vertically
        rangeGroup
            .append('g')
            .attr('transform', 'rotate(-90)')
            .attr('class', 'rangeLabelText')
            .append('text')
            .attr('x', 0 - margin.left + rangeGap + margin.left / 2 - 12)
            .attr('width', margin.left - 25)
            .attr('height', y(r.min) - y(r.max) - rangeGap)
            .attr('text-anchor', 'middle')
            .attr('alignment-baseline', 'middle')
            .attr('y', y(r.max) + (y(r.min) - y(r.max) - rangeGap)/2)
            .text(getRangeLabel(r.name));
    })


    // Add the valueline path.
    seriesGroup.append("path")
        .data([series])
        .attr("class", "line")
        .attr("stroke", "url(#gradient-"+id+")")
        .attr("d", valueline);




    // define points on the line for values
    const points: {
        x: number,
        y: number,
        value: number,
        date: Date
    }[] = series.map(d => {
        return {
            x: x(d.date),
            y: y(d.value),
            value : d.value,
            date: d.date
        }
    })

    // append each point as circle
    seriesGroup.selectAll('.point')
        .data(points)
        .enter()
            .append('circle')
                .attr('class', (d) => {
                    const range = ranges.find(r => d.value >= r.min && d.value <= r.max);
                    const isFromReport = (d.date as Date).toLocaleDateString() == (new Date(currentDate)).toLocaleDateString() ? 'fromReport' : '';
                    return (range ? range.name + ' point' : 'point') + ' ' + isFromReport;
                })
                .attr('cx', (d) => d.x)
                .attr('cy', (d) => d.y);

    // add labels for each point with value, unit and on new line date
    seriesGroup.selectAll('.pointLabel')
        .data(points)
        .enter()
            .append('text')
                .attr('class', 'text')
                .attr('text-anchor', 'middle')
                .attr('x', (d) => d.x)
                .attr('y', (d) => d.y - 30)
                .text((d) => d.value)
                .append('tspan')
                    .attr('x', (d) => d.x)
                    .attr('y', (d) => d.y - 15)
                    .text((d) => date(d.date) || '');





}

run(() => {
    if (svgElement) renderChart(series);
});

onMount(() => {
        
    

        if(svgElement) {
            let rTimer : ReturnType<typeof setTimeout>;
            const rObserver = new ResizeObserver(entries => {
                clearTimeout(rTimer);
                rTimer = setTimeout(() => {
                    if (svgElement) renderChart(series);
                }, 100);

            });

            // start listening to changes
            rObserver.observe(svgElement);

            return function cleanup() {
                clearTimeout(rTimer);
                rObserver.disconnect();
            }
        }
    });

</script>

<div class="panel">
    <svg bind:this={svgElement}></svg>
</div>

<style>

    .panel {
        width: 100%;
        height: 300px;
        padding: .5rem;
    }
    .panel svg {
        width: 100%;
        height: 100%;
    }
    .panel svg :global(.line) {
        fill: none;
        stroke-width: 2px;

    }
    .panel svg :global(.point) {
        r: .4rem;
        opacity: 1;
        stroke: #FFF;
        fill: var(--color-positive);
        stroke-width: .1rem;
        filter: drop-shadow( 2px 2px 2px rgba(0, 0, 0, .5));
    }

    .panel svg :global(.point.fromReport) {
        r: .8rem;
    }

    .panel svg :global(.rangeLabelText) {
        color: var(--color-positive-text);
        fill: currentColor;
        font-size: .7em;
        /*transform: rotate(-90deg);*/
        transform-box: fill-box;
        transform-origin: center;
        text-transform: uppercase;
    }

    .panel svg :global(.text) {
        fill: var(--color-text);
        font-size: 1rem;
        font-weight: bold;
    }
    .panel svg :global(.text tspan) {
        font-size: .7rem;
        font-weight: normal;
    }

    .panel svg :global(.normal) {
        fill: var(--color-positive);
    }

    .panel svg :global(.high) {
        fill: var(--color-negative);
    }

    .panel svg :global(.low) {
        fill: var(--color-negative);
    }

    .panel svg :global(.range) {
        opacity: 0.1;
    }

    .panel svg :global(.axis) {
        opacity: 0.5;
    }



</style>