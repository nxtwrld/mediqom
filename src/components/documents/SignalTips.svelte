<script lang="ts">

    interface Props {
        tips?: string[];
        icon?: string;
        children?: import('svelte').Snippet;
    }

    let { tips = [], icon = 'tips', children }: Props = $props();

</script>
{#if tips.length > 0}
<div class="tips">
<svg>
    <use href="/sprite.svg#{icon}"></use>
</svg>

<div class="tips-list">
    <h3>{@render children?.()}</h3>
    <ul>
        {#each tips as tip}
            <li>{tip}</li>
        {/each}
    </ul>
</div>          
</div>
{/if}

<style>
    .tips {
        display: flex;
        margin: 1.6rem;
        align-items: center;
    }
    .tips svg {
        fill: currentColor;
        height: 8rem;
        width: 8rem;
        margin-right: 1.6rem;
    }
    ul {
        margin: 1.6rem;
        list-style:disc
    }
    li {
        margin: 0.8rem 0 0 1.6rem ;
    }
</style>