<script lang="ts" module>
    import { goto } from '$app/navigation';

    export interface Data {
        index: number,
        label: string,
        type: 'item' | 'goal',
        target?: number;
        data: Value[],
        visible?: boolean,
        [key: string]: any,
    }
    
    
    export interface Value  {
        date: Date
        value: number | string,
        index?: number,
        id?: string,
        href?: string,
        [key: string]: any,
    }
</script>

<script lang="ts">
    import { run, stopPropagation } from 'svelte/legacy';

    import * as d3 from 'd3';
	import { onMount } from 'svelte';
    import Input from '$components/forms/Input.svelte';
    import colorFn from 'color';
    import { date } from '$lib/dateTime';
	import { linkPage } from '$lib/app';




    
    interface Props {
        data: Data[];
        showToday?: boolean;
        colors?: string[];
    }

    let { data = $bindable(), showToday = false, colors = ["#9B68C5","#6291FF", "#F69D26","#6554C4","#73C34D","#E73784","#ffd92f","#e5c494","#b3b3b3"] }: Props = $props();
    
    let tooltip: HTMLDivElement = $state();
    let tooltipData: {
        value: string | number,
        unit: string,
        date: Date,
        lablel?: string
    } = $state()

    const margin = { top: 15, right: 30, bottom: 30, left: 30 };


    let svgElement: SVGSVGElement = $state();

    let width: number = $state(300);
    let height: number = $state(100);

    let selectedEvent: {
        node: SVGCircleElement,
        d: Value
    } | null = null;
    



    function checkVisibility(data: Data[]) {
        // hide and show goals
        data.forEach((d, index) => {
            if (d.data.length == 0) {
                d.visible = false;
            }
            let goal = svgElement.querySelector('.goal-' + index);
            if (goal) {
                if (!d.visible) {
                    goal.classList.add('-hidden');
                } else {
                    goal.classList.remove('-hidden');
                    
                }
            }
        })
        // show Y axis if only one property is visible
        let visiblesItems = data.reduce((acc, d, index) => {
            if (d.visible) {
                return [...acc, index];
            }
            return acc;
        }, [] as number[]);
        if (visiblesItems.length == 1) {
            let axis = svgElement.querySelector('#y-axis-' + visiblesItems[0]);
            if (axis) {
                axis.classList.remove('-hidden');
            }
        } else {
            data.forEach((d, index) => {
                let axis = svgElement.querySelector('#y-axis-' + index);
                if (axis) {
                    axis.classList.add('-hidden');
                }
            })
        }
    }


    onMount(() => {
        document.body.appendChild(tooltip);
        renderChart(data);
        const ro: ResizeObserver = new ResizeObserver(() => {
            renderChart(data);
        });
        ro.observe(svgElement);
        return () => {
            ro.disconnect();
            if (tooltip) {
                document.body.removeChild(tooltip);
            }
        }
        
    })


    function clear() {
        const svg = d3.select(svgElement);
        svg.selectAll("g").remove();
    }


    function renderChart(data: Data[]) {
        
        clear()

        width = (svgElement?.clientWidth || 300);
        let chartWidth = width - margin.left - margin.right;
        height = (svgElement?.clientHeight || 100);
        let chartHeight = height - margin.top - margin.bottom;

        const svg = d3.select(svgElement);
        const svgg: d3.Selection<SVGGElement>  = svg.append("g")
            .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

        const yScales = data.map(d => {
            let extent = d.data as Value[];
            if (d.target) {
                if (Array.isArray(d.target)) {
                    extent = [...extent, 
                        { date: new Date(), value: d.target[0] }, { date: new Date(), value: d.target[1] },
                        { date: new Date(), value: d.target[0]*1.05  }, { date: new Date(), value: d.target[1]*1.05  },
                        { date: new Date(), value: d.target[0]*0.95  }, { date: new Date(), value: d.target[1]*0.95  },
                    ];
                } else {
                    extent = [...extent, { date: new Date(), value: d.target*1.05 }, { date: new Date(), value: d.target*0.95 }];
                }
                
            }
            return d3.scaleLinear()
                .domain(d3.extent(extent, d => d.value))
                .range([ chartHeight, 0 ]);
        })

        let timeExtent = data.reduce((acc, d) => {
                    return [...acc, ...d.data];
                }, [] as Value[]);
        if (showToday) {
            timeExtent.push({ date: new Date(), value: 0 });
        }

        const xScale = d3.scaleTime()
            .domain(d3.extent(timeExtent, (d: Value) => d.date))
            .range([ 0, chartWidth ])


        svgg.append("g")
            .attr('class', 'x-axis')
            .attr("transform", "translate(0," + chartHeight + ")")
            .call(d3.axisBottom(xScale).ticks(5));

        let yGroup = svgg.append("g")
            .attr('class', 'y-axis-group');

        yScales.forEach((yScale, index) => {
            yGroup.append("g")
                .attr('id', 'y-axis-' + index)
                .attr('class', 'y-axis -hidden')
                .attr("style", "--color: " + colors[index])
                .attr("transform", "translate(-4,0)")
                .call(d3.axisLeft(yScale).ticks(5));
        })

        let goal = svgg.selectAll("g.goal")
            .data(data)
            .enter()
                .append('g')
                    .attr('class', (d: Data) => {
                        const hidden =  (d.data.length == 0) ? '-hidden' : '';
                        return 'goal goal-' + d.index + ' ' + hidden;
                    })
                    .attr("style", (d: Data, index: number) => {
                        return '--color: ' + colors[index];
                    })
                    .attr("title", (d: Data) => d.label)
                    .attr("data-value", (d: Data) => d.data.map((d: Value) => d.value).join(','));
        

        // target goal block
        goal
            .append("rect")
                .attr("class", "target")
                .attr("x", 0)
                .attr("y", (d: Data, index: number) => {
                    if (Array.isArray(d.target)) {
                        return yScales[index](d.target[1])
                    } else {
                        return yScales[index](d.target)
                    }
                })
                .attr("width", chartWidth)
                .attr("height", (d: Data, index: number) => {
                    if (Array.isArray(d.target)) {
                        return yScales[index](d.target[0]) - yScales[index](d.target[1])
                    } else {
                        return 3;
                    }
                })
                .attr("fill", (d: Data, index: number) => {
                    if (Array.isArray(d.target)) {
                        return 'url(#color-' + colors[index] + ')';
                    } else {
                        return 'var(--color)';
                    }

                })
                .attr("fill-opacity", .4)

        // target label
        goal.append("text")
            .attr("class", "target")
            .attr("x", chartWidth)
            .attr("y", (d: Data, index: number) => {
                if (Array.isArray(d.target)) {
                    return yScales[index](d.target[1])
                } else {
                    return yScales[index](d.target)
                }
            })
            .attr("dy", "1.1rem")
            .attr("dx", "-3rem")
            .attr("text-anchor", "end")
            .text((d: Data) => { 
                let targetValue = (Array.isArray(d.target)) ? d.target[0] + ' - ' + d.target[1] : d.target;
                return d.label +': '+ targetValue + ' ' + (d.data[0]?.unit || '')
            });
        
        // goal line
        goal
            .append("path")
                .attr("class", "line")
                .attr("d", (d: Data, index: number) => {
                    return d3.line()
                    .curve(d3.curveMonotoneX)
                    .x(function(d: Value) { 
                        return xScale(d.date) 
                    })
                    .y(function(d: Value) { 
                        return yScales[index](d.value);
                    })(d.data as Value[]);
                })
        // goal events
        goal
            .selectAll(".dot")
            .data((d: Data) => {
                return d.data.map((v: Value, index: number) => {
                    return {
                        ...v,
                        index: d.index,
                        id: d.index + '-' + v.date.getTime()
                    }
                });
            })
                .enter()
                .append('circle')
                    .attr('class', 'dot')
                    .attr('cx', (d: Value) => xScale(d.date))
                    .attr('cy', (d: Value, index: number) => d.index !== undefined ? yScales[d.index](d.value) : 0)
                    .attr('r', 8)
                    /*.on('click', function(event: MouseEvent, d: Value) {
                        if (d.href) {
                            goto(d.href);
                        }
                    })*/
                    .on('click', function(event: MouseEvent, d: Value) {
                        event.stopPropagation();
                        clearSelectedEvent();
                        tooltipData = {
                            value: d.value,
                            unit: d.unit,
                            date: d.date,
                            label: d.index !== undefined ? data[d.index].valueName : ''
                        }
                        // calculate fixed position and compensate for scroll
                        d3.select(tooltip)
                            .style('top', (event.clientY) + 'px')
                            .style('left', (event.clientX) + 'px')
                            .style('opacity', 1);

                        d3.select(event.currentTarget as SVGCircleElement).attr('r', 12);
                        selectedEvent = {
                            node: event.currentTarget as SVGCircleElement,
                            d
                        };
                    })/*
                    .on('mouseout', function(event: MouseEvent, d: Value) {
                        d3.select(this).attr('r', 8);
                        d3.select(tooltip)
                            .style('top', '-100000px')
                            .style('left', '-100000px')
                            .style('opacity', 0);
                    })*/


        checkVisibility(processedData);
    }

    function clearSelectedEvent() {
        if(!selectedEvent) return;

        d3.select(selectedEvent.node).attr('r', 8);
        d3.select(tooltip)
            .style('top', '-100000px')
            .style('left', '-100000px')
            .style('opacity', 0);
        selectedEvent = null;
    }

    function viewDetails() {
        console.log('viewDetails', selectedEvent);
        if(!selectedEvent) return;
        if (selectedEvent.d.href) {
                            goto(linkPage(selectedEvent.d.href));
        }
        
    }

    // add visible flag to data in not present
    let processedData = $derived(data.map(d => {
        if (d.visible === undefined) {
            d.visible = (d.data.length > 0) ? true : false;
        }
        return d;
    }))
    run(() => {
        if (svgElement && processedData) {
            checkVisibility(processedData);

        }
    });
