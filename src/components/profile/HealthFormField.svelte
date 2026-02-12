<script lang="ts">
    import { t } from '$lib/i18n';


    let id: string = Math.random().toString(36).substring(7);

    interface Props {
        prop: {
        key: string,
        type: string,
        unit?: string,
        options?: string[]
    };
        data: any;
    }

    let { prop, data = $bindable() }: Props = $props();
</script>
<div class="input">
    {#if prop.key != "value"}
    <label for={id}>{ $t('profile.health.props.'+prop.key) }</label>
    {/if}
    {#if prop.type === 'select' && prop.options}
            <select id={id} bind:value={data}>
                {#each prop.options as option}
                <option value={option}>{$t(`medical.prop-values.${prop.key}.${option}`)}</option>
                {/each}
            </select>
    {/if}

    <div class="field">
    {#if prop.type === 'text'}
            <input type="text" id={id} bind:value={data} />
    {/if}



    {#if prop.type === 'number'}
        <input type="number" id={id} bind:value={data}  data-unit={prop.unit}/>
    {/if}
        
    {#if prop.type == 'date'}
        <input type="date" id={id} bind:value={data}/>
    {/if}
    {#if prop.unit}
        <span class="unit">{prop.unit}</span>
    {/if}
    </div>
</div>

<style>
    .field {
        position: relative;
        width: 100%;
    }
    .field input {
        width: 100%;
    }
    .field:has(:global(.unit)) input {
        padding-right: 4rem;
    }
    .field .unit {
        position: absolute;
        right: 0;
        top: 50%;
        transform: translateY(-50%);
        padding: 1rem;
    }   
</style>
