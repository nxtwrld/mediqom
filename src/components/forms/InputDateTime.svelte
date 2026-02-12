<script lang="ts">
    import { run, createBubbler } from 'svelte/legacy';

    const bubble = createBubbler();

    interface Props {
        value: string;
        placeholder?: string;
        id?: string;
        name?: string;
        type?: string;
        required?: boolean;
        label?: string | undefined;
        style?: string;
        class?: string;
        disabled?: boolean;
        tabindex?: number;
        autocomplete?: string;
        readonly?: boolean;
        children?: import('svelte').Snippet;
        onchange?: (event: Event) => void;
        onblur?: (event: FocusEvent) => void;
        onfocus?: (event: FocusEvent) => void;
    }

    let {
        value = $bindable(),
        placeholder = 'Date and time',
        id = (window as any)?.crypto.getRandomValues(new Uint32Array(1))[0].toString(16),
        name = id,
        type = 'datetime-local',
        required = false,
        label = undefined,
        style = '',
        class: className = 'input',
        disabled = false,
        tabindex = undefined,
        autocomplete = undefined,
        readonly = false,
        children
    }: Props = $props();
    


    let transformedValue: string = $state(toLocalDateTime(value));


    function toLocalDateTime(input: string) {
        try {
            if (type == 'datetime-local') {
                const date = new Date(input);
                const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
                return localDate.toISOString().slice(0, 16);
            } else if (type == 'date') {
                const date = new Date(input);
                return date.toISOString().split('T')[0];
            } else {
                console.log('input', input)
                return input
            }
        }
        catch (e) {
            return '';
        }
    }

    function fromLocalDateTime(localDateTime: string) {
        const localDate = new Date(localDateTime);
        if (type == 'datetime-local') {
            const utcDate = new Date(localDate.getTime() + (localDate.getTimezoneOffset() * 60000));
            return utcDate.toISOString().split('.')[0] + 'Z';
        } else {
            return localDate.toISOString().split('T')[0];
        }
    }
    run(() => {
        if (transformedValue) value = fromLocalDateTime(transformedValue);
    });
</script>
    {#if children || label}
        <label class="label" for={id}>
            {#if label}
                {label}
            {:else}
                {@render children?.()}
            {/if}
        </label>
    {/if}
    {#if type === 'datetime-local'}
        <input type="datetime-local" {id} {name} class={className} bind:value={transformedValue} {placeholder} {required} {style} onchange={bubble('change')} onblur={bubble('blur')} onfocus={bubble('focus')}/>
    {:else if type === 'datetime'}
        <input type="datetime"  {id} {name} class={className} bind:value={transformedValue} {placeholder} {required} {style} onchange={bubble('change')} onblur={bubble('blur')} onfocus={bubble('focus')}/>
    {:else if type === 'date-local'}
        <input type="date-local"  {id} {name} class={className} bind:value={transformedValue} {placeholder} {required} {style} onchange={bubble('change')} onblur={bubble('blur')} onfocus={bubble('focus')}/>
    {:else if type === 'date'}
        <input type="date"  {id} {name} class={className} bind:value={transformedValue} {placeholder} {required} {style} onchange={bubble('change')} onblur={bubble('blur')} onfocus={bubble('focus')}/>
    {:else if type === 'time'}
        <input type="time"  {id} {name} class={className} bind:value={transformedValue} {placeholder} {required} {style} onchange={bubble('change')} onblur={bubble('blur')} onfocus={bubble('focus')}/>
    {/if}


<style>
    input {
        -webkit-appearance: none;
        -webkit-min-logical-width: calc(100% - 16px);
        min-height: 1.5rem;
    }
</style>