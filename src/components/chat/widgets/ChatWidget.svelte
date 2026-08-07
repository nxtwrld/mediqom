<script lang="ts">
	import { mount, unmount } from 'svelte';
	import { onMount, onDestroy } from 'svelte';
	import { getWidgetComponent } from '$lib/chat/widgets/registry';
	import UnknownWidget from './UnknownWidget.svelte';
	import { isValidWidgetType } from '$lib/chat/widgets/types';
	import type { WidgetSpec, WidgetInteraction } from '$lib/chat/widgets/types';
	import type { WidgetComponentProps } from '$lib/chat/widgets/registry';

	interface Props {
		spec: WidgetSpec;
		onInteraction?: (interaction: WidgetInteraction) => void;
	}

	let { spec, onInteraction }: Props = $props();

	let mountTarget: HTMLDivElement | undefined = $state();
	let mountedComponent: Record<string, any> | undefined;
	let validationError = $state('');

	/** M3: Validate widget spec before mounting */
	function validateWidgetSpec(s: WidgetSpec): string | null {
		if (!s || typeof s !== 'object') return 'Invalid widget spec';
		if (!s.id || typeof s.id !== 'string') return 'Missing widget id';
		if (!isValidWidgetType(s.type)) return `Unknown widget type: ${s.type}`;
		if (!s.data || typeof s.data !== 'object' || Array.isArray(s.data)) return 'Invalid widget data';
		return null;
	}

	onMount(() => {
		if (!mountTarget) return;

		// M3: Validate before mounting
		const error = validateWidgetSpec(spec);
		if (error) {
			validationError = error;
			// Fall through to render UnknownWidget
		}

		const Component = validationError
			? (UnknownWidget as unknown as import('svelte').Component<WidgetComponentProps>)
			: getWidgetComponent(spec.type) ?? (UnknownWidget as unknown as import('svelte').Component<WidgetComponentProps>);

		mountedComponent = mount(Component, {
			target: mountTarget,
			props: { spec, onInteraction }
		});
	});

	onDestroy(() => {
		if (mountedComponent) unmount(mountedComponent);
	});
</script>

<div class="chat-widget">
	{#if spec.title}
		<div class="widget-title">{spec.title}</div>
	{/if}
	<div class="widget-content" bind:this={mountTarget}></div>
</div>

<style>
	.chat-widget {
		margin-top: 8px;
		border: 1px solid var(--color-gray-400);
		border-radius: var(--radius-8);
		overflow: hidden;
		background: var(--color-white);
	}

	.widget-title {
		padding: 6px 10px;
		font-size: 12px;
		font-weight: 600;
		color: var(--color-gray-800);
		background: var(--color-gray-300);
		border-bottom: 1px solid var(--color-gray-400);
	}

	.widget-content {
		display: block;
		width: 100%;
	}

	/* Section component overrides for chat context */
	.widget-content :global(.h3.heading.-sticky) {
		display: none;
	}

	.widget-content :global(.list-items) {
		padding: 0;
		margin: 0;
	}

	.widget-content :global(.panel) {
		margin: 0;
		padding: var(--ui-pad-small);
	}

	.widget-content :global(.section-title-sub) {
		margin: var(--ui-pad-small) 0 0;
		font-size: 0.85rem;
	}

</style>
