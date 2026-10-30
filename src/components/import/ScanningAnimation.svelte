<script lang="ts">
    interface Props {
        running?: boolean;
    }

    let { running = false }: Props = $props();
</script>
{#if running}
<div class="scanning">
    <div class="scanning-bar">
        <div class="scanning-indicator"></div>
    </div>
</div>
{/if}


<style>

    .scanning {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
    }

    .scanning-bar {
        position: relative;
        top: 0;
        left: 0;
        width: 100%;
        height: 0.8rem;
        overflow: hidden;
        animation: scan-vertical 15s infinite linear alternate;
        background-color: var(--color-gray-500-alpha);
    }
    .scanning-indicator {
        height: 100%;
        width: 1.6rem;
        position: relative;
        left: 0;
        background-color: var(--color);
        animation: scan-horizontal .3s infinite ease-in-out alternate-reverse;
    }


    @keyframes scan-vertical {
        0% {
            top: 0;
        }
        100% {
            top: calc(100% - 0.8rem);
        }
    }

    @keyframes scan-horizontal {
        0% {
            left: 0;
        }
        100% {
            left: calc(100% - 1.6rem);
        }
    }
</style>