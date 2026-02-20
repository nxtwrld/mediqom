// Dynamic Section Factory
// Creates and manages document sections based on document type and content availability

import type { ComponentType } from "svelte";
import type { Document } from "./types.d";
import type { DocumentTypeInfo } from "./document-type-detector";

// Standard section imports
import SectionSummary from "$components/documents/SectionSummary.svelte";
import SectionDiagnosis from "$components/documents/SectionDiagnosis.svelte";
import SectionRecommendations from "$components/documents/SectionRecommendations.svelte";
import SectionBody from "$components/documents/SectionBody.svelte";
import SectionSignals from "$components/documents/SectionSignals.svelte";
import SectionText from "$components/documents/SectionText.svelte";
import SectionPerformer from "$components/documents/SectionPerformer.svelte";
import SectionLinks from "$components/documents/SectionLinks.svelte";
import SectionAttachments from "$components/documents/SectionAttachments.svelte";
import SectionSession from "$components/documents/SectionSession.svelte";
import Tags from "$components/documents/Tags.svelte";

// Specialized section imports (future expansion)
// import SurgicalProcedureSection from '$components/medical/sections/SurgicalProcedureSection.svelte';
// import PathologySpecimenSection from '$components/medical/sections/PathologySpecimenSection.svelte';

export interface SectionConfiguration {
  id: string;
  component: ComponentType;
  props: Record<string, any>;
  priority: number;
  condition: (document: Document) => boolean;
  wrapper?: {
    class?: string;
    heading?: string;
    collapsible?: boolean;
  };
}

export interface DocumentSectionPlan {
  sections: SectionConfiguration[];
  layout: "standard" | "specialized" | "hybrid";
  useSpecializedViewer: boolean;
}

// Standard section component registry
const STANDARD_SECTIONS = {
  tags: {
    component: Tags,
    priority: 100,
    condition: (doc: Document) => !!doc.content.tags?.length,
    propsMapper: (doc: Document) => ({ tags: doc.content.tags }),
  },
  sessionAnalysis: {
    component: SectionSession,
    priority: 95,
    condition: (doc: Document) => !!doc.content.sessionAnalysis,
    propsMapper: (doc: Document) => ({
      data: doc.content.sessionAnalysis,
      document: doc,
      key: doc.key,
    }),
  },
  summary: {
    component: SectionSummary,
    priority: 90,
    condition: (doc: Document) => !!doc.content.summary,
    propsMapper: (doc: Document) => ({ data: doc.content.summary }),
  },
  diagnosis: {
    component: SectionDiagnosis,
    priority: 80,
    condition: (doc: Document) => !!doc.content.diagnosis,
    propsMapper: (doc: Document) => ({ data: doc.content.diagnosis }),
  },
  body: {
    component: SectionBody,
    priority: 70,
    condition: (doc: Document) => !!doc.content.bodyParts,
    propsMapper: (doc: Document) => ({ data: doc.content.bodyParts }),
  },
  recommendations: {
    component: SectionRecommendations,
    priority: 60,
    condition: (doc: Document) => !!doc.content.recommendations,
    propsMapper: (doc: Document) => ({ data: doc.content.recommendations }),
  },
  signals: {
    component: SectionSignals,
    priority: 50,
    condition: (doc: Document) => !!doc.content.signals,
    propsMapper: (doc: Document) => ({
      data: doc.content.signals,
      document: doc,
    }),
  },
  text: {
    component: SectionText,
    priority: 40,
    condition: (doc: Document) =>
      !!(doc.content.content || doc.content.localizedContent),
    propsMapper: (doc: Document) => ({
      data: {
        original: doc.content.content,
        text: doc.content.localizedContent,
        language: (doc as any).language || "en",
      },
    }),
  },
  performer: {
    component: SectionPerformer,
    priority: 30,
    condition: (doc: Document) => !!doc.content.performer,
    propsMapper: (doc: Document) => ({ data: doc.content.performer }),
  },
  links: {
    component: SectionLinks,
    priority: 20,
    condition: (doc: Document) => !!doc.content.links,
    propsMapper: (doc: Document) => ({ data: doc.content.links }),
  },
  attachments: {
    component: SectionAttachments,
    priority: 10,
    condition: (doc: Document) => !!doc.content.attachments?.length,
    propsMapper: (doc: Document) => ({
      data: doc.content.attachments,
      key: doc.key,
    }),
  },
} as const;

// Document type specific section configurations
const DOCUMENT_TYPE_SECTIONS = {
  surgical: {
    requiredSections: ["summary", "diagnosis"],
    prioritySections: ["body", "recommendations"],
    optionalSections: ["signals", "text", "performer", "attachments", "links"],
    excludeSections: [] as string[],
  },
  pathology: {
    requiredSections: ["summary", "diagnosis"],
    prioritySections: ["text", "attachments"],
    optionalSections: ["body", "recommendations", "performer", "links"],
    excludeSections: ["signals"],
  },
  cardiology: {
    requiredSections: ["summary", "signals"],
    prioritySections: ["diagnosis", "recommendations"],
    optionalSections: ["body", "text", "performer", "attachments", "links"],
    excludeSections: [],
  },
  radiology: {
    requiredSections: ["summary", "text"],
    prioritySections: ["diagnosis", "attachments"],
    optionalSections: ["body", "recommendations", "performer", "links"],
    excludeSections: ["signals"],
  },
  laboratory: {
    requiredSections: ["summary", "signals"],
    prioritySections: ["recommendations"],
    optionalSections: [
      "diagnosis",
      "text",
      "performer",
      "attachments",
      "links",
    ],
    excludeSections: ["body"],
  },
  consultation: {
    requiredSections: ["summary"],
    prioritySections: ["diagnosis", "recommendations", "text"],
    optionalSections: ["body", "signals", "performer", "attachments", "links"],
    excludeSections: [],
  },
} as const;

