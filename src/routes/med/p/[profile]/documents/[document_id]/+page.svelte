<script lang="ts">
    import { loadDocument } from '$lib/documents';
    import type { Document } from '$lib/documents/types.d';
    import Loading from '$components/ui/Loading.svelte';
    import { t } from '$lib/i18n';
import DocumentView from '$components/documents/DocumentView.svelte';
    import DocumentHeading from '$components/documents/DocumentHeading.svelte';
    import DocumentToolbar from '$components/documents/DocumentToolbar.svelte';
    import AppConnect from '$components/apps/AppConnect.svelte';
    import ui from '$lib/ui';

    interface Props {
        data: {
        document_id: string;
        profileId: string;
    };
    }

    let { data }: Props = $props();

    // Fields to include in AI context (matches config/chat.json documentContext.includeFields)
    const includeFields = ['title', 'tags', 'diagnosis', 'medications', 'vitals', 'recommendations', 'signals', 'summary'];

    let document: Document | null = $state(null);
    let notFound = $state(false);
    $effect(() => {
        const id = data.document_id;
        document = null;
        notFound = false;
        loadDocument(id, data.profileId).then(doc => {
            document = doc || null;
            if (!doc) {
                notFound = true;
                return;
            }

            // Emit document context event for AI chat
            const strippedContent = Object.fromEntries(
                includeFields
                    .filter(field => doc.content?.[field] !== undefined)
                    .map(field => [field, doc.content[field]])
            );

            ui.emit('aicontext:document', {
                documentId: doc.id,
                profileId: data.profileId,
                title: doc.content?.title || doc.metadata?.title || 'Untitled Document',
                content: strippedContent,
                timestamp: new Date()
            });
        }).catch(() => {
            notFound = true;
        });
    });

    
</script>


{#if notFound}
<div class="page -empty">
    <div class="not-found">
        <h2>{$t('documents.not-found')}</h2>
        <p>{$t('documents.not-found-description')}</p>
        <a href="/med/p/{data.profileId}/documents" class="button -primary">{$t('documents.back-to-documents')}</a>
    </div>
</div>
{:else if !document}
<Loading/>
{:else}
    {@const doc = document as Document}
    <div class="page -empty  -heading-master">

        <DocumentHeading document={doc} />
        <AppConnect shared={[doc]}/>
        <DocumentView document={doc} />
    </div>

{/if}

<style>
    .not-found {
        text-align: center;
        padding: var(--ui-pad-xlarge);
    }

    .not-found p {
        color: var(--color-text-secondary);
        margin-bottom: var(--ui-pad-large);
    }
</style>
