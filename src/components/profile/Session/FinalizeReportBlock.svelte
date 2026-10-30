<script lang="ts">
    import { run } from 'svelte/legacy';

    import { onMount } from 'svelte';

    interface Props {
        value: string;
        focus?: boolean;
        size?: number;
    }

    let { value = $bindable(), focus = false, size = 1 }: Props = $props();

    let element: HTMLTextAreaElement | undefined = $state();

    let oldValue = $state(value);

    function keydown(e: KeyboardEvent) {
        if (e.key === 'Enter') {
            e.preventDefault();
        }
        sizeTextarea();
    }


    function sizeTextarea()  {
        setTimeout(function(){
            if (!element) return;
            element.style.height = 'auto';    
            element.style.height =  'max(' + (Math.max(element.scrollHeight || 300)) + 'px,' +(3 + size*1.5) +'em)';
        }, 0);
    }


    onMount(() => {
        sizeTextarea();
        if (focus && element) element.focus();
    })

    run(() => {
        if (oldValue !== value) {
            sizeTextarea();
            oldValue = value;
        }
        
    });
</script>


<div class="block block-findings">
    <textarea bind:this={element} class="editable" bind:value={value}></textarea>
</div>


<style>

    .block {
        margin: 0;
        
    }
    textarea {
        width: 100%;
        padding: 1.6rem;
        border: none;
        line-height: 2rem;
        resize: none;
        font-family: var(--font-face-print);
    }
</style>