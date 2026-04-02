<script lang="ts">
    import Flag from "$components/ui/Flag.svelte";
    import Markdown from "$components/ui/Markdown.svelte";
    import { t } from '$lib/i18n';
    import user from '$lib/user';
    import type { Document } from '$lib/documents/types.d';

    interface Props {
        data: {
        text: string;
        original: string;
        language: string;
    };
        document?: Document;
    }

    let { data, document: doc }: Props = $props();

    let viewOriginal: boolean = $state(false);

    function resolveEmbedded(markdown: string): string {
        if (!markdown || !doc?.content?.attachments) return markdown;
        const map = new Map(
            (doc.content.attachments as any[] || [])
                .filter((a: any) => a.embedded && a.imageId && a.thumbnail)
                .map((a: any) => [a.imageId, a.thumbnail] as [string, string])
        );
        return markdown.replace(
            /!\[([^\]]*)\]\(embedded:(img-\d+)\)/g,
            (_, alt, id) => {
                const src = map.get(id);
                return src ? `![${alt}](${src})` : '';
            }
        );
    }

</script>


{#if data && (data.original) && (data.original != '')}


    <h3 class="h3 heading -sticky">{ $t('report.report') }</h3>


    {#if $user?.language != data.language && data.text != data.original && data.text && data.text != ''}
        <div class="panel">
            <Flag country={data.language} /> { $t('report.translated-from', { values: { language: $t('languages.'+ data.language) }}) }
            <button class="a" onclick={() => viewOriginal = !viewOriginal}>{ $t('report.toggle-original-contents') }</button>
        </div>
        <div class="panel">
            <Markdown text={resolveEmbedded(viewOriginal ? data.original : data.text)} />
        </div>
    {:else}
        <div class="panel">
            <Markdown text={resolveEmbedded(data.original)} />
        </div>
    {/if}
{/if}

<style>
    /* SectionText uses global panel styles */
    .panel {
        padding: var(--text-padding);
        background-color: var(--color-background);
    }
</style>
