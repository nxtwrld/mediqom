<script lang="ts">






        
    interface Props {
        value?: number;
        class?: string;
        offset?: {
        right?: string,
        left?: string
    };
        type?: 'linear' | 'circular';
        max?: number;
    }

    let {
        value = 0,
        class: className = '',
        offset = {},
        type = 'linear',
        max = 100
    }: Props = $props();
    

    function getOffset(offset: any) {
        return Object.assign({
            right: '0px',
            left: '0px'
        }, offset);
    }


    let offsetExtended = $derived(getOffset(offset));
</script>

{#if type == 'linear'}
<div class="progress {className} {type}">
    <div class="indicator" style="width: calc({100/max * value}% - {offsetExtended.left} - {offsetExtended.right})"></div>
</div>
{:else if type == 'circular'}
TODO
{/if}

<style>
    .progress {
        position: relative;
        height: 100%;
    }
    .indicator {
        height: 100%;
        background-color: currentColor;
        transition: width var(--transition-default);
    }

</style>