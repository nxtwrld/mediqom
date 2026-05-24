<script lang="ts">
	import Tags from './Tags.svelte';
    import SectionSummary from './SectionSummary.svelte';
    import SectionDiagnosis from './SectionDiagnosis.svelte';
    import SectionRecommendations from './SectionRecommendations.svelte';
    import SectionBody from './SectionBody.svelte';
    import SectionSignals from './SectionSignals.svelte';
    import SectionText from './SectionText.svelte';
    import SectionPerformer from './SectionPerformer.svelte';
    import SectionLinks from './SectionLinks.svelte';
    import SectionAttachments from './SectionAttachments.svelte';
    import SharesList from '$components/apps/SharesList.svelte';
    import SectionMedications from './SectionMedications.svelte';
    import SectionProcedures from './SectionProcedures.svelte';
    import SectionAllergies from './SectionAllergies.svelte';
    import SectionTriage from './SectionTriage.svelte';
    import SectionAnesthesia from './SectionAnesthesia.svelte';
    import SectionImaging from './SectionImaging.svelte';
    import SectionSession from './SectionSession.svelte';

    import type { Document } from '$lib/documents/types.d';

    interface Props {
        document: Document;
    }

    let { document }: Props = $props();
    
    // Pure data-driven approach: render whatever sections exist in the document
    // AI feature detection populates document sections, UI simply renders them
    const availableSections = [

        { id: 'summary', component: SectionSummary, name: 'Summary' },
        { id: 'diagnosis', component: SectionDiagnosis, name: 'Diagnosis' },
        { id: 'bodyParts', component: SectionBody, name: 'Body Parts' },
        { id: 'recommendations', component: SectionRecommendations, name: 'Recommendations' },
        { id: 'medications', component: SectionMedications, name: 'Medications' },
        { id: 'procedures', component: SectionProcedures, name: 'Procedures' },
        { id: 'allergies', component: SectionAllergies, name: 'Allergies' },
        { id: 'triage', component: SectionTriage, name: 'Triage' },
        { id: 'anesthesia', component: SectionAnesthesia, name: 'Anesthesia' },
        { id: 'imaging', component: SectionImaging, name: 'Imaging Studies' },
        { id: 'signals', component: SectionSignals, name: 'Signals & Lab Results' },
        { id: 'sessionAnalysis', component: SectionSession, name: 'Session Analysis' },
        { id: 'text', component: SectionText, name: 'Text Content' },
        // { id: 'specimens', component: SectionSpecimens, name: 'Specimens' },
        { id: 'performer', component: SectionPerformer, name: 'Healthcare Provider' },
        { id: 'links', component: SectionLinks, name: 'Related Links' },
        
        
        // Note: Additional section components will be added as they're implemented:

        // etc.
        { id: 'attachments', component: SectionAttachments, name: 'Attachments' }
    ];
    
    // Get sections that have data in the document
    let sectionsToRender = $derived(() => {
        return availableSections.filter(section => {
            const data = getSectionData(section.id);
            return hasRelevantData(section.id, data);
        });
    });
    
    // Check if section data is meaningful and should be rendered
    function hasRelevantData(sectionId: string, data: any): boolean {
        if (!data || data === null || data === undefined) {
            return false;
        }
        
        // Special handling for different section types
        switch(sectionId) {
            case 'sessionAnalysis':
                // Check if we have valid session analysis data
                // Session analysis contains both transcript and analysis children
                const analysisData = data.analysis || data;
                return !!(analysisData.nodes && (
                    analysisData.nodes.symptoms?.length > 0 ||
                    analysisData.nodes.diagnoses?.length > 0 ||
                    analysisData.nodes.treatments?.length > 0 ||
                    analysisData.nodes.actions?.length > 0
                ));
            
            case 'medications':
                return data.hasMedications || 
                       (data.currentMedications && data.currentMedications.length > 0) ||
                       (data.newPrescriptions && data.newPrescriptions.length > 0) ||
                       (data.discontinuedMedications && data.discontinuedMedications.length > 0) ||
                       (data.medicationChanges && data.medicationChanges.length > 0);
            
            case 'procedures':
                return data.hasProcedures || 
                       (data.procedures && data.procedures.length > 0);
            
            case 'allergies':
                return data.hasAllergies || 
                       (data.allergies && data.allergies.length > 0) ||
                       (data.drugIntolerances && data.drugIntolerances.length > 0) ||
                       (data.environmentalSensitivities && data.environmentalSensitivities.length > 0) ||
                       data.noKnownAllergies;
            
            case 'triage':
                return data.hasTriage || 
                       data.chiefComplaint ||
                       data.triageLevel ||
                       data.arrivalTime;
            
            case 'anesthesia':
                return data.hasAnesthesia || 
                       data.anesthesiaType ||
                       data.anesthesiaDetails ||
                       (data.medications && data.medications.length > 0);
            
            case 'imaging':
                return (data.studies?.length > 0) || (data.attachments?.length > 0);

            case 'signals':
                // Handle both array format (direct signals) and object format
                if (Array.isArray(data)) {
                    return data.length > 0;
                }
                return (data.signals && data.signals.length > 0) ||
                       (data.laboratory && data.laboratory.length > 0) ||
                       (data.vitals && data.vitals.length > 0);
            
            case 'recommendations':
                return Array.isArray(data) ? data.length > 0 : 
                       (data.recommendations && data.recommendations.length > 0);
            
            case 'diagnosis':
                return Array.isArray(data) ? data.length > 0 :
                       (data.diagnoses && data.diagnoses.length > 0);
            
            case 'bodyParts':
                return Array.isArray(data) ? data.length > 0 :
                       (data.bodyParts && data.bodyParts.length > 0);
            
            case 'attachments':
                return Array.isArray(data) ? data.length > 0 :
                       (data.attachments && data.attachments.length > 0);
            
            case 'links':
                return Array.isArray(data) ? data.length > 0 :
                       (data.links && data.links.length > 0);
            
            // For other sections, check if it's a non-empty string, non-empty array, or has meaningful properties
            default:
                if (typeof data === 'string') {
                    return data.trim().length > 0;
                }
                if (Array.isArray(data)) {
                    return data.length > 0;
                }
                if (typeof data === 'object') {
                    return Object.keys(data).length > 0;
                }
                return !!data;
        }
    }
    
    // Merge paths from top-level document.attachments into content attachments
    // Content attachments (inside encrypted blob) may lack path/url fields,
    // while top-level attachments (stored as separate DB column) always have them
    function enrichAttachmentsWithPaths(contentAttachments: any[], docAttachments: any[]): any[] {
        if (!contentAttachments?.length || !docAttachments?.length) return contentAttachments || [];
        return contentAttachments.map((ca, index) => {
            if (ca.path) return ca; // already has path
            // Fallback: index-based match (arrays are built from same source, same order)
            const byIndex = docAttachments[index];
            if (byIndex?.path) return { ...ca, path: byIndex.path, url: byIndex.url };
            return ca;
        });
    }

    // Get data for a section from the document
    function getSectionData(sectionId: string) {
        switch(sectionId) {
            case 'sessionAnalysis':
                return document.content.sessionAnalysis;
            case 'summary':
                return document.content.summary;
            case 'diagnosis':
                return document.content.diagnosis;
            case 'bodyParts':
                return document.content.bodyParts;
            case 'recommendations':
                return document.content.recommendations;
            case 'signals':
                // Signals section handles both signals and laboratory data
                return document.content.signals || document.content.laboratory;
            case 'text':
                return {
                    original: document.content.content,
                    text: document.content.localizedContent,
                    language: document.content.language || 'en'
                };
            case 'performer':
                return document.content.performer;
            case 'links':
                return document.content.links;
            case 'attachments':
                return enrichAttachmentsWithPaths(
                    document.content.attachments || [],
                    document.attachments || []
                ).filter((a: any) => !a.embedded);
            // Enhanced sections - will be rendered when AI populates them
            case 'imaging': {
                const imaging = document.content.imaging;
                if (!imaging) return null;
                // Include all attachments for imaging documents — MIME normalization
                // ensures types are correct, and documents with imaging data should
                // show all their attachments (DICOM, images, even PDFs of scans)
                const allAttachments = enrichAttachmentsWithPaths(
                    document.content.attachments || [],
                    document.attachments || []
                );
                return { studies: Array.isArray(imaging) ? imaging : [imaging], attachments: allAttachments };
            }
            case 'procedures':
                return document.content.procedures;
            case 'anesthesia':
                return document.content.anesthesia;
            case 'triage':
                return document.content.triage;
            case 'allergies':
                return document.content.allergies;
            case 'medications':
                // Include both medications and prescriptions data for comprehensive view
                return document.content.medications || document.content.prescriptions || document.content.prescription;
            default:
                return null;
        }
    }
    
</script>


<div class="report -heading-sub">
    <!-- Pure data-driven rendering: show sections that exist in the document -->
    {#each sectionsToRender().filter(s => s.id !== 'attachments') as section}
        <div class="document-section">
            {#if section.id === 'summary'}
                <!-- Special handling for summary section to include tags -->
                <section.component data={getSectionData(section.id)} {document} encryptionKey={document.key} />
                <div class="page -block">
                    <Tags tags={document.content.tags} />
                </div>
            {:else}
                {@const data = getSectionData(section.id)}
                {#if data}
                    <section.component {data} {document} encryptionKey={document.key} />
                {/if}
            {/if}
        </div>
    {/each}

    <!-- Shares (above attachments) -->
    <SharesList documentId={document.id} hideIfEmpty={true} />

    <!-- Attachments last -->
    {#if getSectionData('attachments')}
        <div class="document-section">
            <SectionAttachments data={getSectionData('attachments')} encryptionKey={document.key} />
        </div>
    {/if}
</div>
<!--pre>
    {JSON.stringify(document, null, 2)}
</pre-->


<style>
    .report {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
    }
    .report :global(.heading)  {
        background-color: var(--color-gray-500);
    }
</style>
