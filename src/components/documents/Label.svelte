<script lang="ts">

    interface Props {
        type?: string;
        class?: string;
    }

    let { type = 'default', class: className = '' }: Props = $props();

    

</script>
{#if type == 'selected'}
<span class="icon {type} {className} category-{type}">
    <svg>
        <use href="/icons.svg#status-ok" />
    </svg>
</span>
{:else}
<span class="icon {type} {className} category-{type}">
    <svg>
        <use href="/icons-o.svg#report-{type}" />
    </svg>
</span>
{/if}

<style>
    span {
        display: inline-block;
        height: 100%;
        width: 100%;
        background-color: var(--color);
        color: var(--color-text-primary);
        aspect-ratio: 1/1;
    }
    svg {
        width: 100%;
        height: 100%;
        color: inherit;
        fill: currentColor;
    }


    .icon.block {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;

        padding: .5rem;
    }
</style>