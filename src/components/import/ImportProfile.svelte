<script lang="ts">
    import { type Profile } from '$lib/types.d';
    import ScreenOverlay from '$components/ui/ScreenOverlay.svelte';
    import ProfileImage from '$components/profile/ProfileImage.svelte';
    import ProfileEdit from '$components/profile/ProfileEdit.svelte';
    import { scale } from 'svelte/transition';
    import { PROFILE_NEW_ID } from '$lib/profiles/tools';
    import { t } from '$lib/i18n';
    

    interface Props {
        profile: Profile;
        initialProfile?: Profile;
    }

    // Safe clone function for Profile objects that may contain non-cloneable properties
    function safeCloneProfile(prof: Profile): Profile {
        try {
            return structuredClone(prof);
        } catch (error) {
            // Fallback to manual cloning of safe properties
            return {
                id: prof.id,
                language: prof.language,
                fullName: prof.fullName,
                publicKey: prof.publicKey,
                avatarUrl: prof.avatarUrl,
                status: prof.status,
                profileDocumentId: prof.profileDocumentId,
                healthDocumentId: prof.healthDocumentId,
                // For complex objects, do JSON clone (loses functions but preserves data)
                vcard: prof.vcard ? JSON.parse(JSON.stringify(prof.vcard)) : prof.vcard,
                health: prof.health ? JSON.parse(JSON.stringify(prof.health)) : prof.health,
                insurance: prof.insurance ? JSON.parse(JSON.stringify(prof.insurance)) : prof.insurance,
            };
        }
    }

    let { profile = $bindable(), initialProfile = safeCloneProfile(profile) }: Props = $props();

    let isNewProfile = $derived(profile.id === PROFILE_NEW_ID);
    let showProfile: boolean = $state(false);


    function reset() {
        profile = safeCloneProfile(initialProfile);
        showProfile = false;
    }
    function done() {
        showProfile = false;
    }
</script>


<button class="profile" class:-new={isNewProfile} onclick={() => showProfile = true}  transition:scale>
    <div class="avatar">
        <ProfileImage profile={('id' in profile) ? profile: null} />
    </div>

    <div class="name">{profile.fullName}</div>
    
    {#if profile.insurance?.number}<div class="insurance">({profile.insurance.number})</div>{/if}

    {#if isNewProfile}
        <div class="status">{$t('app.import.status-new')}</div>
    {/if}
</button>


{#if showProfile}
    <ScreenOverlay  on:close={done}>
        
        {#snippet heading()}
                <div  class="heading">
                <h3 class="h3 heading">{isNewProfile ? $t('app.import.new-profile') : $t('app.import.profile')} - {profile.fullName}</h3>
                <div class="actions">
                    <button class="-danger" onclick={reset}>
                        {$t('app.buttons.reset')}
                    </button>
                    <button class="-primary" onclick={done}>
                        {$t('app.buttons.done')}
                    </button>
                </div>
            </div>
            {/snippet}
        <div class="page -empty">
            <ProfileEdit bind:profile={profile} />
        </div>
    </ScreenOverlay>
{/if}


<style>
    .profile {
        position: relative;
        display: flex;
        align-items: center;
        flex-direction: column;
        padding: 1rem;
        background-color: var(--color-background);
        border: var(--border-width) solid var(--color-background);
        border-radius: var(--radius);
        height: var(--tile-height);
    }

    .profile.-new {
        border-color: var(--color-green);
    }


    .profile .name {
        font-size: 0.9rem;
        font-weight: bold;
        margin-top: 1rem;
    }

    .profile .insurance {
        font-size: 0.8rem;
    }

    .profile .status {
        position: absolute;
        display: flex;
        justify-content: center;
        align-items: center;
        top: 1rem;
        right: -.8rem;
        padding: .3rem .5rem;
        text-align: center;
        font-size: 1rem;
        font-weight: bold;
        border-radius: var(--radius);
    }

    .profile.-new .status {
        background-color: var(--color-positive);
        color: var(--color-positive-text);
    }





</style>