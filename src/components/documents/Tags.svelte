<script lang="ts">
    import { isObject } from '$lib/context/objects';
	import focused from '$lib/focused';
    import { isElementInViewport } from '$lib/viewport';
	import ui from '$lib/ui';
	import { createEventDispatcher, onMount } from 'svelte';
	import { throttle } from 'throttle-debounce';
	import { t } from '$lib/i18n';
	import { translateAnatomy } from '$lib/i18n/anatomy';



	const dispatch = createEventDispatcher();


	interface Props {
		tags?: string[];
		focusable?: boolean;
		active?: boolean;
	}

	let { tags = [], focusable = true, active = true }: Props = $props();


	

	let tagContainer: HTMLElement | undefined = $state();

	function focus(event: MouseEvent, tag: string) {
		event.preventDefault();
		event.stopPropagation();
		focused.set({ object: tag.replace(/ /ig, '_') });
		dispatch('click', tag);
	}

	const checkIfInView = throttle(500, function () {
		if (tagContainer && isElementInViewport(tagContainer)) {
			focused.set({ object: focusableTags[0]});
		}
	});

	onMount(() => {
		return ui.listen('scroll', () => {
			if (focusable) checkIfInView();
		});
	});

	let safeTags = $derived(tags.map(tag => tag.replace(/ /g, '_')));
	let focusableTags = $derived(safeTags.filter((tag) => isObject(tag)));
</script>

<div class="tags" bind:this={tagContainer}>
	{#each tags as tag}
        {#if isObject(tag.replace(/ /g, '_'))}
			{#if active}
            	<button class="tag -object" class:-highlight={tag == $focused.object} onclick={(event) => focus(event, tag)}>{translateAnatomy(tag.replace(/ /g, '_'), $t)}</button>
			{:else}
				<button class="tag -object" class:-highlight={tag == $focused.object} onclick={() => dispatch('click', tag)}>{translateAnatomy(tag.replace(/ /g, '_'), $t)}</button>
			{/if}
        {:else}
    		<button class="tag" onclick={() => dispatch('click', tag)}>{tag}</button>
        {/if}
	{/each}
</div>


<style>
    .tags {
        display: inline-flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.tag {
		display: inline-block;
		padding: 0.25rem 0.5rem;
		border-radius: 0.25rem;
		background-color: var(--color-gray-800);
		color: var(--color-white);
		cursor: pointer;
	}
	.tag.-object {
		background-color: var(--color-interactivity);
		color: var(--color-interactivity-text);
	}
	.tag.-object.-highlight {
		background-color: var(--color-highlight);
		color: var(--color-highlight-text);
	}

    button {
        pointer-events: all;
    }

</style>