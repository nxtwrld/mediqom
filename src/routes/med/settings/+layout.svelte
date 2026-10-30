<script lang="ts" module>
	// shortcut: lost on hard reload (falls back to /med), upgrade when settings becomes an overlay
	let returnUrl: string | null = null;
</script>

<script lang="ts">
	import { page } from '$app/stores';
	import { afterNavigate, goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { SETTINGS_BASE, sections } from './sections';

	interface Props {
		children?: import('svelte').Snippet;
	}

	let { children }: Props = $props();

	// Determine current tab from URL
	const currentPath = $derived($page.url.pathname);
	const isActive = (path: string) => currentPath.includes(path);
	const current = $derived(sections.find((s) => isActive(`/${s.path}`)));

	afterNavigate(({ from }) => {
		if (from && !from.url.pathname.startsWith(SETTINGS_BASE)) {
			returnUrl = from.url.pathname + from.url.search;
		}
	});

	function close() {
		goto(returnUrl ?? '/med');
	}
</script>

<div class="settings-layout">
	<header class="settings-header">
		{#if current}
			<a class="settings-icon settings-back" href={SETTINGS_BASE} aria-label={$t('app.settings.back')}>
				<svg><use href="/icons.svg#arrow-nav-left"></use></svg>
			</a>
		{/if}
		<h1 class="h1 settings-title" class:-sub={current}>
			<span class="title-main">{$t('app.settings.title')}</span>
			{#if current}
				<span class="title-section">{$t(current.key)}</span>
			{/if}
		</h1>
		<button class="settings-icon" aria-label={$t('aria.ui.close-overlay')} onclick={close}>
			<svg><use href="/icons.svg#close"></use></svg>
		</button>
	</header>

	<nav class="tab-heads">
		{#each sections as section (section.path)}
			<a
				href="{SETTINGS_BASE}/{section.path}"
				class={isActive(`/${section.path}`) ? '-active' : ''}
			>
				{$t(section.key)}
			</a>
		{/each}
	</nav>

	<div class="settings-content">
		{@render children?.()}
	</div>
</div>

<style>
	.settings-layout {
		max-width: 90rem;
		margin: 0 auto;
		padding: var(--ui-pad-large);
	}

	.settings-header {
		display: flex;
		align-items: center;
		gap: var(--ui-pad-small);
		margin-bottom: var(--ui-pad-large);
	}

	.settings-title {
		flex: 1;
		margin: 0;
	}

	.title-section,
	.settings-back {
		display: none;
	}

	.settings-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: var(--toolbar-height);
		height: var(--toolbar-height);
		padding: 0;
		border: none;
		border-radius: var(--ui-radius-medium);
		background: transparent;
		color: var(--color-text-primary);
		cursor: pointer;
	}

	.settings-icon:hover {
		background: var(--color-surface);
	}

	.settings-icon svg {
		width: 2.4rem;
		height: 2.4rem;
		fill: currentColor;
	}

	.settings-content {
		animation: fadeIn 0.2s ease;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(1rem);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media (max-width: 768px) {
		.settings-layout {
			padding: var(--ui-pad-medium);
			padding-bottom: calc(var(--safe-area-bottom) + var(--toolbar-height) + 4.8rem);
		}

		.tab-heads {
			display: none;
		}

		.settings-back {
			display: flex;
		}

		.title-section {
			display: inline;
		}

		.settings-title.-sub .title-main {
			display: none;
		}
	}
</style>
