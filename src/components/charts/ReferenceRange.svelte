<script lang="ts">
    import { t } from '$lib/i18n';

    interface Props {
        value: number;
        reference: string;
        referenceRange?: {
        low: {
            value: number,
            unit: string
        },
        high: {
            value: number,
            unit: string
        }
    };
        labels?: boolean;
        showValue?: boolean;
    }

    let {
        value,
        reference,
        referenceRange = {
        low: {
            value: Number(reference.split('-')[0]),
            unit: ''
        },
        high: {
            value: Number(reference.split('-')[1]),
            unit: ''
        }
    },
        labels = true,
        showValue = true
    }: Props = $props();

    // project reference and range to a 0-100 scale
    const referenceRangeLowPercent: number = 35;
    const referenceRangeOkPercent: number = 30;
    const referenceRangeHighPercent: number = 35;
    let onPercentOnScale: number = (referenceRange.high.value - referenceRange.low.value) / referenceRangeOkPercent;
    let scaleStartsAt: number = referenceRange.low.value - (referenceRangeLowPercent * onPercentOnScale);

    let referenceRangeValuePercent = (value - scaleStartsAt) / onPercentOnScale;
    let status: 'ok' | 'low' | 'high' = $state('ok');
    if (value < referenceRange.low.value) {
        status = 'low';
    } else if (value > referenceRange.high.value) {
        status = 'high';
    }
</script>

<div class="range" class:-value={showValue}>

    <figure class="bar">
        <div class="bar__low" class:active={status == 'low'}  style="width: {referenceRangeLowPercent}%">
            {#if labels}
                {$t('charts.reference-range.low')}
            {/if}
        </div>
        <div class="bar__ok" class:active={status == 'ok'} style="width: {referenceRangeOkPercent }%">
            {#if labels}
                {$t('charts.reference-range.normal')}
            {/if}
        </div>
        <div class="bar__high" class:active={status == 'high'} style="width: {referenceRangeHighPercent}%">
            {#if labels}
                {$t('charts.reference-range.high')}
            {/if}
        </div>
        <div class="bar__indicator" style="left: {referenceRangeValuePercent}%"></div>
        {#if showValue}
        <div class="bar__value {status}"  style="left: {referenceRangeValuePercent}%">{value} {referenceRange.high.unit}</div>
        {/if}
    </figure>
    <legend>
        <span class="low" style="left: {referenceRangeLowPercent}%">{referenceRange.low.value}</span>
        <span class="high" style="left: {referenceRangeLowPercent + referenceRangeOkPercent}%">{referenceRange.high.value}</span> 
    </legend>
    </div>
<style>


.range {
        display: inline-block;
        flex-grow: 1;
        width: 100%;
        min-width: 15rem;
        margin: .1rem .1rem 1rem .1rem;
        height: 100%;
    }
.range.-value {
    padding-top: 2rem;
}

    .range legend {
        margin: .2rem 0 0 0;
        position: relative;


    }
    .range legend span.high,
    .range legend span.low {
        position: absolute;
        top: 50%;
        height: 50%;
        text-align: center;
        transform: translateX(-50%);
    }

.bar {
        position: relative;
        height: 50%;
        width: 100%;
        display: flex;
    }
    .bar__low,
    .bar__ok,
    .bar__high {
        height: 100%;
        border-radius: var(--border-radius);
        margin-right: 1px;
        padding: .5rem;
        opacity: .5;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        text-transform: uppercase;
    }
    .bar__low.active,
    .bar__ok.active,
    .bar__high.active {
        opacity: 1;
    }
    .bar__high,
    .bar__low {
        background-color: var(--color-negative);
        color: var(--color-negative-text);
    }
    .bar__ok {
        background-color: var(--color-positive);
        color: var(--color-positive-text);
    }
     
    .bar__indicator {
        position: absolute;
        top: 0;
        left: 0;
        width: 0;
        height: 0;
        border-style: solid;
        border-width:  .5rem .5rem 0 .5rem;
        border-color: var(--color-background) transparent transparent transparent;
        transform: translate(-50%, 0) rotate(360deg);
    }
    .bar__value {
        position: absolute;
        top: -.3rem;
        left: 0;
        transform: translate(-50%, -100%);
        padding: .3rem .5rem;
        border-radius: var(--border-radius);
        font-size: 1rem;
        font-weight: bold;
    }
    .bar__value:after {
        content: '';
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translate(-50%, 0);
        border-style: solid;
        border-width:  .5rem .5rem 0 .5rem;
    }
    .bar__value.low,
    .bar__value.high {
        background-color: var(--color-negative);
        color: var(--color-negative-text);
    }
    .bar__value.ok {
        background-color: var(--color-positive);
        color: var(--color-positive-text);
    }
    .bar__value.ok:after {
        border-color: var(--color-positive) transparent transparent transparent;
    }
    .bar__value.low:after,
    .bar__value.high:after {
        border-color: var(--color-negative) transparent transparent transparent;
    }
</style>