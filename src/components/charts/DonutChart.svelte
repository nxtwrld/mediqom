<script lang="ts">
	import { onMount } from "svelte";
    import * as d3 from 'd3';



    interface Props {
        data?: { name?: string;
                        value: number }[];
        colors?: string[];
        thickness?: number;
    }

    let { data = [], colors = d3.quantize(t => d3.interpolateSpectral(t * 0.8 + 0.1), data.length).reverse(), thickness = .67 }: Props = $props();

    let svgElement: SVGSVGElement | undefined = $state();
    // set the dimensions and margins of the graph
    const width: number = 500;
    const height: number = 500;

    // The radius of the pieplot is half the width or half the height (smallest one). I subtract a bit of margin.
    const radius = Math.min(width, height) / 2;

    onMount(() => {
        renderChart();
    });


    function renderChart(){
        if (!svgElement) return;

    // append the svg object to the div called 'my_dataviz'
        const svg: any = d3.select(svgElement);

        const arc: any = d3.arc()
            .innerRadius(radius * thickness)
            .outerRadius(radius - 1);

        const pie: any = d3.pie()
            .padAngle(1 / radius)
            .sort(null)
            .value((d: any) => d.value);

        const color: any = d3.scaleOrdinal()
            .domain(data.map(d => d.name || ''))
            .range(colors);

        svg
            .attr("viewBox", [-width / 2, -height / 2, width, height]);
            //.attr("style", "max-width: 100%; height: auto;");

        svg.append("g")
            .selectAll()
            .data(pie(data))
            .join("path")
            .attr("fill", (d: any, index: number) => color(d.data.name || index.toString()))
            .attr("d", arc)
            .append("title")
            .text((d: any, index: number) => `${d.data.name || index}: ${d.data.value.toLocaleString()}`);
/*
    svg.append("g")
        .attr("font-family", "sans-serif")
        .attr("font-size", 12)
        .attr("text-anchor", "middle")
        .selectAll()
        .data(pie(data))
        .join("text")
        .attr("transform", d => `translate(${arc.centroid(d)})`)
        .call(text => text.append("tspan")
            .attr("y", "-0.4em")
            .attr("font-weight", "bold")
            .text(d => d.data.name))
        .call(text => text.filter(d => (d.endAngle - d.startAngle) > 0.25).append("tspan")
            .attr("x", 0)
            .attr("y", "0.7em")
            .attr("fill-opacity", 0.7)
            .text(d => d.data.value.toLocaleString("en-US")));*/

    }
</script>
<div class="chart">
    <svg bind:this={svgElement} preserveAspectRatio="xMidYMid meet"></svg>
</div>

<style>
    div, svg {
        width: 100%;
        height: 100%;
    }
</style>