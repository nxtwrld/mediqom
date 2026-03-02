<script lang="ts">

    import { emitShortcut } from '$lib/shortcuts';
    import Unlock from '$components/layout/Unlock.svelte';
    import '../../css/index.css';
    //import UI from '$components/layout/UI.svelte';
    import { onMount } from 'svelte';
    import { checkPendingJobs, processJob } from '$lib/import/job-manager';

    interface Props {
        children?: import('svelte').Snippet;
    }

    let { children }: Props = $props();

    let lazyUnlock: Promise<{ default: any }> | null = $state(null);

    onMount(async () => {
        lazyUnlock = import('$components/layout/UI.svelte');

        // Re-attach polling for any jobs that were in-progress when the app was killed
        const pendingJobs = await checkPendingJobs().catch(() => []);
        for (const job of pendingJobs) {
            if (['created', 'extracting', 'analyzing'].includes(job.status)) {
                processJob(job.id).catch(() => {/* silent — UI will show job card */});
            }
        }
    });

</script>


<svelte:window onkeydown={emitShortcut}></svelte:window>

<svelte:head>
	<title>Mediqom</title>
    <meta name="description" content="Mediqom app" />
    <meta name="robots" content="noindex">
</svelte:head>

<!-- <Unlock> -->
    {#if lazyUnlock !== null}
        {#await lazyUnlock  then { default: LazyComponent }}
            <LazyComponent>{@render children?.()}</LazyComponent>
        {/await}
    {/if}
<!-- </Unlock> -->