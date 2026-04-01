<script lang="ts">
	import { _ } from 'svelte-i18n';
	import type { Writable } from 'svelte/store';

	interface Props {
		activeSection: Writable<number>;
	}

	let { activeSection }: Props = $props();

	let isHeroVisible = $derived($activeSection === 0);
</script>

<div class="app-download" class:-hidden={isHeroVisible}>
	<a href="/auth" class="download-pill">
		<span class="download-label">{$_('www.download.cta')}</span>
		<svg class="download-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none">
			<path d="M3 8h10m-4-4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
		</svg>
	</a>
</div>

<style>
	.app-download {
		position: fixed;
		bottom: 1.5rem;
		right: 1.5rem;
		z-index: 10;
		transition: opacity 0.4s ease, transform 0.4s ease;
	}

	.app-download.-hidden {
		opacity: 0;
		transform: translateY(1rem);
		pointer-events: none;
	}

	.download-pill {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1.5rem;
		background: var(--color-primary, #16d3dd);
		color: #0a0e1a;
		border-radius: 2rem;
		text-decoration: none;
		font-weight: 600;
		font-size: 0.9rem;
		transition: all 0.3s ease;
		box-shadow: 0 4px 16px rgba(22, 211, 221, 0.3);
	}

	.download-pill:hover {
		transform: translateY(-2px);
		box-shadow: 0 8px 24px rgba(22, 211, 221, 0.4);
	}

	.download-arrow {
		flex-shrink: 0;
	}

	@media (max-width: 768px) {
		.app-download {
			bottom: 0;
			right: 0;
			left: 0;
			padding: 0.75rem 1rem;
			background: rgba(255, 255, 255, 0.92);
			backdrop-filter: blur(12px);
			-webkit-backdrop-filter: blur(12px);
			border-top: 1px solid rgba(0, 0, 0, 0.06);
		}

		.download-pill {
			width: 100%;
			justify-content: center;
			border-radius: 0.75rem;
		}
	}
</style>
