import { goto } from "$app/navigation";
import { setDocuments } from "$lib/documents";
import { DocumentType } from "$lib/documents/types.d";
import { profile, updateProfile } from "$lib/profiles";
import type { Document } from "$lib/documents/types.d";
import type { CarePlanItem } from "$lib/careplan/types";

/**
 * Playwright-only hooks for seeding the client-side encrypted document store
 * directly, bypassing real encryption/network round-trips. Both regular
 * documents and the Care Plan singleton document live behind the same
 * `$lib/documents` store, so one seeding primitive covers both journeys.
 *
 * Only ever imported when `PUBLIC_ENABLE_TEST_HOOKS` is set at build time
 * (see `src/routes/med/+layout.svelte`), so it never ships in a normal
 * production bundle.
 */
export function installTestHooks(): void {
  (window as any).__testHooks = {
    goto,

    seedDocuments(docs: Document[]) {
      setDocuments(docs);
    },

    seedCarePlan(items: CarePlanItem[], historicalItems: CarePlanItem[] = []) {
      const currentProfile = profile.get();
      if (!currentProfile) {
        throw new Error("__testHooks.seedCarePlan: no active profile");
      }
      const docId = currentProfile.carePlanDocumentId || "test-careplan-doc";
      setDocuments([
        {
          id: docId,
          key: "test-key",
          type: DocumentType.careplan,
          user_id: currentProfile.id,
          owner_id: currentProfile.id,
          metadata: { title: "Care Plan", tags: ["careplan"] },
          content: {
            title: "Care Plan",
            tags: ["careplan"],
            items,
            historicalItems,
            updatedAt: new Date().toISOString(),
          },
          attachments: [],
        } as unknown as Document,
      ]);
      if (currentProfile.carePlanDocumentId !== docId) {
        updateProfile({ ...currentProfile, carePlanDocumentId: docId });
      }
    },
  };
}
