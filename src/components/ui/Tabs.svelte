<script module lang="ts">
    import type { Writable } from 'svelte/store';

    export interface TabInterface {
        registerTab: (tab: number, id?: string) => void;
        registerPanel: (panel: number, id?: string) => void;
        selectTab: (tab: number) => void;
        selectTabById: (id: string) => void;
		selectByIndex: (tab: number) => void;
        selectedTab?: Writable<number>;
        selectedPanel?: Writable<number>;
        fixedHeight?: boolean;
        registerPanelHeight?: (panel: number, height: number) => void;
        maxHeight?: Writable<number>;
        panels?: number[];
        tabIds?: string[];
    }

	export const TABS: TabInterface = {
        registerTab: function(){},
        registerPanel: function(){},
        selectTab: function(){},
        selectTabById: function(){},
        selectByIndex: function(){}
    };
</script>

<script lang="ts">
	import { setContext, onDestroy } from 'svelte';
	import { writable } from 'svelte/store';
	interface Props {
		children?: import('svelte').Snippet;
		tabHeads?: import('svelte').Snippet;
		fixedHeight?: boolean;
		selectedTabId?: string;
		ontabSelect?: (tabId: string) => void;
	}

	let { children, tabHeads, fixedHeight = true, selectedTabId, ontabSelect }: Props = $props();

	const tabs: number[] = [];
	const panels: number[] = [];
	const tabIds: string[] = [];
	const panelIds: string[] = [];
	const selectedTab = writable(0);
	const selectedPanel = writable(0);
	
	// Height management for fixed height mode
	const panelHeights: Record<number, number> = {};
	const maxHeight = writable(0);
	
	// Track active panel index for transform
	let activePanelIndex = $state(0);
	
	// Calculate tab count for width calculations
	let tabCount = $derived(panels.length || 1);

	const tabContext: TabInterface = {
		registerTab: (tab: number, id?: string) => {
			tabs.push(tab);
			if (id) {
				tabIds[tabs.length - 1] = id;
			}
			selectedTab.update((current: number) => current || tab);
			
			onDestroy(() => {
				const i = tabs.indexOf(tab);
				tabs.splice(i, 1);
				if (id) {
					tabIds.splice(i, 1);
				}
				selectedTab.update(current => current === tab ? (tabs[i] || tabs[tabs.length - 1]) : current);
			});
		},

		registerPanel: (panel: number, id?: string) => {
			panels.push(panel);
			if (id) {
				panelIds[panels.length - 1] = id;
			}
			selectedPanel.update((current: number) => current || panel);
			
			onDestroy(() => {
				const i = panels.indexOf(panel);
				panels.splice(i, 1);
				if (id) {
					panelIds.splice(i, 1);
				}
				selectedPanel.update((current: number) => current === panel ? (panels[i] || panels[panels.length - 1]) : current);
			});
		},

		selectTab: (tab: number) => {
			const i = tabs.indexOf(tab);
			selectedTab.set(tab);
			selectedPanel.set(panels[i]);
			activePanelIndex = i;  // Update index for transform
			
			// Notify parent component about tab selection
			const tabId = tabIds[i];
			if (tabId && ontabSelect) {
				ontabSelect(tabId);
			}
		},

		selectByIndex: (index: number) => {
			selectedTab.set(tabs[index]);
			selectedPanel.set(panels[index]);
			activePanelIndex = index;  // Update index for transform
		},

		selectTabById: (id: string) => {
			const index = panelIds.indexOf(id);
			if (index !== -1) {
				selectedTab.set(tabs[index]);
				selectedPanel.set(panels[index]);
				activePanelIndex = index;  // Update index for transform
			}
		},

		registerPanelHeight: (panel: number, height: number) => {
			if (fixedHeight && height > 0) {
				panelHeights[panel] = height;
				const newMaxHeight = Math.max(...Object.values(panelHeights), 0);
				maxHeight.set(newMaxHeight);
			}
		},

		selectedTab,
		selectedPanel,
		fixedHeight,
		maxHeight,
		panels,
		tabIds
	}

	// React to selectedTabId prop changes
	$effect(() => {
		if (selectedTabId && tabContext.selectTabById) {
			tabContext.selectTabById(selectedTabId);
		}
	});

	// Export selectTab function to component instance (kept for backward compatibility)
	export function selectTab(index: number) {
		tabContext.selectByIndex(index);
	}

	setContext(TABS, tabContext);
</script>

<div class="tabs"
	class:fixed-height={fixedHeight}
	style:--active-panel-index={activePanelIndex}
	style:--tab-count={tabCount}
	style:--max-panel-height={$maxHeight > 0 ? `${$maxHeight}px` : 'auto'}
>
	{#if tabHeads}
		{@render tabHeads()}
	{/if}
	{#if fixedHeight}
		<div class="tab-panels-wrapper">
			<div class="tab-panels-grid">
				{@render children?.()}
			</div>
		</div>
	{:else}
		{@render children?.()}
	{/if}
</div>

<style>
	.tabs {
		width: 100%;
	}

	/* Fixed height mode with CSS Grid sliding */
	.tabs.fixed-height {
		min-height: var(--max-panel-height);
		transition: min-height 0.2s ease;
	}

	/* Wrapper clips the view to show only one tab */
	.tabs.fixed-height :global(.tab-panels-wrapper) {
		overflow: hidden;
		width: 100%;
		position: relative;
	}

	/* Grid container - wide enough for all panels side-by-side */
	.tabs.fixed-height :global(.tab-panels-grid) {
		display: grid;
		grid-template-columns: repeat(var(--tab-count), 1fr);
		width: calc(100% * var(--tab-count));
		transform: translateX(calc(-100% / var(--tab-count) * var(--active-panel-index)));
		transition: transform 0.3s ease;
	}

	/* Each panel takes one grid column automatically */
	.tabs.fixed-height :global(.tab-panel.fixed-height-mode) {
		min-height: var(--max-panel-height);
		/* No positioning needed - grid handles layout */
	}
</style>