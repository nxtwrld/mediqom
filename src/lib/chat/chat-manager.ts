import { get } from "svelte/store";
import { chatStore, chatActions, createMessage, isOpen } from "./store";
import ChatClientService from "./client-service";
import AnatomyIntegration from "./anatomy-integration";
import type {
  ChatMessage,
  ChatContext,
  ChatResponse,
  ToolCallRequest,
  ToolCallResult,
  ClarifyingQuestion,
  ContextPrompt,
} from "./types.d";
import { generateId } from "$lib/utils/id";
import ui from "$lib/ui";
import { t } from "$lib/i18n";
import { chatContextService } from "$lib/context/integration/chat-service";
import type { ChatContextResult } from "$lib/context/integration/shared/chat-context-base";
import { chatMCPToolWrapper } from "./mcp-tool-wrapper";
import user from "$lib/user";
import { profile } from "$lib/profiles";
import { logger } from "$lib/logging/logger";

export class ChatManager {
  private clientService: ChatClientService;
  private isProcessing = false;
  private isInitialized = false;
  private currentProfileId: string | null = null;
  private eventListeners: (() => void)[] = [];
  private currentContextResult: ChatContextResult | null = null;
  private currentPromptProfileId: string | null = null; // Track active profile prompt
  private lastToolCall: string | null = null; // Track last executed tool to prevent immediate duplicates

  constructor() {
    this.clientService = new ChatClientService();
  }

  /**
   * Start listening to UI events
   */
  startListening(): void {
    // Listen for navigation events
    const navigationListener = ui.listen(
      "chat:navigation",
      (data: {
        route: string;
        profileId: string;
        profileName: string;
        documentId?: string;
        documentName?: string;
      }) => {
        this.handleNavigation(data);
      },
    );

    // Listen for profile switch events
    const profileSwitchListener = ui.listen(
      "chat:profile_switch",
      (data: {
        profileId: string;
        profileName: string;
        isOwnProfile: boolean;
        language: string;
      }) => {
        this.handleProfileSwitch(data);
      },
    );

    // Listen for context add events
    const contextAddListener = ui.listen(
      "chat:context_add",
      (data: {
        documentId: string;
        documentName: string;
        documentType: string;
      }) => {
        this.handleContextAdd(data);
      },
    );

    // Listen for context reset events
    const contextResetListener = ui.listen(
      "chat:context_reset",
      (data: { reason: "profile_switch" | "user_request" }) => {
        this.handleContextReset(data);
      },
    );

    // Listen for chat toggle events
    const chatToggleListener = ui.listen("chat:toggle", () => {
      this.handleChatToggle();
    });

    // Listen for document context events
    const documentContextListener = ui.listen(
      "aicontext:document",
      (data: {
        documentId: string;
        title: string;
        content: any;
        timestamp: Date;
      }) => {
        this.handleDocumentContext(data);
      },
    );

    // Listen for profile context events
    const profileContextListener = ui.listen(
      "aicontext:profile",
      (data: {
        profileId: string;
        profileName: string;
        profileData: any;
        timestamp: Date;
      }) => {
        this.handleProfileContext(data);
      },
    );

    // Store cleanup functions
    this.eventListeners.push(
      navigationListener,
      profileSwitchListener,
      contextAddListener,
      contextResetListener,
      chatToggleListener,
      documentContextListener,
      profileContextListener,
    );
  }

  /**
   * Stop listening to UI events
   */
  stopListening(): void {
    this.eventListeners.forEach((cleanup) => cleanup());
    this.eventListeners = [];
  }

  /**
   * Create context from current profile data (preferred method)
   */
  private createContextFromProfileData(
    profileId: string,
    profileName: string,
    isOwnProfile: boolean,
    language: string,
    healthData?: any,
    healthDocumentId?: string,
  ): ChatContext {
    const navigationEvent = ui.getLatest("chat:navigation");

    return profile.createChatContext(
      profileId,
      profileName,
      isOwnProfile,
      language,
      navigationEvent?.data?.route || "/",
      healthData,
      healthDocumentId,
    );
  }

  /**
   * Get cached context for chat initialization (legacy method)
   */
  private getCachedContext(
    profileId: string,
    profileName: string,
    isOwnProfile: boolean,
    language: string,
  ): ChatContext {
    // Get latest events from UI emitter
    const profileEvent =
      ui.getLatest("aicontext:profile") || ui.getLatest("chat:profile_switch");
    const documentEvent = ui.getLatest("aicontext:document");
    const navigationEvent = ui.getLatest("chat:navigation");

    // Use cached profile data if available and matches current profile
    const profileData =
      profileEvent?.data && profileEvent.data.profileId === profileId
        ? profileEvent.data
        : null;

    // Use cached document data if available
    const documentData = documentEvent?.data;

    return {
      mode: isOwnProfile ? "patient" : "clinical",
      currentProfileId: profileId,
      conversationThreadId: generateId(),
      language: language,
      isOwnProfile: isOwnProfile,
      pageContext: {
        route: navigationEvent?.data?.route || "/",
        profileName: profileData?.profileName || profileName,
        availableData: {
          documents: documentData ? [documentData.documentId] : [],
          conditions: [],
          medications: [],
          vitals: [],
        },
        // Include document content if available
        documentsContent: documentData
          ? new Map([[documentData.documentId, documentData.content]])
          : undefined,
      },
    };
  }

