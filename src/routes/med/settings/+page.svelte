<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	onMount(() => {
		goto('/med/settings/general', { replaceState: true });
	});
</script>

<div class="redirecting">
	<p>Redirecting to settings...</p>
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
