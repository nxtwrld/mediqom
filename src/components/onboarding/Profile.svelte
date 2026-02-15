<script lang="ts">
    import { run } from 'svelte/legacy';

	import Avatar from './Avatar.svelte';
    import { onMount } from 'svelte';
    import Languages, { type LanguageType } from '$lib/languages';
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
        }
    };
        profileForm: HTMLFormElement;
    }

    let { ready = $bindable(false), data = $bindable(), profileForm }: Props = $props();

    run(() => {

        if (data.bio.fullName && data.bio.fullName?.trim() != '' && data.bio.birthDate && data.bio.birthDate?.trim() != '') {
            ready = true;
        } else {
            ready = false;
        }
     });

     onMount(() => {
        // load browser language and set it as default if available
        if (Languages[navigator.language as LanguageType]) {
            data.bio.language = navigator.language as LanguageType;
        } else {
            const lang = navigator.language.split('-')[0];
            if (Languages[lang as LanguageType]) {
                data.bio.language = lang as LanguageType;
            }
        }
     })
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

<h2 class="h2">{ $t('app.onboarding.basic-profile') }</h2>

<div class="input">
    <label for="email">{ $t('app.onboarding.email') }</label>
    <input id="email" type="text" bind:value={data.bio.email} disabled />
</div>

<div class="input">
    <label for="fullName">{ $t('app.onboarding.full-name') }  ({ $t('app.onboarding.required') })</label>
    <input id="fullName" name="fullName" type="text" bind:value={data.bio.fullName} required />
</div>

<div class="input">
    <label for="birthDate">{ $t('app.onboarding.date-of-birth') } ({ $t('app.onboarding.required') })</label>
    <input id="birthDate" name="birthDate" type="date" bind:value={data.bio.birthDate} required />
</div>

<div class="input">
    <label for="language">{ $t('app.onboarding.language') }</label>
    <select id="language" name="language" bind:value={data.bio.language}>
        <option value="en">{ $t('languages.en') }</option>
        <option value="cs">{ $t('languages.cs') }</option>
        <option value="de">{ $t('languages.de') }</option>
    </select>
</div>