  /**
   * Handle navigation events
   */
  private handleNavigation(data: {
    route: string;
    profileId: string;
    profileName: string;
    documentId?: string;
    documentName?: string;
  }): void {
    const state = get(chatStore);
    if (state.context) {
      // If we're navigating away from a profile that has an active prompt, remove it
      if (
        this.currentPromptProfileId &&
        this.currentPromptProfileId !== data.profileId
      ) {
        console.log(
          `Navigating away from profile ${this.currentPromptProfileId}, removing stale prompt`,
        );
        this.removeContextPromptMessage(this.currentPromptProfileId, "profile");
        this.currentPromptProfileId = null;
      }

      // Update page context (but keep the chat's profile identity unchanged)
      chatActions.updateContext({
        pageContext: {
          ...state.context.pageContext,
          route: data.route,
          // Don't update profileName - it should only change when chat context switches
        },
      });

      // Add document to context if provided
      if (data.documentId && data.documentName) {
        this.addDocumentToContext(data.documentId, data.documentName);
      }
    }
  }

  /**
   * Handle profile switch events
   */
  private handleProfileSwitch(data: {
    profileId: string;
    profileName: string;
    isOwnProfile: boolean;
    language: string;
  }): void {
    const state = get(chatStore);

    // Clear stale document/profile context from previous user to prevent context mixing
    ui.clearLatest("aicontext:document");
    ui.clearLatest("aicontext:profile");

    // Don't auto-initialize chat on profile switch - only initialize when chat is actually opened
    // If we don't have a context yet, just return - chat will initialize when opened
    if (!state.context) {
      return;
    }

    // If switching to the same profile, no action needed
    if (state.context.currentProfileId === data.profileId) {
      logger
        .namespace("Chat")
        .debug("Already on current profile, no switch needed", {
          profileId: data.profileId,
        });
      return;
    }

    // If switching to a different profile, save current conversation and update context
    if (state.messages.length > 0) {
      const history = new Map(state.conversationHistory);
      history.set(state.context.currentProfileId, [...state.messages]);

      chatStore.update((s) => ({
        ...s,
        conversationHistory: history,
      }));
      console.log(
        `Saved ${state.messages.length} messages for profile ${state.context.currentProfileId}`,
      );
    }

    // Get current profile data from store and update context
    const currentProfile = profile.get();
    if (currentProfile && currentProfile.id === data.profileId) {
      logger.namespace("Chat").info("Switching chat context to profile", {
        profileName: data.profileName,
        profileId: data.profileId,
      });

      // Create new context for the switched profile using profile store data
      const newContext = this.createContextFromProfileData(
        currentProfile.id,
        currentProfile.fullName || "Unknown",
        data.isOwnProfile,
        currentProfile.language || data.language,
        currentProfile.health,
        currentProfile.healthDocumentId,
      );

      // Update chat context
      chatActions.setContext(newContext);

      // Load conversation history for this profile if it exists
      const existingHistory =
        state.conversationHistory.get(data.profileId) || [];
      if (existingHistory.length > 0) {
        chatActions.setMessages(existingHistory);
        console.log(
          `Restored ${existingHistory.length} messages for profile ${data.profileId}`,
        );
      } else {
        // Clear messages and add a greeting for the new profile
        chatActions.clearMessages();
        const greeting = this.getInitialGreeting(newContext);
        if (greeting) {
          const greetingMessage = createMessage("assistant", greeting);
          chatActions.addMessage(greetingMessage);
        }
      }
    } else {
      console.warn(
        `Profile data not found or mismatched for ID: ${data.profileId}`,
      );
    }
  }

  /**
   * Handle context add events
   */
  private handleContextAdd(data: {
    documentId: string;
    documentName: string;
    documentType: string;
  }): void {
    this.addDocumentToContext(data.documentId, data.documentName);
  }

  /**
   * Handle context reset events
   */
  private handleContextReset(data: {
    reason: "profile_switch" | "user_request";
  }): void {
    if (data.reason === "user_request") {
      this.clearConversation();
    }
    // Profile switch is handled by handleProfileSwitch
  }

  /**
   * Handle chat toggle events
   */
  private handleChatToggle(): void {
    const wasOpen = get(chatStore).isOpen;
    chatActions.toggle();

    // If chat was just opened, initialize with current profile
    if (!wasOpen && get(chatStore).isOpen) {
      this.initializeChatWithCurrentProfile();
    }
  }

  /**
   * Initialize chat with current profile when chat is opened
   */
  private initializeChatWithCurrentProfile(): void {
    const currentProfile = profile.get();

    if (!currentProfile) {
      console.warn("No current profile available for chat initialization");
      return;
    }

    // Check if we already have a context for this profile
    const state = get(chatStore);
    if (state.context && state.context.currentProfileId === currentProfile.id) {
      console.log(`Chat already initialized for profile ${currentProfile.id}`);
      // Still check for latest document context
      this.checkForLatestDocumentOnOpen();
      return;
    }

    console.log(
      `Initializing chat for current profile: ${currentProfile.fullName || "Unknown"}`,
      {
        profileId: currentProfile.id,
        hasHealthData: !!currentProfile.health,
        language: currentProfile.language,
      },
    );

    // Create context from current profile including health data
    const initialContext = this.createContextFromProfileData(
      currentProfile.id,
      currentProfile.fullName || "Unknown",
      true, // For now, assume all profiles are "own" profiles in patient mode
      currentProfile.language || "en",
      currentProfile.health, // Pass health data
      currentProfile.healthDocumentId, // Pass health document ID
    );

    // Health context will be available through the profile context system
    if (currentProfile.health) {
      logger
        .namespace("Chat")
        .debug("Health context available for chat initialization", {
          hasHealthData: true,
          healthDocumentId: currentProfile.healthDocumentId,
        });
    }

    // Initialize the chat
    this.initializeChat(initialContext);
  }

