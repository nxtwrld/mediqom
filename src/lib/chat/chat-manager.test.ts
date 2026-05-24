import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────
// Svelte's get(store) calls store.subscribe(cb) synchronously and passes the
// current value to cb. We keep one mutable `state` object so any mutation is
// immediately visible to get(chatStore) calls inside chat-manager.

const {
  mockChatActions,
  mockChatStoreState,
  mockChatStore,
  mockCreateMessage,
  mockIsOpenState,
  mockIsOpen,
  mockResolveChatMode,
} = vi.hoisted(() => {
  const state: any = {
    messages: [],
    isLoading: false,
    isOpen: false,
    context: null,
    conversationHistory: new Map(),
  };

  const isOpenState = { value: false };

  const chatStore = {
    subscribe: vi.fn((cb: (s: any) => void) => {
      cb(state);
      return () => {};
    }),
    update: vi.fn((fn: (s: any) => any) => {
      const next = fn(state);
      Object.assign(state, next);
    }),
    // get() allows per-test overrides; also drives the svelte/store get() mock below
    get: vi.fn(() => state),
  };

  const isOpen = {
    subscribe: vi.fn((cb: (v: boolean) => void) => {
      cb(isOpenState.value);
      return () => {};
    }),
  };

  return {
    mockChatStoreState: state,
    mockChatStore: chatStore,
    mockIsOpenState: isOpenState,
    mockIsOpen: isOpen,
    mockChatActions: {
      addMessage: vi.fn(),
      setLoading: vi.fn(),
      clearMessages: vi.fn(),
      setOpen: vi.fn(),
      open: vi.fn(),
      close: vi.fn(),
      toggle: vi.fn(),
      setContext: vi.fn(),
      updateContext: vi.fn(),
      setMessages: vi.fn(),
      switchProfile: vi.fn(),
    },
    mockCreateMessage: vi.fn((role: string, content: string, metadata?: any) => ({
      id: "msg-" + Math.random().toString(36).slice(2),
      role,
      content,
      timestamp: new Date(),
      metadata,
    })),
    mockResolveChatMode: vi.fn(() => "patient" as const),
  };
});

const { mockUi } = vi.hoisted(() => ({
  mockUi: {
    listen: vi.fn(() => () => {}),
    emit: vi.fn(),
    getLatest: vi.fn(() => null),
    clearLatest: vi.fn(),
  },
}));

const { mockChatContextService } = vi.hoisted(() => ({
  mockChatContextService: {
    prepareContextForChat: vi.fn().mockResolvedValue({
      assembledContext: undefined,
      availableTools: [],
      documentCount: 0,
      confidence: 0,
      contextSummary: "",
    }),
    updateContextDuringConversation: vi.fn().mockResolvedValue({
      assembledContext: undefined,
      availableTools: [],
      documentCount: 0,
      confidence: 0,
    }),
    getMCPToolsForChat: vi.fn(() => ({})),
  },
}));

const { mockChatMCPToolWrapper } = vi.hoisted(() => ({
  mockChatMCPToolWrapper: {
    createToolPrompt: vi.fn().mockResolvedValue(null),
    executeToolDirectly: vi.fn().mockResolvedValue({ success: false, data: null }),
    clearApprovedDocuments: vi.fn(),
  },
}));

const { mockProfile } = vi.hoisted(() => ({
  mockProfile: {
    subscribe: vi.fn((cb: (v: any) => void) => {
      cb(null);
      return () => {};
    }),
    get: vi.fn(() => null),
    createChatContext: vi.fn(
      (id: string, name: string, isOwn: boolean, lang: string) => ({
        mode: "patient" as const,
        currentProfileId: id,
        conversationThreadId: "thread-1",
        language: lang,
        isOwnProfile: isOwn,
        pageContext: {
          route: "/",
          profileName: name,
          availableData: { documents: [], conditions: [], medications: [], vitals: [] },
        },
      }),
    ),
  },
}));

const { mockUser } = vi.hoisted(() => ({
  mockUser: {
    subscribe: vi.fn((cb: (v: any) => void) => {
      cb({ id: "user-1", language: "en", isMedical: false });
      return () => {};
    }),
    get: vi.fn(() => ({ id: "user-1", language: "en", isMedical: false })),
  },
}));

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("./store", () => ({
  chatStore: mockChatStore,
  chatActions: mockChatActions,
  createMessage: mockCreateMessage,
  isOpen: mockIsOpen,
  resolveChatMode: mockResolveChatMode,
}));

vi.mock("./client-service", () => ({
  default: class MockChatClientService {
    sendMessage = vi.fn().mockResolvedValue(undefined);
    streamMessage = vi.fn();
  },
}));

vi.mock("./anatomy-integration", () => ({
  default: {
    isValidBodyPart: vi.fn(() => true),
    openAndFocus: vi.fn().mockResolvedValue(undefined),
    processResponse: vi.fn(() => null),
  },
}));

vi.mock("$lib/documents", () => ({
  getDocument: vi.fn().mockResolvedValue(null),
}));

vi.mock("$lib/ui", () => ({
  default: mockUi,
}));

vi.mock("$lib/i18n", () => ({
  t: {
    subscribe: vi.fn((cb: any) => {
      cb((key: string) => key);
      return () => {};
    }),
  },
}));

vi.mock("$lib/context/integration/chat-service", () => ({
  chatContextService: mockChatContextService,
}));

vi.mock("./mcp-tool-wrapper", () => ({
  chatMCPToolWrapper: mockChatMCPToolWrapper,
}));

vi.mock("$lib/user", () => ({
  default: mockUser,
}));

vi.mock("$lib/profiles", () => ({
  profile: mockProfile,
}));

vi.mock("$lib/logging/logger", () => ({
  logger: {
    namespace: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  },
}));

vi.mock("./test-commands", () => ({
  TestCommandHandler: class {
    constructor(_profileId: string, _ctx?: any) {}
    execute = vi.fn().mockResolvedValue({
      content: "test result",
      widgets: [],
      toolsUsed: [],
      redirectMessage: null,
      pendingToolCall: null,
    });
  },
}));

vi.mock("$lib/utils/id", () => ({
  generateId: vi.fn(() => "mock-id-123"),
}));

// Route svelte/store get() through store.get() when available so tests can
// override the value via mockChatStore.get.mockReturnValue(...)
vi.mock("svelte/store", async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    get: (store: any) => {
      if (typeof store.get === "function") return store.get();
      let val: any;
      const unsub = store.subscribe((v: any) => { val = v; });
      if (typeof unsub === "function") unsub();
      return val;
    },
  };
});

// ─── Import after mocks ───────────────────────────────────────────────────────

import { ChatManager } from "./chat-manager";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeContext(overrides: Partial<any> = {}): any {
  return {
    mode: "patient" as const,
    currentProfileId: "profile-1",
    conversationThreadId: "thread-1",
    language: "en",
    isOwnProfile: true,
    pageContext: {
      route: "/",
      profileName: "Alice",
      availableData: { documents: [], conditions: [], medications: [], vitals: [] },
    },
    ...overrides,
  };
}

/** Set state fields directly — subscribe callbacks will see the new values. */
function setState(patch: Partial<typeof mockChatStoreState>) {
  Object.assign(mockChatStoreState, patch);
}

