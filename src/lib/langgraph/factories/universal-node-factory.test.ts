import { describe, it, expect } from 'vitest';
import { NODE_CONFIGURATIONS, UniversalNodeFactory } from './universal-node-factory';

/**
 * Known LangGraph state channel names from unified-workflow.ts
 */
const VALID_STATE_CHANNELS = [
	'report',
	'diagnosis',
	'performer',
	'patient',
	'bodyParts',
	'signals',
	'ecg',
	'echo',
	'allergies',
	'medications',
	'procedures',
	'imaging',
	'imagingFindings',
	'anesthesia',
	'microscopic',
	'triage',
	'immunizations',
	'specimens',
	'admission',
	'dental',
	'tumorCharacteristics',
	'treatmentPlan',
	'treatmentResponse',
	'grossFindings',
	'specialStains',
	'socialHistory',
	'treatments',
	'assessment',
	'molecular',
	'medicalTermsGeneration',
];

const allNodeIds = Object.keys(NODE_CONFIGURATIONS);
const allConfigs = Object.values(NODE_CONFIGURATIONS);

describe('NODE_CONFIGURATIONS validation', () => {
	it('has 30 node entries', () => {
		expect(allNodeIds).toHaveLength(30);
	});

	it('every config has a nodeName string', () => {
		for (const config of allConfigs) {
			expect(config.nodeName).toBeDefined();
			expect(typeof config.nodeName).toBe('string');
			expect(config.nodeName.length).toBeGreaterThan(0);
		}
	});

	it('every config has a description string', () => {
		for (const config of allConfigs) {
			expect(config.description).toBeDefined();
			expect(typeof config.description).toBe('string');
			expect(config.description.length).toBeGreaterThan(0);
		}
	});

	it('every config has a schemaPath string', () => {
		for (const config of allConfigs) {
			expect(config).toHaveProperty('schemaPath');
			expect(typeof config.schemaPath).toBe('string');
		}
	});

	it('every config has triggers as a non-empty array of strings', () => {
		for (const config of allConfigs) {
			expect(Array.isArray(config.triggers)).toBe(true);
			expect(config.triggers.length).toBeGreaterThan(0);
			for (const trigger of config.triggers) {
				expect(typeof trigger).toBe('string');
				expect(trigger.length).toBeGreaterThan(0);
			}
		}
	});

	it('every config has a numeric priority >= 1', () => {
		for (const config of allConfigs) {
			expect(typeof config.priority).toBe('number');
			expect(config.priority).toBeGreaterThanOrEqual(1);
		}
	});

	it('every config except medical-terms-generation has a non-empty schemaPath', () => {
		for (const [nodeId, config] of Object.entries(NODE_CONFIGURATIONS)) {
			if (nodeId === 'medical-terms-generation') {
				expect(config.schemaPath).toBe('');
			} else {
				expect(config.schemaPath.length).toBeGreaterThan(0);
			}
		}
	});

	it('all non-empty schemaPath values start with "$lib/configurations/"', () => {
		for (const config of allConfigs) {
			if (config.schemaPath.length > 0) {
				expect(config.schemaPath).toMatch(/^\$lib\/configurations\//);
			}
		}
	});

	it('has no duplicate nodeNames', () => {
		const nodeNames = allConfigs.map((c) => c.nodeName);
		const uniqueNames = new Set(nodeNames);
		expect(uniqueNames.size).toBe(nodeNames.length);
	});

	it('every nodeId matches its config nodeName', () => {
		for (const [nodeId, config] of Object.entries(NODE_CONFIGURATIONS)) {
			expect(config.nodeName).toBe(nodeId);
		}
	});
});

describe('Output mapping validation', () => {
	it('every node with outputMapping has a non-empty reportField', () => {
		for (const config of allConfigs) {
			if (config.outputMapping) {
				expect(typeof config.outputMapping.reportField).toBe('string');
				expect(config.outputMapping.reportField.length).toBeGreaterThan(0);
			}
		}
	});

	it('medical-analysis has reportField "report" and isMainReport true', () => {
		const config = NODE_CONFIGURATIONS['medical-analysis'];
		expect(config.outputMapping).toBeDefined();
		expect(config.outputMapping!.reportField).toBe('report');
		expect(config.outputMapping!.isMainReport).toBe(true);
	});

	it('nodes with unwrapField also have a reportField', () => {
		for (const config of allConfigs) {
			if (config.outputMapping?.unwrapField) {
				expect(config.outputMapping.reportField).toBeDefined();
				expect(config.outputMapping.reportField.length).toBeGreaterThan(0);
			}
		}
	});

	it('all reportField values are valid LangGraph state channel names', () => {
		for (const [nodeId, config] of Object.entries(NODE_CONFIGURATIONS)) {
			if (config.outputMapping?.reportField) {
				expect(
					VALID_STATE_CHANNELS,
					`${nodeId} reportField "${config.outputMapping.reportField}" is not a valid state channel`,
				).toContain(config.outputMapping.reportField);
			}
		}
	});

	it('every node has an outputMapping defined', () => {
		for (const [nodeId, config] of Object.entries(NODE_CONFIGURATIONS)) {
			expect(
				config.outputMapping,
				`${nodeId} is missing outputMapping`,
			).toBeDefined();
		}
	});
});

describe('Factory methods', () => {
	it('createNode returns a function for a valid nodeId', () => {
		const node = UniversalNodeFactory.createNode('medical-analysis');
		expect(typeof node).toBe('function');
	});

	it('createNode throws for an unknown nodeId', () => {
		expect(() => UniversalNodeFactory.createNode('unknown-node')).toThrow(
			'Unknown node configuration: unknown-node',
		);
	});

	it('getNodesByTrigger("isMedical") returns correct set', () => {
		const nodes = UniversalNodeFactory.getNodesByTrigger('isMedical');
		const names = nodes.map((n) => n.nodeName).sort();
		expect(names).toContain('medical-analysis');
		expect(names).toContain('performer-processing');
		expect(names).toContain('patient-processing');
		expect(names).toContain('body-parts-processing');
		expect(names).toContain('medical-terms-generation');
		// Should NOT contain nodes with other triggers
		expect(names).not.toContain('ecg-processing');
		expect(names).not.toContain('procedures-processing');
	});

	it('getNodesByTrigger("hasProcedures") returns procedures-processing', () => {
		const nodes = UniversalNodeFactory.getNodesByTrigger('hasProcedures');
		expect(nodes).toHaveLength(1);
		expect(nodes[0].nodeName).toBe('procedures-processing');
	});

	it('getNodesByPriority(1) returns all priority-1 nodes', () => {
		const nodes = UniversalNodeFactory.getNodesByPriority(1);
		const expectedPriority1 = allConfigs.filter((c) => c.priority === 1);
		expect(nodes).toHaveLength(expectedPriority1.length);
		for (const node of nodes) {
			expect(node.priority).toBe(1);
		}
		const names = nodes.map((n) => n.nodeName);
		expect(names).toContain('medical-analysis');
		expect(names).toContain('diagnosis-processing');
		expect(names).toContain('signal-processing');
	});
});
