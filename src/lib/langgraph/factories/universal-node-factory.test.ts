import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoist mock variables so they are available inside vi.mock() factories
// ---------------------------------------------------------------------------
const { mockProcess } = vi.hoisted(() => {
	return { mockProcess: vi.fn().mockResolvedValue({}) };
});

// Mock the base processing node and all its heavy transitive dependencies
vi.mock('../nodes/_base-processing-node', () => {
	class BaseProcessingNode {
		protected config: any;
		constructor(config: any) {
			this.config = config;
		}
		async process(state: any) {
			return mockProcess(state);
		}
		protected shouldExecute(_state: any) {
			return true;
		}
		protected hasRequiredFields(_data: any): boolean {
			return true;
		}
		protected getSectionName(): string {
			return this.config.nodeName;
		}
	}
	return { BaseProcessingNode };
});

import {
	NODE_CONFIGURATIONS,
	UniversalNodeFactory,
	UniversalProcessingNode,
	type UniversalNodeConfig,
} from './universal-node-factory';

// ---------------------------------------------------------------------------
// Helper – build a minimal UniversalNodeConfig
// ---------------------------------------------------------------------------
function makeConfig(overrides: Partial<UniversalNodeConfig> = {}): UniversalNodeConfig {
	return {
		nodeName: 'test-processing',
		description: 'Test node',
		schemaPath: '$lib/configurations/test',
		triggers: ['hasTest'],
		priority: 1,
		outputMapping: { reportField: 'test' },
		...overrides,
	};
}

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

describe('UniversalNodeFactory static methods', () => {
	describe('getAllConfigurations', () => {
		it('returns the NODE_CONFIGURATIONS object', () => {
			const configs = UniversalNodeFactory.getAllConfigurations();
			expect(configs).toBe(NODE_CONFIGURATIONS);
		});

		it('contains the medical-analysis node', () => {
			expect(UniversalNodeFactory.getAllConfigurations()['medical-analysis']).toBeDefined();
		});
	});

	describe('getConfiguration', () => {
		it('returns config for known node', () => {
			const config = UniversalNodeFactory.getConfiguration('medical-analysis');
			expect(config).toBeDefined();
			expect(config?.nodeName).toBe('medical-analysis');
		});

		it('returns undefined for unknown node', () => {
			expect(UniversalNodeFactory.getConfiguration('nonexistent-node')).toBeUndefined();
		});
	});

	describe('registerNode', () => {
		beforeEach(() => {
			delete (NODE_CONFIGURATIONS as any)['registered-test-node'];
		});

		it('adds a new node configuration', () => {
			const newConfig = makeConfig({ nodeName: 'registered-test-node' });
			UniversalNodeFactory.registerNode('registered-test-node', newConfig);
			expect(NODE_CONFIGURATIONS['registered-test-node']).toBe(newConfig);
		});

		it('overwrites an existing node configuration', () => {
			const config1 = makeConfig({ nodeName: 'registered-test-node', priority: 1 });
			const config2 = makeConfig({ nodeName: 'registered-test-node', priority: 9 });
			UniversalNodeFactory.registerNode('registered-test-node', config1);
			UniversalNodeFactory.registerNode('registered-test-node', config2);
			expect(NODE_CONFIGURATIONS['registered-test-node'].priority).toBe(9);
		});
	});

	describe('getNodesByPriority', () => {
		it('returns nodes with priority 1', () => {
			const nodes = UniversalNodeFactory.getNodesByPriority(1);
			expect(nodes.length).toBeGreaterThan(0);
			nodes.forEach((n) => expect(n.priority).toBe(1));
		});

		it('includes medical-analysis in priority 1 results', () => {
			const names = UniversalNodeFactory.getNodesByPriority(1).map((n) => n.nodeName);
			expect(names).toContain('medical-analysis');
			expect(names).toContain('diagnosis-processing');
			expect(names).toContain('signal-processing');
		});

		it('returns nodes with priority 2', () => {
			const nodes = UniversalNodeFactory.getNodesByPriority(2);
			expect(nodes.length).toBeGreaterThan(0);
			nodes.forEach((n) => expect(n.priority).toBe(2));
		});

		it('returns empty array for priority that does not exist', () => {
			expect(UniversalNodeFactory.getNodesByPriority(999)).toEqual([]);
		});

		it('returns all priority-1 nodes matching the registry', () => {
			const nodes = UniversalNodeFactory.getNodesByPriority(1);
			const expectedCount = allConfigs.filter((c) => c.priority === 1).length;
			expect(nodes).toHaveLength(expectedCount);
		});
	});

	describe('getOutputMapping', () => {
		it('returns output mapping for known node', () => {
			const mapping = UniversalNodeFactory.getOutputMapping('medical-analysis');
			expect(mapping).toBeDefined();
			expect(mapping?.reportField).toBe('report');
			expect(mapping?.isMainReport).toBe(true);
		});

		it('returns undefined for unknown node', () => {
			expect(UniversalNodeFactory.getOutputMapping('nonexistent')).toBeUndefined();
		});
	});

	describe('getAllOutputMappings', () => {
		it('includes known node ids', () => {
			const mappings = UniversalNodeFactory.getAllOutputMappings();
			expect(mappings['medical-analysis']).toBeDefined();
			expect(mappings['diagnosis-processing']).toBeDefined();
		});

		it('all mapping values are defined', () => {
			Object.values(UniversalNodeFactory.getAllOutputMappings()).forEach((m) =>
				expect(m).toBeDefined(),
			);
		});
	});

	describe('getNodesByTrigger', () => {
		it('returns nodes triggered by isMedical', () => {
			const nodes = UniversalNodeFactory.getNodesByTrigger('isMedical');
			expect(nodes.length).toBeGreaterThan(0);
			nodes.forEach((n) => expect(n.triggers).toContain('isMedical'));
		});

		it('contains expected nodes for isMedical trigger', () => {
			const names = UniversalNodeFactory.getNodesByTrigger('isMedical').map((n) => n.nodeName);
			expect(names).toContain('medical-analysis');
			expect(names).toContain('performer-processing');
			expect(names).toContain('patient-processing');
			expect(names).toContain('body-parts-processing');
			expect(names).toContain('medical-terms-generation');
			expect(names).not.toContain('ecg-processing');
			expect(names).not.toContain('procedures-processing');
		});

		it('returns ecg-processing for hasECG trigger', () => {
			const names = UniversalNodeFactory.getNodesByTrigger('hasECG').map((n) => n.nodeName);
			expect(names).toContain('ecg-processing');
		});

		it('returns only procedures-processing for hasProcedures', () => {
			const nodes = UniversalNodeFactory.getNodesByTrigger('hasProcedures');
			expect(nodes).toHaveLength(1);
			expect(nodes[0].nodeName).toBe('procedures-processing');
		});

		it('returns empty array for unknown trigger', () => {
			expect(UniversalNodeFactory.getNodesByTrigger('nonexistentTrigger')).toEqual([]);
		});
	});

	describe('createNode', () => {
		it('throws for unknown node ID', () => {
			expect(() => UniversalNodeFactory.createNode('unknown-node')).toThrow(
				'Unknown node configuration: unknown-node',
			);
		});

		it('returns a function for a known node ID', () => {
			expect(typeof UniversalNodeFactory.createNode('medical-analysis')).toBe('function');
		});

		it('returned function calls process on the node instance', async () => {
			mockProcess.mockResolvedValueOnce({ report: {} });
			const fn = UniversalNodeFactory.createNode('medical-analysis');
			const result = await fn({} as any);
			expect(mockProcess).toHaveBeenCalled();
			expect(result).toEqual({ report: {} });
		});
	});
});

