<script lang="ts">
    import { SexEnum } from '$lib/types.d';
    import { t } from '$lib/i18n';
    import SexSelector from './SexSelector.svelte';
    import MeasurementInput from './MeasurementInput.svelte';

    interface Props {
        ready?: boolean;
        data: {
            health: Record<string, any>;
            settings: Record<string, any>;
        };
        profileForm: HTMLFormElement;
    }

    let { ready = $bindable(false), data = $bindable(), profileForm }: Props = $props();

    // Local state
    let biologicalSex: SexEnum | undefined = $state(data.health.biologicalSex || undefined);
    let weightKg: number | undefined = $state(
        data.health.weight?.[0]?.weight ?? undefined
    );
    let heightCm: number | undefined = $state(
        data.health.height?.[0]?.height ?? undefined
    );
    let weightUnit: string = $state(data.settings?.units?.weight ?? 'kg');
    let heightUnit: string = $state(data.settings?.units?.height ?? 'cm');

    const today = new Date().toISOString().split('T')[0];

    // Sync local state → parent data
    $effect(() => {
        if (biologicalSex) {
            data.health.biologicalSex = biologicalSex;
        } else {
            delete data.health.biologicalSex;
        }
    });

    $effect(() => {
        if (weightKg != null) {
            data.health.weight = [{ date: today, weight: Math.round(weightKg * 10) / 10 }];
        } else {
            delete data.health.weight;
        }
    });

    $effect(() => {
        if (heightCm != null) {
            data.health.height = [{ date: today, height: Math.round(heightCm) }];
        } else {
            delete data.health.height;
        }
    });

    $effect(() => {
        data.settings = {
            ...data.settings,
            units: {
                weight: weightUnit,
                height: heightUnit,
            }
        };
    });

    // Ready when sex is selected (weight/height optional)
    $effect(() => {
        ready = !!biologicalSex;
    });
</script>

<h2 class="h2">{$t('app.onboarding.healh-profile')}</h2>
<p class="subtitle">{$t('app.onboarding.health-subtitle')}</p>

<div class="health-fields">
    <SexSelector bind:value={biologicalSex} />

    <MeasurementInput
        type="weight"
        bind:value={weightKg}
        bind:unit={weightUnit}
        label={$t('profile.health.props.weight')}
    />

    <MeasurementInput
        type="height"
        bind:value={heightCm}
        bind:unit={heightUnit}
        label={$t('profile.health.props.height')}
    />
</div>

<style>
    .subtitle {
        font-size: 0.9rem;
        color: var(--color-text-secondary);
        margin-bottom: var(--ui-pad-large);
    }

    .health-fields {
        display: flex;
        flex-direction: column;
        gap: var(--ui-pad-large);
    }
</style>
