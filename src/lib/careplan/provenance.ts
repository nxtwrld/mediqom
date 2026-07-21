/**
 * Provenance resolution (Care Plan build row 15 / §UX · Provenance reveal).
 *
 * Pure helper that maps a task/item/goal's provenance fields to the right
 * "Why is this here?" copy and link, per the three creation paths
 * (CAREPLAN.md §Task creation paths). Kept free of Svelte/i18n so it can be
 * unit-tested; the component renders the returned i18n key + values.
 */
import type { PerformerRef } from "./types";

export type ProvenancePath = "document" | "chat" | "user";

/** Normalised provenance input — accepted from a FollowUpTask, a CarePlanGoal,
 * or an item (item uses its first confirming document). */
export interface ProvenanceSource {
  sourceDocumentId?: string;
  sourceQuote?: string;
  sourceProvider?: PerformerRef;
  sourceMessageId?: string;
  /** ISO date shown in the copy (sourceDocumentDate, lastSeen, or created). */
  date?: string;
  /** Resolved by the caller from the documents store. */
  documentTitle?: string;
  /** True when the parent item carries contradicting documents. */
  contradicting?: boolean;
}

export interface ResolvedProvenance {
  path: ProvenancePath;
  copyKey: string;
  values: Record<string, string>;
  link?: { kind: "document" | "chat"; id: string };
  /** Append the "a newer document disagrees" line. */
  conflict: boolean;
}

/** Human label for the recommending provider, or empty when unattributable. */
export function providerLabel(provider: PerformerRef | undefined): string {
  if (!provider) return "";
  return [provider.title, provider.name].filter(Boolean).join(" ").trim();
}

export function resolveProvenance(
  source: ProvenanceSource,
): ResolvedProvenance {
  const conflict = Boolean(source.contradicting);
  const date = source.date ?? "";
  const title = source.documentTitle ?? "";

  // Path 1 — document extraction.
  if (source.sourceDocumentId) {
    const link = { kind: "document" as const, id: source.sourceDocumentId };
    const provider = providerLabel(source.sourceProvider);
    if (source.sourceQuote && source.sourceQuote.trim().length > 0) {
      return {
        path: "document",
        copyKey: "careplan.provenance.document-quote",
        values: {
          provider: provider || "",
          quote: source.sourceQuote.trim(),
          title,
          date,
        },
        link,
        conflict,
      };
    }
    // No-quote fallback — never fabricate a quote.
    return {
      path: "document",
      copyKey: "careplan.provenance.document",
      values: { title, date },
      link,
      conflict,
    };
  }

  // Path 3 — chat (createCarePlanTask).
  if (source.sourceMessageId) {
    return {
      path: "chat",
      copyKey: "careplan.provenance.chat",
      values: { date },
      link: { kind: "chat", id: source.sourceMessageId },
      conflict,
    };
  }

  // Path 2 — user-created / user-edited.
  return {
    path: "user",
    copyKey: "careplan.provenance.user",
    values: { date },
    conflict,
  };
}
