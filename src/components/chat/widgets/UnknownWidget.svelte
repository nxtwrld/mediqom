<script lang="ts">
	import type { WidgetSpec, WidgetInteraction } from '$lib/chat/widgets/types';

	interface Props {
		spec: WidgetSpec;
		onInteraction?: (interaction: WidgetInteraction) => void;
	}

	let { spec }: Props = $props();
	let expanded = $state(false);

	function toggleExpanded() {
		expanded = !expanded;
	}
</script>

<div class="unknown-widget">
	<p class="label">Unsupported widget: <code>{spec.type}</code></p>
	<button class="toggle" onclick={toggleExpanded}>
		{expanded ? 'Hide' : 'Show'} data
	</button>
	{#if expanded}
		<pre class="data">{JSON.stringify(spec.data, null, 2)}</pre>
	{/if}
</div>

<style>
	.unknown-widget {
		padding: 10px;
		font-size: 12px;
		color: var(--color-gray-800);
	}

	.label {
		margin: 0 0 4px;
	}

	code {
		background: var(--color-gray-400);
		padding: 1px 4px;
		border-radius: 3px;
		font-size: 11px;
	}

	.toggle {
		background: none;
		border: none;
		color: var(--color-blue);
		cursor: pointer;
		padding: 0;
		font-size: 11px;
		text-decoration: underline;
	}

	.data {
		margin: 8px 0 0;
		padding: 8px;
		background: var(--color-gray-300);
		border-radius: 4px;
		font-size: 10px;
		overflow-x: auto;
		max-height: 200px;
		overflow-y: auto;
		white-space: pre-wrap;
		word-break: break-all;
	}
</style>
