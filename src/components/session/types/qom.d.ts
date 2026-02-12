// QOM Visualization Type Definitions
// Based on AI_SESSION_QOM.md specification

import type {
  SymptomNode,
  DiagnosisNode,
  TreatmentNode,
  ActionNode,
} from "./visualization";

// Universal Expert Interface (from spec)
export interface UniversalExpertNode {
  // Input Interface
  inputs: {
    transcript: string;
    patientContext: any; // PatientContext type from medical config
    previousAnalysis?: MedicalAnalysisOutput;
    triggerConditions?: string[];
  };

  // Decision Logic
  decision: "complete_analysis" | "trigger_sub_experts";

  // Output Interface (when complete_analysis)
  outputs?: MedicalAnalysisOutput;

  // Sub-Expert Triggering (when trigger_sub_experts)
  triggers?: {
    subExperts: string[];
    triggerConditions: string[];
    enrichedContext: any;
  };
}

// Medical Analysis Output (unified schema)
export interface MedicalAnalysisOutput {
  symptoms: SymptomNode[];
  diagnoses: DiagnosisNode[];
  treatments: TreatmentNode[];
  questions: ActionNode[]; // Questions are ActionNodes with actionType='question'
  confidence: number;
  reasoning: string;
  expertId: string;
  layer: number;
}

// QOM Node for visualization
export interface QOMNode {
  id: string;
  name: string;
  type:
    | "input"
    | "detector"
    | "primary"
    | "specialist"
    | "sub-specialist"
    | "functional"
    | "merger"
    | "safety"
    | "consensus"
    | "output";
  category: string; // e.g., 'cardiology', 'emergency', 'safety'
  layer: number; // 0=primary, 1=specialist, 2=sub-specialist, etc.
  parent?: string; // Parent expert ID
  children: string[]; // Child expert IDs

  // Execution state
  state: "pending" | "running" | "completed" | "failed" | "skipped";
  progress?: number; // 0-100

  // Model configuration
  provider: string;
  model: string;
  fallbackChain?: string[];

  // Triggering logic
  triggerConditions?: string[];
  triggerThreshold?: number;
  triggered?: boolean;

  // Results
  output?: MedicalAnalysisOutput;
  error?: string;

  // Metrics
  startTime?: number;
  endTime?: number;
  duration?: number;
  cost?: number;
  tokenUsage?: {
    input: number;
    output: number;
  };

  // Visual properties (computed)
  x?: number;
  y?: number;
  fx?: number; // Fixed x position (for completed nodes)
  fy?: number; // Fixed y position
  vx?: number; // Velocity x (for force simulation)
  vy?: number; // Velocity y
  radius?: number;
  color?: string;
}

// QOM Link for relationships
export interface QOMLink {
  id: string;
  source: string | QOMNode;
  target: string | QOMNode;
  type:
    | "data_flow"
    | "analysis_input"
    | "safety_input"
    | "bypass_flow"
    | "triggers"
    | "refines"
    | "contributes"
    | "merges";
  direction: "forward" | "reverse" | "bidirectional";
  strength: number; // 0.0-1.0
  active: boolean;

  // Visual properties
  animated?: boolean;
  particleDirection?: "forward" | "reverse" | "both";
  color?: string;
  width?: number;
  dashArray?: string;
}

// QOM Execution State
export interface QOMExecutionState {
  sessionId: string;
  qomModelId: string;
  status: "idle" | "initializing" | "running" | "completed" | "failed";
  currentLayer: number;
  activeNodes: string[];
  completedNodes: string[];
  failedNodes: string[];

  // Metrics
  totalNodes: number;
  totalCost: number;
  totalDuration: number;
  successRate: number;
}

// SSE Event Types for QOM
export type QOMEvent =
  | QOMInitializedEvent
  | NodeStartedEvent
  | NodeProgressEvent
  | NodeCompletedEvent
  | NodeFailedEvent
  | ExpertTriggeredEvent
  | RelationshipAddedEvent
  | ModelSwitchedEvent
  | QOMCompletedEvent;

export interface QOMInitializedEvent {
  type: "qom_initialized";
  qomModelId: string;
  nodes: QOMNode[];
  links: QOMLink[];
  timestamp: number;
}

export interface NodeStartedEvent {
  type: "node_started";
  nodeId: string;
  nodeName: string;
  model: string;
  provider: string;
  timestamp: number;
}

export interface NodeProgressEvent {
  type: "node_progress";
  nodeId: string;
  progress: number; // 0-100
  message?: string;
}

