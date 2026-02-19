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

    console.log('[InsuranceForm] Initialized with data:', data);
</script>

<h3 class="h3 heading -sticky">{ $t('profile.insurance.health-insurance') }</h3>
<div class="page">

    <div class="input">
        <label for="insurance-provider">{ $t('profile.insurance.provider') }</label>
        <select id="insurance-provider" bind:value={data.provider}>
            <option value="">{ $t('profile.insurance.selectProvider') }</option>
            {#each insuranceProviders as { code, name }}
                <option value={code}>{code} - {name}</option>
            {/each}
        </select>
    </div>

    <div class="input">
        <label for="insurance-number">{ $t('profile.insurance.identification') }</label>
        <input type="text" id="insurance-number" bind:value={data.number} autocomplete="off" />
    </div>
</div>