<script lang="ts">
    import { getDocument } from '$lib/documents';
    import type { Document } from '$lib/documents/types.d';
    import Loading from '$components/ui/Loading.svelte';
    import { onMount } from 'svelte';
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
    onMount(async () => {
        document = await getDocument(data.document_id) || null;

        // Emit document context event for AI chat
        if (document) {
            const doc = document; // Capture for closure
            // Strip document to only include essential fields (excludes sessionAnalysis, attachments, etc.)
            const strippedContent = Object.fromEntries(
                includeFields
                    .filter(field => doc.content?.[field] !== undefined)
                    .map(field => [field, doc.content[field]])
            );

            ui.emit('aicontext:document', {
                documentId: doc.id,
                profileId: data.profileId, // Include profile ownership for validation
                title: doc.content?.title || doc.metadata?.title || 'Untitled Document',
                content: strippedContent,
                timestamp: new Date()
            });
        }
    });

    
</script>


{#if !document}
<Loading/>
{:else}
    <div class="page -empty  -heading-master">

        <DocumentHeading {document} />
        <DocumentToolbar {document} />
        <AppConnect {document} shared={[document]}/>
        <DocumentView {document} />
    </div>
    
{/if}
