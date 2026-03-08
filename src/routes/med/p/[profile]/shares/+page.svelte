<script lang="ts">
    import { profile } from '$lib/profiles';
    import { t } from '$lib/i18n';
    import SharesList from '$components/apps/SharesList.svelte';
</script>

<div class="page-section">
    <h2 class="h2">{$t('share.my-shares-title')}</h2>
    <SharesList profileId={$profile?.id} />
</div>
