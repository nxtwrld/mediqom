<script lang="ts" module>

    export enum LinkType {
        Report = 'report',
        Contact = 'contact',
        Focus = 'focus',
        Event = 'event',
        Medication = 'medication',
        Question = 'question'
    }
</script>
<script lang="ts">
    import Modal from '$components/ui/Modal.svelte';


    

    interface Props {
        object: any;
        reference: any;
        type: LinkType;
        label?: string;
        class?: string;
        showDialog?: boolean;
        children?: import('svelte').Snippet;
    }

    let {
        object,
        reference,
        type,
        label = 'Link',
        class: className = 'button',
        showDialog = $bindable(false),
        children
    }: Props = $props();

    function link() {
        console.log('linking', object, reference, type);
    }
</script>
<button class={className} onclick={() => showDialog = true}>
    {#if children}
        {@render children?.()}
    {:else}
        {label}
    {/if}
</button>

{#if showDialog}
<Modal onclose={() => { showDialog = false; }}>
Link {type} ({object.uid}) to anything

</Modal>
{/if}