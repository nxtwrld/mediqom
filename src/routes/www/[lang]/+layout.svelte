<script lang="ts">
	import type { LayoutData } from './$types';
	import Navigation from '$components/www/Navigation.svelte';
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';

	interface Props {
		data: LayoutData;
		children: Snippet;
	}

	let { data, children }: Props = $props();
	let assetsReady = $state(false);

	onMount(() => {
		const timeout = setTimeout(() => {
			assetsReady = true;
		}, 3000);

		document.fonts.ready.then(() => {
			clearTimeout(timeout);
			assetsReady = true;
		});

		return () => clearTimeout(timeout);
	});
</script>

<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		rel="stylesheet"
		href="https://fonts.googleapis.com/css2?family=Baloo+Thambi+2:wght@600&display=swap"
	/>
</svelte:head>

<div class="www-layout" class:-ready={assetsReady}>
	<Navigation lang={data.lang} session={data.session} user={data.user} />

	<main class="www-main">
		{@render children()}
	</main>
</div>

<style>
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
		scroll-snap-type: none;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		opacity: 0;
		transition: opacity 0.3s ease-in;
	}

	.www-layout.-ready {
		opacity: 1;
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
