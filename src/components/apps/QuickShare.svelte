<script lang="ts">
    // import ImportFileContainer from "$components/import/ImportFileContainer.svelte";
    // import type { JOURNEY } from '$components/user/Onboarding.svelte';
    import { logger } from '$lib/logging/logger';
    import { t } from '$lib/i18n';

    interface Props {
        journey?: any; // JOURNEY type not available
    }

    let { journey = undefined }: Props = $props();

    const callback: (items: any) => void = (items: any) => {
        logger.api.debug('Quick share items', items);
    }
</script>

<div>
{$t('app.apps.quick-share')}

<!-- ImportFileContainer component not available -->
<!-- <ImportFileContainer {callback}/> -->


{$t('app.apps.add-contact')}
</div>
