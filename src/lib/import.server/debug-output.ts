import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { DEBUG_IMPORT } from '$env/static/private';

const DEBUG_ENABLED = DEBUG_IMPORT === 'true';
const DEBUG_DIR = join(process.cwd(), 'test-data');

export interface DebugConfig {
	enabled: boolean;
	includeWorkflowState?: boolean;
	prettyPrint?: boolean;
}

/**
 * Save extraction results to test-data/extractions/
 */
export function saveExtractionResults(
	jobId: string,
	extractionResults: any[],
	config: DebugConfig = { enabled: DEBUG_ENABLED, prettyPrint: true }
): void {
	if (!config.enabled) return;

	try {
		const dir = join(DEBUG_DIR, 'extractions');
		mkdirSync(dir, { recursive: true });

		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const filename = `${jobId}_${timestamp}.json`;
		const filepath = join(dir, filename);

		const data = {
			jobId,
			timestamp: new Date().toISOString(),
			extractionResults,
			metadata: {
				fileCount: extractionResults.length,
				totalPages: extractionResults.reduce((sum, r) => sum + (r.pages?.length || 0), 0),
				totalDocuments: extractionResults.reduce(
					(sum, r) => sum + (r.documents?.length || 0),
					0
				)
			}
		};

		const json = config.prettyPrint ? JSON.stringify(data, null, 2) : JSON.stringify(data);

		writeFileSync(filepath, json, 'utf-8');
		console.log(`📁 [Debug] Saved extraction results to: ${filepath}`);
	} catch (error) {
		console.error(`❌ [Debug] Failed to save extraction results:`, error);
	}
}

/**
 * Save analysis results to test-data/analyses/
 */
export function saveAnalysisResults(
	jobId: string,
	analysisResults: any[],
	config: DebugConfig = { enabled: DEBUG_ENABLED, prettyPrint: true }
): void {
	if (!config.enabled) return;

	try {
		const dir = join(DEBUG_DIR, 'analyses');
		mkdirSync(dir, { recursive: true });

		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const filename = `${jobId}_${timestamp}.json`;
		const filepath = join(dir, filename);

		const data = {
			jobId,
			timestamp: new Date().toISOString(),
			analysisResults,
			metadata: {
				documentCount: analysisResults.length,
				medicalCount: analysisResults.filter((r) => r.isMedical).length,
				hasSignals: analysisResults.filter(
					(r) =>
						r.signals &&
						(Array.isArray(r.signals)
							? r.signals.length > 0
							: Object.keys(r.signals).length > 0)
				).length
			}
		};

		const json = config.prettyPrint ? JSON.stringify(data, null, 2) : JSON.stringify(data);

		writeFileSync(filepath, json, 'utf-8');
		console.log(`📁 [Debug] Saved analysis results to: ${filepath}`);
	} catch (error) {
		console.error(`❌ [Debug] Failed to save analysis results:`, error);
	}
}

/**
 * Save complete workflow state to test-data/workflows/
 */
export function saveCompleteWorkflow(
	jobId: string,
	extractionResults: any[],
	analysisResults: any[],
	workflowState?: any,
	config: DebugConfig = { enabled: DEBUG_ENABLED, prettyPrint: true }
): void {
	if (!config.enabled) return;

	try {
		const dir = join(DEBUG_DIR, 'workflows');
		mkdirSync(dir, { recursive: true });

		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const filename = `${jobId}_complete_${timestamp}.json`;
		const filepath = join(dir, filename);

		const data = {
			jobId,
			timestamp: new Date().toISOString(),
			extractionResults,
			analysisResults,
			...(config.includeWorkflowState && workflowState ? { workflowState } : {}),
			metadata: {
				extractionCount: extractionResults.length,
				analysisCount: analysisResults.length,
				totalPages: extractionResults.reduce((sum, r) => sum + (r.pages?.length || 0), 0),
				medicalDocuments: analysisResults.filter((r) => r.isMedical).length
			}
		};

		const json = config.prettyPrint ? JSON.stringify(data, null, 2) : JSON.stringify(data);

		writeFileSync(filepath, json, 'utf-8');
		console.log(`📁 [Debug] Saved complete workflow to: ${filepath}`);
	} catch (error) {
		console.error(`❌ [Debug] Failed to save complete workflow:`, error);
	}
}

/**
 * Save individual document workflow result
 */
export function saveDocumentWorkflow(
	jobId: string,
	documentIndex: number,
	workflowResult: any,
	config: DebugConfig = { enabled: DEBUG_ENABLED, prettyPrint: true }
): void {
	if (!config.enabled) return;

	try {
		const dir = join(DEBUG_DIR, 'workflows', 'documents');
		mkdirSync(dir, { recursive: true });

		const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		const filename = `${jobId}_doc${documentIndex}_${timestamp}.json`;
		const filepath = join(dir, filename);

		const data = {
			jobId,
			documentIndex,
			timestamp: new Date().toISOString(),
			workflowResult
		};

		const json = config.prettyPrint ? JSON.stringify(data, null, 2) : JSON.stringify(data);

		writeFileSync(filepath, json, 'utf-8');
		console.log(`📁 [Debug] Saved document ${documentIndex} workflow to: ${filepath}`);
	} catch (error) {
		console.error(`❌ [Debug] Failed to save document workflow:`, error);
	}
}

/**
 * Save individual LangGraph node result
 * Saves to: test-data/workflows/nodes/[timestamp]-[jobId]/[nodeName].json
 */
export function saveNodeResult(
	jobId: string,
	nodeName: string,
	nodeOutput: any,
	timestamp?: string,
	config: DebugConfig = { enabled: DEBUG_ENABLED, prettyPrint: true }
): void {
	if (!config.enabled) return;

	try {
		// Use provided timestamp or generate new one
		const ts = timestamp || new Date().toISOString().replace(/[:.]/g, '-');

		// Create directory: test-data/workflows/nodes/[timestamp]-[jobId]/
		const dir = join(DEBUG_DIR, 'workflows', 'nodes', `${ts}-${jobId}`);
		mkdirSync(dir, { recursive: true });

		// Save as [nodeName].json
		const filename = `${nodeName}.json`;
		const filepath = join(dir, filename);

		const data = {
			jobId,
			nodeName,
			timestamp: new Date().toISOString(),
			output: nodeOutput
		};

		const json = config.prettyPrint ? JSON.stringify(data, null, 2) : JSON.stringify(data);

		writeFileSync(filepath, json, 'utf-8');
		console.log(`📁 [Debug] Saved ${nodeName} node result to: ${filepath}`);
	} catch (error) {
		console.error(`❌ [Debug] Failed to save ${nodeName} node result:`, error);
	}
}
