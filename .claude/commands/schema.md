# Medical Configuration Schemas

We are working on medical data extraction schemas and their UI component mappings.

$ARGUMENTS

## Overview

54 configuration files in `src/lib/configurations/` define AI extraction schemas for medical documents. Each schema uses `FunctionDefinition` with JSON Schema parameters and maps 1:1 to a `Section*.svelte` display component.

## Schema Files by Category

### Core Schemas (shared properties spread into specialized schemas)
- `core.patient.ts` - Patient identification and demographics
- `core.performer.ts` - Healthcare provider information
- `core.diagnosis.ts` - Diagnosis coding (ICD-10, SNOMED)
- `core.signals.ts` - Vital signs and measurements
- `core.summary.ts` - Document summary extraction
- `core.bodyParts.ts` - Anatomical body part references
- `core.recommendations.ts` - Clinical recommendations

### Specialized Medical Schemas
- `admission.ts` - Hospital admission records
- `allergies.ts` - Allergy documentation
- `anesthesia.ts` - Anesthesia records
- `assessment.ts` - Clinical assessments
- `dental.ts` - Dental records
- `ecg.ts` - Electrocardiogram data
- `echo.ts` - Echocardiography data
- `gross-findings.ts` - Pathology gross findings
- `imaging.ts` - Medical imaging reports
- `imaging-findings.ts` - Imaging finding details
- `immunization.ts` - Vaccination records
- `laboratory.ts` - Lab results
- `medications.ts` - Medication lists
- `microscopic.ts` - Microscopic pathology
- `molecular.ts` - Molecular testing
- `prescription.ts` - Prescriptions
- `procedures.ts` - Medical procedures
- `report.ts` / `report.core.ts` - General medical reports
- `social-history.ts` - Social history
- `special-stains.ts` - Special staining results
- `specimens.ts` - Specimen information
- `treatment-plan.ts` - Treatment planning
- `treatment-response.ts` - Treatment response tracking
- `treatments.ts` - Treatment records
- `triage.ts` - Triage assessment
- `tumor-characteristics.ts` - Oncology tumor data

### Detection & Extraction Schemas
- `feature-detection.ts` - Document feature detection
- `anomaly-detection.ts` - Medical anomaly detection
- `bodyparts.extraction.ts` - Body part extraction
- `diagnosis.extraction.ts` - Diagnosis extraction
- `patient.extraction.ts` - Patient data extraction
- `performer.extraction.ts` - Performer extraction
- `patient-performer-detection.ts` - Combined detection
- `measurement-extraction.ts` - Measurement extraction
- `medical-imaging-analysis.ts` - Imaging analysis
- `visual-analysis.ts` - Visual content analysis
- `import.assesments.ts` - Import assessment checks

### Session-Specific Schemas
- `session.diagnosis.ts` - Session diagnosis extraction
- `session.diagnosis.enhanced.ts` - Enhanced session diagnosis
- `session.diagnosis.streamlined.ts` - Streamlined session diagnosis
- `session.report.ts` - Session report generation

### Utility Schemas
- `fhir.ts` - FHIR type definitions
- `jcard.ts` / `jcard.reduced.ts` - Patient card format
- `tags.ts` - Document tag definitions

## UI Component Mapping (`src/components/documents/Section*.svelte`)

Each specialized schema maps to a display component (33 Section components):
- `SectionAdmission.svelte` <-> `admission.ts`
- `SectionAllergies.svelte` <-> `allergies.ts`
- `SectionAssessment.svelte` <-> `assessment.ts`
- `SectionDental.svelte` <-> `dental.ts`
- `SectionDiagnosis.svelte` <-> `core.diagnosis.ts`
- `SectionECG.svelte` <-> `ecg.ts`
- `SectionEcho.svelte` <-> `echo.ts`
- `SectionGrossFindings.svelte` <-> `gross-findings.ts`
- `SectionImaging.svelte` <-> `imaging.ts`
- `SectionImagingFindings.svelte` <-> `imaging-findings.ts`
- `SectionImmunizations.svelte` <-> `immunization.ts`
- `SectionMedications.svelte` <-> `medications.ts`
- `SectionMicroscopic.svelte` <-> `microscopic.ts`
- `SectionMolecular.svelte` <-> `molecular.ts`
- `SectionProcedures.svelte` <-> `procedures.ts`
- `SectionSignals.svelte` <-> `core.signals.ts`
- `SectionSocialHistory.svelte` <-> `social-history.ts`
- `SectionSpecialStains.svelte` <-> `special-stains.ts`
- `SectionSpecimens.svelte` <-> `specimens.ts`
- `SectionSummary.svelte` <-> `core.summary.ts`
- `SectionTreatmentPlan.svelte` <-> `treatment-plan.ts`
- `SectionTreatmentResponse.svelte` <-> `treatment-response.ts`
- `SectionTreatments.svelte` <-> `treatments.ts`
- `SectionTriage.svelte` <-> `triage.ts`
- `SectionTumorCharacteristics.svelte` <-> `tumor-characteristics.ts`

Additional Section components: `SectionText.svelte`, `SectionBody.svelte`, `SectionLinks.svelte`, `SectionRecommendations.svelte`, `SectionPerformer.svelte`, `SectionAttachments.svelte`, `SectionSession.svelte`

## Schema Pattern

```typescript
export const schemaName: FunctionDefinition = {
  name: 'extract_...',
  description: '...',
  parameters: {
    type: 'object',
    properties: {
      ...corePatient,     // Spread from core schemas
      ...coreDiagnosis,
      specificField: { type: 'string', description: '...' }
    },
    required: [...]
  }
};
```

## LangGraph Integration

Schemas are consumed by LangGraph nodes in `src/lib/langgraph/nodes/` for AI extraction. Each node uses specific schemas to define what data to extract from documents.

## Documentation

- `AI_IMPORT_USER_CONFIGURATION.md` - Schema configuration for import pipeline
