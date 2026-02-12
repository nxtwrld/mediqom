// Type definitions for MoE Session Visualization

// Main session analysis structure (matches our unified schema)
export interface SessionAnalysis {
  sessionId: string;
  timestamp: string;
  analysisVersion: number;
  nodes: {
    symptoms?: SymptomNode[];
    diagnoses?: DiagnosisNode[];
    treatments?: TreatmentNode[];
    actions?: ActionNode[];
  };
  userActions?: UserAction[];
}

// Node types from our unified schema
export interface SymptomNode {
  id: string;
  text: string;
  severity: number; // 1-10 scale
  duration?: number;
  confidence: number;
  source:
    | "transcript"
    | "medical_history"
    | "family_history"
    | "social_history"
    | "medication_history"
    | "suspected";
  quote?: string;
  fromQuestion?: string;
  characteristics?: string[];
  suggestedBy?: string;
  relevance?: number;
  documentId?: string;
  relationships?: Relationship[];
}

export interface DiagnosisNode {
  id: string;
  name: string;
  probability: number;
  priority: number; // 1-10 scale
  icd10?: string;
  reasoning: string;
  confidence: number;
  requiresInvestigation?: boolean;
  suppressed?: boolean;
  suppressionReason?: string;
  redFlags?: string[];
  subtype?: string;
  relationships?: Relationship[];
}

export interface TreatmentNode {
  id: string;
  type:
    | "medication"
    | "procedure"
    | "therapy"
    | "lifestyle"
    | "investigation"
    | "immediate"
    | "referral";
  name: string;
  dosage?: string;
  priority: number; // 1-10 scale
  confidence: number;
  effectiveness?: number;
  historicalEffectiveness?: number;
  description?: string;
  urgency?: "immediate" | "urgent" | "routine";
  reasoning?: string;
  duration?: string;
  requiresFollowUp?: boolean;
  mechanism?: string;
  contraindications?: string[];
  sideEffects?: string[];
  relationships?: Relationship[];
}

export interface ActionNode {
  id: string;
  text: string;
  category:
    | "symptom_exploration"
    | "diagnostic_clarification"
    | "treatment_selection"
    | "risk_assessment"
    | "drug_interaction"
    | "contraindication"
    | "allergy"
    | "warning"
    | "red_flag";
  actionType: "question" | "alert";
  priority: number; // 1-10 scale
  status: "pending" | "answered" | "acknowledged" | "skipped" | "resolved";
  relationships?: Relationship[];
  impact?: {
    symptoms?: string[];
    diagnoses?: Record<string, number>;
    yes?: Record<string, number>;
    no?: Record<string, number>;
  };
  answer?: string;
  recommendation?: string;
  type?: "confirmatory" | "exclusionary" | "exploratory"; // Legacy field
  connectionType?: "symptom_to_diagnosis" | "diagnosis_to_treatment"; // Legacy field
  description?: string;
  expectedAnswerType?: string;
  answerContext?: string;
  severity?: string;
  alertMessage?: string;
  reasoning?: string;
  clinicalContext?: string;
  followUpActions?: string[];
}

// Unified relationship structure (embedded in nodes)
export interface Relationship {
  nodeId: string;
  relationship:
    | "supports"
    | "contradicts"
    | "confirms"
    | "rules_out"
    | "suggests"
    | "treats"
    | "manages"
    | "prevents"
    | "relieves"
    | "investigates"
    | "clarifies"
    | "explores"
    | "excludes"
    | "reveals"
    | "indicates"
    | "requires"
    | "monitors";
  direction: "incoming" | "outgoing" | "bidirectional";
  strength: number; // 0.0-1.0
  reasoning?: string;
}

export interface UserAction {
  timestamp: string;
  action:
    | "suppress"
    | "accept"
    | "modify"
    | "add_note"
    | "highlight"
    | "question";
  targetId: string;
  reason?: string;
  confidence?: number;
  note?: string;
}

// D3 Sankey specific types
export interface SankeyNode {
  id: string;
  name: string;
  type: "symptom" | "diagnosis" | "treatment" | "question" | "alert";
  column: number; // 0=symptoms, 1=diagnoses, 2=treatments, floating=actions
  priority: number;
  confidence: number;
  probability?: number;
  source?: string;
  data: SymptomNode | DiagnosisNode | TreatmentNode | ActionNode; // Original data
  x: number;
  y: number;
  color: string;

  // Node height value (calculated from priority/severity and probability)
  value: number;

  // Sort index to preserve intended order (especially for symptoms)
  sortIndex?: number;

  // D3 Sankey computed properties (added by D3)
  x0?: number;
  y0?: number;
  x1?: number;
  y1?: number;
  sourceLinks?: SankeyLink[];
  targetLinks?: SankeyLink[];
  index?: number;
}

export interface SankeyLink {
  source: string | number | SankeyNode;
  target: string | number | SankeyNode;
  value: number;
  type: string; // relationship type
  strength: number;
  reasoning?: string;
  direction: "incoming" | "outgoing" | "bidirectional";

  // D3 Sankey computed properties
  width?: number;
  y0?: number;
  y1?: number;
  index?: number;
}

export interface SankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
  metadata: {
    sessionId: string;
    analysisVersion: number;
    timestamp: string;
  };
}

// Visualization configuration
export interface VisualizationConfig {
  width: number;
  height: number;
  isMobile: boolean;
  showLegend: boolean;
  enableInteractions: boolean;
  enableZoom: boolean;
  filterOptions: {
    showSuppressed: boolean;
    minPriority: number;
    maxPriority: number;
    nodeTypes: string[];
    sources: string[];
  };
}

// Component event types
export interface NodeSelectEvent {
  nodeId: string;
  node: SankeyNode;
  event: MouseEvent | TouchEvent;
}

export interface LinkSelectEvent {
  link: SankeyLink;
  event: MouseEvent | TouchEvent;
}

export interface QuestionAnswerEvent {
  questionId: string;
  answer: string;
  confidence?: number;
}

export interface NodeActionEvent {
  action: "accept" | "suppress" | "highlight";
  targetId: string;
  reason?: string;
}
