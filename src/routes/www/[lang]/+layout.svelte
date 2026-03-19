<script lang="ts">
	import type { LayoutData } from './$types';
	import Navigation from '$components/www/Navigation.svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		data: LayoutData;
		children: Snippet;
	}

	let { data, children }: Props = $props();
</script>

<div class="www-layout">
	<Navigation lang={data.lang} session={data.session} user={data.user} />

	<main class="www-main">
		{@render children()}
	</main>
</div>

<style>
	@import url('https://fonts.googleapis.com/css2?family=Baloo+Thambi+2:wght@600&display=swap');

	.www-layout {
		--color-primary: #16d3dd;
		--color-primary-dark: #02b8c1;
		--color-primary-light: #4bf0f9;
		--www-bg: #f5f6f8;
		--www-text: #1a1a2e;
		--www-text-secondary: #555;

		background: var(--www-bg);
		color: var(--www-text);
		width: 100vw;
		height: 100vh;
		overflow-x: hidden;
		overflow-y: auto;
		scroll-snap-type: y mandatory;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	}

	.www-main {
		position: relative;
		z-index: 1;
	}

	/* Global www styles */
	.www-layout :global(a) {
		color: var(--color-primary-dark);
		text-decoration: none;
		transition: color 0.2s;
	}

	.www-layout :global(a:hover) {
		color: var(--color-primary);
		text-shadow: none;
	}
</style>
