// AI Chat Types
import type { WidgetSpec } from "./widgets/types";

export type ChatMode = "patient" | "caregiver" | "clinical";
export type ChatMessageRole = "user" | "assistant" | "system";

export interface SourceCitation {
  id: number;
  title: string;
  url: string;
  domain: string;
}

export interface ContextPrompt {
  type: "document" | "profile" | "tool" | "clarifyingQuestion";
  id: string;
  title: string;
  messageKey: string;
  messageParams?: any;
  acceptLabelKey: string;
  declineLabelKey: string;
  data: any;
  timestamp: Date;
  onAccept: () => void;
  onDecline: () => void;
  // Tool-specific fields
  toolName?: string;
  toolParameters?: any;
  securityLevel?: "low" | "medium" | "high";
  dataAccessDescription?: string[];
  // Clarifying question fields
  questionData?: ClarifyingQuestion;
  onAnswer?: (answers: string[]) => void;
}

/** A follow-through the AI proposes during a Care Plan chat; the user taps the
 * footer to create the task (build row 19). The AI emits this — it does NOT
 * call a tool autonomously. */
export interface SuggestedAction {
  label: string; // user-facing prompt, e.g. "Add a reminder to call your doctor"
  itemId: string; // Care Plan item id (copied verbatim from the focus block)
  text: string; // the task text
  category:
    | "follow_up"
    | "referral"
    | "diagnostic_test"
    | "monitoring"
    | "lifestyle"
    | "medication"
    | "treatment"
    | "prevention"
    | "education";
  priority: "immediate" | "urgent" | "routine" | "as_needed";
  timeframeNormalized?: {
    unit: "days" | "weeks" | "months" | "years";
    value: number;
  };
}

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  timestamp: Date;
  metadata?: {
    anatomyFocus?: string[];
    documentsReferenced?: string[];
    toolsUsed?: string[];
    contextReferences?: string[];
    contextPrompt?: ContextPrompt;
    translationKey?: string;
    translationParams?: any;
    // Context assembly metadata
    contextAvailable?: boolean;
    documentCount?: number;
    contextConfidence?: number;
    availableTools?: string[];
    shouldEnhanceGreeting?: boolean;
    // Tool execution result
    toolResult?: ToolCallResult;
    sources?: SourceCitation[];
    // Generative UI widgets
    widgets?: WidgetSpec[];
    // Care Plan suggested-action footer (build row 19)
    suggestedAction?: SuggestedAction;
    suggestedActionDone?: boolean;
    // Model that produced this message (gateway "provider/model" slug)
    model?: string;
    // Marks a lightweight system notice, e.g. a mid-conversation model switch
    systemNotice?: boolean;
    // Keep legacy support temporarily
    documentPrompt?: {
      documentId: string;
      title: string;
      content: any;
      timestamp: Date;
    };
    profilePrompt?: {
      profileId: string;
      profileName: string;
      profileData: any;
      timestamp: Date;
    };
  };
}

export interface ChatContext {
  mode: ChatMode;
  currentProfileId: string;
  conversationThreadId: string;
  language: string;
  pageContext: PageContext;
  anatomyContext?: AnatomyContext;
  carePlanContext?: CarePlanChatContext; // Focused Care Plan item (build row 7i)
  isOwnProfile: boolean;
  // Context assembly integration
  assembledContext?: any; // AssembledContext from context assembly system
  availableTools?: string[];
  mcpTools?: any; // MCP tools for AI to access medical data
  // Sub-agent routing: classified in Call 1, used in Call 2
  agentType?: string;
  // Selected AI Gateway model ("provider/model" slug); user-switchable mid-conversation.
  selectedModel?: string;
}

/** Care Plan focus passed into chat so the AI can answer about a specific item
 * and propose follow-through (Care Plan build row 7i). */
export interface CarePlanChatContext {
  focusedItemId?: string;
  itemSummary?: import("$lib/careplan/types").CarePlanItemChatSummary;
}

export interface DocumentCatalogEntry {
  id: string;
  title: string;
  category?: string;
  date?: string;
  medicalTerms?: string[];
}

export interface PageContext {
  route: string;
  profileName: string;
  availableData: {
    documents: string[];
    conditions: string[];
    medications: string[];
    vitals: string[];
    carePlanItems?: string[]; // ids of active Care Plan items (build row 7i)
  };
  documentsContent?: Map<string, any>; // documentId -> document content
  /** Lightweight catalog of all profile documents (metadata only, no content) */
  documentCatalog?: DocumentCatalogEntry[];
}

export interface AnatomyContext {
  focusedBodyParts: string[];
  viewState: {
    position: [number, number, number];
    rotation: [number, number, number];
    zoom: number;
  };
}

export interface ChatState {
  isOpen: boolean;
  messages: ChatMessage[];
  context: ChatContext | null;
  isLoading: boolean;
  anatomyModelOpen: boolean;
  focusedBodyPart: string | null;
  conversationHistory: Map<string, ChatMessage[]>; // profileId -> messages
  currentConversationId: string | null;
  syncStatus: "synced" | "syncing" | "error";
  lastSyncTime: Date | null;
}

export interface BodyPartReference {
  text: string;
  bodyPartId: string;
  confidence: number;
}

export interface AnatomySuggestion {
  bodyParts: BodyPartReference[];
  suggestion: string;
  actionText: string;
}

export interface ChatConversation {
  id: string;
  userId: string;
  profileId: string;
  threadId: string;
  messages: ChatMessage[];
  metadata: {
    startTime: Date;
    lastUpdated: Date;
    profileName: string;
    mode: ChatMode;
    anatomyInteractions: number;
    documentsAccessed: string[];
  };
}

export interface ConsentRequest {
  type: "document_access" | "anatomy_integration";
  message: string;
  documentIds?: string[];
  bodyParts?: string[];
  reason: string;
}

export interface ClarifyingQuestion {
  id: string;
  question: string;
  options: string[];
  allowCustom?: boolean;
  multiSelect?: boolean;
  context?: string;
}

export interface ToolCallRequest {
  name: string;
  parameters: any;
  reason: string;
}

export interface ToolCallResult {
  toolName: string;
  success: boolean;
  data?: any;
  error?: string;
  timestamp: Date;
}

export interface ChatResponse {
  message: string;
  anatomyReferences?: string[];
  documentReferences?: string[];
  toolCalls?: ToolCallRequest[];
  suggestions?: AnatomySuggestion[];
  consentRequests?: ConsentRequest[];
  clarifyingQuestions?: ClarifyingQuestion[];
  sources?: SourceCitation[];
  widgets?: WidgetSpec[];
}

export interface AskAboutEvent {
  type: string; // 'diagnosis', 'medication', 'lab', 'carePlanItem', etc.
  label: string; // Human-readable item name (used in tooltip)
  data: any; // Raw section item object
  documentId?: string;
  documentTitle?: string;
}
