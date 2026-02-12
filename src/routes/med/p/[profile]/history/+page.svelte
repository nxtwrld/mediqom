<script lang="ts">
    import { type Profile } from '$lib/types.d';
    import { t } from '$lib/i18n';

    interface Props {
        data: {
        profile: Profile
    };
    }

    let { data }: Props = $props();
    const profile: Profile = data.profile;
</script>

<h1>{$t('app.nav.history')}</h1>