// ---------------------------------------------------------------------------
// UniversalProcessingNode instance methods
// Private methods are accessed via `as any` cast
// ---------------------------------------------------------------------------
describe('UniversalProcessingNode', () => {
	describe('getSectionName', () => {
		it('uses outputMapping.reportField when present', () => {
			const node = new UniversalProcessingNode(
				makeConfig({ nodeName: 'ecg-processing', outputMapping: { reportField: 'ecg' } }),
			) as any;
			expect(node.getSectionName()).toBe('ecg');
		});

		it('falls back to stripping "-processing" from nodeName', () => {
			const node = new UniversalProcessingNode(
				makeConfig({ nodeName: 'custom-processing', outputMapping: undefined }),
			) as any;
			expect(node.getSectionName()).toBe('custom');
		});

		it('uses nodeName as-is when no -processing suffix and no outputMapping', () => {
			const node = new UniversalProcessingNode(
				makeConfig({ nodeName: 'mynode', outputMapping: undefined }),
			) as any;
			expect(node.getSectionName()).toBe('mynode');
		});
	});

	describe('calculateUniversalConfidence', () => {
		let node: any;
		beforeEach(() => {
			node = new UniversalProcessingNode(makeConfig({ triggers: ['hasTest'] })) as any;
		});

		it('returns 0 for null', () => {
			expect(node.calculateUniversalConfidence(null)).toBe(0);
		});

		it('returns 0 for undefined', () => {
			expect(node.calculateUniversalConfidence(undefined)).toBe(0);
		});

		it('returns 0 for empty array', () => {
			expect(node.calculateUniversalConfidence([])).toBe(0);
		});

		it('returns > 0.5 for non-empty array', () => {
			expect(node.calculateUniversalConfidence(['item'])).toBeGreaterThan(0.5);
		});

		it('caps array confidence at 1.0', () => {
			const bigArray = new Array(20).fill('x');
			expect(node.calculateUniversalConfidence(bigArray)).toBeLessThanOrEqual(1.0);
		});

		it('returns 0.5 for a string scalar', () => {
			expect(node.calculateUniversalConfidence('string')).toBe(0.5);
		});

		it('returns 0.5 for a number scalar', () => {
			expect(node.calculateUniversalConfidence(42)).toBe(0.5);
		});

		it('returns 0.5 for empty object (no keys bonus)', () => {
			expect(node.calculateUniversalConfidence({})).toBe(0.5);
		});

		it('increases confidence when trigger field is true', () => {
			const base = node.calculateUniversalConfidence({ someKey: 'x' });
			const withTrigger = node.calculateUniversalConfidence({ hasTest: true, someKey: 'x' });
			expect(withTrigger).toBeGreaterThan(base);
		});

		it('adds confidence for nested object fields', () => {
			const flat = node.calculateUniversalConfidence({ a: 'string' });
			const structured = node.calculateUniversalConfidence({ a: { nested: 1 } });
			expect(structured).toBeGreaterThan(flat);
		});

		it('caps at 1.0 with many structured fields and trigger', () => {
			const data = {
				hasTest: true,
				a: { v: 1 },
				b: { v: 2 },
				c: { v: 3 },
				d: { v: 4 },
				e: 'str',
			};
			expect(node.calculateUniversalConfidence(data)).toBeLessThanOrEqual(1.0);
		});
	});

	describe('hasRequiredFields', () => {
		let node: any;
		beforeEach(() => {
			node = new UniversalProcessingNode(makeConfig({ triggers: ['hasTest'] })) as any;
		});

		it('returns false for null', () => {
			expect(node.hasRequiredFields(null)).toBe(false);
		});

		it('returns false for undefined', () => {
			expect(node.hasRequiredFields(undefined)).toBe(false);
		});

		it('returns false for empty array', () => {
			expect(node.hasRequiredFields([])).toBe(false);
		});

		it('returns true for non-empty array', () => {
			expect(node.hasRequiredFields(['item'])).toBe(true);
		});

		it('returns true for object with matching trigger field true', () => {
			expect(node.hasRequiredFields({ hasTest: true })).toBe(true);
		});

		it('returns true for object with any keys (even without trigger)', () => {
			expect(node.hasRequiredFields({ someOtherKey: 'value' })).toBe(true);
		});
	});

	describe('stripWrapperProperties (private, accessed via any)', () => {
		let node: any;
		beforeEach(() => {
			node = new UniversalProcessingNode(makeConfig()) as any;
		});

		it('removes processingConfidence', () => {
			const result = node.stripWrapperProperties({ processingConfidence: 0.9, field: 'v' });
			expect(result.processingConfidence).toBeUndefined();
			expect(result.field).toBe('v');
		});

		it('removes processingNotes', () => {
			const result = node.stripWrapperProperties({ processingNotes: 'notes', field: 'v' });
			expect(result.processingNotes).toBeUndefined();
			expect(result.field).toBe('v');
		});

		it('removes documentContext', () => {
			const result = node.stripWrapperProperties({ documentContext: { lang: 'en' }, field: 'v' });
			expect(result.documentContext).toBeUndefined();
			expect(result.field).toBe('v');
		});

		it('preserves all unrelated fields', () => {
			const result = node.stripWrapperProperties({ a: 1, b: 'x', c: true });
			expect(result).toEqual({ a: 1, b: 'x', c: true });
		});

		it('returns null unchanged', () => {
			expect(node.stripWrapperProperties(null)).toBeNull();
		});

		it('returns arrays unchanged', () => {
			const arr = [1, 2, 3];
			expect(node.stripWrapperProperties(arr)).toBe(arr);
		});

		it('returns primitive strings unchanged', () => {
			expect(node.stripWrapperProperties('hello')).toBe('hello');
		});
	});

	describe('applyDefaultEnhancement (private, accessed via any)', () => {
		it('returns null for null aiResult', () => {
			const node = new UniversalProcessingNode(makeConfig()) as any;
			expect(node.applyDefaultEnhancement(null)).toBeNull();
		});

		it('returns null for undefined aiResult', () => {
			const node = new UniversalProcessingNode(makeConfig()) as any;
			expect(node.applyDefaultEnhancement(undefined)).toBeNull();
		});

		it('returns empty array for empty array aiResult', () => {
			const node = new UniversalProcessingNode(makeConfig()) as any;
			expect(node.applyDefaultEnhancement([])).toEqual([]);
		});

		it('returns non-empty array as-is', () => {
			const node = new UniversalProcessingNode(makeConfig()) as any;
			expect(node.applyDefaultEnhancement(['a', 'b'])).toEqual(['a', 'b']);
		});

		it('returns null for empty object', () => {
			const node = new UniversalProcessingNode(makeConfig()) as any;
			expect(node.applyDefaultEnhancement({})).toBeNull();
		});

		it('unwraps field when unwrapField is set and present in result', () => {
			const node = new UniversalProcessingNode(
				makeConfig({ outputMapping: { reportField: 'patient', unwrapField: 'patient' } }),
			) as any;
			const aiResult = { patient: { name: 'John' }, extra: 'ignored' };
			expect(node.applyDefaultEnhancement(aiResult)).toEqual({ name: 'John' });
		});

		it('strips wrapper properties when no unwrapField matches', () => {
			const node = new UniversalProcessingNode(makeConfig()) as any;
			const aiResult = {
				processingConfidence: 0.9,
				processingNotes: 'notes',
				data: 'value',
			};
			const result = node.applyDefaultEnhancement(aiResult);
			expect(result.processingConfidence).toBeUndefined();
			expect(result.data).toBe('value');
		});
	});
});
