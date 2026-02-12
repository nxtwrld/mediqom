<script lang="ts">
    import { t } from '$lib/i18n';
    import insuranceProviders from '$data/insurance.providers.json';

    interface Props {
        data: {
            provider: string;
            number: string;
        };
    }

    let { data = $bindable() }: Props = $props();

    // Create local state for form inputs
    let provider = $state(data?.provider || '');
    let number = $state(data?.number || '');

    // Update data only when user enters meaningful values
    $effect(() => {
        if (provider || number) {
            // Only create the data object when user enters something
            if (!data) data = { provider: '', number: '' };
            data.provider = provider;
            data.number = number;
        }
    });

</script>

<h3 class="h3 heading -sticky">{ $t('profile.insurance.health-insurance') }</h3>
<div class="page">


    <div class="input">
        <label for="insurance-provider">{ $t('profile.insurance.provider') }</label>
        <select id="insurance-provider" bind:value={provider}>
            <option value="">{ $t('profile.insurance.selectProvider') }</option>
            {#each insuranceProviders as { code, name }}
                <option value={code}>{code} - {name}</option>
            {/each}
        </select>
    </div>

    <div class="input">
        <label for="insurance-number">{ $t('profile.insurance.identification') }</label>
        <input type="text" id="insurance-number" bind:value={number} />
    </div>
</div>