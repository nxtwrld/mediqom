<script lang="ts">
    import { run, createBubbler } from 'svelte/legacy';

    const bubble = createBubbler();
	import { onMount } from "svelte";


    interface Props {
        value: string;
        placeholder?: string;
        resizable?: boolean;
        id?: string;
        name?: string;
        required?: boolean;
        label?: string | undefined;
        focus?: boolean;
        size?: number;
        class?: string;
        children?: import('svelte').Snippet;
    }

    let {
        value = $bindable(),
        placeholder = '',
        resizable = true,
        id = (window as any)?.crypto.getRandomValues(new Uint32Array(1))[0].toString(16),
        name = id,
        required = false,
        label = undefined,
        focus = false,
        size = 1,
        class: className = 'textarea',
        children
    }: Props = $props();
    let oldValue = $state(value);


    let element: HTMLTextAreaElement | undefined = $state();
    function keydown(e: KeyboardEvent) {
        if (e.key === 'Enter') {
            e.preventDefault();
        }
        sizeTextarea();
    }


    function sizeTextarea()  {
        if (!resizable) return;
        setTimeout(function(){
            if (!element) return;
            element.style.height = 'auto';    
            element.style.height =  'max(' + (Math.max(element.scrollHeight || 300)) + 'px,' +(3 + size*1.5) +'em)';
        },0);
    }


    onMount(() => {
        sizeTextarea();
        if (focus) element?.focus();
    })


    run(() => {
        if (oldValue !== value) {
            sizeTextarea();
            oldValue = value;
        }
        
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

<textarea bind:this={element} bind:value={value} {id} {name} {placeholder} class={className} onkeydown={keydown} onchange={bubble('change')} {required}></textarea>

<style>


</style>