  /**
   * Check for latest document context when chat is opened and suggest adding it
   */
  private checkForLatestDocumentOnOpen(): void {
    const state = get(chatStore);

    // Only check if chat is initialized and not processing
    if (!state.context || this.isProcessing) {
      return;
    }

    // Get the latest document event
    const documentEvent = ui.getLatest("aicontext:document");
    if (!documentEvent?.data) {
      return;
    }

    const documentData = documentEvent.data;

    // Check if document is already in context
    const existingDocs =
      state.context.pageContext.availableData.documents || [];
    if (existingDocs.includes(documentData.documentId)) {
      return; // Document already added
    }

    // Check if this is a recent document (within last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (documentData.timestamp < fiveMinutesAgo) {
      return; // Document is too old, don't auto-suggest
    }

    // Trigger document context handling to show the prompt
    this.handleDocumentContext(documentData);

    console.log(
      `Auto-suggested latest document context for: ${documentData.title}`,
    );
  }

  /**
   * Handle document context events
   */
  private handleDocumentContext(data: {
    documentId: string;
    profileId?: string;
    title: string;
    content: any;
    timestamp: Date;
  }): void {
    // Only show prompt if chat is initialized and we're not already processing
    const state = get(chatStore);
    if (!state.context || this.isProcessing) {
      return;
    }

    // Validate document belongs to current profile (prevent context mixing)
    if (data.profileId && data.profileId !== state.context.currentProfileId) {
      console.log(
        `Ignoring document context from different profile: ${data.profileId} !== ${state.context.currentProfileId}`,
      );
      return;
    }

    // Check if document is already in context
    const existingDocs =
      state.context.pageContext.availableData.documents || [];
    if (existingDocs.includes(data.documentId)) {
      return; // Document already added
    }

    // Create uniform prompt object with callbacks
    const contextPrompt = {
      type: "document" as const,
      id: data.documentId,
      title: data.title,
      messageKey: "app.chat.document.add-prompt",
      messageParams: { title: data.title },
      acceptLabelKey: "app.chat.document.add-yes",
      declineLabelKey: "app.chat.document.add-no",
      data: data.content,
      timestamp: data.timestamp,
      onAccept: () =>
        this.acceptDocumentContext(data.documentId, data.title, data.content),
      onDecline: () => this.declineDocumentContext(data.documentId, data.title),
    };

    // Add document context prompt message
    const promptMessage = createMessage("system", "", {
      contextPrompt,
    });

    chatActions.addMessage(promptMessage);
    console.log(`Document context prompt added for: ${data.title}`);
  }

  /**
   * Add document to context
   */
  private addDocumentToContext(documentId: string, documentName: string): void {
    const state = get(chatStore);
    if (state.context) {
      const updatedDocuments = [
        ...state.context.pageContext.availableData.documents,
        documentId,
      ];
      chatActions.updateContext({
        pageContext: {
          ...state.context.pageContext,
          availableData: {
            ...state.context.pageContext.availableData,
            documents: updatedDocuments,
          },
        },
      });

      // Add system message about document access
      const contextMsg = createMessage(
        "system",
        "", // Empty content - translation will be handled in the component
        {
          translationKey: "app.chat.document.added",
          translationParams: { title: documentName },
        },
      );
      chatActions.addMessage(contextMsg);
    }
  }

  /**
   * Handle user accepting document addition
   */
  acceptDocumentContext(
    documentId: string,
    documentName: string,
    documentContent: any,
  ): void {
    // Remove the prompt message from chat
    this.removeContextPromptMessage(documentId, "document");

    // Store document content in context
    const state = get(chatStore);
    if (state.context) {
      // Initialize documentsContent map if it doesn't exist
      const documentsContent = new Map(
        state.context.pageContext.documentsContent || [],
      );
      documentsContent.set(documentId, documentContent);

      // Update context with document content
      chatActions.updateContext({
        pageContext: {
          ...state.context.pageContext,
          documentsContent,
        },
      });
    }

    // Add to document list and show confirmation
    this.addDocumentToContext(documentId, documentName);

    console.log(`Document ${documentId} accepted with full content`);
  }

  /**
   * Handle user declining document addition
   */
  declineDocumentContext(documentId: string, documentName: string): void {
    // Remove the prompt message from chat
    this.removeContextPromptMessage(documentId, "document");

    console.log(`Document ${documentId} declined by user`);
  }

  /**
   * Remove context prompt message from chat after user responds
   */
  private removeContextPromptMessage(
    id: string,
    type: "document" | "profile" | "tool",
  ): void {
    const state = get(chatStore);
    const updatedMessages = state.messages.filter((message) => {
      // Remove messages that have a contextPrompt with matching id and type
      if (message.metadata?.contextPrompt) {
        const prompt = message.metadata.contextPrompt;
        return !(prompt.id === id && prompt.type === type);
      }
      return true;
    });

    if (updatedMessages.length !== state.messages.length) {
      chatActions.setMessages(updatedMessages);
      console.log(`Removed context prompt message for ${type}: ${id}`);
    }
  }

  /**
   * Handle profile context events
   */
  private handleProfileContext(data: {
    profileId: string;
    profileName: string;
    profileData: any;
    timestamp: Date;
  }): void {
    const state = get(chatStore);
    if (!state.context || this.isProcessing) {
      return;
    }

    // Check if this is a different profile
    if (state.context.currentProfileId === data.profileId) {
      return; // Same profile, no action needed
    }

    // Only show prompt if chat is open and has messages
    const chatIsOpen = get(isOpen);
    if (!chatIsOpen || state.messages.length === 0) {
      console.log(
        "Skipping profile context prompt - chat is closed or has no messages",
      );
      return;
    }

    // Create uniform prompt object with callbacks
    const contextPrompt = {
      type: "profile" as const,
      id: data.profileId,
      title: data.profileName,
      messageKey: "app.chat.profile.switch-prompt",
      messageParams: { profileName: data.profileName },
      acceptLabelKey: "app.chat.profile.switch-yes",
      declineLabelKey: "app.chat.profile.switch-no",
      data: data.profileData,
      timestamp: data.timestamp,
      onAccept: () =>
        this.acceptProfileContext(
          data.profileId,
          data.profileName,
          data.profileData,
        ),
      onDecline: () =>
        this.declineProfileContext(data.profileId, data.profileName),
    };

    // Add profile context prompt message
    const promptMessage = createMessage("system", "", {
      contextPrompt,
    });

    chatActions.addMessage(promptMessage);
    this.currentPromptProfileId = data.profileId; // Track the active prompt
    console.log(`Profile context prompt added for: ${data.profileName}`);
  }

  /**
   * Handle user accepting profile context reset
   */
  acceptProfileContext(
    profileId: string,
    profileName: string,
    _profileData: any,
  ): void {
    const state = get(chatStore);

    // Remove the prompt message from chat and clear tracking
    this.removeContextPromptMessage(profileId, "profile");
    this.currentPromptProfileId = null;

    // Save current conversation to history before switching
    if (state.context && state.messages.length > 0) {
      const history = new Map(state.conversationHistory);
      history.set(state.context.currentProfileId, [...state.messages]);
      chatStore.update((s) => ({
        ...s,
        conversationHistory: history,
      }));
    }

    // Get current profile data from store for consistency
    const currentProfile = profile.get();
    if (currentProfile && currentProfile.id === profileId) {
      // Create new context using profile store data (same as other methods)
      const newContext = this.createContextFromProfileData(
        currentProfile.id,
        currentProfile.fullName || profileName,
        state.context?.isOwnProfile || true,
        currentProfile.language || state.context?.language || "en",
        currentProfile.health,
        currentProfile.healthDocumentId,
      );

      // Initialize chat with new profile context
      this.initializeChat(newContext);
    } else {
      console.warn(
        `Profile data not found for accepted profile context: ${profileId}`,
      );

      // Fallback to manual creation (legacy behavior)
      const newContext: ChatContext = {
        mode: state.context?.mode || "patient",
        currentProfileId: profileId,
        conversationThreadId: generateId(),
        language: state.context?.language || "en",
        isOwnProfile: state.context?.isOwnProfile || true,
        pageContext: {
          route: state.context?.pageContext?.route || "/",
          profileName: profileName,
          availableData: {
            documents: [],
            conditions: [],
            medications: [],
            vitals: [],
          },
        },
      };

      this.initializeChat(newContext);
    }

    // Add simple system message about switching profile
    const switchMsg = createMessage("system", `Switching to ${profileName}`);
    chatActions.addMessage(switchMsg);
    console.log(`Profile context reset accepted for ${profileId}`);
  }

  /**
   * Handle user declining profile context reset
   */
  declineProfileContext(profileId: string, profileName: string): void {
    // Remove the prompt message from chat and clear tracking
    this.removeContextPromptMessage(profileId, "profile");
    this.currentPromptProfileId = null;

    // Update the context to reflect we're now discussing a different profile
    const state = get(chatStore);
    if (state.context) {
      chatActions.updateContext({
        currentProfileId: profileId,
        pageContext: {
          ...state.context.pageContext,
          profileName: profileName,
        },
      });
    }

    console.log(`Profile context reset declined for ${profileId}`);
  }

  /**
   * Initialize chat for current profile
   */
  async initializeChat(context: ChatContext): Promise<void> {
    console.log(
      `Initializing chat for profile ${context.currentProfileId}, mode: ${context.mode}`,
    );

    const state = get(chatStore);

    // Check if we have existing history for this profile
    const existingHistory =
      state.conversationHistory.get(context.currentProfileId) || [];

    // Initialize context assembly for this profile
    try {
      this.currentContextResult =
        await chatContextService.prepareContextForChat(
          "Initial chat setup", // Initial message for context preparation
          {
            profileId: context.currentProfileId,
            maxTokens: 3000,
            includeDocuments: true,
            contextThreshold: 0.6,
          },
        );

      console.log(
        `Context assembly initialized: ${this.currentContextResult?.documentCount} documents available, confidence: ${this.currentContextResult?.confidence}`,
      );
    } catch (error) {
      console.warn("Failed to initialize context assembly:", error);
      this.currentContextResult = null;
    }

    // Only clear messages if we don't have existing history
    if (existingHistory.length === 0) {
      chatActions.clearMessages();

      // Add context-aware initial greeting
      const greeting = this.getContextAwareGreeting(
        context,
        this.currentContextResult,
      );
      if (greeting) {
        // Include context metadata if available
        const messageMetadata = this.currentContextResult
          ? {
              contextAvailable: true,
              documentCount: this.currentContextResult.documentCount,
              contextConfidence: this.currentContextResult.confidence,
              availableTools: this.currentContextResult.availableTools,
              shouldEnhanceGreeting:
                this.currentContextResult.documentCount > 0,
            }
          : {
              contextAvailable: false,
              shouldEnhanceGreeting: false,
            };

        const greetingMessage = createMessage(
          "assistant",
          greeting,
          messageMetadata,
        );
        chatActions.addMessage(greetingMessage);
        console.log(
          "Added context-aware greeting message:",
          greeting.substring(0, 50) + "...",
        );
      }
    } else {
      // Restore existing history
      chatActions.setMessages(existingHistory);
      console.log(`Restored ${existingHistory.length} messages from history`);
    }

    // Set the context
    chatActions.setContext(context);

    this.isInitialized = true;
    this.currentProfileId = context.currentProfileId;
    console.log(
      `Chat initialized for ${context.mode} mode with language ${context.language}`,
    );
  }

  /**
   * Process user message and get AI response via SSE
   */
  async sendMessage(userMessage: string): Promise<void> {
    if (this.isProcessing) {
      console.warn("Chat is already processing a message");
      return;
    }

    // Clear last tool call on new user message to allow fresh tool usage
    this.lastToolCall = null;

    const state = get(chatStore);
    if (!state.context) {
      throw new Error("Chat context not initialized");
    }

    // If there's an active profile prompt, remove it since user is continuing with current context
    if (this.currentPromptProfileId) {
      console.log(
        `User sent message without responding to profile switch prompt, removing prompt for profile ${this.currentPromptProfileId}`,
      );
      this.removeContextPromptMessage(this.currentPromptProfileId, "profile");
      this.currentPromptProfileId = null;
    }

    this.isProcessing = true;
    chatActions.setLoading(true);

    try {
      // Update context assembly for current conversation
      const conversationHistory = state.messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => m.content)
        .slice(-5); // Last 5 messages for context

      this.currentContextResult =
        await chatContextService.updateContextDuringConversation(
          state.context.currentProfileId,
          conversationHistory,
          userMessage,
        );

      console.log(
        `Context updated for message: ${this.currentContextResult.documentCount} documents, confidence: ${this.currentContextResult.confidence}`,
      );

      // Add user message to chat
      const userMsg = createMessage("user", userMessage);
      chatActions.addMessage(userMsg);

      // Create enhanced context for AI with assembled context and MCP tools
      const enhancedContext = {
        ...state.context,
        assembledContext: this.currentContextResult?.assembledContext,
        availableTools: this.currentContextResult?.availableTools || [],
        mcpTools: chatContextService.getMCPToolsForChat(
          state.context.currentProfileId,
        ),
      };

      console.log(
        "[MCP Debug] Enhanced context tools:",
        enhancedContext.availableTools,
      );
      console.log(
        "[MCP Debug] Current context result:",
        this.currentContextResult,
      );

      // Create a message that will be updated as chunks arrive
      let streamingMessageId: string | null = null;
      let accumulatedContent = "";
      let messageMetadata: any = {};

      // Send message via SSE with enhanced context
      await this.clientService.sendMessage(
        userMessage,
        enhancedContext,
        state.messages,
        (event) => {
          switch (event.type) {
            case "chunk":
              // Handle streaming chunks
              accumulatedContent += event.content || "";

              if (!streamingMessageId) {
                // Create initial streaming message
                const streamingMsg = createMessage(
                  "assistant",
                  accumulatedContent,
                );
                streamingMessageId = streamingMsg.id;
                chatActions.addMessage(streamingMsg);
              } else {
                // Update existing message with new content
                const currentState = get(chatStore);
                const updatedMessages = currentState.messages.map((msg) =>
                  msg.id === streamingMessageId
                    ? { ...msg, content: accumulatedContent }
                    : msg,
                );
                chatActions.setMessages(updatedMessages);
              }
              break;

            case "metadata":
              // Debug: Log what we received from server
              console.log("🔍 [Client Debug] Received metadata:", {
                hasToolCalls: !!event.data.toolCalls,
                toolCallsLength: event.data.toolCalls?.length || 0,
                toolCalls: event.data.toolCalls,
                debugInfo: event.data.debugInfo,
              });

              // Store metadata for later use
              messageMetadata = {
                anatomyFocus: event.data.anatomyReferences,
                documentsReferenced: event.data.documentReferences,
                toolsUsed: [],
              };

              // Update the message with metadata
              if (streamingMessageId) {
                const currentState = get(chatStore);
                const updatedMessages = currentState.messages.map((msg) =>
                  msg.id === streamingMessageId
                    ? { ...msg, metadata: messageMetadata }
                    : msg,
                );
                chatActions.setMessages(updatedMessages);
              }

              // Handle consent requests
              if (
                event.data.consentRequests &&
                event.data.consentRequests.length > 0
              ) {
                console.log(
                  "🔍 [Client Debug] Processing consent requests:",
                  event.data.consentRequests,
                );
                this.handleConsentRequests(event.data.consentRequests);
              }

              // Handle tool call requests
              if (event.data.toolCalls && event.data.toolCalls.length > 0) {
                console.log(
                  "🔍 [Client Debug] Processing tool calls:",
                  event.data.toolCalls,
                );
                this.handleToolCallRequests(
                  event.data.toolCalls,
                  streamingMessageId,
                );
              } else {
                console.log(
                  "🔍 [Client Debug] No tool calls received or empty array",
                );
              }

              // Handle clarifying questions
              if (
                event.data.clarifyingQuestions &&
                event.data.clarifyingQuestions.length > 0
              ) {
                console.log(
                  "🔍 [Client Debug] Processing clarifying questions:",
                  event.data.clarifyingQuestions,
                );
                this.handleClarifyingQuestions(event.data.clarifyingQuestions);
              }
              break;

            case "complete":
              // Streaming is complete
              console.log("Streaming complete");
              break;

            case "error":
              // Add error message
              const errorMsg = createMessage(
                "assistant",
                event.message ||
                  "I apologize, but I encountered an error processing your message. Please try again.",
              );
              chatActions.addMessage(errorMsg);
              break;
          }
        },
      );
    } catch (error) {
      console.error("Error processing message:", error);

      // Add error message to chat
      const errorMsg = createMessage(
        "assistant",
        "I apologize, but I encountered an error processing your message. Please try again.",
      );
      chatActions.addMessage(errorMsg);
    } finally {
      this.isProcessing = false;
      chatActions.setLoading(false);
    }
  }

  /**
   * Handle anatomy suggestions from AI
   */
  private handleAnatomySuggestions(suggestions: any[]): void {
    // This could trigger UI elements to show anatomy buttons
    console.log("Anatomy suggestions:", suggestions);
  }

  /**
   * Handle consent requests from AI
   */
  private handleConsentRequests(requests: any[]): void {
    // This could trigger consent dialog UI
    console.log("Consent requests:", requests);
  }

  /**
   * Handle clarifying questions from AI (Socratic approach)
   */
  private handleClarifyingQuestions(questions: ClarifyingQuestion[]): void {
    // Process only the first question (one at a time per UX decision)
    const question = questions[0];
    if (!question) return;

    // Create a ContextPrompt for the clarifying question
    const questionPrompt: ContextPrompt = {
      type: "clarifyingQuestion",
      id: question.id || generateId(),
      title: question.question,
      messageKey: "", // Not using translation key for dynamic question
      acceptLabelKey: "app.buttons.continue",
      declineLabelKey: "", // No decline for questions
      data: question,
      timestamp: new Date(),
      onAccept: () => {}, // Not used for questions
      onDecline: () => {}, // Not used for questions
      questionData: question,
      onAnswer: (answers: string[]) => this.onQuestionAnswered(question, answers),
    };

    // Add system message with question prompt
    const promptMessage = createMessage("system", question.question, {
      contextPrompt: questionPrompt,
    });

    chatActions.addMessage(promptMessage);
  }

  /**
   * Handle when user answers a clarifying question
   */
  private onQuestionAnswered(
    question: ClarifyingQuestion,
    answers: string[],
  ): void {
    // Format the answer as a user message
    const answerText = answers.join(", ");

    // Add user's answer to the conversation
    const userMessage = createMessage("user", answerText);
    chatActions.addMessage(userMessage);

    // Continue the conversation with the answer
    // This will trigger a new AI response that can ask follow-ups or provide recommendations
    this.sendMessageWithContext(answerText);
  }

  /**
   * Send message with current context (for follow-up after answering questions)
   */
  private async sendMessageWithContext(message: string): Promise<void> {
    // Use the existing sendMessage flow to continue the conversation
    await this.sendMessage(message);
  }

  /**
   * Handle tool call requests from AI
   */
  private async handleToolCallRequests(
    toolCalls: ToolCallRequest[],
    messageId: string | null,
  ): Promise<void> {
    const state = get(chatStore);

    // Get profile ID from chat store state instead of instance variable
    const profileId = state.context?.currentProfileId;
    if (!profileId) {
      console.error("Cannot execute tools without profile context");
      return;
    }

    // Debug check for document availability
    if (this.currentContextResult?.documentCount === 0) {
      console.warn(
        "[MCP Debug] No documents loaded - tools may not return results",
      );
    }

    // Get current authenticated user
    const currentUser = user.get();
    if (!currentUser) {
      console.error("Cannot execute tools without authenticated user");
      return;
    }

    console.log("[Client Debug] Using authenticated user for tools:", {
      userId: currentUser.id,
      email: currentUser.email,
      profileId: profileId,
    });

    // Process each tool call request
    for (const toolCall of toolCalls) {
      // Check for duplicate tool calls to prevent infinite loops
      const toolSignature = `${toolCall.name}_${JSON.stringify(toolCall.parameters)}`;
      if (this.lastToolCall === toolSignature) {
        console.log(
          `🚫 [Tool Loop Prevention] Suppressing duplicate tool call: ${toolCall.name}`,
        );

        // Add explanatory message instead of executing the duplicate tool
        const explanationMessage = createMessage(
          "system",
          `I already searched for that information and found no results. Let me provide an answer based on what I found.`,
        );
        chatActions.addMessage(explanationMessage);
        continue; // Skip this duplicate tool call
      }

      const toolPrompt = await chatMCPToolWrapper.createToolPrompt(
        toolCall.name,
        toolCall.parameters,
        profileId,
        (result) => this.onToolApproved(result, toolCall.name),
        () => this.onToolDeclined(toolCall.name),
      );

      // Track this tool call signature to prevent immediate duplicates
      this.lastToolCall = toolSignature;

      // Only add prompt message if tool requires confirmation
      if (toolPrompt) {
        // Add system message with tool prompt
        const promptMessage = createMessage("system", "", {
          contextPrompt: toolPrompt,
        });

        chatActions.addMessage(promptMessage);
      }
      // If toolPrompt is null, the tool was executed immediately (low-risk)
    }
  }

  /**
   * Handle tool approval
   */
  private async onToolApproved(
    result: ToolCallResult,
    toolName: string,
  ): Promise<void> {
    // Remove the tool prompt message
    this.removeContextPromptMessage(result.toolName, "tool");

    if (result.success && result.data) {
      // Add a system message showing tool was executed
      const toolResultMessage = createMessage("system", "", {
        translationKey: "app.chat.tool.executed",
        translationParams: { toolName: this.getToolDisplayName(toolName) },
        toolResult: result,
      });

      chatActions.addMessage(toolResultMessage);

      // Continue conversation with tool results
      await this.continueWithToolResult(result);
    } else {
      // Show error message
      const errorMessage = createMessage("system", "", {
        translationKey: "app.chat.tool.error",
        translationParams: {
          toolName: this.getToolDisplayName(toolName),
          error: result.error || "Unknown error",
        },
      });

      chatActions.addMessage(errorMessage);
    }
  }

  /**
   * Handle tool denial
   */
  private onToolDeclined(toolName: string): void {
    // Remove the tool prompt message
    this.removeContextPromptMessage(toolName, "tool");

    // Add a system message showing tool was declined
    const declinedMessage = createMessage("system", "", {
      translationKey: "app.chat.tool.declined",
      translationParams: { toolName: this.getToolDisplayName(toolName) },
    });

    chatActions.addMessage(declinedMessage);
  }

  /**
   * Continue conversation with tool results
   */
  private async continueWithToolResult(result: ToolCallResult): Promise<void> {
    if (!result.success || !result.data) return;

    const state = get(chatStore);

    // Create a follow-up message to process the tool results
    const followUpMessage = `Based on the ${result.toolName} results, here is the information:`;

    // Send the tool results back to the AI for processing
    try {
      chatActions.setLoading(true);

      // Create enhanced context with tool results
      const enhancedContext: ChatContext = {
        ...state.context!,
        mcpTools: { [result.toolName]: result.data },
      };

      // Send a message with tool results context
      let streamingMessageId: string | null = null;
      let accumulatedContent = "";
      let messageMetadata: any = {};

      await this.clientService.sendMessage(
        followUpMessage,
        enhancedContext,
        state.messages,
        (event) => {
          switch (event.type) {
            case "chunk":
              // Handle streaming chunks
              accumulatedContent += event.content || "";
              if (!streamingMessageId) {
                // Create initial streaming message
                const streamingMsg = createMessage(
                  "assistant",
                  accumulatedContent,
                );
                streamingMessageId = streamingMsg.id;
                chatActions.addMessage(streamingMsg);
              } else {
                // Update existing message with new content
                const currentState = get(chatStore);
                const updatedMessages = currentState.messages.map((msg) =>
                  msg.id === streamingMessageId
                    ? { ...msg, content: accumulatedContent }
                    : msg,
                );
                chatActions.setMessages(updatedMessages);
              }
              break;
            case "metadata":
              // Store metadata for the final message
              messageMetadata = event.data;

              // Note: Tool calls are already processed by the main sendMessage handler
              // No need to process them again here to avoid duplication
              break;
            case "complete":
              // Finalize the streaming message with metadata
              if (streamingMessageId) {
                const finalState = get(chatStore);
                const updatedMessages = finalState.messages.map((msg) =>
                  msg.id === streamingMessageId
                    ? {
                        ...msg,
                        metadata: {
                          ...msg.metadata,
                          ...messageMetadata,
                          tokenUsage: messageMetadata.tokenUsage,
                          anatomyReferences:
                            messageMetadata.anatomyReferences || [],
                          documentReferences:
                            messageMetadata.documentReferences || [],
                        },
                      }
                    : msg,
                );
                chatActions.setMessages(updatedMessages);
              }
              break;
            case "error":
              console.error("Tool result processing error:", event.message);
              break;
          }
        },
      );
    } catch (error) {
      console.error("Error continuing with tool results:", error);
    } finally {
      chatActions.setLoading(false);
    }
  }

  /**
   * Get display name for tool
   */
  private getToolDisplayName(toolName: string): string {
    const names: Record<string, string> = {
      searchDocuments: "Document Search",
      getAssembledContext: "Context Assembly",
      getProfileData: "Profile Data",
      queryMedicalHistory: "Medical History",
      getDocumentById: "Document Access",
    };
    return names[toolName] || toolName;
  }

  /**
   * Open anatomy model and focus on body part
   */
  async focusAnatomy(bodyPartId: string): Promise<void> {
    try {
      console.log("Focusing anatomy on:", bodyPartId);

      // Validate if this is a valid body part
      if (!AnatomyIntegration.isValidBodyPart(bodyPartId)) {
        console.error(`Invalid body part ID: ${bodyPartId}`);
        const errorMsg = createMessage(
          "system",
          `Unable to focus on "${bodyPartId}" - not found in anatomy model`,
          {},
        );
        chatActions.addMessage(errorMsg);
        return;
      }

      await AnatomyIntegration.openAndFocus(bodyPartId);
    } catch (error) {
      console.error("Error focusing anatomy:", error);
    }
  }

  /**
   * Switch profile context
   */
  async switchProfile(profileId: string, isOwnProfile: boolean): Promise<void> {
    const state = get(chatStore);

    if (state.context?.currentProfileId === profileId) {
      return; // Already on this profile
    }

    // Switch profile in store
    chatActions.switchProfile(profileId, isOwnProfile);

    // Update context mode
    const newMode = isOwnProfile ? "patient" : "clinical";
    chatActions.updateContext({ mode: newMode });

    // Add profile switch message
    const profileName = state.context?.pageContext?.profileName || "Unknown";
    const switchMsg = createMessage(
      "system",
      `Switched to ${profileName}'s profile (${newMode} mode)`,
    );
    chatActions.addMessage(switchMsg);
  }

  /**
   * Clear current conversation
   */
  clearConversation(): void {
    chatActions.clearMessages();

    // Clear last tool call to allow fresh tool usage in new conversation
    this.lastToolCall = null;

    // Clear approved documents for this session
    if (this.currentProfileId) {
      chatMCPToolWrapper.clearApprovedDocuments(this.currentProfileId);
      console.log("Cleared approved documents for current conversation");
    }

    // Add new greeting
    const state = get(chatStore);
    if (state.context) {
      const greeting = this.getInitialGreeting(state.context);
      if (greeting) {
        const greetingMessage = createMessage("assistant", greeting);
        chatActions.addMessage(greetingMessage);
      }
    }
  }

  /**
   * Save current conversation to history before closing
   */
  saveCurrentConversation(): void {
    const state = get(chatStore);
    if (state.context?.currentProfileId && state.messages.length > 0) {
      const history = new Map(state.conversationHistory);
      history.set(state.context.currentProfileId, [...state.messages]);

      chatStore.update((s) => ({
        ...s,
        conversationHistory: history,
      }));
      console.log(
        `Saved ${state.messages.length} messages for profile ${state.context.currentProfileId}`,
      );
    }
  }

  /**
   * Get initial greeting based on mode and context
   */
  private getInitialGreeting(context: ChatContext): string {
    const profileName = context.pageContext.profileName;

    if (context.mode === "patient") {
      return get(t)("app.chat.greetings.patient");
    } else {
      return get(t)("app.chat.greetings.clinical", { values: { profileName } });
    }
  }

  /**
   * Get context-aware greeting that includes information about available medical context
   * The AI will handle language translation based on the user's language context
   */
  private getContextAwareGreeting(
    context: ChatContext,
    contextResult: ChatContextResult | null,
  ): string {
    const baseGreeting = this.getInitialGreeting(context);

    // If no context available, return the standard translated greeting
    if (!contextResult || contextResult.documentCount === 0) {
      return baseGreeting;
    }

    // For context-enhanced greeting, we'll let the AI handle the language
    // by providing metadata that the AI service can use to generate a contextualized response
    const contextMetadata = {
      hasContext: true,
      documentCount: contextResult.documentCount,
      confidence: contextResult.confidence,
      contextSummary: contextResult.contextSummary,
      userLanguage: context.language,
      mode: context.mode,
    };

    // Create a message with metadata that the AI service will use to generate the appropriate greeting
    return baseGreeting; // Return base greeting and let AI enhance it with context
  }

  /**
   * Get chat statistics
   */
  getChatStats(): {
    messageCount: number;
    anatomyInteractions: number;
    documentsAccessed: number;
    isProcessing: boolean;
  } {
    const state = get(chatStore);

    return {
      messageCount: state.messages.length,
      anatomyInteractions: state.messages.filter(
        (m) => m.metadata?.anatomyFocus && m.metadata.anatomyFocus.length > 0,
      ).length,
      documentsAccessed: new Set(
        state.messages
          .filter((m) => m.metadata?.documentsReferenced)
          .flatMap((m) => m.metadata?.documentsReferenced || []),
      ).size,
      isProcessing: this.isProcessing,
    };
  }

  /**
   * Export conversation history
   */
  exportConversation(): string {
    const state = get(chatStore);
    const exportData = {
      context: state.context,
      messages: state.messages,
      timestamp: new Date().toISOString(),
      stats: this.getChatStats(),
    };

    return JSON.stringify(exportData, null, 2);
  }
}

// Export singleton instance
export const chatManager = new ChatManager();
export default chatManager;
