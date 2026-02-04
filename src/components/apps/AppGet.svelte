<script lang="ts">
    import { AppConnectionType, type AppConnectionType as AppConnectionTypeEnum, type AppRecord } from '$lib/apps/types.d';
    import { sharedItems } from '$lib/apps/store';
    /*import ShareLinkedItems from '$components/shares/ShareLinkedItems.svelte';*/
    //import type { Link } from "$lib/common.types.d";
    import { goto } from '$app/navigation';
    import { t } from '$lib/i18n';
    import { createEventDispatcher } from 'svelte';
    import { logger } from '$lib/logging/logger';
    

    
    interface Props {
        /*import xp, { spendCredits } from '$lib/xp/store';*/
        app: AppRecord;
        items?: Link[];
    }

    let { app, items = [] }: Props = $props();
    
    logger.api.debug('App', app);
    logger.api.debug('Items', items);
    
    const dispatch = createEventDispatcher();
    let reviewData: boolean = $state(false);

    function confirm() {
        if(app) {
            sharedItems.set(items);
            const uid = app.uid;
            dispatch('abort');
            setTimeout(() => {
                //spendCredits(app.credits);
                goto('/med/app/' + uid);
            }, 500);


        }
    }

</script>


<div>


    <div class="app-header">
    <img src={app.icon} loading="lazy" alt={app.name} class="app-icon -full" />
        <div>
        <h2 class="h2">{app.name}</h2>
        <div class="app-details">
            <div>
                <h5>{ $t('app-connect.price') }:</h5>
                <!--strong class="price" class:-insufficent-credit={$xp.credits < app.credits}>{app.credits} { $t('app-connect.credits') }</strong-->
            </div>
            <div>
                <h5>{ $t('app-connect.author') }:</h5>
                <strong>{app.author}</strong>
            </div>
            <div>
                <h5>{ $t('app-connect.requires') }:</h5>
                <strong>{app.requires.join(', ')}</strong>
            </div>
            <div>
                <h5>Permissions:</h5>
                {#each app.permissions as permission}
                    <strong>{$t('app-connect.permissions.'+permission)}</strong>

                {/each}
            </div>

        </div>
        {#if !reviewData}
        <div class="p">{app.description}</div>
        {/if}

        </div>
    </div>

    {#if !reviewData}
        <div class="warning">
            <svg>
                <use href="/sprite.svg#privacy"></use>
            </svg>
            <div>
                <h4 class="h4">{ $t('app-connect.total-privacy-warning') }</h4>
                <p class="p">{ $t('app-connect.you-are-about-to-leave-mediqom-total-privacy-realm') }</p>
                <p class="p">{ $t('app-connect.you-are-about-to-share-data-withe-a-third-party-service') }</p>
            </div>
        </div>
    {:else}
        <h4 class="h4">{ $t('app-connect.review-data') }</h4>
        <div class="contents">
            {#if reviewData}

            <!--ShareLinkedItems {items} /--> 
            {/if}
        </div>
    {/if}

    <div class="buttons-row">
        <button class="button" onclick={() => dispatch('abort')}>{ $t('app.cancel') }</button>

        {#if !reviewData}
            <button class="button -primary" onclick={() => reviewData = !reviewData}>{ $t('app.continue') }</button>
        {:else}
            <button class="button -primary" onclick={confirm}>{ $t('app-cconect.get') }</button>
        {/if}
    </div>
</div>



<style>
    .app-header {
        display: flex;
        align-items: flex-start;
        gap: 1rem;
        container-type: inline-size;
        container-name: appheader;
        width: 40rem;
    }

    /* Unused - price element is commented out in template
    .price {
        background-color: var(--color-shade);
        padding: .2rem .5rem;
        display: inline-block;
        border-radius: var(--border-radius);
        white-space: nowrap;
        font-weight: bold;
    }
    */
    /* Unused - price element is commented out in template
    .price.-insufficent-credit {
        background-color: var(--color-negative);
        color: var(--color-negative-contrast);
    }
    */

    .app-details {
        display: flex;
        align-items: flex-start;
        justify-content: stretch;
        gap: 1rem;
        margin-top: 1rem;
        
    }

    .app-details h5 {
        font-size: .7rem;
        text-transform: uppercase;
        margin-bottom: .5rem;
    }



    .app-details div {
        text-align: left;
        padding: 0 1rem 0 0 ;      
        border-right: 1px solid var(--color-shade);
        height: 100%;
    }
    .app-details div:first-child {
        padding-left: 0;
    }
    .app-details div:last-child {
        border-right: none;
        padding-right: 0;
    }
    @media screen and (max-width: 768px) {
        .app-header {
            display: block;
            width: auto;
        }
        .app-header img {
            float: left;
            margin-right: 1rem;
        }

        .app-details {
            flex-direction: column;
            gap: .5rem;
            align-items: flex-start;
        }
        .app-details div {
            border-right: none;
            padding: 0;
        }
    }
    @media screen and (min-width: 769px) {
        .app-details {
            display: table;
        }
        .app-details div {
            display: table-cell;
            padding: 0 1rem;
        }
    }

    .warning {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: .5rem 1rem;
        background-color: var(--color-shade);
        border-radius: var(--border-radius);
        margin: 1rem 0;
    }
    .warning > svg {
        width: 4rem;
        height: 4rem;
    }

    .contents {
        max-height: 40vh;
        overflow-y: auto;
    }
</style>