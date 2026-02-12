<script lang="ts">

    import { type ProfileNew, SexEnum } from "$lib/types.d";
    import user from "$lib/user";
    import { t } from '$lib/i18n';

    //console.log("user", $user);

    let newProfile: ProfileNew = $state({
        fullName: "",
        birthDate: undefined,
        language: undefined,
        insurance: undefined,
        vcard: undefined,
        health: undefined
    })

    async function createNewProfile() {
        /*
        const res = await fetch("/api/med/p/newpatient", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(newPatient),
        });
        if (res.ok) {
            const patient = await res.json();
            patient.set(patient);
        }*/
    }

</script>

<div class="page">
    <h1 class="h1">{$t('app.med.add-profile')}</h1>
    {#if $user && 'subscriptionStats' in $user && $user.subscriptionStats.profiles == 0}
        <p class="p">{$t('app.med.max-profiles-reached')}</p>
        <a href="/med/upgrade" class="button -primary -large">{$t('app.med.upgrade')}</a>
    {:else}
        <p class="p">{$t('app.med.profiles-remaining', { values: { count: ($user as any)?.subscriptionStats?.profiles } })}</p>


        <input type="text" bind:value={newProfile.fullName} onclick={createNewProfile} />
        <button>{$t('app.buttons.create')}</button>
    {/if}
</div>