export interface NodeCompletedEvent {
  type: "node_completed";
  nodeId: string;
  duration: number;
  cost: number;
  tokenUsage?: {
    input: number;
    output: number;
  };
  output?: MedicalAnalysisOutput;
}

export interface NodeFailedEvent {
  type: "node_failed";
  nodeId: string;
  error: string;
  willRetry: boolean;
  fallbackModel?: string;
}

export interface ExpertTriggeredEvent {
  type: "expert_triggered";
  parentId: string;
  expertId: string;
  expertName: string;
  triggerConditions: string[];
  layer: number;
}

export interface RelationshipAddedEvent {
  type: "relationship_added";
  linkId: string;
  sourceId: string;
  targetId: string;
  relationshipType: string;
  direction: "forward" | "reverse" | "bidirectional";
}

export interface ModelSwitchedEvent {
  type: "model_switched";
  nodeId: string;
  fromModel: string;
  toModel: string;
  reason: string;
}

export interface QOMCompletedEvent {
  type: "qom_completed";
  totalDuration: number;
  totalCost: number;
  nodeCount: number;
  successCount: number;
  failureCount: number;
  finalOutput: MedicalAnalysisOutput;
}

// Expert Template Configuration
export interface ExpertTemplate {
  type: "primary" | "specialist" | "functional" | "merger";
  execution:
    | "always_active"
    | "trigger_based"
    | "conditional"
    | "after_layer_complete";
  outputs: string[];
  decisionLogic: string;
  modelConfig: {
    provider: string;
    model: string;
    temperature: number;
    maxTokens: number;
    timeoutMs: number;
  };
}

// QOM Model Configuration
export interface QOMModelConfig {
  id: string;
  description: string;
  layers: Map<string, ExpertLayer>;
  dependencies: Map<string, string[]>;
  consensusStrategy: ConsensusStrategy;
}

export interface ExpertLayer {
  id: string;
  name: string;
  experts: QOMNode[];
  executionType: "parallel" | "sequential";
}

export interface ConsensusStrategy {
  type: "weighted" | "majority" | "unanimous";
  weights?: Map<string, number>;
  conflictThreshold: number;
  agreementBoost: number;
}

// Consensus and Conflict types
export interface ConsensusResult {
  unifiedAnalysis: MedicalAnalysisOutput;
  consensusItems: ConsensusItem[];
  conflictAlerts: ConflictAlert[];
  participatingExperts: string[];
  agreementScore: number;
}

export interface ConsensusItem {
  type: "symptom" | "diagnosis" | "treatment" | "question";
  item: any;
  supportingExperts: string[];
  confidence: number;
}

export interface ConflictAlert {
  type:
    | "diagnosis_conflict"
    | "treatment_conflict"
    | "question_priority_conflict";
  conflictingExperts: string[];
  conflictingItems: any[];
  severity: "low" | "medium" | "high";
  recommendedAction: string;
}

// D3 Force Simulation types
export interface D3QOMNode extends QOMNode {
  index?: number;
  x: number;
  y: number;
  fx?: number;
  fy?: number;
  vx?: number;
  vy?: number;
}

export interface D3QOMLink extends QOMLink {
  source: D3QOMNode;
  target: D3QOMNode;
  index?: number;
}

// Visualization configuration
export interface QOMVisualizationConfig {
  layout: {
    type: "hierarchical" | "force" | "radial";
    width: number;
    height: number;
    margins: { top: number; right: number; bottom: number; left: number };
    layerSpacing: number;
    nodeSpacing: number;
    panelWidth?: number;
    panelHeight?: number;
  };
  forces: {
    linkStrength: number | ((link: D3QOMLink) => number);
    chargeStrength: number;
    collisionRadius: number | ((node: D3QOMNode) => number);
    centerForce: number;
    layerForce: number;
  };
  animations: {
    duration: number;
    exitDuration: number;
    enterDelay: number;
    particleSpeed: number;
    pulseInterval: number;
  };
  styles: {
    nodes: {
      [state: string]: {
        fill: string;
        stroke: string;
        strokeWidth: number;
        opacity: number;
        radius?: number;
        strokeDasharray?: string;
        glow?: string;
        innerStroke?: string;
        pattern?: string;
      };
    };
    links: {
      [type: string]: {
        stroke: string;
        strokeWidth: number;
        strokeDasharray?: string;
        opacity: number;
        markerEnd?: string;
      };
    };
  };
}
