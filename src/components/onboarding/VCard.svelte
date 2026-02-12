<script lang="ts">
    import { run } from 'svelte/legacy';
    import type { VCard } from '$lib/contact/types.d';
    import { logger } from '$lib/logging/logger';

    export const ready: boolean = true;


    let vcard = $state({
        n__honorificPrefixes: '',
        n__givenName: '',
        n__familyName: '',
        n__honorificSufixes: '',
        org: '',
        title: '',
        email: [{
            type: 'work',
            value: ''
        }],
        tel: [{
            type: 'work',
            value: ''
        }],
        adr: [{
            type: 'work',
            street: '',
            city: '',
            state: '',
            postalCode: '',
        }],
        note: ''
    })

    const FORM = [
        {
            label: 'Honorific Prefixes',
            id: 'honorificPrefixes',
            type: 'text',
            bind: 'n__honorificPrefixes'
        },
        {
            label: 'First Name',
            id: 'givenName',
            type: 'text',
            bind: 'n__givenName'
        },
        {
            label: 'Last Name',
            id: 'familyName',
            type: 'text',
            bind: 'n__familyName'
        },
        {
            label: 'Honorific Suffixes',
            id: 'honorificSufixes',
            type: 'text',
            bind: 'n__honorificSufixes'
        },
        {
            label: 'Organization',
            id: 'organization',
            type: 'text',
            bind: 'org'
        },
        {
            label: 'Title',
            id: 'title',
            type: 'text',
            bind: 'title'
        },
        {
            type: 'array',
            label: 'Email',
            id: 'email',
            bind: 'email'
        },
        {
            type: 'array',
            label: 'Phone',
            id: 'tel',
            bind: 'tel'
        },
        {
            type: 'array',
            label: 'Address',
            id: 'adr',
            bind: 'adr'
        },
        {
            label: 'Note',
            id: 'note',
            type: 'text',
            bind: 'note'
        }
    ]

    const formSets = {
        n: ['honorificPrefixes', 'givenName', 'familyName', 'honorificSufixes', 'org', 'title', 'note'],
        contacts: ['email', 'tel'],
        adr: ['adr']
    }
    let currentSet: 'n' | 'contacts' | 'adr' = $state('n');

    interface Props {
        data: {
        vcard: VCard
    };
        profileForm: HTMLFormElement;
    }

    let { data = $bindable(), profileForm }: Props = $props();


    function addItem(id: 'email' | 'tel' | 'adr') {
        if (id === 'adr') {
            vcard[id] = [...vcard[id], {
                type: 'work',
                street: '',
                city: '',
                state: '',
                postalCode: ''
            }] as any;
        } else {
            vcard[id] = [...vcard[id], {
                type: 'work',
                value: ''
            }] as any;
        }
    }

    function removeItem(id: 'email' | 'tel' | 'adr', index: number) {
        (vcard[id] as any).splice(index, 1);
        vcard[id] = [...vcard[id]] as any;
    }
    run(() => {
        Object.entries(vcard).forEach(([key, value]) => {
            const path = key.split('__');
            if (path.length === 1) {
                (data.vcard as any)[path[0]] = value;
                return;
            }
            if (!(data.vcard as any)[path[0]]) {
                (data.vcard as any)[path[0]] = {};
            }
            (data.vcard as any)[path[0]][path[1]] = value;
        })
        //logger.api.debug('VCard data:', data.vcard);
    });
</script>


<h2 class="h2">Contact information (optional)</h2>

<div class="tab-heads">
{#each Object.keys(formSets) as key}
    <button  onclick={() => currentSet = key as 'n' | 'contacts' | 'adr'} class:-active={currentSet == key}>{key}</button>
{/each}
</div>

{#each FORM.filter((f) => formSets[currentSet].includes(f.id)) as { label, id, type, bind }}

        <!--label for={id}>{label}</label-->
        {#if type == 'text'}
        <div class="input">
        <input id={id} name={id} type="text" bind:value={(vcard as any)[bind]} placeholder={label} />
    </div>
        {:else if type == 'array'}
        <div class="form-block">
            <h4 class="h4">{label}</h4>
            {#each (vcard as any)[bind] as arr, index}
            <div class="flex contact-item">
                <div class="input">
                <select id={id + 'type' +index} name={id + 'type' +index}  bind:value={arr.type}>
                    <option value="work" selected>Work</option>
                    <option value="home">Home</option>
                    {#if id == 'tel'}
                    <option value="cell">Cell</option>
                    {/if}
                </select>
                </div>
                <div>
                {#each Object.keys(arr).filter(key => key != 'type') as key}
                    <div class="input">
                    {#if id == 'email'}
                    <input id={id + key + index} name={id + key +index} type="email" bind:value={arr[key]} placeholder={label} />
                    {:else if id == 'tel'}
                    <input id={id + key + index} name={id + key +index} type="tel" bind:value={arr[key]} placeholder={label} />
                    {:else}
                    <input id={id + key + index} name={id + key +index} type="text" bind:value={arr[key]} placeholder={label + ' ' + key} />
                    {/if}
                    </div>
                {/each}
                </div>
                <button class="button" aria-label="Remove item" onclick={() => removeItem(id as 'email' | 'tel' | 'adr', index)}>
                    <svg>
                        <use href="/icons.svg#close" />
                    </svg>
                </button>
            </div>
            {/each}
            <button class="button" onclick={() => addItem(id as 'email' | 'tel' | 'adr')}>Add</button>
        </div>
        {/if}

{/each}

<style> 
    .flex {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: .5rem;
    }
    /* Unused - no .flex class in template
    .flex > select {
      width: 5rem;
    }
    */
    .flex > div {
        flex-grow: 1;
    }
    /* Unused - no .flex class in template
    .flex > div > input {
        width: 100%;
    }
    */
    .contact-item > button {
        width: var(--input-height);
        height: var(--input-height);
        padding: .5rem;
    }

    svg {
        width: 100%;
        height: 100%;
    }

    .form-block {
        margin: 1rem 0;
    }

    /* Unused - no .tabs-head class in template
    .tabs-head {
        margin-bottom: 1rem;
    }
    */
</style>