/**
 * Creates a document section plan based on document type and content
 */
export function createDocumentSectionPlan(
  document: Document,
  documentType: DocumentTypeInfo,
  useSpecializedViewer: boolean = false,
): DocumentSectionPlan {
  // If using specialized viewer, return minimal section plan
  if (useSpecializedViewer) {
    return {
      sections: [
        {
          id: "tags",
          component: Tags,
          props: { tags: document.content.tags },
          priority: 100,
          condition: () => !!document.content.tags?.length,
        },
      ].filter((section) => section.condition()),
      layout: "specialized",
      useSpecializedViewer: true,
    };
  }

  // Get document type configuration
  const typeConfig =
    DOCUMENT_TYPE_SECTIONS[
      documentType.primaryType as keyof typeof DOCUMENT_TYPE_SECTIONS
    ] || DOCUMENT_TYPE_SECTIONS.consultation;

  const sections: SectionConfiguration[] = [];

  // Process each available section
  for (const [sectionId, sectionDef] of Object.entries(STANDARD_SECTIONS) as [
    keyof typeof STANDARD_SECTIONS,
    (typeof STANDARD_SECTIONS)[keyof typeof STANDARD_SECTIONS],
  ][]) {
    // Skip excluded sections for this document type
    if (
      (typeConfig.excludeSections as unknown as any[]).includes(
        sectionId as any,
      )
    ) {
      continue;
    }

    // Check if section should be included based on content availability
    if (!sectionDef.condition(document)) {
      // Required sections show even if empty (with placeholder)
      if (
        !(typeConfig.requiredSections as unknown as any[]).includes(
          sectionId as any,
        )
      ) {
        continue;
      }
    }

    // Calculate section priority based on document type
    let priority = sectionDef.priority;
    if (
      (typeConfig.requiredSections as unknown as any[]).includes(
        sectionId as any,
      )
    ) {
      priority += 50; // Boost required sections
    } else if (
      (typeConfig.prioritySections as unknown as any[]).includes(
        sectionId as any,
      )
    ) {
      priority += 25; // Boost priority sections
    }

    // Create section configuration
    sections.push({
      id: sectionId,
      component: sectionDef.component as any,
      props: sectionDef.propsMapper(document),
      priority,
      condition: sectionDef.condition,
      wrapper: getSectionWrapper(sectionId, documentType.primaryType),
    });
  }

  // Sort sections by priority (descending)
  sections.sort((a, b) => b.priority - a.priority);

  return {
    sections: sections.filter((section) => section.condition(document)),
    layout: documentType.confidence > 0.7 ? "hybrid" : "standard",
    useSpecializedViewer: false,
  };
}

/**
 * Gets wrapper configuration for a section based on document type
 */
function getSectionWrapper(
  sectionId: string,
  documentType: string,
): SectionConfiguration["wrapper"] {
  // Document type specific wrapper customizations
  const typeWrappers = {
    surgical: {
      diagnosis: { heading: "Primary Diagnosis", collapsible: false },
      body: { heading: "Surgical Site", collapsible: true },
      text: { heading: "Operative Report", collapsible: true },
    },
    pathology: {
      diagnosis: { heading: "Pathological Diagnosis", collapsible: false },
      text: { heading: "Microscopic Description", collapsible: true },
    },
    cardiology: {
      signals: { heading: "Cardiac Measurements", collapsible: false },
      diagnosis: { heading: "Clinical Impression", collapsible: false },
    },
    radiology: {
      text: { heading: "Findings & Impression", collapsible: false },
      diagnosis: { heading: "Radiological Impression", collapsible: false },
    },
  };

  const docTypeWrappers =
    typeWrappers[documentType as keyof typeof typeWrappers];
  return (
    docTypeWrappers?.[sectionId as keyof typeof docTypeWrappers] || undefined
  );
}

/**
 * Validates that required sections are available for a document type
 */
export function validateSectionAvailability(
  document: Document,
  documentType: DocumentTypeInfo,
): { valid: boolean; missingSections: string[]; warnings: string[] } {
  const typeConfig =
    DOCUMENT_TYPE_SECTIONS[
      documentType.primaryType as keyof typeof DOCUMENT_TYPE_SECTIONS
    ] || DOCUMENT_TYPE_SECTIONS.consultation;

  const missingSections: string[] = [];
  const warnings: string[] = [];

  // Check required sections
  for (const requiredSection of typeConfig.requiredSections) {
    const sectionDef =
      STANDARD_SECTIONS[requiredSection as keyof typeof STANDARD_SECTIONS];
    if (sectionDef && !sectionDef.condition(document)) {
      missingSections.push(requiredSection);
    }
  }

  // Check priority sections for warnings
  for (const prioritySection of typeConfig.prioritySections) {
    const sectionDef =
      STANDARD_SECTIONS[prioritySection as keyof typeof STANDARD_SECTIONS];
    if (sectionDef && !sectionDef.condition(document)) {
      warnings.push(
        `Priority section '${prioritySection}' has no content available`,
      );
    }
  }

  return {
    valid: missingSections.length === 0,
    missingSections,
    warnings,
  };
}
