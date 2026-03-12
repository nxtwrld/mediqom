import type { FunctionDefinition } from "@langchain/core/language_models/base";

/**
 * Comprehensive AI Feature Detection for Medical Documents
 *
 * This AI-based detection system identifies which medical sections are present
 * in documents across all languages. It replaces the previous registry-based
 * approach with direct AI analysis that populates document sections.
 *
 * Philosophy: AI detects sections → Document contains sections → UI renders sections
 */
export default {
  name: "extractor",
  description:
    "Analyze medical documents comprehensively to identify ALL medical sections present. Carefully examine the entire document for: prescriptions/medications (drug names, dosages like '20mg 1-0-1'), procedures (surgical/endoscopic operations), lab values/measurements (numbers with units), imaging studies, diagnoses, etc. Set each boolean flag to true if that content type exists anywhere in the document. This analysis works in any language. If not medical content, mark as notMedical and skip other analysis.",
  parameters: {
    type: "object",
    properties: {
      isMedical: {
        type: "boolean",
        description:
          "Is this medical content (report, lab results, imaging, clinical notes, etc.)? true/false. If false, ignore all other parameters.",
      },
      language: {
        type: "string",
        description:
          "Language of the document content. Use ISO-639-1 two-character code (en, es, fr, de, cs, etc.)",
      },
      documentType: {
        type: "string",
        description:
          "Primary document type based on content analysis. Choose the most specific type: 'laboratory_results' for any lab panel, blood test, urinalysis, or biochemistry results; 'imaging_report' for CT/MRI/PET/scintigraphy reports; 'radiology_report' for X-ray/ultrasound reports with written findings; 'pathology_report' for histology/biopsy/autopsy; 'surgical_report' for operative notes; 'discharge_summary' for hospital admission/discharge documents; 'prescription' for medication prescription documents; 'emergency_report' for ER/urgent care visits; 'oncology_report' for oncology/cancer follow-ups; 'cardiology_report' for cardiology consultations (ECG, echo, stress test); 'consultation_note' for specialist consultations; 'clinical_report' as fallback for general medical reports.",
        enum: [
          "clinical_report",
          "laboratory_results",
          "imaging_report",
          "pathology_report",
          "surgical_report",
          "emergency_report",
          "consultation_note",
          "discharge_summary",
          "prescription",
          "immunization_record",
          "dental_record",
          "genetic_analysis",
          "oncology_report",
          "cardiology_report",
          "radiology_report",
        ],
      },

      // Core Medical Sections (Always Analyze)
      hasSummary: {
        type: "boolean",
        description: "Does the document contain summary or findings section?",
      },
      hasDiagnosis: {
        type: "boolean",
        description:
          "Does the document contain diagnostic information? Look for: diagnosis statements, medical conditions, disease names, ICD codes, primary/secondary diagnoses, clinical impressions, working diagnoses, differential diagnoses, final diagnoses, or conclusive medical assessments. Examples: 'Diagnosis: Hypertension', 'R50.9 Fever unspecified', 'Acute appendicitis', 'Clinical impression: pneumonia'.",
      },
      hasBodyParts: {
        type: "boolean",
        description:
          "Does the document reference specific body parts, anatomy, or organ systems?",
      },
      hasPerformer: {
        type: "boolean",
        description:
          "Does the document identify healthcare providers, physicians, or medical staff?",
      },
      hasPatient: {
        type: "boolean",
        description:
          "Does the document contain patient information, demographics, or patient identifiers?",
      },
      hasRecommendations: {
        type: "boolean",
        description:
          "Does the document contain recommendations, follow-up instructions, or care plans?",
      },

      // Measurements and Data Sections
      hasSignals: {
        type: "boolean",
        description:
          "Does the document contain vital signs, lab values, measurements, or quantitative data? Look for: laboratory test results (any language), result tables showing test name / value / reference range / unit, blood counts, chemistry panels (biochemistry, hematology, immunology, endocrinology), urine analysis, blood pressure, heart rate, temperature, numerical values with medical units (mmol/l, g/l, mg/dl, ukat/l, nmol/l, 10^9/l, etc.). Set TRUE for any standard laboratory report showing test results with reference ranges.",
      },
      hasPrescriptions: {
        type: "boolean",
        description:
          "Does the document contain NEW prescriptions being issued? Look for: prescription documents, newly prescribed medications, dosage instructions for new medications (1-0-1, twice daily), drug brand names being prescribed, pharmaceutical prescriptions, medication recommendations from current visit, 'Take as directed', 'Dispense #30', refill information, etc.",
      },
      hasImmunizations: {
        type: "boolean",
        description:
          "Does the document contain vaccination records or immunization information?",
      },

      // Medical Specialty Sections
      hasImaging: {
        type: "boolean",
        description:
          "Does the document contain imaging studies or references to them? Look for: CT (computed tomography), MRI (magnetic resonance imaging), X-ray/RTG, PET scan, ultrasound/sonography/USG, scintigraphy, DEXA scan, mammography, fluoroscopy, angiography, or any radiology/nuclear medicine study — whether ordered, performed, or referenced. 'CT břicha' (Czech: abdominal CT), 'Röntgen' (German: X-ray).",
      },
      hasDental: {
        type: "boolean",
        description:
          "Does the document contain dental examination or oral health information?",
      },
      hasAdmission: {
        type: "boolean",
        description:
          "Does the document contain hospital admission or discharge information? Look for: admission date, discharge date, hospital ward/department, length of stay, discharge diagnosis, DRG codes, discharge condition, readmission risk, discharge instructions, inpatient stay details, 'propuštěn' (Czech: discharged), 'Entlassung' (German: discharge), hospital name with dates.",
      },
      hasProcedures: {
        type: "boolean",
        description:
          "Does the document contain surgical or medical procedures? Look for: surgery descriptions, endoscopic procedures, biopsies, treatments performed, operative reports, procedure codes (CPT), surgical techniques, medical interventions, etc.",
      },
      hasAnesthesia: {
        type: "boolean",
        description:
          "Does the document contain anesthesia information or monitoring?",
      },
      hasSpecimens: {
        type: "boolean",
        description:
          "Does the document contain specimen collection or tissue sample information? Look for: biopsy specimen details, blood/urine/tissue sample IDs, specimen collection site/date, sample processing notes, fixation type (formalin), gross specimen description before sectioning, 'vzorek' (Czech: sample), 'Probe/Biopsie' (German).",
      },
      hasMicroscopic: {
        type: "boolean",
        description:
          "Does the document contain microscopic examination or histopathology findings? Look for: microscopic description of tissue sections, cell morphology (pleomorphism, mitotic figures), histological grading, 'microscopic:', H&E staining findings, histopathological diagnosis, Gleason score, Bloom-Richardson grade, 'mikroskopický nález' (Czech), 'mikroskopischer Befund' (German).",
      },
      hasMolecular: {
        type: "boolean",
        description:
          "Does the document contain molecular, genetic, or biomarker analysis? Look for: gene mutation results (BRCA1/2, KRAS, EGFR, TP53), next-generation sequencing (NGS) panels, PCR results, chromosomal analysis, microsatellite instability (MSI), tumor mutational burden (TMB), pharmacogenomics, flow cytometry immunophenotyping, molecular diagnostics, 'genetická analýza' (Czech), 'Molekulardiagnostik' (German).",
      },
      hasECG: {
        type: "boolean",
        description:
          "Does the document contain electrocardiogram or heart rhythm analysis?",
      },
      hasEcho: {
        type: "boolean",
        description:
          "Does the document contain echocardiogram or cardiac ultrasound findings?",
      },
      hasTriage: {
        type: "boolean",
        description:
          "Does the document contain emergency triage or acuity assessment? Look for: triage category/level (1-5, immediate/urgent/delayed), emergency department visit, chief complaint on arrival, vital signs at triage, Manchester Triage System scores, ESI levels, 'urgentní příjem' (Czech), 'Notaufnahme' (German: emergency admission), FAST exam, trauma assessment.",
      },
      hasTreatments: {
        type: "boolean",
        description:
          "Does the document describe treatments that were ALREADY PERFORMED or are currently ongoing? Look for: completed procedures, administered medications/infusions, performed interventions, ongoing therapy descriptions, 'patient received', 'was treated with', rehabilitation in progress, 'léčen' (Czech: treated), 'behandelt' (German: treated). NOTE: For planned future treatments (chemotherapy schedules, radiation plans), use hasTreatmentPlan instead.",
      },
      hasAssessment: {
        type: "boolean",
        description:
          "Does the document contain a specialist's clinical assessment or structured evaluation? Look for: specialist examination findings, clinical judgment sections, assessment of patient's condition, scoring systems (GCS, APACHE, SOFA, PHQ-9), functional assessment, specialist opinion/conclusion, 'závěr' (Czech: conclusion/assessment), 'Beurteilung' (German: assessment). NOTE: hasSummary is for overall document summaries; hasAssessment is for structured clinical evaluation by a specialist.",
      },

      // Enhanced Medical Specialty Sections
      hasTumorCharacteristics: {
        type: "boolean",
        description:
          "Does the document contain tumor staging, grading, or cancer characteristics?",
      },
      hasTreatmentPlan: {
        type: "boolean",
        description:
          "Does the document contain a PLANNED/FUTURE structured treatment plan? Look for: scheduled chemotherapy cycles, radiation therapy planning, planned surgical interventions, future medication schedules, oncology treatment protocols, rehabilitation plans, 'plan:', 'doporučujeme' (Czech: we recommend), treatment timeline/schedule. NOTE: For treatments already performed/ongoing, use hasTreatments instead.",
      },
      hasTreatmentResponse: {
        type: "boolean",
        description:
          "Does the document contain treatment response assessment (RECIST, etc.)?",
      },
      hasImagingFindings: {
        type: "boolean",
        description:
          "Does the document contain DETAILED radiology findings with measurements or descriptions (not just a reference to an imaging study)? Look for: radiologist's written report with organ descriptions, lesion sizes in mm/cm, Hounsfield units, signal intensity descriptions, RECIST measurements, 'nález:' (Czech: findings), detailed descriptive text from CT/MRI/ultrasound reports. NOTE: hasImaging=true for documents that ORDER or reference imaging; hasImagingFindings=true for the actual radiologist report text.",
      },
      hasGrossFindings: {
        type: "boolean",
        description:
          "Does the document contain gross pathological examination findings?",
      },
      hasSpecialStains: {
        type: "boolean",
        description:
          "Does the document contain special stains or immunohistochemistry results?",
      },
      hasAllergies: {
        type: "boolean",
        description:
          "Does the document contain allergy information or adverse drug reactions? Look for: drug allergies (penicillin, NSAIDs, contrast media), food allergies, allergy list, 'alergie' (Czech), 'Allergie' (German), ADR (adverse drug reaction), hypersensitivity reactions, RAST results, allergy testing, 'no known allergies', contraindications due to allergy.",
      },
      hasMedications: {
        type: "boolean",
        description:
          "Does the document contain CURRENT medications or medication lists? Look for: current medication reconciliation, medication lists, home medications, ongoing medications, medication history, 'Patient takes', 'Currently on', medication compliance information, drug allergies, medication changes, discontinued medications, etc.",
      },
      hasSocialHistory: {
        type: "boolean",
        description:
          "Does the document contain social history or lifestyle risk factors? Look for: smoking status (pack-years, ex-smoker), alcohol consumption, recreational drug use, occupation/work exposure, physical activity level, diet description, family situation, living conditions, 'anamnéza' social section (Czech), 'Sozialanamnese' (German), BMI context, sexual history in relevant specialties.",
      },

      // Medical Context Tags
      medicalSpecialty: {
        type: "array",
        description: "Medical specialties relevant to this document",
        items: {
          type: "string",
          enum: [
            "general_medicine",
            "emergency_medicine",
            "surgery",
            "pathology",
            "radiology",
            "cardiology",
            "oncology",
            "dentistry",
            "genetics",
            "anesthesiology",
            "immunology",
            "dermatology",
            "neurology",
            "psychiatry",
            "orthopedics",
            "urology",
            "gynecology",
            "pediatrics",
          ],
        },
      },

      urgencyLevel: {
        type: "number",
        description:
          "Clinical urgency level (1-5, where 1=routine, 5=critical/emergency)",
        minimum: 1,
        maximum: 5,
      },

      tags: {
        type: "array",
        description:
          "Medical tags and labels from the document. Include anatomical terms, diseases, procedures, medications, and test names in their standard medical terminology (Latin/English).",
        items: {
          type: "string",
        },
      },
    },
    required: [
      "isMedical",
      "language",
      "documentType",
      // Core Medical Sections
      "hasSummary",
      "hasDiagnosis",
      "hasBodyParts",
      "hasPerformer",
      "hasPatient",
      "hasRecommendations",
      // Measurements and Data Sections
      "hasSignals",
      "hasPrescriptions",
      "hasImmunizations",
      // Medical Specialty Sections
      "hasImaging",
      "hasDental",
      "hasAdmission",
      "hasProcedures",
      "hasAnesthesia",
      "hasSpecimens",
      "hasMicroscopic",
      "hasMolecular",
      "hasECG",
      "hasEcho",
      "hasTriage",
      "hasTreatments",
      "hasAssessment",
      // Enhanced Medical Specialty Sections
      "hasTumorCharacteristics",
      "hasTreatmentPlan",
      "hasTreatmentResponse",
      "hasImagingFindings",
      "hasGrossFindings",
      "hasSpecialStains",
      "hasAllergies",
      "hasMedications",
      "hasSocialHistory",
      // Medical Context
      "medicalSpecialty",
      "urgencyLevel",
      "tags",
    ],
  },
} as FunctionDefinition;
