<script lang="ts">
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';

	interface Props {
		children?: import('svelte').Snippet;
	}

	let { children }: Props = $props();

	// Determine current tab from URL
	const currentPath = $derived($page.url.pathname);
	const isActive = (path: string) => currentPath.includes(path);
</script>

<div class="settings-layout">
	<header class="settings-header">
		<h1 class="h1">{$t('app.settings.title')}</h1>
	</header>

	<nav class="tab-heads">
		<a
			href="/med/settings/general"
			class={isActive('/general') ? '-active' : ''}
		>
			{$t('app.settings.tabs.general')}
		</a>
		<a
			href="/med/settings/profile"
			class={isActive('/profile') ? '-active' : ''}
		>
			{$t('app.settings.tabs.profile')}
		</a>
		<a
			href="/med/settings/privacy"
			class={isActive('/privacy') ? '-active' : ''}
		>
			{$t('app.settings.tabs.privacy')}
		</a>
		<a
			href="/med/settings/about"
			class={isActive('/about') ? '-active' : ''}
		>
			{$t('app.settings.tabs.about')}
		</a>
	</nav>

	<div class="settings-content">
		{@render children?.()}
	</div>
</div>

<style>
	.settings-layout {
		max-width: 900px;
		margin: 0 auto;
		padding: var(--ui-pad-large);
	}

	.settings-header {
		margin-bottom: var(--ui-pad-large);
	}


	.settings-content {
		animation: fadeIn 0.2s ease;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media (max-width: 768px) {
		.settings-layout {
			padding: var(--ui-pad-medium);
		}
	}
</style>