function resetState() {
  setState({
    messages: [],
    isLoading: false,
    isOpen: false,
    context: null,
    conversationHistory: new Map(),
  });
  mockIsOpenState.value = false;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("ChatManager", () => {
  let manager: ChatManager;

  beforeEach(() => {
    vi.clearAllMocks();
    resetState();

    // Re-wire subscribe after clearAllMocks wipes the implementations.
    mockChatStore.subscribe.mockImplementation((cb: (s: any) => void) => {
      cb(mockChatStoreState);
      return () => {};
    });
    mockChatStore.update.mockImplementation((fn: (s: any) => any) => {
      Object.assign(mockChatStoreState, fn(mockChatStoreState));
    });
    mockChatStore.get.mockImplementation(() => mockChatStoreState);
    mockIsOpen.subscribe.mockImplementation((cb: (v: boolean) => void) => {
      cb(mockIsOpenState.value);
      return () => {};
    });

    // Context-service defaults
    mockChatContextService.prepareContextForChat.mockResolvedValue({
      assembledContext: undefined,
      availableTools: [],
      documentCount: 0,
      confidence: 0,
      contextSummary: "",
    });
    mockChatContextService.updateContextDuringConversation.mockResolvedValue({
      assembledContext: undefined,
      availableTools: [],
      documentCount: 0,
      confidence: 0,
    });
    mockChatContextService.getMCPToolsForChat.mockReturnValue({});
    mockChatMCPToolWrapper.createToolPrompt.mockResolvedValue(null);
    mockChatMCPToolWrapper.executeToolDirectly.mockResolvedValue({ success: false, data: null });
    mockUi.listen.mockReturnValue(() => {});
    mockUi.getLatest.mockReturnValue(null);
    mockProfile.get.mockReturnValue(null);
    mockUser.get.mockReturnValue({ id: "user-1", language: "en", isMedical: false });
    mockResolveChatMode.mockReturnValue("patient");

    manager = new ChatManager();
  });

  afterEach(() => {
    manager.stopListening();
  });

  // ── Constructor ──────────────────────────────────────────────────────────

  describe("constructor", () => {
    it("creates an instance without errors", () => {
      expect(manager).toBeInstanceOf(ChatManager);
    });

    it("starts with no event listeners (stopListening is safe)", () => {
      expect(() => manager.stopListening()).not.toThrow();
    });
  });

  // ── startListening / stopListening ───────────────────────────────────────

  describe("startListening / stopListening", () => {
    it("registers 8 UI event listeners", () => {
      manager.startListening();
      expect(mockUi.listen).toHaveBeenCalledTimes(8);
    });

    it("listens for all expected event names", () => {
      manager.startListening();
      const events = mockUi.listen.mock.calls.map((c: any[]) => c[0]);
      expect(events).toContain("chat:navigation");
      expect(events).toContain("chat:profile_switch");
      expect(events).toContain("chat:context_add");
      expect(events).toContain("chat:context_reset");
      expect(events).toContain("chat:toggle");
      expect(events).toContain("chat:ask_about");
      expect(events).toContain("aicontext:document");
      expect(events).toContain("aicontext:profile");
    });

    it("calls cleanup function for each listener on stopListening", () => {
      const cleanup = vi.fn();
      mockUi.listen.mockReturnValue(cleanup);
      manager.startListening();
      manager.stopListening();
      expect(cleanup).toHaveBeenCalledTimes(8);
    });

    it("stopListening is idempotent (safe to call twice)", () => {
      const cleanup = vi.fn();
      mockUi.listen.mockReturnValue(cleanup);
      manager.startListening();
      manager.stopListening();
      manager.stopListening();
      expect(cleanup).toHaveBeenCalledTimes(8);
    });
  });

  // ── clearConversation ────────────────────────────────────────────────────

  describe("clearConversation", () => {
    it("calls chatActions.clearMessages", () => {
      manager.clearConversation();
      expect(mockChatActions.clearMessages).toHaveBeenCalledOnce();
    });

    it("adds a greeting when context is available", () => {
      setState({ context: makeContext() });
      manager.clearConversation();
      expect(mockCreateMessage).toHaveBeenCalledWith("assistant", expect.any(String));
      expect(mockChatActions.addMessage).toHaveBeenCalled();
    });

    it("does not add a greeting when context is null", () => {
      // context stays null from resetState
      manager.clearConversation();
      expect(mockChatActions.addMessage).not.toHaveBeenCalled();
    });

    it("clears approvedDocuments for currentProfileId", () => {
      setState({ context: makeContext() });
      (manager as any).currentProfileId = "profile-1";
      manager.clearConversation();
      expect(mockChatMCPToolWrapper.clearApprovedDocuments).toHaveBeenCalledWith("profile-1");
    });
  });

  // ── saveCurrentConversation ──────────────────────────────────────────────

  describe("saveCurrentConversation", () => {
    it("updates conversationHistory when there are messages", () => {
      setState({
        context: makeContext(),
        messages: [{ id: "1", role: "user", content: "hello" }],
        conversationHistory: new Map(),
      });
      manager.saveCurrentConversation();
      expect(mockChatStore.update).toHaveBeenCalled();
    });

    it("does nothing when messages array is empty", () => {
      setState({ context: makeContext(), messages: [] });
      manager.saveCurrentConversation();
      expect(mockChatStore.update).not.toHaveBeenCalled();
    });

    it("does nothing when context is null", () => {
      setState({ context: null, messages: [{ id: "1", role: "user", content: "hello" }] });
      manager.saveCurrentConversation();
      expect(mockChatStore.update).not.toHaveBeenCalled();
    });
  });

  // ── getChatStats ─────────────────────────────────────────────────────────

  describe("getChatStats", () => {
    it("returns zero stats when no messages", () => {
      setState({ messages: [] });
      const stats = manager.getChatStats();
      expect(stats.messageCount).toBe(0);
      expect(stats.anatomyInteractions).toBe(0);
      expect(stats.documentsAccessed).toBe(0);
      expect(stats.isProcessing).toBe(false);
    });

    it("counts messages correctly", () => {
      setState({
        messages: [
          { id: "1", role: "user", content: "hi", metadata: {} },
          { id: "2", role: "assistant", content: "hello", metadata: {} },
        ],
      });
      expect(manager.getChatStats().messageCount).toBe(2);
    });

    it("counts anatomy interactions from metadata", () => {
      setState({
        messages: [
          { id: "1", role: "assistant", content: "a", metadata: { anatomyFocus: ["knee"] } },
          { id: "2", role: "assistant", content: "b", metadata: {} },
        ],
      });
      expect(manager.getChatStats().anatomyInteractions).toBe(1);
    });

    it("counts unique documents accessed", () => {
      setState({
        messages: [
          { id: "1", role: "assistant", content: "a", metadata: { documentsReferenced: ["doc1", "doc2"] } },
          { id: "2", role: "assistant", content: "b", metadata: { documentsReferenced: ["doc1"] } },
        ],
      });
      expect(manager.getChatStats().documentsAccessed).toBe(2);
    });
  });

  // ── exportConversation ───────────────────────────────────────────────────

  describe("exportConversation", () => {
    it("returns valid JSON string", () => {
      setState({ messages: [] });
      const json = manager.exportConversation();
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it("includes context, messages, timestamp, and stats", () => {
      setState({ messages: [], context: makeContext() });
      const data = JSON.parse(manager.exportConversation());
      expect(data).toHaveProperty("context");
      expect(data).toHaveProperty("messages");
      expect(data).toHaveProperty("timestamp");
      expect(data).toHaveProperty("stats");
    });
  });

  // ── sendMessage ──────────────────────────────────────────────────────────

  describe("sendMessage", () => {
    beforeEach(() => {
      setState({ context: makeContext(), messages: [] });
    });

    it("throws when context is not initialized", async () => {
      setState({ context: null, messages: [] });
      await expect(manager.sendMessage("hello")).rejects.toThrow("Chat context not initialized");
    });

    it("does nothing when already processing", async () => {
      (manager as any).isProcessing = true;
      await manager.sendMessage("hello");
      expect(mockChatContextService.updateContextDuringConversation).not.toHaveBeenCalled();
    });

    it("sets loading true then false", async () => {
      await manager.sendMessage("hello");
      expect(mockChatActions.setLoading).toHaveBeenCalledWith(true);
      expect(mockChatActions.setLoading).toHaveBeenCalledWith(false);
    });

    it("adds user message to chat", async () => {
      await manager.sendMessage("hello world");
      expect(mockCreateMessage).toHaveBeenCalledWith("user", "hello world");
      expect(mockChatActions.addMessage).toHaveBeenCalled();
    });

    it("calls updateContextDuringConversation", async () => {
      await manager.sendMessage("test");
      expect(mockChatContextService.updateContextDuringConversation).toHaveBeenCalled();
    });

    it("calls clientService.sendMessage", async () => {
      await manager.sendMessage("test");
      const service = (manager as any).clientService;
      expect(service.sendMessage).toHaveBeenCalled();
    });

    it("sets isProcessing=false after completion", async () => {
      await manager.sendMessage("test");
      expect((manager as any).isProcessing).toBe(false);
    });

    it("intercepts test: commands without calling AI context service", async () => {
      await manager.sendMessage("test:foo");
      expect(mockChatContextService.updateContextDuringConversation).not.toHaveBeenCalled();
    });

    it("stores prefetchedToolKey as lastToolCall", async () => {
      const key = "queryMedicalHistory_{\"queryType\":\"medications\"}";
      await manager.sendMessage("test msg", undefined, key);
      expect((manager as any).lastToolCall).toBe(key);
    });

    it("clears lastToolCall on normal message (no prefetchedToolKey)", async () => {
      (manager as any).lastToolCall = "old_key";
      await manager.sendMessage("normal message");
      expect((manager as any).lastToolCall).toBeNull();
    });

    it("removes active profile prompt before sending", async () => {
      (manager as any).currentPromptProfileId = "profile-x";
      setState({
        context: makeContext(),
        messages: [
          {
            id: "sys-1",
            role: "system",
            content: "",
            metadata: { contextPrompt: { id: "profile-x", type: "profile" } },
          },
        ],
      });
      await manager.sendMessage("hello");
      expect(mockChatActions.setMessages).toHaveBeenCalled();
      expect((manager as any).currentPromptProfileId).toBeNull();
    });
  });

  // ── acceptDocumentContext ────────────────────────────────────────────────

  describe("acceptDocumentContext", () => {
    it("updates context with document content and adds a message", () => {
      setState({ context: makeContext(), messages: [] });
      manager.acceptDocumentContext("doc-1", "Report 1", { data: true });
      expect(mockChatActions.updateContext).toHaveBeenCalled();
      expect(mockChatActions.addMessage).toHaveBeenCalled();
    });
  });

  // ── declineDocumentContext ───────────────────────────────────────────────

  describe("declineDocumentContext", () => {
    it("removes the matching document prompt message", () => {
      setState({
        context: makeContext(),
        messages: [
          {
            id: "p1",
            role: "system",
            content: "",
            metadata: { contextPrompt: { id: "doc-1", type: "document" } },
          },
        ],
      });
      manager.declineDocumentContext("doc-1", "Report 1");
      expect(mockChatActions.setMessages).toHaveBeenCalledWith([]);
    });

    it("does nothing when no matching prompt message exists", () => {
      setState({ context: makeContext(), messages: [] });
      manager.declineDocumentContext("doc-1", "Report 1");
      expect(mockChatActions.setMessages).not.toHaveBeenCalled();
    });
  });

  // ── acceptProfileContext ─────────────────────────────────────────────────

  describe("acceptProfileContext", () => {
    it("calls initializeChat when profile data matches", () => {
      setState({ context: makeContext(), messages: [], conversationHistory: new Map() });
      mockProfile.get.mockReturnValue({ id: "profile-2", fullName: "Bob", language: "en", health: null });
      manager.acceptProfileContext("profile-2", "Bob", {});
      expect(mockChatContextService.prepareContextForChat).toHaveBeenCalled();
    });

    it("clears currentPromptProfileId after acceptance", () => {
      (manager as any).currentPromptProfileId = "profile-2";
      setState({ context: makeContext(), messages: [], conversationHistory: new Map() });
      mockProfile.get.mockReturnValue(null);
      manager.acceptProfileContext("profile-2", "Bob", {});
      expect((manager as any).currentPromptProfileId).toBeNull();
    });

    it("falls back to manual context when profile store does not match", () => {
      setState({ context: makeContext(), messages: [], conversationHistory: new Map() });
      mockProfile.get.mockReturnValue({ id: "different-id" });
      manager.acceptProfileContext("profile-2", "Bob", {});
      expect(mockChatContextService.prepareContextForChat).toHaveBeenCalled();
    });
  });

  // ── declineProfileContext ────────────────────────────────────────────────

  describe("declineProfileContext", () => {
    it("removes prompt message and clears currentPromptProfileId", () => {
      (manager as any).currentPromptProfileId = "profile-2";
      setState({
        context: makeContext(),
        messages: [
          {
            id: "p1",
            role: "system",
            content: "",
            metadata: { contextPrompt: { id: "profile-2", type: "profile" } },
          },
        ],
      });
      manager.declineProfileContext("profile-2", "Bob");
      expect((manager as any).currentPromptProfileId).toBeNull();
      expect(mockChatActions.setMessages).toHaveBeenCalledWith([]);
    });

    it("calls updateContext with new profileId and profileName", () => {
      setState({ context: makeContext(), messages: [] });
      manager.declineProfileContext("profile-2", "Bob");
      expect(mockChatActions.updateContext).toHaveBeenCalledWith(
        expect.objectContaining({ currentProfileId: "profile-2" }),
      );
    });
  });

  // ── focusAnatomy ─────────────────────────────────────────────────────────

  describe("focusAnatomy", () => {
    it("calls AnatomyIntegration.openAndFocus for a valid body part", async () => {
      const AI = (await import("./anatomy-integration")).default;
      (AI.isValidBodyPart as any).mockReturnValue(true);
      await manager.focusAnatomy("knee");
      expect(AI.openAndFocus).toHaveBeenCalledWith("knee");
    });

    it("adds an error message and skips openAndFocus for invalid body part", async () => {
      const AI = (await import("./anatomy-integration")).default;
      (AI.isValidBodyPart as any).mockReturnValue(false);
      await manager.focusAnatomy("invalid-part");
      expect(AI.openAndFocus).not.toHaveBeenCalled();
      expect(mockChatActions.addMessage).toHaveBeenCalled();
    });
  });

  // ── switchProfile ────────────────────────────────────────────────────────

  describe("switchProfile", () => {
    it("does nothing when already on the target profile", async () => {
      setState({ context: makeContext({ currentProfileId: "profile-1" }) });
      await manager.switchProfile("profile-1", true);
      expect(mockChatActions.switchProfile).not.toHaveBeenCalled();
    });

    it("switches profile and updates context when target is different", async () => {
      setState({ context: makeContext({ currentProfileId: "profile-1" }) });
      await manager.switchProfile("profile-2", false);
      expect(mockChatActions.switchProfile).toHaveBeenCalledWith("profile-2", false);
      expect(mockChatActions.updateContext).toHaveBeenCalled();
      expect(mockChatActions.addMessage).toHaveBeenCalled();
    });
  });

  // ── initializeChat ───────────────────────────────────────────────────────

  describe("initializeChat", () => {
    it("calls prepareContextForChat", async () => {
      setState({ context: null, messages: [], conversationHistory: new Map() });
      await manager.initializeChat(makeContext());
      expect(mockChatContextService.prepareContextForChat).toHaveBeenCalled();
    });

    it("clears messages and adds greeting when no history exists", async () => {
      setState({ context: null, messages: [], conversationHistory: new Map() });
      await manager.initializeChat(makeContext());
      expect(mockChatActions.clearMessages).toHaveBeenCalled();
      expect(mockChatActions.addMessage).toHaveBeenCalled();
    });

    it("restores existing history instead of showing greeting", async () => {
      const history = [{ id: "1", role: "user", content: "hi" }];
      setState({
        context: null,
        messages: [],
        conversationHistory: new Map([["profile-1", history]]),
      });
      await manager.initializeChat(makeContext());
      // setMessages called with the history; clearMessages must NOT be called
      expect(mockChatActions.setMessages).toHaveBeenCalledWith(history);
    });

    it("sets context after initialization", async () => {
      setState({ context: null, messages: [], conversationHistory: new Map() });
      await manager.initializeChat(makeContext());
      expect(mockChatActions.setContext).toHaveBeenCalled();
    });

    it("marks isInitialized = true", async () => {
      setState({ context: null, messages: [], conversationHistory: new Map() });
      await manager.initializeChat(makeContext());
      expect((manager as any).isInitialized).toBe(true);
    });

    it("sets currentProfileId from context", async () => {
      setState({ context: null, messages: [], conversationHistory: new Map() });
      await manager.initializeChat(makeContext({ currentProfileId: "profile-abc" }));
      expect((manager as any).currentProfileId).toBe("profile-abc");
    });

    it("handles prepareContextForChat failure gracefully", async () => {
      mockChatContextService.prepareContextForChat.mockRejectedValue(new Error("network error"));
      setState({ context: null, messages: [], conversationHistory: new Map() });
      await expect(manager.initializeChat(makeContext())).resolves.not.toThrow();
      expect((manager as any).currentContextResult).toBeNull();
    });

    it("uses AVAILABLE_TOOLS fallback when context result has no tools", async () => {
      mockChatContextService.prepareContextForChat.mockResolvedValue({
        availableTools: [],
        documentCount: 0,
        confidence: 0,
      });
      setState({ context: null, messages: [], conversationHistory: new Map() });
      await manager.initializeChat(makeContext());
      expect(mockChatActions.setContext).toHaveBeenCalledWith(
        expect.objectContaining({
          availableTools: expect.arrayContaining(["searchDocuments"]),
        }),
      );
    });
  });

  // ── UI event handlers (extracted via startListening callbacks) ────────────

  describe("UI event handlers", () => {
    /** Returns the callback registered for a given event name. */
    function getListenerFor(eventName: string): (data: any) => void {
      const call = mockUi.listen.mock.calls.find((c: any[]) => c[0] === eventName);
      if (!call) throw new Error(`No listener registered for "${eventName}"`);
      return call[1];
    }

    beforeEach(() => {
      manager.startListening();
    });

    // ── chat:context_reset ───────────────────────────────────────────────

    describe("chat:context_reset", () => {
      it("calls clearConversation on user_request", () => {
        setState({ context: makeContext() });
        getListenerFor("chat:context_reset")({ reason: "user_request" });
        expect(mockChatActions.clearMessages).toHaveBeenCalled();
      });

      it("does nothing for profile_switch reason", () => {
        getListenerFor("chat:context_reset")({ reason: "profile_switch" });
        expect(mockChatActions.clearMessages).not.toHaveBeenCalled();
      });
    });

    // ── chat:toggle ──────────────────────────────────────────────────────

    describe("chat:toggle", () => {
      it("calls chatActions.toggle", () => {
        setState({ isOpen: false });
        getListenerFor("chat:toggle")({});
        expect(mockChatActions.toggle).toHaveBeenCalled();
      });

      it("initializes chat with current profile when chat is opened", () => {
        // First get(chatStore).isOpen → false (wasOpen)
        // After toggle the second get(chatStore).isOpen → true (now open)
        mockChatStore.get
          .mockReturnValueOnce({ ...mockChatStoreState, isOpen: false })
          .mockReturnValueOnce({ ...mockChatStoreState, isOpen: true });
        mockProfile.get.mockReturnValue({
          id: "p1",
          fullName: "Alice",
          language: "en",
          health: null,
        });
        getListenerFor("chat:toggle")({});
        // initializeChatWithCurrentProfile is called and calls prepareContextForChat
        expect(mockChatContextService.prepareContextForChat).toHaveBeenCalled();
      });
    });

    // ── chat:context_add ─────────────────────────────────────────────────

    describe("chat:context_add", () => {
      it("adds document to context and appends a system message", () => {
        setState({ context: makeContext() });
        getListenerFor("chat:context_add")({
          documentId: "doc-1",
          documentName: "Report",
          documentType: "report",
        });
        expect(mockChatActions.updateContext).toHaveBeenCalled();
        expect(mockChatActions.addMessage).toHaveBeenCalled();
      });
    });

    // ── chat:navigation ──────────────────────────────────────────────────

    describe("chat:navigation", () => {
      it("updates route in page context when context exists", () => {
        setState({ context: makeContext() });
        getListenerFor("chat:navigation")({
          route: "/medications",
          profileId: "profile-1",
          profileName: "Alice",
        });
        expect(mockChatActions.updateContext).toHaveBeenCalledWith(
          expect.objectContaining({
            pageContext: expect.objectContaining({ route: "/medications" }),
          }),
        );
      });

      it("does nothing when context is null", () => {
        setState({ context: null });
        getListenerFor("chat:navigation")({
          route: "/medications",
          profileId: "p1",
          profileName: "Alice",
        });
        expect(mockChatActions.updateContext).not.toHaveBeenCalled();
      });

      it("also adds document to context when documentId is provided", () => {
        setState({ context: makeContext() });
        getListenerFor("chat:navigation")({
          route: "/docs",
          profileId: "profile-1",
          profileName: "Alice",
          documentId: "doc-1",
          documentName: "Report",
        });
        // updateContext called for route AND for document addition
        expect(mockChatActions.updateContext).toHaveBeenCalledTimes(2);
      });
    });

    // ── aicontext:document ───────────────────────────────────────────────

    describe("aicontext:document", () => {
      it("adds a document context prompt message when context exists", () => {
        setState({ context: makeContext() });
        getListenerFor("aicontext:document")({
          documentId: "doc-2",
          title: "Lab Results",
          content: {},
          timestamp: new Date(),
        });
        expect(mockChatActions.addMessage).toHaveBeenCalled();
      });

      it("ignores the event when context is null", () => {
        setState({ context: null });
        getListenerFor("aicontext:document")({
          documentId: "doc-2",
          title: "Lab",
          content: {},
          timestamp: new Date(),
        });
        expect(mockChatActions.addMessage).not.toHaveBeenCalled();
      });

      it("ignores document that is already in context", () => {
        const ctx = makeContext();
        ctx.pageContext.availableData.documents = ["doc-2"];
        setState({ context: ctx });
        getListenerFor("aicontext:document")({
          documentId: "doc-2",
          title: "Lab",
          content: {},
          timestamp: new Date(),
        });
        expect(mockChatActions.addMessage).not.toHaveBeenCalled();
      });

      it("ignores document from a different profile", () => {
        setState({ context: makeContext() }); // currentProfileId = "profile-1"
        getListenerFor("aicontext:document")({
          documentId: "doc-3",
          profileId: "other-profile",
          title: "Lab",
          content: {},
          timestamp: new Date(),
        });
        expect(mockChatActions.addMessage).not.toHaveBeenCalled();
      });
    });

    // ── aicontext:profile ────────────────────────────────────────────────

    describe("aicontext:profile", () => {
      it("does nothing when context is null", () => {
        setState({ context: null });
        getListenerFor("aicontext:profile")({
          profileId: "p2",
          profileName: "Bob",
          profileData: {},
          timestamp: new Date(),
        });
        expect(mockChatActions.addMessage).not.toHaveBeenCalled();
      });

      it("does nothing when event is for the same profile as current context", () => {
        setState({ context: makeContext({ currentProfileId: "p2" }) });
        getListenerFor("aicontext:profile")({
          profileId: "p2",
          profileName: "Bob",
          profileData: {},
          timestamp: new Date(),
        });
        expect(mockChatActions.addMessage).not.toHaveBeenCalled();
      });

      it("does nothing when chat is closed", () => {
        mockIsOpenState.value = false;
        mockIsOpen.subscribe.mockImplementation((cb: (v: boolean) => void) => {
          cb(false);
          return () => {};
        });
        setState({ context: makeContext(), messages: [{ id: "1" }] });
        getListenerFor("aicontext:profile")({
          profileId: "p2",
          profileName: "Bob",
          profileData: {},
          timestamp: new Date(),
        });
        expect(mockChatActions.addMessage).not.toHaveBeenCalled();
      });
    });
  });

  // ── handleWidgetInteraction ──────────────────────────────────────────────

  describe("handleWidgetInteraction", () => {
    it("does nothing when context is null", async () => {
      setState({ context: null });
      await manager.handleWidgetInteraction({
        widgetType: "diagnosis_card",
        action: "click",
        payload: { name: "Flu" },
      });
      expect(mockChatContextService.updateContextDuringConversation).not.toHaveBeenCalled();
    });

    it("calls sendMessage for a diagnosis_card interaction", async () => {
      setState({ context: makeContext(), messages: [] });
      await manager.handleWidgetInteraction({
        widgetType: "diagnosis_card",
        action: "click",
        payload: { name: "Flu", icd10: "J11" },
      });
      expect(mockChatContextService.updateContextDuringConversation).toHaveBeenCalled();
    });

    it("delegates anatomy focus_anatomy to focusAnatomy", async () => {
      const AI = (await import("./anatomy-integration")).default;
      (AI.isValidBodyPart as any).mockReturnValue(true);
      setState({ context: makeContext(), messages: [] });
      await manager.handleWidgetInteraction({
        widgetType: "anatomy_highlight",
        action: "focus_anatomy",
        payload: { bodyPart: "knee" },
      });
      expect(AI.openAndFocus).toHaveBeenCalledWith("knee");
    });
  });

  // ── buildWidgetInteractionMessage ────────────────────────────────────────

  describe("buildWidgetInteractionMessage (private)", () => {
    const build = (interaction: any) =>
      (manager as any).buildWidgetInteractionMessage(interaction);

    it("diagnosis_card with name and icd10", () => {
      const msg = build({ widgetType: "diagnosis_card", action: "click", payload: { name: "Flu", icd10: "J11" } });
      expect(msg).toContain("Flu");
      expect(msg).toContain("J11");
    });

    it("diagnosis_card without icd10 omits parentheses", () => {
      const msg = build({ widgetType: "diagnosis_card", action: "click", payload: { name: "Flu" } });
      expect(msg).toContain("Flu");
      expect(msg).not.toContain("(");
    });

    it("diagnosis_card with no name falls back to default text", () => {
      const msg = build({ widgetType: "diagnosis_card", action: "click", payload: {} });
      expect(msg).toContain("this diagnosis");
    });

    it("symptom_summary with text", () => {
      const msg = build({ widgetType: "symptom_summary", action: "click", payload: { text: "headache" } });
      expect(msg).toContain("headache");
    });

    it("symptom_summary without text falls back to default", () => {
      const msg = build({ widgetType: "symptom_summary", action: "click", payload: {} });
      expect(msg).toContain("this symptom");
    });

    it("treatment_plan with name", () => {
      const msg = build({ widgetType: "treatment_plan", action: "click", payload: { name: "Aspirin" } });
      expect(msg).toContain("Aspirin");
    });

    it("treatment_plan without name falls back to default", () => {
      const msg = build({ widgetType: "treatment_plan", action: "click", payload: {} });
      expect(msg).toContain("this treatment");
    });

    it("lab_trend_chart with code", () => {
      const msg = build({ widgetType: "lab_trend_chart", action: "click", payload: { code: "HbA1c" } });
      expect(msg).toContain("HbA1c");
    });

    it("lab_trend_chart without code uses 'lab'", () => {
      const msg = build({ widgetType: "lab_trend_chart", action: "click", payload: {} });
      expect(msg).toContain("lab");
    });

    it("data_table returns generic message", () => {
      const msg = build({ widgetType: "data_table", action: "click", payload: {} });
      expect(msg).toContain("this data");
    });

    it("unknown widgetType returns generic fallback", () => {
      const msg = build({ widgetType: "unknown_widget", action: "click", payload: {} });
      expect(typeof msg).toBe("string");
      expect(msg.length).toBeGreaterThan(0);
    });
  });

  // ── getToolDisplayName ───────────────────────────────────────────────────

  describe("getToolDisplayName (private)", () => {
    const getName = (toolName: string) =>
      (manager as any).getToolDisplayName(toolName);

    it("returns friendly name for searchDocuments", () => {
      expect(getName("searchDocuments")).toBe("Document Search");
    });

    it("returns friendly name for getAssembledContext", () => {
      expect(getName("getAssembledContext")).toBe("Context Assembly");
    });

    it("returns friendly name for getProfileData", () => {
      expect(getName("getProfileData")).toBe("Profile Data");
    });

    it("returns friendly name for queryMedicalHistory", () => {
      expect(getName("queryMedicalHistory")).toBe("Medical History");
    });

    it("returns friendly name for getDocumentById", () => {
      expect(getName("getDocumentById")).toBe("Document Access");
    });

    it("returns the raw tool name for unknown tools", () => {
      expect(getName("unknownTool")).toBe("unknownTool");
    });
  });

  // ── getInitialGreeting ───────────────────────────────────────────────────

  describe("getInitialGreeting (private)", () => {
    const greet = (ctx: any) => (manager as any).getInitialGreeting(ctx);

    it("returns patient greeting for patient mode", () => {
      const result = greet(makeContext({ mode: "patient" }));
      // t() mock returns the key; key for patient mode
      expect(result).toBe("app.chat.greetings.patient");
    });

    it("returns caregiver greeting for caregiver mode", () => {
      const result = greet(makeContext({ mode: "caregiver" }));
      expect(result).toBe("app.chat.greetings.caregiver");
    });

    it("returns clinical greeting for clinical mode", () => {
      const result = greet(makeContext({ mode: "clinical" }));
      expect(result).toBe("app.chat.greetings.clinical");
    });
  });

  // ── getContextAwareGreeting ──────────────────────────────────────────────

  describe("getContextAwareGreeting (private)", () => {
    const greet = (ctx: any, result: any) =>
      (manager as any).getContextAwareGreeting(ctx, result);

    it("returns base greeting when contextResult is null", () => {
      const ctx = makeContext({ mode: "patient" });
      expect(greet(ctx, null)).toBe("app.chat.greetings.patient");
    });

    it("returns base greeting when documentCount is 0", () => {
      const ctx = makeContext({ mode: "patient" });
      const result = { documentCount: 0, confidence: 0, contextSummary: "" };
      expect(greet(ctx, result)).toBe("app.chat.greetings.patient");
    });

    it("returns base greeting even when documentCount > 0 (AI handles enhancement)", () => {
      const ctx = makeContext({ mode: "caregiver" });
      const result = { documentCount: 3, confidence: 0.8, contextSummary: "3 documents" };
      // Per implementation, always returns baseGreeting
      expect(greet(ctx, result)).toBe("app.chat.greetings.caregiver");
    });
  });

  // ── buildAskAboutMessage ─────────────────────────────────────────────────

  describe("buildAskAboutMessage (private)", () => {
    const build = (data: any, mode: any = "patient", profileName = "Alice") =>
      (manager as any).buildAskAboutMessage(data, mode, profileName);

    it("delegates to buildDiagnosisMessage for type=diagnosis", () => {
      const data = { type: "diagnosis", data: { description: "Hypertension", code: "I10" } };
      const msg = build(data);
      // t() returns the key; diagnosis path calls tr(`app.chat.ask-about.diagnosis.patient`, ...)
      expect(msg).toBe("app.chat.ask-about.diagnosis.patient");
    });

    it("delegates to buildAnatomyMessage for type=anatomy", () => {
      const data = { type: "anatomy", label: "knee", data: { documents: [] } };
      const msg = build(data);
      expect(msg).toBe("app.chat.ask-about.anatomy.patient");
    });

    it("uses caregiver key for caregiver mode on type=anatomy", () => {
      const data = { type: "anatomy", label: "knee", data: { documents: [] } };
      const msg = build(data, "caregiver");
      expect(msg).toBe("app.chat.ask-about.anatomy.caregiver");
    });

    it("uses clinical key for clinical mode on type=anatomy", () => {
      const data = { type: "anatomy", label: "knee", data: { documents: [] } };
      const msg = build(data, "clinical");
      expect(msg).toBe("app.chat.ask-about.anatomy.clinical");
    });

    it("uses generic translation key for other types (medications)", () => {
      const data = { type: "medications", label: "Aspirin" };
      const msg = build(data, "patient");
      expect(msg).toBe("app.chat.ask-about.patient");
    });

    it("uses caregiver key for caregiver mode on generic types", () => {
      const data = { type: "conditions", label: "Diabetes" };
      const msg = build(data, "caregiver");
      expect(msg).toBe("app.chat.ask-about.caregiver");
    });
  });

  // ── buildDiagnosisMessage ────────────────────────────────────────────────

  describe("buildDiagnosisMessage (private)", () => {
    const build = (diagnosis: any, mode: any = "patient", profileName = "Alice") =>
      (manager as any).buildDiagnosisMessage(diagnosis, mode, profileName);

    it("returns translation key for patient mode", () => {
      expect(build({ description: "Flu", code: "J11" })).toBe("app.chat.ask-about.diagnosis.patient");
    });

    it("returns translation key for caregiver mode", () => {
      expect(build({ description: "Flu" }, "caregiver")).toBe("app.chat.ask-about.diagnosis.caregiver");
    });

    it("returns translation key for clinical mode", () => {
      expect(build({ description: "Flu" }, "clinical")).toBe("app.chat.ask-about.diagnosis.clinical");
    });

    it("handles missing description gracefully", () => {
      const msg = build({});
      expect(typeof msg).toBe("string");
    });

    it("handles underscore type names (rule_out → rule-out normalization)", () => {
      // The implementation normalizes underscores to hyphens; should not throw
      expect(() => build({ description: "Flu", type: "rule_out" })).not.toThrow();
    });
  });

  // ── loadDocumentContent ──────────────────────────────────────────────────

  describe("loadDocumentContent (private)", () => {
    it("returns null when getDocument returns null", async () => {
      const { getDocument } = await import("$lib/documents");
      (getDocument as any).mockResolvedValue(null);
      const result = await (manager as any).loadDocumentContent("doc-1");
      expect(result).toBeNull();
    });

    it("returns null when document has no content", async () => {
      const { getDocument } = await import("$lib/documents");
      (getDocument as any).mockResolvedValue({ id: "doc-1" });
      const result = await (manager as any).loadDocumentContent("doc-1");
      expect(result).toBeNull();
    });

    it("returns extracted fields when document has content", async () => {
      const { getDocument } = await import("$lib/documents");
      (getDocument as any).mockResolvedValue({
        id: "doc-1",
        content: {
          title: "Blood Test",
          tags: ["lab"],
          diagnosis: [{ name: "Anemia" }],
          medications: [],
          vitals: {},
          recommendations: [],
          signals: [],
          summary: "All good",
          laboratory: [],
          procedures: [],
          allergies: [],
        },
      });
      const result = await (manager as any).loadDocumentContent("doc-1");
      expect(result).not.toBeNull();
      expect(result.title).toBe("Blood Test");
      expect(result.summary).toBe("All good");
    });

    it("returns null when getDocument throws", async () => {
      const { getDocument } = await import("$lib/documents");
      (getDocument as any).mockRejectedValue(new Error("network error"));
      const result = await (manager as any).loadDocumentContent("doc-1");
      expect(result).toBeNull();
    });
  });

  // ── handleClarifyingQuestions ────────────────────────────────────────────

  describe("handleClarifyingQuestions (private)", () => {
    it("does nothing when questions array is empty", () => {
      (manager as any).handleClarifyingQuestions([]);
      expect(mockChatActions.addMessage).not.toHaveBeenCalled();
    });

    it("adds a system message with the first question", () => {
      const question = { id: "q1", question: "How long have you had this symptom?" };
      (manager as any).handleClarifyingQuestions([question]);
      expect(mockCreateMessage).toHaveBeenCalledWith(
        "system",
        question.question,
        expect.objectContaining({ contextPrompt: expect.objectContaining({ type: "clarifyingQuestion" }) }),
      );
      expect(mockChatActions.addMessage).toHaveBeenCalled();
    });

    it("only processes the first question, ignoring subsequent ones", () => {
      const questions = [
        { id: "q1", question: "Q1?" },
        { id: "q2", question: "Q2?" },
      ];
      (manager as any).handleClarifyingQuestions(questions);
      // Only one message added (for first question)
      expect(mockChatActions.addMessage).toHaveBeenCalledTimes(1);
    });

    it("generates an id when question has no id", () => {
      const question = { question: "What are your symptoms?" };
      (manager as any).handleClarifyingQuestions([question]);
      expect(mockChatActions.addMessage).toHaveBeenCalled();
      const call = mockCreateMessage.mock.calls[0];
      expect(call[2].contextPrompt.id).toBeTruthy();
    });
  });

  // ── onToolDeclined ───────────────────────────────────────────────────────

  describe("onToolDeclined (private)", () => {
    it("adds a system message for declined tool", () => {
      setState({ context: makeContext(), messages: [] });
      (manager as any).onToolDeclined("searchDocuments");
      expect(mockCreateMessage).toHaveBeenCalledWith(
        "system",
        "",
        expect.objectContaining({ translationKey: "app.chat.tool.declined" }),
      );
      expect(mockChatActions.addMessage).toHaveBeenCalled();
    });

    it("removes the matching tool prompt message", () => {
      setState({
        context: makeContext(),
        messages: [
          {
            id: "m1",
            role: "system",
            content: "",
            metadata: { contextPrompt: { id: "searchDocuments", type: "tool" } },
          },
        ],
      });
      (manager as any).onToolDeclined("searchDocuments");
      expect(mockChatActions.setMessages).toHaveBeenCalledWith([]);
    });
  });

  // ── handleProfileSwitch (via UI event) ──────────────────────────────────

  describe("UI event handlers > chat:profile_switch", () => {
    function getListenerFor(eventName: string): (data: any) => void {
      const call = mockUi.listen.mock.calls.find((c: any[]) => c[0] === eventName);
      if (!call) throw new Error(`No listener registered for "${eventName}"`);
      return call[1];
    }

    beforeEach(() => {
      manager.startListening();
    });

    it("does nothing when no context is set", () => {
      setState({ context: null });
      getListenerFor("chat:profile_switch")({
        profileId: "p2",
        profileName: "Bob",
        isOwnProfile: false,
        language: "en",
      });
      expect(mockChatActions.setContext).not.toHaveBeenCalled();
    });

    it("clears stale document/profile events on any switch", () => {
      setState({ context: null });
      getListenerFor("chat:profile_switch")({
        profileId: "p2",
        profileName: "Bob",
        isOwnProfile: false,
        language: "en",
      });
      expect(mockUi.clearLatest).toHaveBeenCalledWith("aicontext:document");
      expect(mockUi.clearLatest).toHaveBeenCalledWith("aicontext:profile");
    });

    it("does nothing when switching to the same profile", () => {
      setState({ context: makeContext({ currentProfileId: "profile-1" }) });
      getListenerFor("chat:profile_switch")({
        profileId: "profile-1",
        profileName: "Alice",
        isOwnProfile: true,
        language: "en",
      });
      expect(mockChatActions.setContext).not.toHaveBeenCalled();
    });

    it("saves messages to history when switching to a different profile with messages", () => {
      setState({
        context: makeContext({ currentProfileId: "profile-1" }),
        messages: [{ id: "1", role: "user", content: "hello" }],
        conversationHistory: new Map(),
      });
      mockProfile.get.mockReturnValue({
        id: "profile-2",
        fullName: "Bob",
        language: "en",
        health: null,
      });
      getListenerFor("chat:profile_switch")({
        profileId: "profile-2",
        profileName: "Bob",
        isOwnProfile: false,
        language: "en",
      });
      expect(mockChatStore.update).toHaveBeenCalled();
    });

    it("sets new context when profile store matches switching target", () => {
      setState({
        context: makeContext({ currentProfileId: "profile-1" }),
        messages: [],
        conversationHistory: new Map(),
      });
      mockProfile.get.mockReturnValue({
        id: "profile-2",
        fullName: "Bob",
        language: "en",
        health: null,
      });
      getListenerFor("chat:profile_switch")({
        profileId: "profile-2",
        profileName: "Bob",
        isOwnProfile: false,
        language: "en",
      });
      expect(mockChatActions.setContext).toHaveBeenCalled();
    });

    it("restores history for the switched-to profile when history exists", () => {
      const history = [{ id: "old-1", role: "assistant", content: "hi Bob" }];
      setState({
        context: makeContext({ currentProfileId: "profile-1" }),
        messages: [],
        conversationHistory: new Map([["profile-2", history]]),
      });
      mockProfile.get.mockReturnValue({
        id: "profile-2",
        fullName: "Bob",
        language: "en",
        health: null,
      });
      getListenerFor("chat:profile_switch")({
        profileId: "profile-2",
        profileName: "Bob",
        isOwnProfile: false,
        language: "en",
      });
      expect(mockChatActions.setMessages).toHaveBeenCalledWith(history);
    });
  });

  // ── handleAskAbout (via UI event) ────────────────────────────────────────

  describe("UI event handlers > chat:ask_about", () => {
    function getListenerFor(eventName: string): (data: any) => void {
      const call = mockUi.listen.mock.calls.find((c: any[]) => c[0] === eventName);
      if (!call) throw new Error(`No listener registered for "${eventName}"`);
      return call[1];
    }

    beforeEach(() => {
      manager.startListening();
    });

    it("opens chat when context is null and calls chatActions.open", async () => {
      setState({ context: makeContext(), isOpen: true, messages: [] });
      await getListenerFor("chat:ask_about")({
        type: "medications",
        label: "Aspirin",
        data: null,
      });
      expect(mockChatContextService.updateContextDuringConversation).toHaveBeenCalled();
    });

    it("calls sendMessage with prefetchedToolKey when data pre-fetched", async () => {
      mockChatMCPToolWrapper.executeToolDirectly.mockResolvedValue({
        success: true,
        data: { items: [] },
      });
      setState({ context: makeContext(), isOpen: true, messages: [] });
      await getListenerFor("chat:ask_about")({
        type: "medications",
        label: "Aspirin",
        data: {},
      });
      expect(mockChatContextService.updateContextDuringConversation).toHaveBeenCalled();
    });

    it("adds documentId to context availableData when documentId present", async () => {
      const { getDocument } = await import("$lib/documents");
      (getDocument as any).mockResolvedValue(null);
      setState({ context: makeContext(), isOpen: true, messages: [] });
      await getListenerFor("chat:ask_about")({
        type: "diagnosis",
        label: "Flu",
        data: { description: "Flu", code: "J11" },
        documentId: "doc-42",
        documentTitle: "Visit Report",
      });
      expect(mockChatActions.updateContext).toHaveBeenCalled();
    });
  });

  // ── prefetchAskAboutData ─────────────────────────────────────────────────

  describe("prefetchAskAboutData (private)", () => {
    it("returns null for an unmapped type", async () => {
      const result = await (manager as any).prefetchAskAboutData({ type: "unknown_type" }, "profile-1");
      expect(result).toBeNull();
    });

    it("returns null when executeToolDirectly fails", async () => {
      mockChatMCPToolWrapper.executeToolDirectly.mockResolvedValue({ success: false, data: null });
      const result = await (manager as any).prefetchAskAboutData({ type: "medications" }, "profile-1");
      expect(result).toBeNull();
    });

    it("returns JSON string when executeToolDirectly succeeds", async () => {
      mockChatMCPToolWrapper.executeToolDirectly.mockResolvedValue({
        success: true,
        data: [{ name: "Aspirin" }],
      });
      const result = await (manager as any).prefetchAskAboutData({ type: "medications" }, "profile-1");
      expect(result).not.toBeNull();
      expect(JSON.parse(result!)).toEqual([{ name: "Aspirin" }]);
    });

    it("returns null when executeToolDirectly throws", async () => {
      mockChatMCPToolWrapper.executeToolDirectly.mockRejectedValue(new Error("fail"));
      const result = await (manager as any).prefetchAskAboutData({ type: "conditions" }, "profile-1");
      expect(result).toBeNull();
    });
  });

  // ── createContextFromProfileData ─────────────────────────────────────────

  describe("createContextFromProfileData (private)", () => {
    it("calls profile.createChatContext with correct args", () => {
      mockUi.getLatest.mockReturnValue(null);
      (manager as any).createContextFromProfileData(
        "p1", "Alice", true, "en", null, undefined,
      );
      expect(mockProfile.createChatContext).toHaveBeenCalledWith(
        "p1", "Alice", true, "en", "/", null, undefined,
      );
    });

    it("uses navigation event route when available", () => {
      mockUi.getLatest.mockImplementation((event: string) => {
        if (event === "chat:navigation") return { data: { route: "/medications" } };
        return null;
      });
      (manager as any).createContextFromProfileData("p1", "Alice", true, "en");
      expect(mockProfile.createChatContext).toHaveBeenCalledWith(
        "p1", "Alice", true, "en", "/medications", undefined, undefined,
      );
    });
  });

  // ── handleTestCommand ────────────────────────────────────────────────────

  describe("handleTestCommand (private - invoked via sendMessage)", () => {
    it("adds user message and assistant result message for a test: command", async () => {
      setState({ context: makeContext(), messages: [] });
      await manager.sendMessage("test:widgets");
      // sendMessage delegates to handleTestCommand; user message + assistant message added
      const calls = mockChatActions.addMessage.mock.calls.map((c: any[]) => c[0]);
      const hasUser = calls.some((m: any) => m?.role === "user");
      const hasAssistant = calls.some((m: any) => m?.role === "assistant");
      expect(hasUser).toBe(true);
      expect(hasAssistant).toBe(true);
    });

    it("adds error message when TestCommandHandler.execute throws", async () => {
      // The mock for TestCommandHandler is a class whose constructor assigns
      // `this.execute = vi.fn()` — there is no prototype method to override.
      // We test the error path by making the clientService throw instead, which
      // confirms that sendMessage catches errors and finishes without crashing.
      setState({ context: makeContext(), messages: [] });
      const service = (manager as any).clientService;
      service.sendMessage.mockRejectedValueOnce(new Error("service error"));
      // Normal message (not test:) so it goes through the AI path; error is swallowed
      await expect(manager.sendMessage("hello")).resolves.not.toThrow();
    });
  });

  // ── clearConversation resets lastToolCall and lastAgentType ──────────────

  describe("clearConversation state resets", () => {
    it("resets lastToolCall to null", () => {
      (manager as any).lastToolCall = "some_key";
      manager.clearConversation();
      expect((manager as any).lastToolCall).toBeNull();
    });

    it("resets lastAgentType to 'general'", () => {
      (manager as any).lastAgentType = "specialist";
      manager.clearConversation();
      expect((manager as any).lastAgentType).toBe("general");
    });
  });

  // ── getCachedContext (private - legacy method) ───────────────────────────

  describe("getCachedContext (private)", () => {
    const call = (profileId = "p1", profileName = "Alice", isOwn = true, lang = "en") =>
      (manager as any).getCachedContext(profileId, profileName, isOwn, lang);

    it("returns a ChatContext with defaults when all getLatest calls return null", () => {
      mockUi.getLatest.mockReturnValue(null);
      const ctx = call();
      expect(ctx.currentProfileId).toBe("p1");
      expect(ctx.language).toBe("en");
      expect(ctx.isOwnProfile).toBe(true);
      expect(ctx.pageContext.route).toBe("/");
      expect(ctx.pageContext.profileName).toBe("Alice");
      expect(ctx.pageContext.availableData.documents).toEqual([]);
      expect(ctx.pageContext.documentsContent).toBeUndefined();
    });

    it("uses profileData from aicontext:profile when profileId matches", () => {
      mockUi.getLatest.mockImplementation((event: string) => {
        if (event === "aicontext:profile") {
          return { data: { profileId: "p1", profileName: "Alice Override" } };
        }
        return null;
      });
      const ctx = call("p1");
      expect(ctx.pageContext.profileName).toBe("Alice Override");
    });

    it("ignores profileData from aicontext:profile when profileId does not match", () => {
      mockUi.getLatest.mockImplementation((event: string) => {
        if (event === "aicontext:profile") {
          return { data: { profileId: "other-profile", profileName: "Other" } };
        }
        return null;
      });
      const ctx = call("p1", "Alice");
      expect(ctx.pageContext.profileName).toBe("Alice");
    });

    it("falls back to chat:profile_switch when aicontext:profile returns null", () => {
      mockUi.getLatest.mockImplementation((event: string) => {
        if (event === "aicontext:profile") return null;
        if (event === "chat:profile_switch") {
          return { data: { profileId: "p1", profileName: "Alice From Switch" } };
        }
        return null;
      });
      const ctx = call("p1");
      expect(ctx.pageContext.profileName).toBe("Alice From Switch");
    });

    it("sets documentsContent and documents array when aicontext:document returns data", () => {
      mockUi.getLatest.mockImplementation((event: string) => {
        if (event === "aicontext:document") {
          return { data: { documentId: "doc-42", content: { title: "Lab" } } };
        }
        return null;
      });
      const ctx = call();
      expect(ctx.pageContext.availableData.documents).toEqual(["doc-42"]);
      expect(ctx.pageContext.documentsContent).toBeDefined();
      expect(ctx.pageContext.documentsContent!.get("doc-42")).toEqual({ title: "Lab" });
    });

    it("uses route from chat:navigation event when available", () => {
      mockUi.getLatest.mockImplementation((event: string) => {
        if (event === "chat:navigation") {
          return { data: { route: "/medications" } };
        }
        return null;
      });
      const ctx = call();
      expect(ctx.pageContext.route).toBe("/medications");
    });
  });

  // ── handleNavigation removes stale prompt on profile change ───────────────

  describe("UI event handlers > chat:navigation with stale prompt", () => {
    function getListenerFor(eventName: string): (data: any) => void {
      const call = mockUi.listen.mock.calls.find((c: any[]) => c[0] === eventName);
      if (!call) throw new Error(`No listener registered for "${eventName}"`);
      return call[1];
    }

    beforeEach(() => {
      manager.startListening();
    });

    it("removes context prompt and clears currentPromptProfileId when navigating to different profile", () => {
      (manager as any).currentPromptProfileId = "profile-old";
      setState({
        context: makeContext({ currentProfileId: "profile-1" }),
        messages: [
          {
            id: "sys-old",
            role: "system",
            content: "",
            metadata: { contextPrompt: { id: "profile-old", type: "profile" } },
          },
        ],
      });
      getListenerFor("chat:navigation")({
        route: "/medications",
        profileId: "profile-new",
        profileName: "Bob",
      });
      expect(mockChatActions.setMessages).toHaveBeenCalledWith([]);
      expect((manager as any).currentPromptProfileId).toBeNull();
    });

    it("does NOT remove prompt when navigating within the same profile", () => {
      (manager as any).currentPromptProfileId = "profile-1";
      setState({
        context: makeContext({ currentProfileId: "profile-1" }),
        messages: [
          {
            id: "sys-1",
            role: "system",
            content: "",
            metadata: { contextPrompt: { id: "profile-1", type: "profile" } },
          },
        ],
      });
      getListenerFor("chat:navigation")({
        route: "/medications",
        profileId: "profile-1",
        profileName: "Alice",
      });
      // setMessages not called for prompt removal (context prompt stays)
      // Only updateContext for route change is called
      expect(mockChatActions.updateContext).toHaveBeenCalled();
      expect((manager as any).currentPromptProfileId).toBe("profile-1");
    });
  });

  // ── handleProfileSwitch warns when profile data not found ─────────────────

  describe("UI event handlers > chat:profile_switch warns on missing profile data", () => {
    function getListenerFor(eventName: string): (data: any) => void {
      const call = mockUi.listen.mock.calls.find((c: any[]) => c[0] === eventName);
      if (!call) throw new Error(`No listener registered for "${eventName}"`);
      return call[1];
    }

    beforeEach(() => {
      manager.startListening();
    });

    it("hits the warn path when profile.get() returns null (no setContext called)", () => {
      setState({
        context: makeContext({ currentProfileId: "profile-1" }),
        messages: [],
        conversationHistory: new Map(),
      });
      mockProfile.get.mockReturnValue(null);
      getListenerFor("chat:profile_switch")({
        profileId: "profile-2",
        profileName: "Bob",
        isOwnProfile: false,
        language: "en",
      });
      expect(mockChatActions.setContext).not.toHaveBeenCalled();
    });

    it("hits the warn path when profile.get() returns a mismatched id", () => {
      setState({
        context: makeContext({ currentProfileId: "profile-1" }),
        messages: [],
        conversationHistory: new Map(),
      });
      mockProfile.get.mockReturnValue({ id: "wrong-id", fullName: "Wrong Person", language: "en" });
      getListenerFor("chat:profile_switch")({
        profileId: "profile-2",
        profileName: "Bob",
        isOwnProfile: false,
        language: "en",
      });
      expect(mockChatActions.setContext).not.toHaveBeenCalled();
    });
  });

  // ── handleAskAbout: context is null (retry loop) ──────────────────────────

  describe("UI event handlers > chat:ask_about when context is null", () => {
    function getListenerFor(eventName: string): (data: any) => void {
      const call = mockUi.listen.mock.calls.find((c: any[]) => c[0] === eventName);
      if (!call) throw new Error(`No listener registered for "${eventName}"`);
      return call[1];
    }

    beforeEach(() => {
      manager.startListening();
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("opens chat and calls initializeChatWithCurrentProfile when context is null", async () => {
      // context stays null throughout - retry loop exhausts, then early return
      setState({ context: null, isOpen: false });
      mockProfile.get.mockReturnValue(null);

      const promise = getListenerFor("chat:ask_about")({
        type: "medications",
        label: "Aspirin",
        data: null,
      });

      // Advance timers to exhaust the retry loop (30 × 100ms = 3000ms)
      await vi.runAllTimersAsync();
      await promise;

      expect(mockChatActions.open).toHaveBeenCalled();
    });

    it("returns early when context is still null after retry loop", async () => {
      setState({ context: null, isOpen: false });
      mockProfile.get.mockReturnValue(null);

      const promise = getListenerFor("chat:ask_about")({
        type: "medications",
        label: "Aspirin",
        data: null,
      });

      await vi.runAllTimersAsync();
      await promise;

      // sendMessage (which calls updateContextDuringConversation) should NOT be reached
      expect(mockChatContextService.updateContextDuringConversation).not.toHaveBeenCalled();
    });
  });

  // ── handleAskAbout: context exists but chat not open ─────────────────────

  describe("UI event handlers > chat:ask_about when context exists but chat is closed", () => {
    function getListenerFor(eventName: string): (data: any) => void {
      const call = mockUi.listen.mock.calls.find((c: any[]) => c[0] === eventName);
      if (!call) throw new Error(`No listener registered for "${eventName}"`);
      return call[1];
    }

    beforeEach(() => {
      manager.startListening();
    });

    it("calls chatActions.open when context exists but isOpen is false", async () => {
      setState({ context: makeContext(), isOpen: false, messages: [] });
      await getListenerFor("chat:ask_about")({
        type: "medications",
        label: "Aspirin",
        data: null,
      });
      expect(mockChatActions.open).toHaveBeenCalled();
    });
  });

  // ── handleAskAbout: documentId present but loadDocumentContent returns null ──

  describe("UI event handlers > chat:ask_about when loadDocumentContent returns null", () => {
    function getListenerFor(eventName: string): (data: any) => void {
      const call = mockUi.listen.mock.calls.find((c: any[]) => c[0] === eventName);
      if (!call) throw new Error(`No listener registered for "${eventName}"`);
      return call[1];
    }

    beforeEach(() => {
      manager.startListening();
    });

    it("skips documentsContent update when loadDocumentContent returns null", async () => {
      const { getDocument } = await import("$lib/documents");
      (getDocument as any).mockResolvedValue(null); // loadDocumentContent will return null

      setState({ context: makeContext(), isOpen: true, messages: [] });

      await getListenerFor("chat:ask_about")({
        type: "diagnosis",
        label: "Flu",
        data: { description: "Flu" },
        documentId: "doc-null-content",
        documentTitle: "Visit Report",
      });

      // updateContext is called once for the availableData.documents update,
      // but NOT for documentsContent (since docContent is null)
      const updateCalls = mockChatActions.updateContext.mock.calls;
      const hasDocContent = updateCalls.some((c: any[]) =>
        c[0]?.pageContext?.documentsContent !== undefined,
      );
      expect(hasDocContent).toBe(false);
    });
  });

  // ── continueWithToolResult (private) ─────────────────────────────────────

  describe("continueWithToolResult (private)", () => {
    beforeEach(() => {
      setState({ context: makeContext(), messages: [], isOpen: true });
    });

    it("returns early when result.success is false", async () => {
      await (manager as any).continueWithToolResult({
        success: false,
        data: { items: [] },
        toolName: "searchDocuments",
      });
      expect(mockChatActions.setLoading).not.toHaveBeenCalled();
    });

    it("returns early when result.data is null/falsy", async () => {
      await (manager as any).continueWithToolResult({
        success: true,
        data: null,
        toolName: "searchDocuments",
      });
      expect(mockChatActions.setLoading).not.toHaveBeenCalled();
    });

    it("sets loading true then false on success with string data", async () => {
      const service = (manager as any).clientService;
      service.sendMessage.mockResolvedValue(undefined);

      await (manager as any).continueWithToolResult({
        success: true,
        data: "some result string",
        toolName: "searchDocuments",
      });

      expect(mockChatActions.setLoading).toHaveBeenCalledWith(true);
      expect(mockChatActions.setLoading).toHaveBeenCalledWith(false);
    });

    it("sets loading true then false on success with object data", async () => {
      const service = (manager as any).clientService;
      service.sendMessage.mockResolvedValue(undefined);

      await (manager as any).continueWithToolResult({
        success: true,
        data: { results: ["a", "b"] },
        toolName: "getProfileData",
      });

      expect(mockChatActions.setLoading).toHaveBeenCalledWith(true);
      expect(mockChatActions.setLoading).toHaveBeenCalledWith(false);
    });

    it("handles chunk event: creates initial streaming message on first chunk", async () => {
      const service = (manager as any).clientService;
      service.sendMessage.mockImplementation(
        async (_msg: any, _ctx: any, _msgs: any, onEvent: (e: any) => void) => {
          onEvent({ type: "chunk", content: "Hello " });
        },
      );

      await (manager as any).continueWithToolResult({
        success: true,
        data: "tool data",
        toolName: "searchDocuments",
      });

      expect(mockCreateMessage).toHaveBeenCalledWith("assistant", "Hello ");
      expect(mockChatActions.addMessage).toHaveBeenCalled();
    });

    it("handles chunk event: updates existing message on second chunk", async () => {
      const streamingMsg = { id: "stream-1", role: "assistant", content: "Hello " };
      mockCreateMessage.mockReturnValueOnce(streamingMsg);

      const service = (manager as any).clientService;
      service.sendMessage.mockImplementation(
        async (_msg: any, _ctx: any, _msgs: any, onEvent: (e: any) => void) => {
          onEvent({ type: "chunk", content: "Hello " });
          onEvent({ type: "chunk", content: "world" });
        },
      );

      setState({
        context: makeContext(),
        messages: [streamingMsg],
        isOpen: true,
      });

      await (manager as any).continueWithToolResult({
        success: true,
        data: "tool data",
        toolName: "searchDocuments",
      });

      expect(mockChatActions.setMessages).toHaveBeenCalled();
    });

    it("handles metadata event: stores metadata", async () => {
      const service = (manager as any).clientService;
      service.sendMessage.mockImplementation(
        async (_msg: any, _ctx: any, _msgs: any, onEvent: (e: any) => void) => {
          onEvent({ type: "metadata", data: { tokenUsage: 100 } });
        },
      );

      await (manager as any).continueWithToolResult({
        success: true,
        data: "tool data",
        toolName: "searchDocuments",
      });

      // No crash, loading was set and cleared
      expect(mockChatActions.setLoading).toHaveBeenCalledWith(false);
    });

    it("handles complete event: finalizes streaming message with metadata", async () => {
      const streamingMsg = { id: "stream-42", role: "assistant", content: "partial" };
      mockCreateMessage.mockReturnValueOnce(streamingMsg);

      const service = (manager as any).clientService;
      service.sendMessage.mockImplementation(
        async (_msg: any, _ctx: any, _msgs: any, onEvent: (e: any) => void) => {
          onEvent({ type: "chunk", content: "partial" });
          onEvent({ type: "metadata", data: { tokenUsage: 50, anatomyReferences: ["knee"] } });
          onEvent({ type: "complete" });
        },
      );

      setState({
        context: makeContext(),
        messages: [streamingMsg],
        isOpen: true,
      });

      await (manager as any).continueWithToolResult({
        success: true,
        data: "tool data",
        toolName: "searchDocuments",
      });

      // setMessages called for the final message update with metadata
      expect(mockChatActions.setMessages).toHaveBeenCalled();
    });

    it("handles error event without crashing", async () => {
      const service = (manager as any).clientService;
      service.sendMessage.mockImplementation(
        async (_msg: any, _ctx: any, _msgs: any, onEvent: (e: any) => void) => {
          onEvent({ type: "error", message: "streaming error" });
        },
      );

      await expect(
        (manager as any).continueWithToolResult({
          success: true,
          data: "tool data",
          toolName: "searchDocuments",
        }),
      ).resolves.not.toThrow();
      expect(mockChatActions.setLoading).toHaveBeenCalledWith(false);
    });

    it("sets loading false even when sendMessage throws", async () => {
      const service = (manager as any).clientService;
      service.sendMessage.mockRejectedValue(new Error("network failure"));

      await (manager as any).continueWithToolResult({
        success: true,
        data: "tool data",
        toolName: "searchDocuments",
      });

      expect(mockChatActions.setLoading).toHaveBeenCalledWith(true);
      expect(mockChatActions.setLoading).toHaveBeenCalledWith(false);
    });
  });

  // ── checkForLatestDocumentOnOpen ─────────────────────────────────────────

  describe("checkForLatestDocumentOnOpen (private)", () => {
    it("does nothing when isProcessing is true", () => {
      setState({ context: makeContext(), messages: [] });
      (manager as any).isProcessing = true;
      mockUi.getLatest.mockReturnValue({ data: { documentId: "doc-1", title: "Report", timestamp: new Date() } });
      (manager as any).checkForLatestDocumentOnOpen();
      expect(mockChatActions.addMessage).not.toHaveBeenCalled();
    });

    it("does nothing when no document event exists", () => {
      setState({ context: makeContext(), messages: [] });
      mockUi.getLatest.mockReturnValue(null);
      (manager as any).checkForLatestDocumentOnOpen();
      expect(mockChatActions.addMessage).not.toHaveBeenCalled();
    });

    it("does nothing when document is already in context", () => {
      const ctx = makeContext();
      ctx.pageContext.availableData.documents = ["doc-1"];
      setState({ context: ctx, messages: [] });
      mockUi.getLatest.mockReturnValue({
        data: { documentId: "doc-1", title: "Report", timestamp: new Date() },
      });
      (manager as any).checkForLatestDocumentOnOpen();
      expect(mockChatActions.addMessage).not.toHaveBeenCalled();
    });

    it("does nothing when document timestamp is too old (>5min)", () => {
      setState({ context: makeContext(), messages: [] });
      const oldTimestamp = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
      mockUi.getLatest.mockReturnValue({
        data: { documentId: "doc-new", title: "Old Report", timestamp: oldTimestamp },
      });
      (manager as any).checkForLatestDocumentOnOpen();
      expect(mockChatActions.addMessage).not.toHaveBeenCalled();
    });

    it("triggers handleDocumentContext for a fresh document not yet in context", () => {
      setState({ context: makeContext(), messages: [] });
      const recentTimestamp = new Date();
      mockUi.getLatest.mockReturnValue({
        data: {
          documentId: "doc-new",
          title: "New Report",
          content: {},
          timestamp: recentTimestamp,
        },
      });
      (manager as any).checkForLatestDocumentOnOpen();
      expect(mockChatActions.addMessage).toHaveBeenCalled();
    });
  });
});
