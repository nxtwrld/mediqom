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
		padding: 1rem;
		font-size: 1.2rem;
		color: var(--color-gray-800);
	}

	.label {
		margin: 0 0 0.4rem;
	}

	code {
		background: var(--color-gray-400);
		padding: 1px 0.4rem;
		border-radius: 0.3rem;
		font-size: 1.2rem;
	}

	.toggle {
		background: none;
		border: none;
		color: var(--color-blue);
		cursor: pointer;
		padding: 0;
		font-size: 1.2rem;
		text-decoration: underline;
	}

	.data {
		margin: 0.8rem 0 0;
		padding: 0.8rem;
		background: var(--color-gray-300);
		border-radius: 0.4rem;
		font-size: 1rem;
		overflow-x: auto;
		max-height: 20rem;
		overflow-y: auto;
		white-space: pre-wrap;
		word-break: break-all;
	}
</style>
