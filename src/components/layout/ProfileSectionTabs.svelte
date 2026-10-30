<script lang="ts">
    import { page } from '$app/stores';
    import { profile } from '$lib/profiles';
    import { t } from '$lib/i18n';
    import { isFeatureEnabled } from '$lib/config/feature-flags';

    interface Props {
        group: 'docs' | 'doctors';
    }

    let { group }: Props = $props();

    type Tab = { path: string; key: string; flag?: Parameters<typeof isFeatureEnabled>[0] };

    const GROUPS: Record<Props['group'], Tab[]> = {
        docs: [
            { path: 'documents', key: 'app.nav.documents' },
            { path: 'medications', key: 'medications.title', flag: 'MEDICATIONS' },
        ],
        doctors: [
            { path: 'contacts', key: 'contacts.nav' },
            { path: 'appointments', key: 'appointments.nav' },
        ],
    };

    let tabs = $derived(GROUPS[group].filter((tab) => !tab.flag || isFeatureEnabled(tab.flag)));
</script>

<!-- Mobile only: on desktop the top bar already links every page -->
{#if $profile?.id && tabs.length > 1}
    <nav class="tab-heads profile-section-tabs">
        {#each tabs as tab (tab.path)}
            <a
                href="/med/p/{$profile.id}/{tab.path}"
                class={$page.url.pathname.startsWith(`/med/p/${$profile.id}/${tab.path}`) ? '-active' : ''}
            >
                {$t(tab.key)}
            </a>
        {/each}
    </nav>
{/if}

<style>
    @media (min-width: 769px) {
        .profile-section-tabs {
            display: none;
        }
    }
</style>
