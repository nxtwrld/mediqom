<script lang="ts">


    interface Props {
        data?: { 
    id: string;
    type: 'document' | 'other';
 }[];
    }

    let { data = [] }: Props = $props();

 let byType = $derived(data.reduce((acc, {type, id}) => {
    if (!(acc as any)[type]) (acc as any)[type] = [];
    (acc as any)[type].push(id);
    return acc;
 }, {}) as Record<string, string[]>);

</script>


{#each Object.keys(byType) as type}
    <h2>{type}</h2>
    <ul>
        {#each byType[type] as id}
            <li><a href="/{type}/{id}">{id}</a></li>
        {/each}
    </ul>
{/each}