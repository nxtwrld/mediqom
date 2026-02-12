<script lang="ts">
	import { onMount } from "svelte";
    //import LabResultHistory from "./LabResultHistory.svelte";
    import LabResultTips from "./SignalTips.svelte";
    import ReferenceRange from "$components/charts/ReferenceRange.svelte";
	//import Consult from "$components/contact/Consult.svelte";
	import LabResultInfo from "./SignalInfo.svelte";
    import { Tabs, TabHeads, TabHead, TabPanel } from "$components/ui/tabs";
    import defaults from '$data/lab.properties.defaults.json';






    interface Props {
        code?: string;
        value?: string | number;
        unit?: string;
        status?: string;
        observation?: any;
        item?: {
        test: string,
        value: string | number,
        unit: string,
        reference: string
    } | undefined;
        report?: any;
        referenceRange?: {
        low: {
            value: number,
            unit: string
        },
        high: {
            value: number,
            unit: string
        }
    } | null;
    }

    let {
        code = 'unknown',
        value = 'unknown',
        unit = 'unknown',
        status = 'ok',
        observation = {},
        item = undefined,
        report = {},
        referenceRange = null
    }: Props = $props();

    // blood and urine can have different values - we need to provide a way to map them to the same code
    function getMeasurementInfoCode(code: string, unit: string) {

        code = code.toLowerCase().replace(/ /g, '_');
        if (['glucose', 'wbc', 'bilirubin', 'total_protein'].includes(code)) {
            if (unit == 'arb.j.') {
                return code;
            } else {
                return code+'-quant';
            }
        } else {
            return code;
        }
    }


    let kb: any = $state(undefined);
    let level: any = $state(undefined);

    let tabs: Tabs = $state();
    onMount(() => {
        const key = getMeasurementInfoCode(code, unit);
        fetch('/knowledgebase/lab/'+ key+'.json')
            .then(r => r.json())
            .then(r => {
                kb = r;

                if (kb[status]) {
                    if (Array.isArray(kb[status])) {
                        level = kb[status].filter((e: any) => e.value == value)[0];
                    } else level = kb[status];
                }


            })
            .catch(e => console.error(e))
    })

    function showTab(index: number) {
        if (tabs) tabs.selectTab(index);
    }

</script>

<!--Consult detail={report, item}/-->
{#if kb}

<Tabs bind:this={tabs}>
    {#snippet tabHeads()}
        <TabHeads>
            <TabHead>Overview</TabHead>
            <TabHead>Trends</TabHead>
            <TabHead>Info</TabHead>
        </TabHeads>
    {/snippet}
    <TabPanel>

        <div class="status {status}">


            <h3 class="h3 title">
            {#if status == 'ok'}
            Your values are in the normal range, indicating good health balance. Well done!
            {:else if status == 'low'}
            Your results are below the expected range, which could be concerning or due to test error. Professional guidance is recommended to understand these results.

            {:else if status == 'high'}
            Your values are above normal, which may raise concern. However, test errors do occur. It's best to consult a healthcare professional for clarity.
            {/if}
            </h3>


            {#if referenceRange && referenceRange.low.value != null && referenceRange.high.value != null && typeof value == 'number'}
            <div class="range">

            <ReferenceRange
                {value}
                reference={item?.reference || `${referenceRange.low.value}-${referenceRange.high.value}`}
                {referenceRange} />
            </div>
            {:else}
                <div class="value">
                    <h3 class="h3">{value}</h3>
                </div>
            {/if}


            {#if level}
                <p class="p"><strong>{level.risk}</strong></p>


                

                
                
                {#if status == 'low'}
                <h3 class="h3">How to raise your {code}</h3>
                {:else if status == 'high'}
                <h3 class="h3">How to lower your {code}</h3>
                {/if}

                <div class="status-block">
                    <LabResultTips tips={level.diet} icon="diet" >What to eat</LabResultTips>
                </div>

                <div class="status-block">
                    <LabResultTips tips={level.behavior} icon="behavior" >What to do</LabResultTips>
                </div>

    

            {:else}
                <p class="p">Your values are comfortably within the normal range, which is excellent. While everything looks good now, it's always wise to keep an eye on <button onclick={() => showTab(1)} class="a">overall trends over time</button>. Regular monitoring can help ensure that your health remains on the right track.</p>
            {/if}
        </div>


    </TabPanel>
    <TabPanel>
        <!--LabResultHistory
            {code}
            {status}
            {unit}
            date={report.date}
        /-->
    </TabPanel>
    <TabPanel>
        <LabResultInfo {kb} />
    </TabPanel>
</Tabs>


{:else}
Loading...
{/if}
<style>
    h3.title {
        margin: 1rem 0;
        color: var(--color-positive-text);
    }


    .status {
        color: var(--color-diver-4);
    }


    .range {
        height: 5rem;
        font-size: .8rem;
    }


    .status.low h3.title,
    .status.high h3.title {
        color: var(--color-negative-text);
    }

    .value .h3 {
        text-align: center;
        font-weight: bold;
        font-size: 3rem !important;
    }
    .status.risk .value {
        color: var(--color-negative-text);
    }
    .consult {
        font-size: 1rem;
        font-weight: bold;
        font-style: italic;
    }


    .tab-item {
        overflow: hidden;
        width: 100%;
        height: 1px;
        max-height: 1px;
    }
    .tab-item.active {
        height: auto;
        max-height: 1000vh;
    }

    p button {
        display: inline-block;
        white-space: wrap;
    }
</style>