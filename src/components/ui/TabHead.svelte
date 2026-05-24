<script lang="ts">
	import { getContext, untrack } from 'svelte';
	import { writable } from 'svelte/store';
	import { TABS } from './Tabs.svelte';
    import type { TabInterface } from './Tabs.svelte';
	interface Props {
		children?: import('svelte').Snippet;
		id?: string;
	}

	let { children, id }: Props = $props();

	const tab: number = crypto.getRandomValues(new Uint32Array(1))[0];
	const tabContext = getContext(TABS) as TabInterface | undefined;
	
	// Gracefully handle missing context
	const registerTab = tabContext?.registerTab ?? (() => {});
	const selectTab = tabContext?.selectTab ?? (() => {});
	const selectedTab = tabContext?.selectedTab ?? writable(0);

	untrack(() => registerTab(tab, id));
</script>



<button class="tab-head" class:-active="{$selectedTab === tab}" onclick={() => selectTab(tab)}>
	{@render children?.()}
</button>