<script lang="ts">
    
    interface Props {
        title?: string;
        href?: string;
        type?: string;
        passive?: boolean;
        class?: string;
        onclick?: () => void;
        children?: import('svelte').Snippet;
        icon?: import('svelte').Snippet;
        titleSlot?: import('svelte').Snippet;
    }
    
    let { 
        title = undefined, 
        href = undefined, 
        type = 'link', 
        passive = false, 
        class: className = '',
        onclick,
        children,
        icon,
        titleSlot
    }: Props = $props();

</script>

{#if passive}
    <div class="link {className} link-{type}">
        <div class="link-content">
            {@render children?.()}
        </div>

        <h4 class="link-title">
            {#if icon}
                <div class="link-icon">
                    {@render icon()}
                </div>
            {:else}
                <svg class="link-icon">
                    <use href="/sprite.svg#{type}"></use>
                </svg>
            {/if}
            {title}
        </h4>
    </div>

{:else if href}
    <a {href} class="link {className} link-{type}" {onclick}>
        <div class="link-content">
            {@render children?.()}
        </div>

        <h4 class="link-title">
            {#if icon}
                <div class="link-icon">
                    {@render icon()}
                </div>
            {:else}
                <svg class="link-icon">
                    <use href="/sprite.svg#{type}"></use>
                </svg>
            {/if}
            {#if titleSlot}
                {@render titleSlot()}
            {:else}
                {title}
            {/if}
        </h4>
    </a>
{:else}
    <button class="link {className} link-{type}" {onclick}>
        <div class="link-content">
            {@render children?.()}
        </div>
        <h4 class="link-title">
            <svg class="link-icon">
                <use href="/sprite.svg#{type}"></use>
            </svg>
            {#if titleSlot}
                {@render titleSlot()}
            {:else}
                {title}
            {/if}
        </h4>
    </button>
{/if}
<style>


    .link {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background: var(--color-gray-300);
        padding: 0;
        width: 100%;
        min-height: 14rem;
        height: 100%;
        cursor: pointer;
    }
    @media (hover: hover) {
        .link:hover {
            background: var(--color-interactivity-light);
        }
    }
    /*
    .link:hover:after {
        position: absolute;
        content: '';
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: var(--color-interactivity);
        opacity: .6;
    }*/



    .link-icon {
        position: absolute;
        width: 3rem;
        height: 3rem;
        top: -3.5rem;
        right: .5rem;
        fill: #FFF;
    }
    .link-icon :global(svg) {
        fill: #FFF;
    }

    .link.preview .link-icon  {
        color: var(--color-white)
    }

    .link-details {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
    }
    .link-content {
        position: relative;
        width: 100%;
        height: 100%;
        opacity: .9;
        transition: opacity .2s ease-in-out;
    }
    @media (hover: none) {
        .link-content {
            opacity: 1;
        }   
    }
    .link-title {
        position: absolute;
        bottom: 0;
        left: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        min-height: 4rem;
        border: 0;
        font-size: 1.1rem;
        padding: .5rem;
        text-overflow: ellipsis;
        font-weight: bold;
        text-align: center;
        background: var(--color-surface);
        z-index: 1;
    }
    @media (hover: hover) {
        .link:hover .link-content {
            opacity: 1;
        }
    }

/*
    .link-focus {
        background-color: #E73684;
    }
    .link-report {
        background-color: #9A67C5;
    }
    .link-doctor {
        background-color: #74C34C;
    }*/
</style>