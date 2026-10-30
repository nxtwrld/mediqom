<script lang="ts">
	import { _ } from 'svelte-i18n';

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

<section id="story" class="section-story" class:-visible={visible} bind:this={sectionEl}>
	<div class="story-inner">
		<svg class="story-logo" viewBox="0 0 500 500" aria-hidden="true">
			<use href="/logo.svg#icon" />
		</svg>
		<h2 class="story-title">{$_('www.story.title')}</h2>
		<p class="story-symbol">{$_('www.story.symbol')}</p>
		<p class="story-text">{$_('www.story.p1')}</p>
		<p class="story-text">{$_('www.story.p2')}</p>
		<p class="story-text">{$_('www.story.p3')}</p>
		<p class="story-text">{$_('www.story.ownership')}</p>
		<p class="story-tagline">{$_('www.story.tagline')}</p>
	</div>
</section>

<style>
	.section-story {
		min-height: 100dvh;
		display: flex;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 6.4rem 3.2rem;
		position: relative;
	}

	.story-inner {
		max-width: 64rem;
		z-index: 1;
	}

	.story-inner > * {
		opacity: 0;
		transform: translateY(2.4rem);
		transition: opacity 0.7s ease, transform 0.7s ease;
	}

	.-visible .story-inner > * {
		opacity: 1;
		transform: translateY(0);
	}

	.-visible .story-inner > :nth-child(2) { transition-delay: 0.15s; }
	.-visible .story-inner > :nth-child(3) { transition-delay: 0.3s; }
	.-visible .story-inner > :nth-child(4) { transition-delay: 0.45s; }
	.-visible .story-inner > :nth-child(5) { transition-delay: 0.6s; }
	.-visible .story-inner > :nth-child(6) { transition-delay: 0.75s; }
	.-visible .story-inner > :nth-child(7) { transition-delay: 0.9s; }
	.-visible .story-inner > :nth-child(8) { transition-delay: 1.05s; }

	.story-logo {
		width: clamp(5.6rem, 8vw, 8rem);
		height: clamp(5.6rem, 8vw, 8rem);
		margin-bottom: 1.6rem;
	}

	.story-title {
		font-family: 'Baloo Thambi 2';
		font-size: clamp(2.8rem, 4vw, 4rem);
		color: var(--www-text, #1a1a2e);
		margin: 0 0 0.8rem;
		line-height: 1.2;
	}

	.story-symbol {
		font-size: clamp(1.6rem, 1.8vw, 2rem);
		font-style: italic;
		color: var(--www-text, #1a1a2e);
		margin: 0 0 3.2rem;
	}

	.story-text {
		font-size: clamp(1.6rem, 1.5vw, 1.8rem);
		color: var(--www-text-secondary, #555);
		line-height: 1.7;
		margin: 0 0 2rem;
	}

	.story-tagline {
		font-family: 'Baloo Thambi 2';
		font-size: clamp(2rem, 2.5vw, 2.6rem);
		color: var(--www-text, #1a1a2e);
		margin: 2.4rem 0 0;
		line-height: 1.3;
	}

	@media (max-width: 768px) {
		.section-story {
			padding: 4.8rem 2.4rem;
			min-height: auto;
		}
	}
</style>
