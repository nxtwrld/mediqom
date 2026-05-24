<script lang="ts">
    import { byUser } from '$lib/documents';
    import { profile } from '$lib/profiles';
    import Documents from '$components/documents/Index.svelte';
    import { t } from '$lib/i18n';
    import { log } from '$lib/logging/logger';
    

    interface Props {
        //const documents = byUser($profile.id);
        data: {
        filters: {
            tags: string[];
        }
    };
    }

    let { data }: Props = $props();
    $effect(() => { log.ui.debug('data', data); });
</script>

<div class="page -empty">
    <div class="heading">
<h1 class="h1">{$t('app.nav.documents')}</h1>
        </div>
<Documents user={$profile.id} filterTags={data.filters.tags} />

</div>