<script lang="ts">
    import { profiles } from '$lib/profiles';
    import ProfileImage from '$components/profile/ProfileImage.svelte';
    import { t } from '$lib/i18n';

    interface Props {
        onSelectProfile: (id: string) => void;
        onClose: () => void;
    }

    let { onSelectProfile, onClose }: Props = $props();
</script>

<nav class="panel-profiles">
    {#each $profiles as p (p.id)}
        <button class="button panel-profile-item" onclick={() => onSelectProfile(p.id)}>
            <ProfileImage profile={p} size={2.5} />
            <span>{p.fullName}</span>
        </button>
    {/each}
    <a href="/med/settings" onclick={onClose} class="button panel-settings-link">
        {$t('app.nav.settings')}
    </a>
</nav>

<style>
    .panel-profiles {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 1.8rem;
        margin: 3rem 0 0;
    }

    .panel-profile-item {
        position: relative;
        display: flex;
        align-items: left;
        text-align: left;
        width: 100%;
        font-size: 1rem;
        padding: 1rem .5rem .5rem;
    }

    .panel-profile-item :global(.avatar) {
        position: absolute;
        left: 50%;
        top: 0;
        transform: translate(-50%, -70%);
    }

</style>
