<script lang="ts">
    import { run } from 'svelte/legacy';

    import { slide } from "svelte/transition";
    import FinalizeReportBlock from "./FinalizeReportBlock.svelte";
    import { profile } from '$lib/profiles';
    import FinalizeReportHeader from "./FinalizeReportHeader.svelte";
    import { ReportComponent, type Report, type ReportFinal } from '$lib/report/types.d';
    //import Markdown from '$components/ui/Markdown.svelte';
    /*interface Report {
        findings: string;
        patient: string;
        doctor: string;
        date: string;
        complaints: string;
        diagnosis: string;
        prescription: string;
        tests: {
            test: string;
            value: number;
            unit: string;
            reference: string;
        }[];
    }*/


    // Types imported from $lib/report/types.d

    interface Props {
        report: Report;
        finalReport?: ReportFinal;
    }

    let { report = $bindable(), finalReport = $bindable({}) }: Props = $props();
    


    let template =  $state([
        {
            id: 'findings',
            name: ReportComponent.Findings,
        }, 
        {
            id: 'treatment',
            name: ReportComponent.Treatment,
        },
        {
            id: 'medication',
            name: ReportComponent.Medication,
        },
        {
            id: 'follow-up',
            name: ReportComponent.FollowUp,
        },
        {
            id: 'recommendations',
            name: ReportComponent.Recommendations,
        },
        {
            id: 'doctor',
            name: ReportComponent.Doctor,
        }
    ])

    console.log(report)

    run(() => {
        finalReport = {};
        template.forEach(b => {
            if (report && report[b.name]) {
                finalReport[b.name] = report[b.name];
            }
        })
    });

    function deleteBlock(id: string) {
        template = [...template.filter(b => b.id !== id)]
    }

    function moveBlock(id: string, direction: number) {
        if (direction === 0) return;

        let index = template.findIndex(b => b.id === id);

        if (direction === 1 && index === template.length - 1) return;
        if (direction === -1 && index === 0) return;
        const block = template[index];

        let newTemplate = [...template].filter(b => b.id !== id);
        template = [...newTemplate.slice(0, index + direction), block, ...newTemplate.slice(index + direction)]
        console.log(template)
    }

    function addBlock(index: number = 0, name: ReportComponent = ReportComponent.Paragraph) {
        console.log('add', name)
        const block = {
            id: Math.random().toString(36).substring(7),
            name
        }
        report[block.id] = '';
        console.log(report)
        template = [...template.slice(0, index), block, ...template.slice(index)]
    }
</script>


<div class="report">

    <FinalizeReportHeader bind:report={report} />

    {#each template as block, index (block.id)}
        {#if report[block.name] || report[block.id] != undefined}
        <div out:slide class="block">
            <div class="title">{block.name}</div>

            {#if report[block.id] != undefined}
            <FinalizeReportBlock bind:value={report[block.id]} />
            {:else}
            <FinalizeReportBlock bind:value={report[block.name]} />
            {/if}
            <div class="actions">
                <button onclick={() => deleteBlock(block.id)} class="danger" aria-label="Delete block"><svg>
                    <use href="/icons.svg#minus"></use>
                </svg></button>
                <button onclick={() => moveBlock(block.id, -1)} aria-label="Move block up"><svg>
                    <use href="/icons.svg#arrow-round-up"></use>
                </svg></button>
                <button onclick={() => moveBlock(block.id, 1)} aria-label="Move block down"><svg>
                    <use href="/icons.svg#arrow-round-down"></use>
                </svg></button>
            </div>
        </div>
        <button class="add" aria-label="Add new block" onclick={() => addBlock(index+1)}>
            <svg>
                <use href="/icons.svg#plus"></use>
            </svg>
        </button>
        {/if}
    {/each}

</div>

<style>
    .report {
        padding: 5rem 3rem;
    }
    .block {
        position: relative;
        border: 1px dotted var(--color-gray-300);
    }
    .add {
        margin: 1rem;
    }
    .title {
        position: absolute;
        top: -1.2rem;
        right: 0;
        height: 1.2rem;
        font-size: .8rem;
        background-color: var(--color-gray-300);
        color: var(--color-gray-800);
        padding: .2rem .5rem;
        font-weight: 700;
    }
    .block:hover .title {
        background-color: var(--color-neutral);
        color: var(--color-neutral-text);
    }
    .actions {

        position: absolute;
        top: 0;
        left: 100%;
        z-index: 2;
        height: auto;
        padding: .2rem;
        display: none;
        flex-direction: column;
    }
    .block:hover .actions {
        display: flex;
    }
    button {
        background: none;
        border: none;
        cursor: pointer;
        color: var(--color-gray-500);
    }
    button:hover {
        color: var(--color-neutral);
    }
    button.danger:hover {
        color: var(--color-negative);
    }
    svg {
        width: 1.5rem;
        height: 1.5rem;
        color: inherit;
        fill: currentColor;
    }

    @media print {
        .report {
            padding: 1rem;
        }
        .block {
            border: none;
        }
        .add,
        .actions,
        .title {
            display: none;
        }
    }

</style>