<script lang="ts">
    import { run } from 'svelte/legacy';

    import { onMount } from "svelte";


    enum Stress {
        low = 'low',
        medium = 'medium',
        high = 'high'
    }
    enum Urgency {
        low = 'low',
        medium = 'medium',
        high = 'high'
    }

    interface Props {
        conversation?: {
        speaker: string,
        text: string,
        stress: string,
        urgency: string
    }[];
        newSpeech?: boolean;
    }

    let { conversation = [], newSpeech = false }: Props = $props();

    let scrollEl: HTMLDivElement | undefined = $state();


    function scollToEnd() {
        if (scrollEl) {
            scrollEl.scrollBy({
                top: scrollEl.scrollHeight,
                behavior: 'smooth'
            });
        }
    }

    onMount(() => {
        scollToEnd();
    });
    run(() => { 
        if (newSpeech) {
            scollToEnd();
        }
    });
</script>


<div class="conversation" bind:this={scrollEl}>
    {#each conversation as message}
        <div class="message -{message.speaker}" class:-important={message.stress == Stress.high || message.urgency == Urgency.high}>
            <p class="p">{message.text}</p>
        </div>
    {/each}

    {#if newSpeech}
        <div class="message">
            <p class="p">...</p>
        </div>
    {/if}
</div>


<style>


.conversation {
        display: flex;
        flex-direction: column;
        padding: 1.6rem;
        gap: 1.6rem;
        height: 100%;
        padding-bottom: 16rem;
        overflow: auto;
    }

.message {
        --color: var(--color-info);
        position: relative;
        display: flex;
        gap: 0.8rem;
        width: 100%;
        background-color: var(--color);
        color: var(--color-info-text);
        padding: 0.8rem;
        border-radius: var(--radius-8);
        font-weight: 600;
    }
    .message.-important {
        --color: var(--color-negative);
    }
    /* message bubble arrow at bottom left */
    .message:after {
        content: '';
        position: absolute;
        width: 0;
        height: 0;

        border-top: 1rem solid var(--color);
        border-right: 1rem solid transparent;
        border-left: 1rem solid transparent;
        bottom: -1rem;
        left: 1rem;
    }
    .message.-nurse,
    .message.-doctor {
        --color: var(--color-gray-500);
        background-color: var(--color);
        color: var(--text);
        justify-content: flex-end;
        font-weight: 300;
    }
    .message.-nurse:after,
    .message.-doctor:after {
        right: 1rem;
        left: auto;
        border-top: 1rem solid var(--color);
    }


</style>
