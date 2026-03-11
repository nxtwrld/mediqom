<script lang="ts">
    import { t } from '$lib/i18n';
    import AskButton from '$components/chat/AskButton.svelte';

    interface Props {
        data: any;
        document?: any;
    }

    let { data, document }: Props = $props();

    function sortByUrgency(a: any, b: any) {
        return b.urgency - a.urgency;
    }

    let sortedData = $derived(data ? [...data].sort(sortByUrgency) : []);

</script>


{#if data && data.length > 0}
    <h3 class="h3 heading -sticky">{ $t('report.recommendations') }</h3>

    <ul class="list-items">
        {#each sortedData as rec}
        <li class="panel urgency-{rec.urgency}">
            {rec.description}
            <AskButton
                type="recommendation"
                label={rec.description}
                data={rec}
                documentId={document?.id}
                documentTitle={document?.content?.title}
            />
        </li>
        {/each}
    </ul>
{/if}

<style>
    /* SectionRecommendations specific styles */
    .list-items li.panel {
        border-left-color: var(--color-urgency);
    }
</style>