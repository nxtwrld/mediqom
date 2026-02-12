<script lang="ts">
    import { run } from 'svelte/legacy';

    import { t } from '$lib/i18n';
    //import { properties } from '$lib/health/dataTypes';
    import properties from '$data/lab.properties.defaults.json'
    import { computeOutputForRereference } from '$data/properties';
    import { createEventDispatcher } from 'svelte';
    import { durationFrom, durationFromFormatted } from '$lib/datetime';

    const dispatch = createEventDispatcher();

    type Signal = {
        signal?: string;
        value: number;
        unit?: string;
        reference?: string;
        urgency?: number;
        date?: string;
        trend?: number;
    }

    type Property = {
        key?: string;
        signal?: string;
        test?: string;
        source?: any;
        value?: any;
        fn?: (v: any) => any;
        reference?: string;
        urgency?: number;
    }


    interface Props {
        property: Property;
    }

    let { property }: Props = $props();
    



    function getSignalFromProperty(p: Property): Signal {
        let value = undefined;
        let trend = undefined;
        let date = undefined;
        // combining multiple values - but only if all are set
        if (p.source)  {
            if (Array.isArray(p.source)) {
                value = (p.source.every(v => v != undefined)) ? p.source : undefined;
            } else {
                value = p.source;
            }
            
            // results is a time array of items - select the first one
            // or if it is multiple values, select the first value of each
            if (Array.isArray(value)) {
                if (Array.isArray(value[0])) {
                    let lastIndex = value.length - 1;
                    //value = value[0][0]?.value;
                    date = value[0][0]?.date;
                    value = value.map(v => v[0]?.value);
                } else {
                    // calculate trend if available
                    if (value.length > 1) {
                        trend = value[0].value - value[1].value;
                    }
                    date = value[0]?.date;
                    value = value[0]?.value;
                }
            }
        } else if (p.value) {
            value = p.value;
        }
        // if there is a function to transform the value
        if (value && p.fn) {
            value = p.fn(value);
        }
        //console.log('value  done', p, value);

        return {
            ...(properties[p.signal] || {}),
            ...p,
            date,
            trend,
            value

        } as Signal;

    }

//    $: unit = getUnit(signal.unit)

    const supportedIcons = ['age', 'biologicalSex', 'bloodPressure', 'weight', 'height', 'bmi', 'temperature']


    function getResultIcon(property: Signal) {
        switch (property.signal) {
            case 'biologicalSex':
                return 'biologicalSex-' + signal.value;
            default:
                return (supportedIcons.includes(property.signal)) ? property.signal : 'laboratory';
        }
    }

    function showUnit(unit: string) {
        if (!unit) return '';
        const localized = $t(`medical.units.${signal.unit}`);
        if (localized && localized !== `medical.units.${signal.unit}`) {
            return localized;
        } 
        return unit;
    }

    let signal = $derived(getSignalFromProperty(property));
    let defaultSetup = $derived((signal.signal && properties[signal.signal.toLowerCase().replace(/ /ig, '_')]) || {});
    //$: ageOfEntry = (signal.date) ? durationFrom(signal.date) : undefined;
    // how much is the value expiring  1== recent  < 1 == older
    //$: isExpired = (signal.date) ? durationFromFormatted('days', signal.date) -  defaultSetup.valueExpirationInDays > 0 : false;
    let valueHeat = $derived((signal.date) ? computeOutputForRereference( durationFromFormatted('days', signal.date) || 0, [0, defaultSetup.valueExpirationInDays], [0.4, 1]) : 1);
    let referenceRange = $derived(signal.reference?.split('-').map(Number));
    let title = $derived(signal.signal as string);
    let icon = $derived(getResultIcon(signal));
    run(() => {
        //console.log('defaultSetup', defaultSetup);
        //console.log('referenceRange', referenceRange);
        
    });
</script>

{#if signal.value}

<div class="grid-tile-wrapper prop-{signal.signal} urgency-{signal.urgency} prop-value-{signal.value}"  class:-danger={referenceRange && (signal.value < referenceRange[0] || signal.value > referenceRange[1])}  >
    <svg class="icon">
        <use href="/icons-o.svg#prop-{icon}"></use>
    </svg>
    <div class="indicator" style="opacity: {valueHeat}"></div>
    <button 
    onclick={() => dispatch('open')} 
        class="grid-tile ">
        <div class="title">
            {#if $t(`profile.health.props.${title}`) == `profile.health.props.${title}`}
                {title}
            {:else} 
                { $t(`profile.health.props.${title}`)}
            {/if}
            <!--
            {#if ageOfEntry}
                <div class="date">
                    {#if isExpired}
                        <svg class="icon -text">
                            <use href="/icons-o.svg#warning"></use>
                        </svg>
                    {/if}   
                    {$t({ id: 'app.duration.'+ageOfEntry.format+'-ago', values: {value: ageOfEntry.value}})}
                </div>
            {/if}-->
        </div>

        <div class="value" style="opacity: {valueHeat}">
            {#if signal.trend}
                <span class="trend">{signal.trend > 0 ? '↑' : '↓'}</span>
            {/if}
            <strong>
            {#if properties[title]?.localize}
                { $t(`medical.prop-values.${title}.${signal.value}`) }
            {:else if signal.signal == 'age'}
                {$t({id: 'app.profile.value-age', values: { value: signal.value}})}
            {:else}
                {signal.value}
            {/if}
        </strong>
        {#if signal.unit}<span class="unit">{@html  showUnit(signal.unit)} </span>{/if}</div>

    </button>
</div>
{/if}
<style>


    .grid-tile-wrapper {
        
        position: relative;
        width: 100%;
        height: 100%;
        /*border-radius: var(--radius-8);*/
        margin-bottom: var(--gap);
        background-color: var(--background-color);
        text-align: left;
        transition: background-color 0.3s;
    }

    .grid-tile {
        position: absolute;
        display: flex;
        flex-direction: column;
        gap: .5rem;
        padding: .1rem .5rem .5rem;
        margin-top: .4rem;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        align-items: stretch;
        border: 0;
        
    }
    .grid-tile-wrapper:hover {
        background-color: var(--color-white);
    }
    .grid-tile-wrapper:hover .indicator,
    .grid-tile:hover .value {
        opacity: 1 !important;
    }
    
    .grid-tile .title {
        text-align: right;
    }
    .grid-tile-wrapper .icon {
        width: 3rem;
        height: 3rem;
        margin: 1rem 1rem 2rem 0.5rem;
        fill: var(--color-gray-500);
    }

    .grid-tile .value {
        display: flex;
        flex-direction: row;
        justify-content: flex-end;
        align-items: flex-end;
        flex-grow: 1;
        gap: .2rem;
        font-size: 2rem;
        font-weight: 700;
        padding: .3rem;
        transition: opacity 0.3s;
    }
    .grid-tile .unit {
        font-size: .7em;
        font-weight: 300;
    }
    .indicator {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: .4rem;
        background-color: var(--color-gray-800);
        transition: opacity 0.3s;
    }
    .urgency-1 .indicator {
        background-color: var(--color-positive);
    }
    .urgency-2 .indicator,
    .urgency-3 .indicator {
        background-color: var(--color-warning);
    }
    

    .urgency-4 .indicator,
    .urgency-5 .indicator {
        background-color: var(--color-negative);
    }
    .urgency-4 .value,
    .urgency-5 .value {
        color: var(--color-negative);
    }

    .icon.-text {
        display: inline-block;
        width: .8rem;
        height: .8rem;
        color: var(--color-negative);
        fill: currentColor;
        margin: 0 .2rem;
    }
</style>