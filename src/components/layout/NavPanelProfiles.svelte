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
        <button class="panel-profile-item" onclick={() => onSelectProfile(p.id)}>
            <ProfileImage profile={p} size={2} />
            <span>{p.fullName}</span>
        </button>
    {/each}
    <a href="/med/settings" onclick={onClose} class="panel-settings-link">
        {$t('app.nav.settings')}
    </a>
</nav>

<style>
    .panel-profiles {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .panel-profile-item {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.5rem 0.75rem;
        background: none;
        border: none;
        cursor: pointer;
        text-align: left;
        width: 100%;
        font-size: 1rem;
        color: var(--color-black);
        border-radius: var(--radius-16, 1rem);
        background-color: var(--color-gray-300);
    }

    .panel-profile-item:hover {
        background: rgba(0, 0, 0, 0.05);
    }

    .panel-settings-link {
        display: block;
        padding: 0.65rem 0.75rem;
        color: var(--color-gray-800);
        text-decoration: none;
        font-size: 0.875rem;
        margin-top: 0.25rem;
    }

    .panel-settings-link:hover {
        color: var(--color-black);
    }
</style>
