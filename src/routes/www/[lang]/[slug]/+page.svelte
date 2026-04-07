<script lang="ts">
	import type { PageData } from './$types';
	import MermaidDiagram from '$lib/components/MermaidDiagram.svelte';
	import { onMount } from 'svelte';
	import mermaid from 'mermaid';
	import BetaForm from '$components/www/BetaForm.svelte';

	export let data: PageData;
	
	let contentElement: HTMLElement;

	let mermaidInitialized = false;
	
	onMount(() => {
		initializeMermaid();
	});

	// Reactive statement to process Mermaid when content changes
	$: if (data.content.html && contentElement) {
		// Small delay to ensure DOM is updated
		setTimeout(() => {
			processMermaidDiagrams();
		}, 50);
	}

	function initializeMermaid() {
		if (mermaidInitialized) return;
		
		// Initialize mermaid with configuration
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
		
		mermaidInitialized = true;
	}

	async function processMermaidDiagrams() {
		if (!contentElement || !mermaidInitialized) return;

		// Look for our custom mermaid-placeholder divs that haven't been processed yet
		const mermaidElements = contentElement.querySelectorAll('.mermaid-placeholder:not(.processed)');
		console.log(`Found ${mermaidElements.length} unprocessed mermaid placeholder elements`);
		
		// Process each element sequentially to avoid ID conflicts
		for (let index = 0; index < mermaidElements.length; index++) {
			const element = mermaidElements[index];
			const encodedCode = element.getAttribute('data-code');
			const code = encodedCode ? decodeURIComponent(encodedCode) : element.textContent || '';
			const id = `mermaid-${data.slug}-${index}-${Date.now()}`;
			
			console.log(`Processing mermaid diagram ${index}:`, code.substring(0, 50) + '...');
			
			// Mark as being processed to prevent duplicate processing
			element.classList.add('processed');
			
			try {
				// Clear any previous mermaid state
				mermaid.mermaidAPI.reset();
				
				const { svg } = await mermaid.render(id, code);
				
				// Create a new div to replace the placeholder
				const container = document.createElement('div');
				container.className = 'mermaid-diagram';
				container.innerHTML = svg;
				
				// Replace the placeholder with the rendered diagram
				element.parentNode?.replaceChild(container, element);
				console.log(`Successfully rendered mermaid diagram ${index}`);
			} catch (err) {
				console.error(`Mermaid rendering error for diagram ${index}:`, err);
				// Show error in place of diagram
				element.classList.remove('processed');
				element.classList.add('mermaid-error');
				const errorDiv = document.createElement('div');
				errorDiv.className = 'error';
				errorDiv.textContent = `Failed to render diagram: ${(err as Error).message}`;
				element.textContent = '';
				element.appendChild(errorDiv);
			}
			
			// Small delay between renders to ensure proper cleanup
			await new Promise(resolve => setTimeout(resolve, 50));
		}

		// Also check for standard code blocks as fallback that haven't been processed
		const codeBlocks = contentElement.querySelectorAll('pre > code.language-mermaid:not(.processed)');
		console.log(`Found ${codeBlocks.length} unprocessed standard mermaid code blocks`);
		
		// Process fallback code blocks sequentially too
		for (let index = 0; index < codeBlocks.length; index++) {
			const codeElement = codeBlocks[index];
			const preElement = codeElement.parentElement;
			if (!preElement) continue;
			
			const code = codeElement.textContent || '';
			const id = `mermaid-fallback-${data.slug}-${index}-${Date.now()}`;
			
			console.log(`Processing fallback mermaid diagram ${index}:`, code.substring(0, 50) + '...');
			
			// Mark as being processed
			codeElement.classList.add('processed');
			
			try {
				// Clear any previous mermaid state
				mermaid.mermaidAPI.reset();
				
				const { svg } = await mermaid.render(id, code);
				
				// Create a new div to replace the pre element
				const container = document.createElement('div');
				container.className = 'mermaid-diagram';
				container.innerHTML = svg;
				
				// Replace the pre element with the rendered diagram
				preElement.parentNode?.replaceChild(container, preElement);
				console.log(`Successfully rendered fallback mermaid diagram ${index}`);
			} catch (err) {
				console.error(`Mermaid rendering error for fallback diagram ${index}:`, err);
				// Keep the original code block on error, remove processed flag
				codeElement.classList.remove('processed');
				codeElement.classList.add('mermaid-error');
			}
			
			// Small delay between renders
			await new Promise(resolve => setTimeout(resolve, 50));
		}
	}
