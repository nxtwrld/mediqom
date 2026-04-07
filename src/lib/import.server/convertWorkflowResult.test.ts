import { describe, it, expect } from 'vitest';
import { convertWorkflowResult } from './convertWorkflowResult';

describe('convertWorkflowResult', () => {
  // ─── 1. Structured data path ───────────────────────────────────────

  describe('structured data path (workflowResult.report is object)', () => {
    it('passes through title, summary, recommendations from report', () => {
      const result = convertWorkflowResult({
        report: {
          type: 'laboratory',
          category: 'laboratory',
          title: 'Blood Panel',
          summary: 'Normal results',
          recommendations: ['Follow up in 6 months'],
        },
        title: 'Blood Panel',
        summary: 'Normal results',
        recommendations: ['Follow up in 6 months'],
      });

      expect(result.title).toBe('Blood Panel');
      expect(result.summary).toBe('Normal results');
      expect(result.recommendations).toEqual(['Follow up in 6 months']);
    });

    it('derives category from featureDetection documentType when available', () => {
      const result = convertWorkflowResult({
        report: { category: 'report' },
        featureDetectionResults: { documentType: 'laboratory_results' },
      });

      expect(result.category).toBe('laboratory');
    });

    it('uses report category when featureDetection is absent', () => {
      const result = convertWorkflowResult({
        report: { category: 'imaging' },
      });

      expect(result.category).toBe('imaging');
    });

    it('maps imaging_report to imaging category', () => {
      const result = convertWorkflowResult({
        report: { category: 'report' },
        featureDetectionResults: { documentType: 'imaging_report' },
      });

      expect(result.category).toBe('imaging');
    });

    it('maps prescription documentType to prescription category', () => {
      const result = convertWorkflowResult({
        report: {},
        featureDetectionResults: { documentType: 'prescription' },
      });

      expect(result.category).toBe('prescription');
    });

    it('reads isMedical from report', () => {
      const result = convertWorkflowResult({
        report: { isMedical: false },
      });

      expect(result.isMedical).toBe(false);
    });

    it('defaults isMedical to true when not specified in report', () => {
      const result = convertWorkflowResult({
        report: {},
      });

      expect(result.isMedical).toBe(true);
    });
  });

  // ─── 2. Legacy path ────────────────────────────────────────────────

  describe('legacy path (no workflowResult.report)', () => {
    it('falls back to medicalAnalysis.content', () => {
      const result = convertWorkflowResult({
        medicalAnalysis: {
          content: {
            type: 'dental',
            category: 'dental',
            title: 'Dental checkup',
            text: 'All clear',
            report: { dental: { teeth: [] } },
          },
        },
      });

      expect(result.type).toBe('dental');
      expect(result.category).toBe('dental');
      expect(result.title).toBe('Dental checkup');
      expect(result.text).toBe('All clear');
    });

    it('falls back to workflowResult.content when medicalAnalysis is absent', () => {
      const result = convertWorkflowResult({
        content: {
          type: 'imaging',
          category: 'imaging',
          summary: 'MRI scan',
          report: {},
        },
      });

      expect(result.type).toBe('imaging');
      expect(result.summary).toBe('MRI scan');
    });

    it('produces graceful defaults for empty workflowResult', () => {
      const result = convertWorkflowResult({});

      expect(result.type).toBe('report');
      expect(result.fhirType).toBe('DiagnosticReport');
      expect(result.category).toBe('report');
      expect(result.isMedical).toBe(true);
      expect(result.tags).toEqual([]);
      expect(result.hasPrescription).toBe(false);
      expect(result.hasImmunization).toBe(false);
      expect(result.hasLabOrVitals).toBe(false);
      expect(result.content).toBe('');
      expect(result.text).toBe('');
      expect(result.tokenUsage).toEqual({ total: 0 });
    });
  });

  // ─── 3. Specialized sections merge ─────────────────────────────────

  describe('specialized sections merge', () => {
    it('merges bodyParts, diagnosis, procedures, medications into report', () => {
      const result = convertWorkflowResult({
        report: { type: 'report' },
        bodyParts: [{ identification: 'heart', status: 'normal' }],
        diagnosis: [{ code: 'J06', description: 'URI' }],
        procedures: [{ name: 'Blood draw' }],
        medications: [{ name: 'Ibuprofen' }],
      });

      expect(result.report.bodyParts).toEqual([{ identification: 'heart', status: 'normal' }]);
      expect(result.report.diagnosis).toEqual([{ code: 'J06', description: 'URI' }]);
      expect(result.report.procedures).toEqual([{ name: 'Blood draw' }]);
      expect(result.report.medications).toEqual([{ name: 'Ibuprofen' }]);
    });

    it('does not add absent sections to report', () => {
      const result = convertWorkflowResult({
        report: { type: 'report' },
        diagnosis: [{ code: 'A01' }],
      });

      expect(result.report.diagnosis).toBeDefined();
      expect(result.report.procedures).toBeUndefined();
      expect(result.report.medications).toBeUndefined();
      expect(result.report.imaging).toBeUndefined();
    });

    it('merges all recognized specialized sections', () => {
      const allSections = [
        'diagnosis', 'performer', 'patient', 'bodyParts', 'signals', 'ecg', 'echo',
        'allergies', 'anesthesia', 'microscopic', 'triage', 'immunizations', 'specimens',
        'admission', 'dental', 'tumorCharacteristics', 'treatmentPlan', 'treatmentResponse',
        'imagingFindings', 'grossFindings', 'specialStains', 'socialHistory', 'treatments',
        'assessment', 'molecular', 'medications', 'procedures', 'imaging',
      ];

      const input: any = { report: {} };
      for (const s of allSections) {
        input[s] = { [s]: `${s}-data` };
      }

      const result = convertWorkflowResult(input);

      for (const s of allSections) {
        expect(result.report[s]).toBeDefined();
      }
    });
  });

  // ─── 4. Body part normalization ────────────────────────────────────

  describe('body part normalization', () => {
    it('normalizes "femur" to "femur_left" via alias', () => {
      const result = convertWorkflowResult({
        report: {},
        bodyParts: [{ identification: 'femur' }],
      });

      expect(result.report.bodyParts[0].identification).toBe('femur_left');
    });

    it('keeps "L_humerus" as-is because it is a valid 3D object', () => {
      const result = convertWorkflowResult({
        report: {},
        bodyParts: [{ identification: 'L_humerus' }],
      });

      expect(result.report.bodyParts[0].identification).toBe('L_humerus');
    });

    it('normalizes "mandible" to "jaw_bone"', () => {
      const result = convertWorkflowResult({
        report: {},
        bodyParts: [{ identification: 'mandible' }],
      });

      expect(result.report.bodyParts[0].identification).toBe('jaw_bone');
    });

    it('normalizes "cranium" to "skull"', () => {
      const result = convertWorkflowResult({
        report: {},
        bodyParts: [{ identification: 'cranium' }],
      });

      expect(result.report.bodyParts[0].identification).toBe('skull');
    });

    it('leaves unknown IDs as-is', () => {
      const result = convertWorkflowResult({
        report: {},
        bodyParts: [{ identification: 'some_unknown_part' }],
      });

      expect(result.report.bodyParts[0].identification).toBe('some_unknown_part');
    });

    it('normalizes case-insensitively', () => {
      const result = convertWorkflowResult({
        report: {},
        bodyParts: [{ identification: 'MANDIBLE' }],
      });

      expect(result.report.bodyParts[0].identification).toBe('jaw_bone');
    });
  });

  // ─── 5. Tags derivation ───────────────────────────────────────────

  describe('tags derivation', () => {
    it('derives tags from body part identifications', () => {
      const result = convertWorkflowResult({
        report: {},
        bodyParts: [
          { identification: 'heart' },
          { identification: 'lungs' },
        ],
      });

      expect(result.tags).toContain('heart');
      expect(result.tags).toContain('lungs');
    });

    it('deduplicates tags', () => {
      const result = convertWorkflowResult({
        report: {},
        tags: ['heart'],
        bodyParts: [
          { identification: 'heart' },
          { identification: 'heart' },
        ],
      });

      const heartCount = result.tags.filter((t: string) => t === 'heart').length;
      expect(heartCount).toBe(1);
    });

    it('preserves existing tags alongside body part tags', () => {
      const result = convertWorkflowResult({
        report: {},
        tags: ['urgent', 'followup'],
        bodyParts: [{ identification: 'heart' }],
      });

      expect(result.tags).toContain('urgent');
      expect(result.tags).toContain('followup');
      expect(result.tags).toContain('heart');
    });

    it('handles body parts with empty/missing identification', () => {
      const result = convertWorkflowResult({
        report: {},
        bodyParts: [
          { identification: '' },
          { identification: 'heart' },
          { status: 'normal' }, // no identification field
        ],
      });

      expect(result.tags).toEqual(['heart']);
    });
  });

  // ─── 6. Signals extraction ────────────────────────────────────────

  describe('signals extraction', () => {
    it('extracts direct array signals', () => {
      const signals = [
        { name: 'Heart Rate', value: 72, unit: 'bpm' },
        { name: 'Blood Pressure', value: '120/80', unit: 'mmHg' },
      ];

      const result = convertWorkflowResult({
        report: {},
        signals,
      });

      expect(result.signals).toEqual(signals);
    });

    it('unwraps double-wrapped signals (signals.signals)', () => {
      const innerSignals = [{ name: 'Temp', value: 37, unit: 'C' }];

      const result = convertWorkflowResult({
        report: {},
        signals: { signals: innerSignals },
      });

      expect(result.signals).toEqual(innerSignals);
    });

    it('sets hasLabOrVitals when signals array is non-empty', () => {
      const result = convertWorkflowResult({
        report: {},
        signals: [{ name: 'HR', value: 80 }],
      });

      expect(result.hasLabOrVitals).toBe(true);
    });

    it('does not set hasLabOrVitals for empty signals array', () => {
      const result = convertWorkflowResult({
        report: {},
        signals: [],
      });

      expect(result.hasLabOrVitals).toBe(false);
    });

    it('sets hasLabOrVitals from featureDetectionResults.hasSignals', () => {
      const result = convertWorkflowResult({
        report: {},
        featureDetectionResults: { hasSignals: true },
      });

      expect(result.hasLabOrVitals).toBe(true);
    });
  });

  // ─── 7. Metadata stripping ────────────────────────────────────────

  describe('metadata stripping', () => {
    it('removes processingConfidence, documentContext, processingNotes from sections', () => {
      const result = convertWorkflowResult({
        report: {},
        diagnosis: [
          {
            code: 'J06',
            description: 'URI',
            processingConfidence: 0.95,
            documentContext: 'page 1',
            processingNotes: 'extracted via GPT-4',
          },
        ],
      });

      const diag = result.report.diagnosis[0];
      expect(diag.code).toBe('J06');
      expect(diag.description).toBe('URI');
      expect(diag.processingConfidence).toBeUndefined();
      expect(diag.documentContext).toBeUndefined();
      expect(diag.processingNotes).toBeUndefined();
    });

    it('unwraps double-nested section data when key matches section name', () => {
      // When a section like "diagnosis" has shape { diagnosis: [...] },
      // stripProcessingMetadata with sectionKey="diagnosis" should unwrap it
      const inner = [{ code: 'A01' }, { code: 'B02' }];

      const result = convertWorkflowResult({
        report: {},
        diagnosis: { diagnosis: inner },
      });

      expect(result.report.diagnosis).toEqual(inner);
    });

    it('does not unwrap when there are additional keys besides the section key', () => {
      const result = convertWorkflowResult({
        report: {},
        diagnosis: {
          diagnosis: [{ code: 'A01' }],
          extraField: 'keep this',
        },
      });

      // Should NOT unwrap because there's more than just the section key
      expect(result.report.diagnosis).toHaveProperty('diagnosis');
      expect(result.report.diagnosis).toHaveProperty('extraField');
      // But metadata should still be stripped
      expect(result.report.diagnosis.processingConfidence).toBeUndefined();
    });

    it('strips metadata from nested objects recursively', () => {
      const result = convertWorkflowResult({
        report: {},
        procedures: [
          {
            name: 'Biopsy',
            details: {
              site: 'liver',
              processingConfidence: 0.9,
              documentContext: 'from table',
            },
          },
        ],
      });

      // The top-level array item gets stripped
      const proc = result.report.procedures[0];
      expect(proc.processingConfidence).toBeUndefined();
      // Note: details is a nested object within an array item - stripped at array item level
    });
  });

  // ─── 8. Edge cases ────────────────────────────────────────────────

  describe('edge cases', () => {
    it('uses fallbackText when content is missing', () => {
      const result = convertWorkflowResult({}, 'Fallback text here');

      expect(result.content).toBe('Fallback text here');
      expect(result.text).toBe('Fallback text here');
    });

    it('handles array reportBase as legacy format', () => {
      const result = convertWorkflowResult({
        report: [{ section: 'findings', text: 'Normal' }],
      });

      // Array report is not treated as structured data (useStructuredData = false)
      // because Array.isArray(workflowResult.report) is true
      expect(result.type).toBe('report');
      expect(result.isMedical).toBe(true);
    });

    it('prefers workflowResult.tokenUsage over nested tokenUsage', () => {
      const result = convertWorkflowResult({
        report: {},
        tokenUsage: { total: 500, prompt: 300, completion: 200 },
      });

      expect(result.tokenUsage).toEqual({ total: 500, prompt: 300, completion: 200 });
    });

    it('returns fhir defaults', () => {
      const result = convertWorkflowResult({});

      expect(result.fhir).toEqual({});
      expect(result.fhirType).toBe('DiagnosticReport');
    });

    it('passes through documentType and schemaUsed', () => {
      const result = convertWorkflowResult({
        report: {},
        documentType: 'laboratory_results',
        schemaUsed: 'laboratory_v2',
      });

      expect(result.documentType).toBe('laboratory_results');
      expect(result.schemaUsed).toBe('laboratory_v2');
    });

    it('handles null/undefined gracefully in stripProcessingMetadata', () => {
      const result = convertWorkflowResult({
        report: {},
        diagnosis: null,
      });

      // null is passed through as-is by stripProcessingMetadata
      expect(result.report.diagnosis).toBeNull();
    });

    it('defaults text to empty string when no text and no fallback', () => {
      const result = convertWorkflowResult({});

      expect(result.text).toBe('');
    });
  });
});
