<script lang="ts">
    
    import Signal from "./Signal.svelte";
    import focused from "$lib/focused";
    import { t } from '$lib/i18n';
    import type { Document } from '$lib/documents/types.d';


  interface Props {
    document: Document;
    data: any;
  }

  let { document, data }: Props = $props();

    //console.log('Results',data);
    let children: Signal[] = $state([]);
    let isClosing = false; // Prevent recursion

    function closeAll() {
        if (isClosing) return; // Prevent infinite recursion
        isClosing = true;
        
        children.forEach((c: any) => {
            if (c && c.closeDetails) c.closeDetails()
        });
        
        // Reset the flag after a small delay
        setTimeout(() => {
            isClosing = false;
        }, 0);
    }

    // Use $effect for store subscription in Svelte 5
    $effect(() => {
        const unsubscribe = focused.subscribe((f: any) => {
            if(f.object) {
                closeAll();
                //filter  = 'default';
            }
        });
        
        return unsubscribe;
    });
</script>


{#if data && data.length > 0}
    <h3 class="h3 heading -sticky">{ $t('report.vitals-and-amp-results') }</h3>

  

        <table  class="table-list">
        {#each data as item, index}

            <Signal bind:this={children[index]}
                {item} {document} />
        {/each}
        
        
        </table>

{/if}


<style>
    /* SectionSignals uses global table and heading styles */
    
    /* Container query support for signals section */
    .table-list {
        container-type: inline-size;
    }
    
    /* Responsive table adjustments */
    @container (max-width: 600px) {
        .table-list {
            font-size: 1.4rem;
        }
    }
    
    @container (max-width: 400px) {
        .table-list {
            font-size: 1.2rem;
        }
        
        .h3.heading {
            font-size: 1.8rem;
        }
    }
</style>