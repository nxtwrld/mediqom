<script lang="ts">
    import { createEventDispatcher } from "svelte";
	import Empty from "./Empty.svelte";
	import { LinkType } from "$lib/common.types.d";

    const dispatch = createEventDispatcher();

   interface Props {
      items?: any[];
      removable?: boolean;
      layout?: 'rows' | 'icons';
      max?: number;
      type?: string;
      view?: import('svelte').Snippet<[any]>;
      empty?: import('svelte').Snippet;
      add?: import('svelte').Snippet<[any]>;
   }

   let {
      items = $bindable([]),
      removable = false,
      layout = 'rows',
      max = 0,
      type = 'item',
      view,
      empty,
      add
   }: Props = $props();

    let count = $derived(items.filter(item => type === item.type || type === 'item').length);

    // unlink item
    function unlink(item: any) {
        items.splice(items.indexOf(item), 1);
        items = [...items];
        dispatch('change', items);
    }

    function link(item: any) {
        console.log('linking', item);
        if (max > 0 && items.length >= max) {
            return;
        }
        items.push(item);
        items = [...items];
        dispatch('change', items);
    }
</script>

<div class="links -{layout} -size-{items.length}"  class:-removable={removable}>
    {#if count > 0}
        {#each items as item}
            {#if type === item.type || type === 'item'}
            <div class="linked-item">
                {@render view?.({ item, })}
                {#if removable}
                <button class="-unlink" type="button" aria-label="Remove link" onclick={() => unlink(item)}>
                    <svg class="icon">
                        <use href="/sprite.svg#close"></use>
                    </svg>
                </button>
                {/if}
            </div>
            {/if}
        {/each}
    
   {:else} 
        {#if empty}
            {@render empty?.()}
        {:else}
            <Empty>No items linked</Empty>
        {/if}
    {/if}
    {#if add}
        <div class="linked-item">{@render add?.({ link, })}</div>
    {/if}
</div>



<style>
    .links {
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        justify-content: stretch;
        align-items: stretch;
        flex-grow: 1;
        gap: var(--gap);
        container: links /  inline-size;
        margin-bottom: var(--gap);
    }
    .links:has(:global(> .empty)) {
        min-height: 4rem;
    }

    .links.-rows .linked-item {
        width: calc(50% - var(--gap));
        min-width: 12rem; 
        position: relative;
    }

    .links :global(.empty) {
        width: 100% !important;
    }

    @container links (inline-size < 30rem) {
        .links.-rows .linked-item {
            width: calc(100%);
            min-width: none;
        }
    }

    @container links (inline-size > 60rem) {
        .links.-rows .linked-item {
            width: calc(33.3% - var(--gap));
            min-width: none;
        }
    }

    .links.-icons .linked-item {
        width: calc(50% - var(--gap) / 2);
        min-width: 10rem; 
        position: relative;
    }
    @container links (inline-size < 15rem) {
        .links.-icons .linked-item {
            width: calc(100%);
            min-width: none;
        }
    }

    @container links (inline-size > 40rem) {
        .links.-icons .linked-item {
            width: calc(33.3% - var(--gap));
            min-width: none;
        }
    }

    .links.-size-1 .linked-item {
        width: 100% !important;
    }

    .links .linked-item  > :global(.button),
    .links .linked-item  > :global(.item)  {
        width: 100%;
        height: 100%;
    }
    .links.-removable :global(.item)   {
        padding-right: 2.5rem;
    }

    .linked-item {
        display: inline-block;
        position: relative;
    }
    .linked-item > :global(*) {
        margin: 0;
    }
    .linked-item button {
        position: absolute;
        top: 0;
        right: 0;
        width: 2rem;
        height: 2rem;
        background-color: var(--color-negative);
        border-bottom-left-radius: var(--border-radius-panel);
        border-top-right-radius: var(--border-radius-panel);
        box-shadow: var(--shadow-interactive);
        display: flex;
        justify-content: center;
        align-items: center;
        padding: .5rem;
        border: 0;
        cursor: pointer;
    }

    .linked-item:last-child:nth-child(1) {
        width: 100%;
    }
    .linked-item:last-child:nth-child(2) {
        width: calc(50% - var(--gap));
    }
</style>