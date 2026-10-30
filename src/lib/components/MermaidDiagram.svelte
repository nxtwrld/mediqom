<script lang="ts">
	import { onMount } from 'svelte';
	import mermaid from 'mermaid';

	export let code: string;
	export let id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;

	let container: HTMLDivElement;
	let error: string | null = null;

	onMount(() => {
		// Initialize mermaid with theme
		mermaid.initialize({
			startOnLoad: false,
			theme: 'default',
			themeVariables: {
				primaryColor: '#007bff',
				primaryTextColor: '#fff',
				primaryBorderColor: '#0056b3',
				lineColor: '#333',
				secondaryColor: '#6c757d',
				tertiaryColor: '#e9ecef'
			}
		});

		// Render the diagram
		renderDiagram();
	});

	async function renderDiagram() {
		try {
			const { svg } = await mermaid.render(id, code);
			if (container) {
				container.innerHTML = svg;
			}
		} catch (err) {
			console.error('Mermaid rendering error:', err);
			error = 'Failed to render diagram';
		}
	}
</script>

<div class="mermaid-container">
	{#if error}
		<div class="error">{error}</div>
	{:else}
		<div bind:this={container} class="mermaid-diagram"></div>
	{/if}
</div>

<style>
	.mermaid-container {
		margin: 3.2rem 0;
		display: flex;
		justify-content: center;
	}

	.mermaid-diagram {
		max-width: 100%;
		overflow-x: auto;
	}

	.error {
		padding: 1.6rem;
		background-color: #fee;
		border: 1px solid #fcc;
		border-radius: 0.4rem;
		color: #c00;
	}

	:global(.mermaid-diagram svg) {
		max-width: 100%;
		height: auto;
	}
</style>