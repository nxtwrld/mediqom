<script lang="ts">
    import SignalDetail from "./SignalDetail.svelte";
    import defaults from '$data/lab.properties.defaults.json';
    import ui from '$lib/ui';
    import { t } from '$lib/i18n';

    import type { Document } from '$lib/documents/types.d';

    interface Props {
        document: Document;
        item: {
            signal: string,
            test: string,
            value: string | number,
            unit: string,
            reference: string,
            urgency?: number,
            document?: Document
        };
        showDetails?: boolean;
        onshowdetails?: (event: { code: string, showDetails: boolean }) => void;
    }

    let { document, item, showDetails = false, onshowdetails }: Props = $props();

    // Create a local copy instead of mutating the prop
    const itemWithDocument = $derived({
        ...item,
        document: document
    });

    const code = $derived<string>(item.signal || item.test);
    const key = $derived(code.toLowerCase().replace(/ /g, '_'));
    const title = $derived<string>(item.signal || item.test);
    const value = $derived<string | number>(parseValue(item.value));
    const unit = $derived<string>(item.unit || '');
    const urgency = $derived<number>(item.urgency || -1);

    let referenceRange: {
        low: {
            value: number,
            unit: string
        },
        high: {
            value: number,
            unit: string
        }
    } | null = getRange();

    // Define status to fix undefined variable
    const status = $derived(getStatus());

    function parseValue(value: string | number) {
        if (typeof value == 'string') {
            const parsed = parseFloat(value.replace(',', '.'));
            if (!isNaN(parsed)) {
                return parsed;
            }
        } 
        return value;
    }

    function getStatus() {
        if (unit == 'arb.j.') {
            return (['neg', '-'].includes(value.toString())) ? 'ok' : 'risk';
        } else {
            let status: 'ok' | 'low' | 'high' = 'ok';
            
            if (referenceRange == null) return status;
            if (typeof value != 'number') return status;

            if (value < referenceRange.low.value) {
                status = 'low';
            } else if (value > referenceRange.high.value) {
                status = 'high';
            }
            return status;
        }
    }

    function getRange() {
        try {
            return  getRangeItem(item?.reference) 
        } catch(e) {
            
            if (!defaults[key as keyof typeof defaults]) return null;

            const defRefRange = (defaults as any)[key]?.referenceRange;

            if (!defRefRange)  return null;

            const userRefRange = defRefRange.find((refRange: any) => {
                console.log('TODO', refRange)
                // TODO: check unit!!
                return {
                    low: {
                        value: 0,
                        unit:'x'
                    },
                    high: {
                        value: 0,
                        unit:  'x'
                    } 
                };

                // Remove invalid profile references
                // return (refRange.sex == 'any' || refRange.age == profile.getSex())  
                //     && (refRange.ageRange.min <= profile.getAge() && refRange.ageRange.max >= profile.getAge())      
            })


            if (!userRefRange)  return null;
 
            return {
                low: {
                    value: userRefRange.low,
                    unit
                },
                high: {
                    value: userRefRange.high,
                    unit
                }
            };
        }
    }

    function getRangeItem(itemRef: string | undefined) {

        if(itemRef) {
            let [low, high] = itemRef.split('-');
            return {
                low: {
                    value: parseValue(low),
                    unit: unit
                },
                high: {
                    value:  parseValue(high),
                    unit: unit
                }
            }
        }
        return null; 
    }
    
    /*
    function getStatus() {
        if (unit == 'arb.j.') {
            return (['neg', '-'].includes(value.toString())) ? 'ok' : 'risk';
        } else {
            let status: 'ok' | 'low' | 'high' = 'ok';
            
            if (referenceRange == null) return status;
            if (typeof value != 'number') return status;

            if (value < referenceRange.low.value) {
                status = 'low';
            } else if (value > referenceRange.high.value) {
                status = 'high';
            }
            return status;
        }
    }

    $: icon = getIcon(status);

    function getIcon(status) {
        return (status == 'ok') ? 'ok' : 'danger';
        
    }

    function toggleDetails() {
        if (!showDetails) dispatch('showDetails', {code, showDetails});
        showDetails = !showDetails;
    }
    

    export function closeDetails() {
        showDetails = false;
    }


*/
</script>

    <tr class="lab-result  urgency-{urgency}  status-{status}"  id="{code.toLocaleLowerCase()}-lab-result">
        
        <!--td class="more" class:opened={showDetails}>
            <svg>
                <use href="/sprite.svg#down"></use>
            </svg>
        </td-->
        
        <td class="title">{$t('profile.health.props.'+code)}</td>

        <td class="-empty">
            <div class="actions">
                <button onclick={() => ui.emit('modal.healthProperty', itemWithDocument )} aria-label="View signal chart">
                    <svg>
                        <use href="/icons.svg#chart-line"></use>
                    </svg>
                </button>
            </div>
        </td>

        {#if unit == 'arb.j.'}
            <td class="-empty value">
                <div class="status status-{status} urgency-{urgency}">
                    <!--svg>
                        <use href="/sprite.svg#status-{icon}"></use>
                    </svg-->
                    <strong>{value}</strong>
                </div>
            </td>
        {:else}
            <td class="-empty value">
                <div class="status  urgency-{urgency}">
                    <!--svg>
                        <use href="/sprite.svg#status-{icon}"></use>
                    </svg-->
                    <strong>{value} </strong>
                    {#if unit}
                    <span class="unit">{unit}</span>
                    {/if}
                </div>
            </td>
        {/if}

    </tr>


    <!--tr class="lab-details" class:opened={showDetails}>
        <td colspan="4" >
            <div class="details"  class:opened={showDetails}>

            {#if showDetails}

                <SignalDetail
                    {code}
                    {status}
                    {item}
                    {unit}
                    {value}
                    {referenceRange}
                    {report} />
            {/if}
            </div>
        </td>
    </tr-->


<style>



    /*.lab-result td:first-child {
        border-top-left-radius: var(--border-radius);
        border-bottom-left-radius: var(--border-radius);
    }
    .lab-result td:last-child {
        border-top-right-radius: var(--border-radius);
        border-bottom-right-radius: var(--border-radius);
    }
*/
/*
    .lab-result:hover td,
    .lab-result.opened td {
        background-color: var(--color-white);
    }
    .lab-result.opened .title {
        font-weight: bold;
    }

    .table-list .lab-details td {
        width: 100%;
        margin: 0;
        padding: 0;
    }

    .title {

        font-size: 1.1rem;
        width:100%
    }
*/

    tr td:first-child {
        border-left: .5rem solid var(--background-color);
    }



    .value {
        text-align: right;
        vertical-align: middle;
    }
    
    /* Make table cells responsive to container size */
    .title {
        font-size: clamp(0.9rem, 2.5vw, 1.1rem);
        word-break: break-word;
    }
    
    @container (max-width: 600px) {
        .title {
            font-size: 0.9rem;
        }
    }
    
    @container (max-width: 400px) {
        .title {
            font-size: 0.8rem;
        }
    }
/*
    .details {
        max-height: 0;
        transition: max-height .3s ease-in-out;
        width: 100%;
        overflow: hidden;
    }

    .details.opened {
        max-height: 100vh;
        overflow: auto;
    }

        */
    .status {
        margin-right: 1rem;
        min-width: min(4rem, 25%);
        border-radius: var(--border-radius);
        padding: 0 min(1.5rem, 4%) 0 min(1rem, 3%);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: #FFF;
        font-weight: 500;
        flex-grow: 1;
        width: 100%;
        height: 100%;
        text-align: right;
        transition: background-color .1s ease-in-out;
        background-color: var(--background-color);
        color: var(--text-color);
    }
    
    /* Container-responsive adjustments for Signal */
    @container (max-width: 500px) {
        .status {
            min-width: 3rem;
            padding: 0 0.75rem 0 0.5rem;
            margin-right: 0.5rem;
        }
        
        .status strong {
            font-size: 1.2rem;
        }
        
        .actions {
            scale: 0.8;
        }
    }
    
    @container (max-width: 400px) {
        .status strong {
            font-size: 1rem;
            margin-right: 0.25rem;
        }
        
        .unit {
            font-size: 0.8rem;
        }
    }

    .status-ok {
        --background-color: var(--color-positive);
        --text-color: var(--color-positive-text);
    }
    .status-risk,
    .status-low,
    .status-high {
        --background-color: var(--color-negative);
        --text-color: var(--color-negative-text);
    }

    .urgency-1 {
        --background-color: var(--color-positive);
        --text-color: var(--color-positive-text);
    }
    .urgency-2 {
        --background-color: var(--color-warning);
        --text-color: var(--color-warning-text);
    }
    .urgency-3,
    .urgency-4,
    .urgency-5 {
        --background-color: var(--color-negative);
        --text-color: var(--color-negative-text);
    }
    

    .status svg {
        fill: currentColor;
        height: 1.5rem;
        width: 1.5rem;
        margin-right: .5rem;
    }
    .status strong {
        font-size: 1.5rem;
        font-weight: 900;
        margin-right: .5rem;
        flex-grow: 1;
    }
  

</style>
