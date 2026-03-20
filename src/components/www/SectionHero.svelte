<script lang="ts">
	import { _ } from 'svelte-i18n';

	interface Props {
		lang: string;
	}

	let { lang }: Props = $props();
</script>

<section id="hero" class="section-hero">
	<div class="hero-content">
		<svg class="hero-logo" viewBox="0 0 500 500" aria-label="mediqom">
			<use href="/logo.svg#icon" />
		</svg>
		<h1 class="hero-title">mediqom</h1>
		<p class="hero-motto">{$_('www.hero.motto')}</p>
		<p class="hero-sub">{$_('www.hero.sub')}</p>

		<div class="hero-cta">
			<a href="/auth" class="cta-button -primary">{$_('www.hero.get-started')}</a>
			<div class="store-badges">
				<a href="https://apps.apple.com" class="store-badge" aria-label="App Store">
					<img src="/www/badge-appstore.svg" alt="Download on App Store" />
				</a>
				<a href="https://play.google.com" class="store-badge" aria-label="Google Play">
					<img src="/www/badge-googleplay.svg" alt="Get it on Google Play" />
				</a>
			</div>
		</div>
	</div>
</section>

<style>
	.section-hero {
		min-height: 100dvh;
		display: flex;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 2rem;
		position: relative;
		scroll-snap-align: start;
	}

	.hero-content {
		max-width: 700px;
		z-index: 1;
	}

	.hero-logo {
		width: clamp(4rem, 12vw, 7rem);
		height: clamp(4rem, 12vw, 7rem);
		margin-bottom: 1rem;
		color: gray;
	}

	.hero-logo :global(*) {
		fill: gray !important;
	}

	.hero-title {
		font-family: 'Baloo Thambi 2';
		font-size: clamp(3rem, 8vw, 5.5rem);
		font-weight: 600;
		color: var(--www-text, #1a1a2e);
		margin: 0 0 0.5rem;
		line-height: 1.1;
		letter-spacing: -0.02em;
	}

	.hero-motto {
		font-size: clamp(1.25rem, 3vw, 1.75rem);
		color: var(--www-text, #1a1a2e);
		margin: 0 0 0.75rem;
		font-weight: 400;
		line-height: 1.3;
	}

	.hero-sub {
		font-size: clamp(1rem, 2vw, 1.2rem);
		color: var(--www-text-secondary, #555);
		margin: 0 0 2.5rem;
		line-height: 1.4;
	}

	.hero-cta {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
	}

	.cta-button {
		display: inline-block;
		padding: 0.875rem 2.5rem;
		border-radius: 2rem;
		font-size: 1.1rem;
		font-weight: 600;
		text-decoration: none;
		transition: all 0.3s ease;
	}

	.cta-button.-primary {
		background: var(--color-primary, #16d3dd);
		color: #0a0e1a;
	}

	.cta-button.-primary:hover {
		transform: translateY(-2px);
		box-shadow: 0 8px 24px rgba(22, 211, 221, 0.3);
	}

	.store-badges {
		display: flex;
		gap: 1rem;
		align-items: center;
	}

	.store-badge img {
		height: 40px;
		opacity: 0.8;
		transition: opacity 0.2s;
	}

	.store-badge:hover img {
		opacity: 1;
	}

	@media (max-width: 768px) {
		.section-hero {
			padding: 1.5rem;
		}
	}
</style>