</script>

    <svelte:window onclick={clearSelectedEvent} />

<div class="chart">
    <div class="chart-controls">
    {#each data as  item, index}
        {@const label = (item.label || item.valueName) + ((item.data.length == 0) ? ' (no data)' : '')}
        <Input type="checkbox" {label} 
            disabled={item.data.length == 0}
            bind:checked={item.visible}
            style="--color-form-input-checkbox-on: {colors[index]}; --color-form-input-checkbox-off: {colors[index]}; --color-form-input-active-border: {colors[index]}; --color-form-input: {colorFn(colors[index]).alpha(.3)}"/>

    {/each}
    </div>

    <div class="goal-chart" style="padding: {Object.values(margin).join('px ')}px">
        <div class="goal-chart-area" ></div>
        <svg bind:this={svgElement} viewBox="0 0 {width} {height}">
            <defs>
                {#each colors as color}
                <pattern id="color-{color}" viewBox="0,0,4,4" width="3" height="3" patternUnits="userSpaceOnUse">
                  <circle r="3" fill={color} dx="1" dy="1" >
                </pattern>
                {/each}
        </defs>        
        </svg>
    </div>
</div>
<button class="tooltip" bind:this={tooltip} onclick={stopPropagation(viewDetails)}>
    {#if tooltipData}
        <div class="date">{date(tooltipData.date)}</div>
        <div class="property">{tooltipData.label}</div>
        <div class="value">{tooltipData.value}</div>
        <div class="unit">{tooltipData.unit}</div>
    {/if}
</button>


<style>

    .chart {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
    }
    .chart-controls {
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        justify-content: flex-end;
        align-items: center;
        padding: 1rem;
        font-size: .8rem;
    }

    .goal-chart {
        width: 100%;
        height: 100%;
        flex-grow: 1;
        position: relative;
    }
    .goal-chart-area {
        width: 100%;
        height: 100%;
        --dot-color: var(--color-divider-1);
        --dot-size: 1px;
        --dot-space: 1.5rem;
        background-image: radial-gradient(var(--dot-color) var(--dot-size), transparent 0);
        background-color: transparent;
        background-position: calc(var(--dot-space) / 2 + var(--dot-size)) calc(var(--dot-space) / 2 + var(--dot-size));
        background-size: var(--dot-space) var(--dot-space);
    }
    svg {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
    }

    svg :global(g.goal) {
        opacity: 1;
        transition: opacity .3s ease-in-out;
        pointer-events: none;
    }
    svg :global(.-hidden) {
        opacity: 0 !important;
        translate: translate(0, -100%);
    }

    svg :global(path.line) {
        fill: none;
        stroke: var(--color);
        stroke-width: 2.5;
    }
    svg :global(line.target) {
        fill: none;
        stroke: var(--color);
        stroke-width: 5;
    }
    svg :global(text.target) {
        fill: var(--color);
        font-size: 1rem;
        font-weight: bold;
        filter: brightness(80%);
    }

    svg :global(circle.dot) {
        fill: var(--color);
        stroke: var(--color-background-panel);
        stroke-width: 3;
        transition: all .1s ease-in-out;
        cursor: pointer;
        pointer-events: all;
    }

    svg :global(text.value) {
        fill: var(--color);
        paint-order: stroke; 
        font-size: 1rem;
        stroke: var(--color-background-panel);
        stroke-width: 8;
        font-weight: bold;
        opacity: 0;
        text-anchor: middle;
        alignment-baseline: middle;
        transition: all .3s ease-in-out;
        z-index: 10000;
    }
    svg :global(.y-axis line),
    svg :global(.y-axis path) {
        stroke: var(--color);
    }
    svg :global(.y-axis text) {
        fill: var(--color);
        filter: brightness(80%);
    }

    .tooltip {
        position: fixed;
        top: -100000px;
        left: -100000px;
        background-color: var(--color-background-panel);
        padding: .5rem;
        transform: translate(-50%, 1rem);
        pointer-events: all;

    }

    .tooltip > * {
        margin: .5rem;
        text-align: center;
        font-size: .8rem;
    }
    .tooltip .value {
        font-size: 2rem;
        font-weight: bold;
    }
    .tooltip .property {
        font-size: 1rem;
        font-weight: bold;
        text-align: center;
    }

</style>