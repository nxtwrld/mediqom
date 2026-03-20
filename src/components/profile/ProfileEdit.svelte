<script lang="ts">
    import InsuranceForm from "./InsuranceForm.svelte";
    import VCardFrom from "./VCardFrom.svelte";
    import HealthForm from "./HealthForm.svelte";
    import HealthConnect from "./HealthConnect.svelte";
    import Avatar from "$components/onboarding/Avatar.svelte";
    import { profile as profileStore, removeLinkedProfile } from '$lib/profiles';
    import { isNativePlatform } from '$lib/config/platform';
    import { t } from '$lib/i18n';

    interface Props {
        profile: any;
        ondelete?: () => void;
    }
    let { profile = $bindable(), ondelete }: Props = $props();

    const isShared = $derived(!!(profile as any).auth_id);

    // No reactive initialization needed - parent (ProfileDashboard) handles all setup

    function handleAvatarUpload() {
        // Update the profile store immediately so other parts of UI reflect the change
        profileStore.update(p => ({
            ...p,
            avatarUrl: profile.avatarUrl
        }));
    }

    async function handleDelete() {
        const msg = isShared
            ? $t('profile.edit.confirm-disconnect')
            : $t('profile.edit.confirm-delete');
        if (!confirm(msg)) return;
        await removeLinkedProfile(profile.id);
        ondelete?.();
    }
</script>


<div class="profile-edit">

    <div class="profile-image-section">
        <h3 class="h3 heading">Profile Image</h3>
        <Avatar id={profile.id} bind:url={profile.avatarUrl} editable={true} on:upload={handleAvatarUpload} />
    </div>

    <InsuranceForm bind:data={profile.insurance} />
    <VCardFrom bind:data={profile.vcard} />
    <HealthForm config={{ data: profile.health }} bind:data={profile.health} />

    {#if isNativePlatform()}
        <HealthConnect
            profileId={profile.id}
            bind:config={profile.health.deviceSync}
        />
    {/if}

    <div class="danger-zone">
        <button class="button -danger" onclick={handleDelete}>
            {isShared ? $t('profile.edit.disconnect') : $t('profile.edit.delete')}
        </button>
    </div>

</div>

<style>
    .profile-image-section {
        margin-bottom: 2rem;
        text-align: center;
    }

    .profile-edit :global(.tab-body) {
        padding: 1rem;
        background-color: var(--color-background);
    }

    .danger-zone {
        margin-top: 2rem;
        padding-top: 1.5rem;
        border-top: 1px solid var(--color-border);
        display: flex;
        justify-content: flex-end;
    }
</style>