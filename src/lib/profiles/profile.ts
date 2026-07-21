import { writable, type Writable, get } from "svelte/store";
import { type Profile } from "$lib/types.d";
import type { ChatContext, PageContext, DocumentCatalogEntry } from "$lib/chat/types.d";
import { generateId } from "$lib/utils/id";
import ui from "$lib/ui";
import user, { type User } from "$lib/user";
import { resolveChatMode } from "$lib/chat/store";
import { byUser } from "$lib/documents";

const store: Writable<Profile> = writable();

/**
 * Creates a chat context from the current profile data
 * This provides a centralized method for converting profile data to chat context
 */
function createChatContext(
  profileId: string,
  profileName: string,
  isOwnProfile: boolean,
  language: string,
  currentRoute: string = "/",
  healthData?: any,
  healthDocumentId?: string,
): ChatContext {
  // Get cached document data if available (for consistency with existing behavior)
  const documentEvent = ui.getLatest("aicontext:document");
  // Only include document if it belongs to this profile (belt-and-suspenders guard)
  const documentData =
    documentEvent?.data?.profileId === profileId ? documentEvent.data : null;

  // Build available documents list including health document
  const availableDocuments = [];
  const documentsContent = new Map();

  // Add cached document if available
  if (documentData) {
    availableDocuments.push(documentData.documentId);
    documentsContent.set(documentData.documentId, documentData.content);
  }

  // Add health document if available - only include basic summary to reduce token usage
  if (healthDocumentId && healthData) {
    const basicHealthSummary = {
      birthDate: healthData.birthDate,
      biologicalSex: healthData.biologicalSex,
      bloodType: healthData.bloodType,
      height: healthData.signals?.height?.values?.[0]?.value,
      weight: healthData.signals?.weight?.values?.[0]?.value,
      // Include counts for context, actual data accessed via tools
      medicationCount: healthData.medications?.length || 0,
      conditionCount: healthData.conditions?.length || 0,
    };
    availableDocuments.push(healthDocumentId);
    documentsContent.set(healthDocumentId, basicHealthSummary);
  }

  // Build document catalog from all profile documents
  const profileDocs = get(byUser(profileId)) || [];
  const documentCatalog: DocumentCatalogEntry[] = profileDocs.map((doc: any) => ({
    id: doc.id,
    title: doc.content?.title || doc.metadata?.title || "Untitled",
    category: doc.metadata?.category,
    date: doc.metadata?.date || doc.created_at?.substring(0, 10),
    medicalTerms: (doc.metadata?.tags || []).slice(0, 10),
  }));

  // Merge all profile doc IDs with existing available documents
  const allDocIds = profileDocs.map((d: any) => d.id);
  const mergedDocIds = [...new Set([...availableDocuments, ...allDocIds])];

  // Extract conditions and medications from healthData
  const conditions: string[] = [];
  const medications: string[] = [];
  if (healthData) {
    if (healthData.conditions && Array.isArray(healthData.conditions)) {
      for (const c of healthData.conditions) {
        const name = c.name || c.code || (typeof c === 'string' ? c : '');
        if (name) conditions.push(name);
      }
    }
    if (healthData.medications && Array.isArray(healthData.medications)) {
      for (const m of healthData.medications) {
        const name = m.name || (typeof m === 'string' ? m : '');
        if (name) medications.push(name);
      }
    }
  }

  // Extract vitals from healthData signals
  const vitals: string[] = [];
  if (healthData) {
    const h = healthData.signals?.height?.values?.[0];
    if (h?.value) vitals.push(`Height: ${h.value}${h.unit || ' cm'}`);
    const w = healthData.signals?.weight?.values?.[0];
    if (w?.value) vitals.push(`Weight: ${w.value}${w.unit || ' kg'}`);
    if (healthData.bloodType) vitals.push(`Blood Type: ${healthData.bloodType}`);
    if (healthData.birthDate) vitals.push(`Birth Date: ${healthData.birthDate}`);
    if (healthData.biologicalSex) vitals.push(`Biological Sex: ${healthData.biologicalSex}`);
  }

  const pageContext: PageContext = {
    route: currentRoute,
    profileName: profileName,
    availableData: {
      documents: mergedDocIds,
      conditions,
      medications,
      vitals,
    },
    documentsContent: documentsContent.size > 0 ? documentsContent : undefined,
    documentCatalog: documentCatalog.length > 0 ? documentCatalog : undefined,
  };

  return {
    mode: resolveChatMode(isOwnProfile, (user.get() as User)?.isMedical ?? false),
    currentProfileId: profileId,
    conversationThreadId: generateId(),
    language: language,
    pageContext: pageContext,
    isOwnProfile: isOwnProfile,
  };
}

export default {
  ...store,
  get: () => get(store),
  createChatContext,
};
