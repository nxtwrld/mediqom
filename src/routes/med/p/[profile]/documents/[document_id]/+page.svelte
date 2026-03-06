<script lang="ts">
    import { getDocument } from '$lib/documents';
    import type { Document } from '$lib/documents/types.d';
    import Loading from '$components/ui/Loading.svelte';
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
    $effect(() => {
        const id = data.document_id;
        document = null;
        getDocument(id).then(doc => {
            document = doc || null;

            // Emit document context event for AI chat
            if (doc) {
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
            }
        });
    });

    
</script>


{#if !document}
<Loading/>
{:else}
    {@const doc = document as Document}
    <div class="page -empty  -heading-master">

        <DocumentHeading document={doc} />
        <AppConnect shared={[doc]}/>
        <DocumentView document={doc} />
    </div>

{/if}
