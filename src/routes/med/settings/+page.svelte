<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n';

	onMount(() => {
		goto('/med/settings/general', { replaceState: true });
	});
</script>

<div class="redirecting">
	<p>{$t('app.settings.redirect')}</p>
</div>

<style>
	.redirecting {
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 200px;
		color: var(--color-text-secondary, var(--color-gray-600));
	}
</style>
