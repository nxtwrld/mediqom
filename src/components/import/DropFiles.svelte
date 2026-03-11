<script lang="ts">
    //import { ACCEPTED_FILES} from '$lib/files/CONFIG';
    import { goto } from '$app/navigation';
    import { fade } from 'svelte/transition';
    import { files } from '$lib/files';
    import { fromEvent } from 'file-selector';
    import ui from '$lib/ui';
    import { t } from '$lib/i18n';
    import { isNativePlatform } from '$lib/config/platform';
    interface Props {
        children?: import('svelte').Snippet;
    }

    let { children }: Props = $props();

    let dragover: boolean = $state(false);
    let dragTimer: any;
    let dropActive: boolean = true;


    function handleDragOver(event: DragEvent) {
        if (!dropActive) return;
        if (dragTimer) clearTimeout(dragTimer);
        event.preventDefault(); // Necessary to allow for a drop event
        dragover = true;
    }

    async function handleDrop(event: DragEvent) {
        if (!dropActive) return;
        dragover = false;
        if (!event.dataTransfer) return;
        event.preventDefault();

        const newFiles = await fromEvent(event) as File[];
        if (newFiles.length >  0) {
            files.set([ ...$files,  ...newFiles ]);
            ui.emit('overlay.import');
        }
    }

    function handleDragEnd(event: DragEvent) {
        if (!dropActive) return;
        if (dragTimer) clearTimeout(dragTimer);
        dragTimer = setTimeout(() => {
            dragover = false;
        }, 300);
    }



</script>


    {#if !isNativePlatform()}
    <div class="droparea" role="region" aria-label={ $t('app.import.file-drop-area') } ondrop={handleDrop} ondragover={handleDragOver} ondragleave={handleDragEnd} ondragend={handleDragEnd}>
        {@render children?.()}
        {#if dragover}
        <div class="drag-active overlay" transition:fade>
            <p>{ $t('app.import.drop-files-here') }</p>
        </div>
        {/if}
    </div>
    {:else}
        {@render children?.()}
    {/if}



<style>

    .droparea {

        height: 100%;
        width: 100%;
    }


</style>