<script lang="ts">




    import { SexEnum } from '$lib/types.d';
    import { t } from '$lib/i18n';


    interface Props {
        ready?: boolean;
        data: {
        health: {
            biologicalSex?: SexEnum;
        }
    };
        profileForm: HTMLFormElement;
    }

    let { ready = $bindable(false), data = $bindable(), profileForm }: Props = $props();


    let biologicalSex: SexEnum | undefined = $state(data.health.biologicalSex || undefined);

    $effect(() => {
        if (biologicalSex) {
            data.health.biologicalSex = biologicalSex;
        } else {
            delete data.health.biologicalSex;
        }
    });

    // Update ready state based on required fields
    $effect(() => {
        ready = !!data.health.biologicalSex;
    });
</script>


<h2 class="h2">{ $t('app.onboarding.healh-profile') }</h2>

<div class="input">
    <label for="biologicalSex">{ $t('profile.health.props.biologicalSex') } ({ $t('app.onboarding.required') })</label>
    <select id="biologicalSex" name="biologicalSex" bind:value={biologicalSex}  required>
        <option value={undefined}>{ $t('app.onboarding.please-select-your-anatomy') }</option>
        {#each Object.entries(SexEnum) as [v, o]}
        <option value={v}>{$t('medical.prop-values.biologicalSex.'+o)}</option>
        {/each}

    </select>
</div>
