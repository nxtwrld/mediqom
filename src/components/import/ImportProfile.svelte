<script lang="ts">
    import { type Profile } from '$lib/types.d';
    import ScreenOverlay from '$components/ui/ScreenOverlay.svelte';
    import ProfileImage from '$components/profile/ProfileImage.svelte';
    import ProfileEdit from '$components/profile/ProfileEdit.svelte';
    import { scale } from 'svelte/transition';
    import { PROFILE_NEW_ID } from '$lib/profiles/tools';
    import { t } from '$lib/i18n';
    import { saveHealthProfile } from '$lib/health/save';
    import { saveProfileDocument } from '$lib/profiles/save';
    import { apiFetch } from '$lib/api/client';
    

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
    async function done() {
        // Save all data before closing (only for existing profiles)
        if (profile.id && profile.id !== PROFILE_NEW_ID) {
            try {
                // 1. Save profile document (vcard + insurance)
                const profileResult = await saveProfileDocument({
                    profileId: profile.id,
                    vcard: profile.vcard,
                    insurance: profile.insurance
                });

                // 2. Update database fullName (sync derived field)
                if (profileResult.success && profileResult.fullName) {
                    try {
                        await apiFetch(`/v1/med/profiles/${profile.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ fullName: profileResult.fullName })
                        });
                    } catch (e) {
                        console.warn('[ImportProfile] Failed to sync fullName:', e);
                    }
                }

                // 3. Save health document
                if (profile.health) {
                    await saveHealthProfile({
                        profileId: profile.id,
                        formData: profile.health
                    });
                }
            } catch (error) {
                console.error('[ImportProfile] Save error:', error);
                // TODO: Show error message to user
            }
        }
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