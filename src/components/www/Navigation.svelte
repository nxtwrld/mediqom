<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { page } from '$app/stores';
	import LoginButton from './LoginButton.svelte';
	import type { Session, User } from '@supabase/supabase-js';

	interface Props {
		lang: string;
		session: Session | null;
		user: User | null;
	}

	let { lang, session = null, user = null }: Props = $props();

	let mobileMenuOpen = $state(false);

	function toggleMenu() {
		mobileMenuOpen = !mobileMenuOpen;
	}

	function closeMenu() {
		mobileMenuOpen = false;
	}

	const languages = [
		{ code: 'en', label: 'EN' },
		{ code: 'cs', label: 'CS' },
		{ code: 'de', label: 'DE' }
	];
</script>

<nav class="www-nav">
	<div class="nav-inner">
		<a href="/www/{lang}" class="nav-brand" onclick={closeMenu}>
			<span class="brand-name">Mediqom</span>
		</a>

		<div class="nav-right">
			<div class="lang-switcher">
				{#each languages as l}
					<a
						href="/www/{l.code}"
						class="lang-link"
						class:-active={lang === l.code}
						data-sveltekit-preload-data="off"
					>
						{l.label}
					</a>
				{/each}
			</div>

			<LoginButton {session} {user} {lang} />

			<a href="/auth" class="nav-cta">{$_('www.nav.get-started')}</a>

			<button class="nav-hamburger" onclick={toggleMenu} aria-label="Toggle menu">
				<span class="bar" class:-open={mobileMenuOpen}></span>
				<span class="bar" class:-open={mobileMenuOpen}></span>
				<span class="bar" class:-open={mobileMenuOpen}></span>
			</button>
		</div>
	</div>

	{#if mobileMenuOpen}
		<div class="mobile-menu">
			<div class="mobile-lang">
				{#each languages as l}
					<a
						href="/www/{l.code}"
						class="lang-link"
						class:-active={lang === l.code}
						onclick={closeMenu}
					>
						{l.label}
					</a>
				{/each}
			</div>
			<LoginButton {session} {user} {lang} />
			<a href="/auth" class="nav-cta -full" onclick={closeMenu}>{$_('www.nav.get-started')}</a>
		</div>
	{/if}
</nav>

<style>
	.www-nav {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 100;
		background: rgba(255, 255, 255, 0.85);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border-bottom: 1px solid rgba(0, 0, 0, 0.06);
	}

	.nav-inner {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 2rem;
		height: 3.5rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.nav-brand {
		text-decoration: none;
		color: var(--www-text, #1a1a2e);
		z-index: 101;
	}

	.brand-name {
		font-family: 'Baloo Thambi 2', cursive;
		font-size: 1.35rem;
		font-weight: 600;
	}

	.nav-right {
		display: flex;
		align-items: center;
		gap: 1.25rem;
	}

	.lang-switcher {
		display: flex;
		gap: 0.25rem;
	}

	.lang-link {
		padding: 0.25rem 0.5rem;
		border-radius: 0.25rem;
		font-size: 0.75rem;
		font-weight: 500;
		color: rgba(0, 0, 0, 0.4);
		text-decoration: none;
		transition: color 0.2s, background 0.2s;
		letter-spacing: 0.05em;
	}

	.lang-link:hover {
		color: rgba(0, 0, 0, 0.7);
	}

	.lang-link.-active {
		color: var(--www-text, #1a1a2e);
		background: rgba(0, 0, 0, 0.06);
	}

	.nav-cta {
		padding: 0.45rem 1.25rem;
		background: var(--color-primary, #16d3dd);
		color: #0a0e1a;
		border-radius: 1.5rem;
		text-decoration: none;
		font-weight: 600;
		font-size: 0.85rem;
		transition: all 0.2s;
		white-space: nowrap;
	}

	.nav-cta:hover {
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(22, 211, 221, 0.25);
	}

	.nav-cta.-full {
		width: 100%;
		text-align: center;
		padding: 0.75rem;
		border-radius: 0.75rem;
	}

	.nav-hamburger {
		display: none;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0.5rem;
		z-index: 101;
	}

	.bar {
		display: block;
		width: 20px;
		height: 2px;
		background: var(--www-text, #1a1a2e);
		margin: 4px 0;
		transition: all 0.3s ease;
		border-radius: 1px;
	}

	.bar.-open:nth-child(1) {
		transform: rotate(45deg) translate(4px, 4px);
	}

	.bar.-open:nth-child(2) {
		opacity: 0;
	}

	.bar.-open:nth-child(3) {
		transform: rotate(-45deg) translate(4px, -4px);
	}

	.mobile-menu {
		display: none;
	}

	@media (max-width: 768px) {
		.lang-switcher,
		.nav-cta:not(.-full) {
			display: none;
		}

		:global(.www-nav .login-button),
		:global(.www-nav .user-menu) {
			display: none;
		}

		.nav-hamburger {
			display: block;
		}

		.mobile-menu {
			display: flex;
			flex-direction: column;
			gap: 1rem;
			padding: 1.5rem 2rem 2rem;
			background: rgba(255, 255, 255, 0.95);
			border-top: 1px solid rgba(0, 0, 0, 0.06);
		}

		.mobile-lang {
			display: flex;
			gap: 0.5rem;
			justify-content: center;
		}

		.mobile-lang .lang-link {
			font-size: 0.9rem;
			padding: 0.5rem 1rem;
		}
	}
</style>
