<script lang="ts">
	import { t } from '$lib/i18n';
    
    
    export const ready: boolean = true;
    interface Props {
        data: {
        subscription: string;
    };
        profileForm: HTMLFormElement;
    }

    let { data = $bindable(), profileForm }: Props = $props();


    const SUBSCRIPTIONS = [
        {
            id: 'individual',
            name: $t('app.onboarding.subscription.individual'),
            connectedAccounts: 1,
            price: 'free',
        },
        {
            id: 'family',
            name: $t('app.onboarding.subscription.family'),
            connectedAccounts: 10,
            price: '299',
        },
        {
            id: 'gp',
            name: $t('app.onboarding.subscription.medical-practice'),
            connectedAccounts: 100,
            price: '999',
        },
        {
            id: 'medical',
            name: $t('app.onboarding.subscription.medical-institution'),
            connectedAccounts: 0,
            price: $t('app.onboarding.subscription.call'),
        },
    ]
</script>

<div class="cards flex">
{#each SUBSCRIPTIONS as subscription}
    <div class="card flex -column" class:-selected={subscription.id == data.subscription}>
        <h3 class="h3">{subscription.name}</h3>
        <div class="card-body flex">
            <div class="details">
                <p>{ $t('app.onboarding.subscription.connected-accounts') }: 
                    
                    {subscription.connectedAccounts === 0
                        ? 'Unlimited'
                        : subscription.connectedAccounts
                    }
                </p>
                <p><!--{ $t('app.onboarding.subscription.price') }: {subscription.price} --> { $t('app.onboarding.subscription.free-beta-access') }</p>
            </div>
            {#if subscription.id != data.subscription}
                <button class="button" onclick={() => data.subscription = subscription.id}>{ $t('app.onboarding.subscription.select') }</button>
            {/if}
        </div>
    </div>
{/each}
</div>


<style>
    .cards {
        gap: 1.6rem;
        align-items: stretch;
        justify-content: stretch;
        flex-wrap: wrap;
        height: 100%;
    }
    .card {
        background-color: var(--color-white);
        border-radius: var(--radius-16);
        padding: 1.6rem;
        width: 100%;
        height: 100%;
        align-items: space-between;
    }

    .card.-selected {
        background-color: var(--color-positive);
    }

    .card .h3 {
        margin: 0 0 1.6rem;
    }

    .details {
        flex-grow: 1;
    }

</style>