<script lang="ts">
	import { _ } from 'svelte-i18n';

	interface Props {
		id: string;
		titleKey: string;
		descriptionKey: string;
		screenshotUrl?: string;
		alignment: 'left' | 'right';
	}

	let { id, titleKey, descriptionKey, screenshotUrl, alignment }: Props = $props();

	let visible = $state(false);
	let sectionEl: HTMLElement | undefined = $state();

	$effect(() => {
		if (!sectionEl) return;
		const root = sectionEl.closest('.www-layout') as HTMLElement | null;
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					visible = true;
					observer.disconnect();
				}
			},
			{ threshold: 0.15, root }
		);
		observer.observe(sectionEl);
		return () => observer.disconnect();
	});
</script>

<section {id} class="section-feature" class:-right={alignment === 'right'} class:-visible={visible} bind:this={sectionEl}>
	<div class="feature-inner">
		<div class="feature-text">
			<h2 class="feature-title">{$_(titleKey)}</h2>
			<p class="feature-description">{$_(descriptionKey)}</p>
		</div>
		{#if screenshotUrl}
			<div class="feature-screenshot">
				<div class="screenshot-frame">
					<img src={screenshotUrl} alt={$_(titleKey)} loading="lazy" />
				</div>
			</div>
		{/if}
	</div>
</section>

<style>
	.section-feature {
		min-height: 100dvh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 4rem 2rem;
		position: relative;
		scroll-snap-align: start;
	}

	.feature-inner {
		max-width: 1100px;
		width: 100%;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 4rem;
		align-items: center;
		opacity: 0;
		transform: translateY(40px);
		transition: opacity 0.7s ease, transform 0.7s ease;
	}

	.-visible .feature-inner {
		opacity: 1;
		transform: translateY(0);
	}

	.-right .feature-inner {
		direction: rtl;
	}

	.-right .feature-text,
	.-right .feature-screenshot {
		direction: ltr;
	}

	.feature-text {
		z-index: 1;
	}

	.feature-title {
		font-family: 'Baloo Thambi 2', cursive;
		font-size: clamp(1.75rem, 4vw, 2.5rem);
		color: var(--www-text, #1a1a2e);
		margin: 0 0 1rem;
		line-height: 1.2;
	}

	.feature-description {
		font-size: clamp(1rem, 1.5vw, 1.15rem);
		color: var(--www-text-secondary, #555);
		line-height: 1.7;
		margin: 0;
	}

	.feature-screenshot {
		display: flex;
		justify-content: center;
	}

	.screenshot-frame {
		background: #fff;
		border: 1px solid rgba(0, 0, 0, 0.08);
		border-radius: 1rem;
		padding: 0.5rem;
		overflow: hidden;
		max-width: 100%;
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
	}

	.screenshot-frame img {
		width: 100%;
		height: auto;
		border-radius: 0.75rem;
		display: block;
	}

	@media (max-width: 768px) {
		.section-feature {
			padding: 3rem 1.5rem;
			min-height: auto;
		}

		.feature-inner {
			grid-template-columns: 1fr;
			gap: 2rem;
			text-align: center;
		}

		.-right .feature-inner {
			direction: ltr;
		}

		.feature-screenshot {
			order: -1;
		}

		.screenshot-frame {
			max-width: 320px;
		}
	}
</style>