</script>

<svelte:head>
	<title>{data.content.metadata.title || data.slug} - Mediqom</title>
	{#if data.content.metadata.description}
		<meta name="description" content={data.content.metadata.description} />
	{/if}
	{#if data.content.metadata.keywords}
		<meta name="keywords" content={data.content.metadata.keywords.join(', ')} />
	{/if}
</svelte:head>

<article class="content-page">


	<div bind:this={contentElement} class="markdown-content">
		{@html data.content.html}
	</div>
	
	{#if data.slug === 'beta'}
		<BetaForm lang={data.lang} />
	{/if}
</article>

<style>
	.content-page {
		max-width: 800px;
		margin: 0 auto;
		padding: 2rem;
		line-height: 1.6;
	}

	/* Unused - h1 comes from markdown content
	h1 {
		margin-bottom: 1rem;
		font-size: 2.5rem;
		color: var(--color-heading, #1a1a1a);
	}
	*/

	/* Unused - no time element in template
	time {
		display: block;
		margin-bottom: 2rem;
		color: var(--color-text-muted, #666);
		font-size: 0.9rem;
	}
	*/

	/* Used dynamically in JavaScript for mermaid rendering errors */
	:global(.error) {
		padding: 1rem;
		background-color: #fee;
		border: 1px solid #fcc;
		border-radius: 0.25rem;
		color: #c00;
	}

	/* Unused - no loading state in template
	.loading {
		padding: 2rem;
		text-align: center;
		color: var(--color-text-muted, #666);
	}
	*/

	:global(.content-page h2) {
		margin-top: 2rem;
		margin-bottom: 1rem;
		font-size: 1.8rem;
		color: var(--color-heading, #1a1a1a);
	}

	:global(.content-page h3) {
		margin-top: 1.5rem;
		margin-bottom: 0.75rem;
		font-size: 1.4rem;
		color: var(--color-heading, #1a1a1a);
	}

	:global(.content-page p) {
		margin-bottom: 1rem;
	}

	:global(.content-page ul, .content-page ol) {
		margin-bottom: 1rem;
		padding-left: 2rem;
	}

	:global(.content-page code) {
		background-color: var(--color-bg-code, #f4f4f4);
		padding: 0.125rem 0.25rem;
		border-radius: 0.25rem;
		font-family: monospace;
		font-size: 0.9em;
	}

	:global(.content-page pre) {
		background-color: var(--color-bg-code, #f4f4f4);
		padding: 1rem;
		border-radius: 0.5rem;
		overflow-x: auto;
		margin-bottom: 1rem;
	}

	:global(.content-page pre code) {
		background-color: transparent;
		padding: 0;
	}

	:global(.content-page blockquote) {
		border-left: 4px solid var(--color-primary, #007bff);
		padding-left: 1rem;
		margin: 1rem 0;
		font-style: italic;
		color: var(--color-text-muted, #666);
	}

	:global(.mermaid-diagram) {
		display: flex;
		justify-content: center;
		margin: 2rem 0;
		overflow-x: auto;
	}

	:global(.mermaid-diagram svg) {
		max-width: 100%;
		height: auto;
	}

	:global(.mermaid-error) {
		border: 2px dashed #ff6b6b;
		background-color: #ffe0e0;
	}

	:global(.mermaid-placeholder) {
		background-color: #f8f9fa;
		border: 1px dashed #dee2e6;
		padding: 1rem;
		margin: 1rem 0;
		border-radius: 0.25rem;
		color: #6c757d;
		font-family: monospace;
		font-size: 0.875rem;
		white-space: pre-wrap;
	}

	:global(.mermaid-placeholder::before) {
		content: "Rendering diagram...";
		display: block;
		margin-bottom: 0.5rem;
		font-weight: 500;
		color: #495057;
	}

	:global(.mermaid-placeholder.processed) {
		opacity: 0.5;
	}

	:global(.mermaid-placeholder.processed::before) {
		content: "Processing...";
	}
</style>