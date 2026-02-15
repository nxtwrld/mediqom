<script lang="ts">
    import { select, line, curveCardinal, scaleTime, scaleLinear, extent, min, max, axisBottom, axisLeft } from 'd3';
    import { onMount } from 'svelte';
    import { getLabValueFor } from '$lib/report/utils';
    import type { LabItem } from '$lib/report/utils';



    // d3 line chart from array of objects



    interface Range {
        name: string,
        min: number,
        max: number
    }

    


    
  interface Props {
    code?: string;
    unit?: string;
    status?: string;
    date?: string;
    margin?: any;
    rangeGap?: number;
    series?: LabItem[];
    ranges?: Range[];
  }

  let {
    code = 'unknown',
    unit = 'unknown',
    status = 'ok',
    date = 'unknown',
    margin = {top: 20, right: 10, bottom: 40, left: 50},
    rangeGap = 2,
    series = $bindable([]),
    ranges = $bindable([])
  }: Props = $props();


    // derive ranges from series.refernenceRange

    let normalExtent: number = 0

    export const id: string = crypto.randomUUID();

    let svgE: SVGElement | undefined = $state();


    onMount(() => {
        if (series.length > 1 && unit != 'arb.j.') renderChart();
        //initialized = true;

        loadHistoryData().then(() => {
            if (series.length > 1 && unit != 'arb.j.') renderChart();
        });

        if(svgE) {
            let rTimer: ReturnType<typeof setTimeout> | undefined;
            const rObserver = new ResizeObserver(entries => {
                clearTimeout(rTimer);
                rTimer = setTimeout(() => {
                    if (svgE) renderChart();
                }, 100);

            });

            // start listening to changes
            rObserver.observe(svgE);

            return () => {
                clearTimeout(rTimer);
                rObserver.disconnect();
            }
        }
    });


    async function loadHistoryData() {
        series = (await getLabValueFor(code, unit)).sort((a: any, b: any) => {
            return new Date(a.time).getTime() - new Date(b.time).getTime();
        });

        if (series.length > 0 && series[0].referenceRange?.high?.value && series[0].referenceRange?.low?.value) {
            normalExtent = series[0].referenceRange.high.value - series[0].referenceRange.low.value;
            ranges = [
                {
                    name: 'Low',
                    min: series[0].referenceRange.low.value - normalExtent,
                    max: series[0].referenceRange.low.value
                },
                {
                    name: 'Normal',
                    min: series[0].referenceRange.low.value,
                    max: series[0].referenceRange.high.value
                },
                {
                    name: 'High',
                    min: series[0].referenceRange.high.value,
                    max: series[0].referenceRange.high.value + normalExtent
                }
            ];
        }
    }

    
    function renderChart() {
        if (!svgE) return;

        svgE.innerHTML = '';

        const width: number = svgE.clientWidth - margin.left - margin.right;
        const height: number = 300 - margin.top - margin.bottom;


        const svg = select(svgE)
                    .append("g")
                    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

  


        // set the ranges
        const x = scaleTime().range([0, width]);
        const y = scaleLinear().range([height, 0]);

        // format the data
        series.forEach(function(d) {
            d.time = new Date(d.time);
            d.value = +d.value;
        });

        const xExtent = extent(series, function(d: LabItem) {
            return typeof d.time === 'string' ? new Date(d.time) : d.time;
        }) as [Date, Date];
        const xRange = (xExtent[1] && xExtent[0]) ?
            (typeof xExtent[1] === 'object' ? (xExtent[1] as Date).getTime() : new Date(xExtent[1]).getTime()) -
            (typeof xExtent[0] === 'object' ? (xExtent[0] as Date).getTime() : new Date(xExtent[0]).getTime()) : 0;

        const xPadding = xRange * .05;

        const xStart = xExtent[0] ?
            (typeof xExtent[0] === 'object' ? (xExtent[0] as Date).getTime() : new Date(xExtent[0]).getTime()) - xPadding : 0;
        const xEnd = xExtent[1] ?
            (typeof xExtent[1] === 'object' ? (xExtent[1] as Date).getTime() : new Date(xExtent[1]).getTime()) + xPadding : 0;
        const xArea: [number, number] = [xStart, xEnd];
        const yArea: [number, number] = [
            min(ranges, function(d: Range) { return d.min; }) || 0,
            max(ranges, function(d: Range) { return d.max; }) || 100
        ];
        // Scale the range of the data
        x.domain(xArea);
        y.domain(yArea);



        if (ranges.length > 0) {

            const normalMin: number = ranges[1].min;
            const normalMax: number = ranges[1].max;

            // Calculate data bounds
            const dataMin = min(series, d => d.value) ?? 0;
            const dataMax = max(series, d => d.value) ?? 100;
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


            const gradient = select(svgE).append("defs")
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
            .curve(curveCardinal)
            .x(function(d: LabItem) { return x(typeof d.time === 'object' ? d.time : new Date(d.time)); })
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
                .text(r.name);
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
            time: string | Date
        }[] = series.map(d => {
            return {
                x: x(typeof d.time === 'object' ? d.time : new Date(d.time)),
                y: y(d.value),
                value : d.value,
                time: d.time
            }
        })

        // append each point as circle
        seriesGroup.selectAll('.point')
            .data(points)
            .enter()
                .append('circle')
                    .attr('class', (d) => {
                        const range = ranges.find(r => d.value >= r.min && d.value <= r.max);
                        const isFromReport = (new Date(d.time as string)).toLocaleDateString() == (new Date(date)).toLocaleDateString() ? 'fromReport' : '';
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
                        .text((d) => new Date(d.time as string).toLocaleDateString());





    }

    // calculate trend difference between last two values 
    function getTrendFromLastValues() {
        if (series.length < 2) return 0;

        const lastValues = series.slice(series.length - 2, series.length);
        const lastValue = lastValues[lastValues.length - 1];
        const secondLastValue = lastValues[lastValues.length - 2];

        return lastValue.value - secondLastValue.value;

    }

    // when normal extent is 100% what is the last value difference in percent
    function getPercentageFromLastValues() {

        return (getTrendFromLastValues() / normalExtent * 100).toFixed();

    }
    

    //get trend from last two values
    function getTrendStatusFromLastValues() {
        if (series.length < 2) return 0;
        const lastValueDiff = getTrendFromLastValues();

        const fraction = normalExtent * .05;
        if (lastValueDiff >  fraction ) {
            return 'up';
        } else if (lastValueDiff < (0 - fraction) ) {
            return 'down';
        } else {
            return 'stable';
        }
    }

    let percentChange = $derived(getPercentageFromLastValues());
    let trend = $derived(getTrendStatusFromLastValues());
</script>



{#if series.length < 2}
    <h3 class="h3 empty">Not enough data to show a trend</h3>
{:else}


    <h3 class="h3">

        {#if status == 'ok'}
            {#if  trend == 'stable'}
            Your values have held steady since your last check-up, which is a reassuring sign of consistency.
            {:else if  trend == 'down'}
            Your values have decreased slightly, but they remain solidly within the normal range. This is a normal variation and nothing to be concerned about.
            {:else if  trend == 'up'}
            Your latest results show a small rise in values, but there's no cause for concern as they're comfortably within the healthy range.
            {/if}
        {:else if status == 'low'}
            {#if trend == 'stable'}
            While your values are consistent, they're consistently low. Seeking advice from a healthcare provider can help identify strategies to bring them into the normal range.
            {:else if trend == 'down'}
            Your values have decreased further below the normal range, which is a clear sign to seek advice from a healthcare professional. They can help in diagnosing and addressing this trend
            {:else if trend == 'up'}
            Your values are on the rise, which is exactly what we want to see given your previous low levels.
            {/if}
        {:else if status == 'high'}
            {#if trend == 'stable'}
            Although your values are stable, they're persistently high. Professional healthcare guidance can assist in understanding and managing this condition.
            {:else if trend == 'down'}
            You're showing an increase in your values, which could be a signal for us to investigate and ensure everything is in order.
            {:else if trend == 'up'}
            The upward trend in your values is a signal to seek professional guidance. Together with your doctor, you can explore effective strategies to manage this change.
            {/if}
        {/if}
        
    </h3>

    <h3 class="h3">
        {#if Number(percentChange) > 0}
        <svg>
            <use href="/sprite.svg#trend-up"></use>
        </svg>
            +{percentChange}% change since last check-up
        {:else if Number(percentChange) < 0}
        <svg>
            <use href="/sprite.svg#trend-down"></use>
        </svg>
            {percentChange}% change since last check-up
        {/if}

    </h3>
    {#if unit == 'arb.j.'}
        <div class="timeline">
            {#each series as item}
                    <div class="item">
                        <h3 class="h3">{item.value}</h3>
                        <div class="tags">
                            <span class="tag">{item.time}</span>
                        </div>
                    </div>
            {/each}
        </div>
    {:else}
        <div class="panel">    
            <svg bind:this={svgE}></svg>
        </div>
    {/if}
{/if}


<style>
    .panel {
        width: 100%;
        height: 300px;
        padding: .5rem;
    }
    svg {
        width: 100%;
        height: 100%;
    }

    .h3 {
        text-align: center;
        margin: 1rem;
    }
    .empty {
        margin: 4rem 1rem;
    }

    .h3 svg {
        height: 1rem;
        width: 1rem;
        fill: var(--color-text);
        margin-right: .5rem;
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
        color: #FFF;
        fill: #FFF;
        /*transform: rotate(-90deg);*/
        transform-box: fill-box;
        transform-origin: center; 
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

    .panel svg :global(.Normal) {
        fill: var(--color-positive);
    }

    .panel svg :global(.High) {
        fill: var(--color-negative);
    }

    .panel svg :global(.Low) {
        fill: var(--color-negative);
    }

    .panel svg :global(.range) {
        opacity: 0.1;
    }

    .panel svg :global(.axis) {
        opacity: 0.5;
    }

    .timeline {
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        justify-content: center;
        align-items: center;
    }


</style>