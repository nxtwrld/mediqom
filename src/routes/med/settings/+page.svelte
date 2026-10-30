<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n';
	import { SETTINGS_BASE, sections } from './sections';

	onMount(() => {
		// Mobile shows the section list; desktop jumps straight to the first tab
		if (!window.matchMedia('(max-width: 768px)').matches) {
			goto(`${SETTINGS_BASE}/general`, { replaceState: true });
		}
	});
</script>

<div class="redirecting">
	<p>{$t('app.settings.redirect')}</p>
</div>

<nav class="settings-list" aria-label={$t('app.settings.title')}>
	<ul>
		{#each sections as section (section.path)}
			<li>
				<a href="{SETTINGS_BASE}/{section.path}">
					<span>{$t(section.key)}</span>
					<svg aria-hidden="true"><use href="/icons.svg#arrow-nav-right"></use></svg>
				</a>
			</li>
		{/each}
	</ul>
</nav>

<style>
	.redirecting {
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 20rem;
		color: var(--color-text-secondary, var(--color-gray-600));
	}

	.settings-list {
		display: none;
	}

	@media (max-width: 768px) {
		.redirecting {
			display: none;
		}

		.settings-list {
			display: block;
		}
	}

	.settings-list ul {
		list-style: none;
		margin: 0;
		padding: 0;
		background: var(--color-surface);
		border-radius: var(--ui-radius-medium);
		overflow: hidden;
	}

	.settings-list li + li {
		border-top: 1px solid var(--color-border);
	}

	.settings-list a {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--ui-pad-small);
		min-height: var(--toolbar-height);
		padding: 0 var(--ui-pad-medium);
		color: var(--color-text-primary);
		text-decoration: none;
	}

	.settings-list svg {
		width: 1.6rem;
		height: 1.6rem;
		fill: var(--color-text-secondary);
	}
</style>
