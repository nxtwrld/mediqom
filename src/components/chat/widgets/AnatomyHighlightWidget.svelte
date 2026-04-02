<script lang="ts">
	import type { WidgetSpec, WidgetInteraction } from '$lib/chat/widgets/types';
	import { t } from '$lib/i18n';

	interface Props {
		spec: WidgetSpec;
		onInteraction?: (interaction: WidgetInteraction) => void;
	}

	let { spec, onInteraction }: Props = $props();

	let bodyParts: string[] = $derived(spec.data.bodyParts ?? []);
	let description: string | undefined = $derived(spec.data.description);

	function handleFocus(bodyPart: string) {
		onInteraction?.({
			widgetId: spec.id,
			widgetType: spec.type,
			action: 'focus_anatomy',
			payload: { bodyPart },
		});
	}
</script>

<div class="widget-anatomy">
	{#if description}
		<p class="description">{description}</p>
	{/if}
	{#if bodyParts.length > 0}
		<div class="body-parts">
			{#each bodyParts as part}
				<button class="body-part-btn" onclick={() => handleFocus(part)}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="14" height="14">
						<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
						<path d="M8 12h8M12 8v8"/>
					</svg>
					{part}
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.widget-anatomy {
		padding: 8px;
	}

	.description {
		font-size: 12px;
		color: var(--color-black);
		margin: 0 0 8px;
		line-height: 1.4;
	}

	.body-parts {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.body-part-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 10px;
		border: 1px solid var(--color-gray-400);
		border-radius: 16px;
		background: var(--color-gray-300);
		color: var(--color-black);
		font-size: 12px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.body-part-btn:hover {
		background: var(--color-highlight, var(--color-blue));
		color: var(--color-white);
		border-color: var(--color-highlight, var(--color-blue));
	}
</style>
