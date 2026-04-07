<script lang="ts">
	import type { WidgetSpec, WidgetInteraction } from '$lib/chat/widgets/types';

	interface Props {
		spec: WidgetSpec;
		onInteraction?: (interaction: WidgetInteraction) => void;
	}

	let { spec, onInteraction }: Props = $props();

	let headers: string[] = $derived(spec.data.headers ?? []);
	let rows: any[][] = $derived(spec.data.rows ?? []);
	let caption: string | undefined = $derived(spec.data.caption);

	function handleRowClick(rowIndex: number) {
		onInteraction?.({
			widgetId: spec.id,
			widgetType: spec.type,
			action: 'click_row',
			payload: { rowIndex, rowData: rows[rowIndex] },
		});
	}
</script>

<div class="widget-table">
	{#if headers.length > 0 && rows.length > 0}
		<table>
			{#if caption}
				<caption>{caption}</caption>
			{/if}
			<thead>
				<tr>
					{#each headers as header}
						<th>{header}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each rows as row, i}
					<tr onclick={() => handleRowClick(i)} class:clickable={spec.interactive}>
						{#each row as cell}
							<td>{cell ?? ''}</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	{:else}
		<p class="no-data">No data available.</p>
	{/if}
</div>

<style>
	.widget-table {
		padding: 8px;
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 12px;
	}

	caption {
		font-size: 11px;
		color: var(--color-gray-800);
		text-align: left;
		padding: 0 0 6px;
		font-weight: 500;
	}

	th {
		text-align: left;
		padding: 6px 8px;
		font-size: 11px;
		font-weight: 600;
		color: var(--color-gray-800);
		border-bottom: 2px solid var(--color-gray-400);
		white-space: nowrap;
	}

	td {
		padding: 5px 8px;
		border-bottom: 1px solid var(--color-gray-400);
		color: var(--color-black);
	}

	tr.clickable {
		cursor: pointer;
	}

	tr.clickable:hover {
		background: var(--color-gray-300);
	}

	.no-data {
		font-size: 12px;
		color: var(--color-gray-800);
		text-align: center;
		padding: 12px;
		margin: 0;
	}
</style>
