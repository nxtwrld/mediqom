<script lang="ts">
    import { onMount } from 'svelte';
    import Avatar from './Avatar.svelte';
    import SexSelector from './SexSelector.svelte';
    import MeasurementInput from './MeasurementInput.svelte';
    import Languages, { type LanguageType } from '$lib/languages';
    import { SexEnum } from '$lib/types.d';
    import user from '$lib/user';
    import { t } from '$lib/i18n';

    interface Props {
        ready?: boolean;
        data: {
            bio: {
                email: string;
                fullName: string;
                avatarUrl?: string;
                birthDate?: string;
                language: LanguageType;
            };
            health: Record<string, any>;
            settings: Record<string, any>;
        };
        profileForm: HTMLFormElement;
    }

    let { ready = $bindable(false), data = $bindable(), profileForm }: Props = $props();

    // Health local state (mirrors Health.svelte handling)
    let biologicalSex: SexEnum | undefined = $state(data.health.biologicalSex || undefined);
    let weightKg: number | undefined = $state(data.health.weight?.[0]?.weight ?? undefined);
    let heightCm: number | undefined = $state(data.health.height?.[0]?.height ?? undefined);
    let weightUnit: string = $state(data.settings?.units?.weight ?? 'kg');
    let heightUnit: string = $state(data.settings?.units?.height ?? 'cm');

    const today = new Date().toISOString().split('T')[0];

    onMount(() => {
        // Default the language to the browser's if supported
        if (Languages[navigator.language as LanguageType]) {
            data.bio.language = navigator.language as LanguageType;
        } else {
            const lang = navigator.language.split('-')[0];
            if (Languages[lang as LanguageType]) {
                data.bio.language = lang as LanguageType;
            }
        }
    });

    // Sync local health state → parent data
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
        if (!data.settings) data.settings = {};
        data.settings.units = { weight: weightUnit, height: heightUnit };
    });

    // Ready when the three capability-critical fields are present
    $effect(() => {
        const bioReady =
            !!data.bio.fullName?.trim() && !!data.bio.birthDate?.trim();
        ready = bioReady && !!biologicalSex;
    });
</script>

<div class="flex -center">
    <Avatar
        bind:url={data.bio.avatarUrl as any}
        id={$user?.id || ''}
        size={10}
        editable={true}
        on:upload={() => {
            profileForm.requestSubmit();
        }}
    />
</div>

<h2 class="h2">{$t('app.onboarding.about-you.title')}</h2>
<p class="subtitle">{$t('app.onboarding.about-you.subtitle')}</p>

<div class="input">
    <label for="email">{$t('app.onboarding.email')}</label>
    <input id="email" type="text" bind:value={data.bio.email} disabled />
</div>

<div class="input">
    <label for="fullName">{$t('app.onboarding.full-name')} ({$t('app.onboarding.required')})</label>
    <input id="fullName" name="fullName" type="text" bind:value={data.bio.fullName} required />
</div>

<div class="input">
    <label for="birthDate">{$t('app.onboarding.date-of-birth')} ({$t('app.onboarding.required')})</label>
    <input id="birthDate" name="birthDate" type="date" bind:value={data.bio.birthDate} required />
    <p class="capability">{$t('app.onboarding.capability.birth-date')}</p>
</div>

<div class="input">
    <SexSelector bind:value={biologicalSex} />
    <p class="capability">{$t('app.onboarding.capability.biological-sex')}</p>
</div>

<div class="measurements">
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
<p class="capability">{$t('app.onboarding.capability.measurements')}</p>

<div class="input">
    <label for="language">{$t('app.onboarding.language')}</label>
    <select id="language" name="language" bind:value={data.bio.language}>
        {#each Object.entries(Languages) as [code]}
            <option value={code}>{$t('languages.' + code)}</option>
        {/each}
    </select>
</div>

<style>
    .subtitle {
        font-size: 0.9rem;
        color: var(--color-text-secondary);
        margin-bottom: var(--ui-pad-large);
        text-align: center;
    }

    .measurements {
        display: flex;
        flex-direction: column;
        gap: var(--ui-pad-large);
    }

    .capability {
        font-size: 0.8rem;
        color: var(--color-text-secondary);
        margin-top: 0.35rem;
    }
</style>
