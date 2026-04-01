<script lang="ts">
	import { sections } from './sections';
	import type { Writable } from 'svelte/store';

	interface Props {
		activeSection: Writable<number>;
	}

	let { activeSection }: Props = $props();

	function scrollTo(index: number) {
		const el = document.getElementById(sections[index].id);
		if (!el) return;
		const scrollRoot = el.closest('.www-layout');
		if (scrollRoot) {
			scrollRoot.scrollTo({ top: el.offsetTop, behavior: 'smooth' });
		} else {
			el.scrollIntoView({ behavior: 'smooth' });
		}
	}
</script>

<nav class="section-dots" aria-label="Section navigation">
	{#each sections as section, i}
		<button
			class="dot"
			class:-active={$activeSection === i}
			onclick={() => scrollTo(i)}
			aria-label="Go to {section.id}"
			style="--dot-color: {section.canvasColor}"
		></button>
	{/each}
</nav>

<style>
	.section-dots {
		position: fixed;
		right: 1.5rem;
		top: 50%;
		transform: translateY(-50%);
		z-index: 10;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		border: 1.5px solid rgba(0, 0, 0, 0.2);
		background: transparent;
		cursor: pointer;
		padding: 0;
		transition: all 0.3s ease;
	}

	.dot:hover {
		border-color: rgba(0, 0, 0, 0.5);
		transform: scale(1.3);
	}

	.dot.-active {
		background: var(--dot-color, #16d3dd);
		border-color: var(--dot-color, #16d3dd);
		box-shadow: 0 0 8px var(--dot-color, #16d3dd);
		transform: scale(1.3);
	}

	@media (max-width: 768px) {
		.section-dots {
			display: none;
		}
	}
</style>
