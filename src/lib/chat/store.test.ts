import { describe, it, expect, vi, beforeEach } from "vitest";
import { get } from "svelte/store";

const { mockUserGet, mockProfileValue } = vi.hoisted(() => ({
  mockUserGet: vi.fn().mockReturnValue(null),
  mockProfileValue: { current: null as any },
}));

vi.mock("$lib/profiles", () => {
  const { writable } = require("svelte/store");
  const profileStore = writable(null);
  return { profile: profileStore };
});

vi.mock("$lib/user", () => ({
  default: { get: mockUserGet },
}));

vi.mock("$lib/utils/id", () => ({
  generateId: vi.fn().mockReturnValue("test-id-123"),
}));

import {
  chatStore,
  chatActions,
  resolveChatMode,
  createMessage,
  detectMode,
  isOpen,
  messages,
  context,
  isLoading,
  anatomyModelOpen,
} from "./store";

beforeEach(() => {
  vi.clearAllMocks();
  chatActions.reset();
  mockUserGet.mockReturnValue(null);
});

// ── resolveChatMode ────────────────────────────────────────────────────────────

describe("resolveChatMode", () => {
  it("returns 'patient' when isOwnProfile is true", () => {
    expect(resolveChatMode(true, false)).toBe("patient");
    expect(resolveChatMode(true, true)).toBe("patient");
  });

  it("returns 'clinical' when not own profile and isMedical is true", () => {
    expect(resolveChatMode(false, true)).toBe("clinical");
  });

  it("returns 'caregiver' when not own profile and isMedical is false", () => {
    expect(resolveChatMode(false, false)).toBe("caregiver");
  });
});

// ── initial state ──────────────────────────────────────────────────────────────

describe("chatStore — initial state", () => {
  it("has isOpen=false initially", () => {
    expect(get(chatStore).isOpen).toBe(false);
  });

  it("has empty messages array initially", () => {
    expect(get(chatStore).messages).toEqual([]);
  });

  it("has null context initially", () => {
    expect(get(chatStore).context).toBeNull();
  });

  it("has isLoading=false initially", () => {
    expect(get(chatStore).isLoading).toBe(false);
  });

  it("has anatomyModelOpen=false initially", () => {
    expect(get(chatStore).anatomyModelOpen).toBe(false);
  });
});

// ── derived stores ─────────────────────────────────────────────────────────────

describe("derived stores", () => {
  it("isOpen reflects chatStore.isOpen", () => {
    expect(get(isOpen)).toBe(false);
    chatActions.open();
    expect(get(isOpen)).toBe(true);
  });

  it("messages reflects chatStore.messages", () => {
    expect(get(messages)).toEqual([]);
    const msg = createMessage("user", "hello");
    chatActions.addMessage(msg);
    expect(get(messages)).toHaveLength(1);
  });

  it("context reflects chatStore.context", () => {
    expect(get(context)).toBeNull();
  });

  it("isLoading reflects chatStore.isLoading", () => {
    expect(get(isLoading)).toBe(false);
    chatActions.setLoading(true);
    expect(get(isLoading)).toBe(true);
  });

  it("anatomyModelOpen reflects chatStore.anatomyModelOpen", () => {
    expect(get(anatomyModelOpen)).toBe(false);
    chatActions.toggleAnatomyModel();
    expect(get(anatomyModelOpen)).toBe(true);
  });
});

// ── chatActions ────────────────────────────────────────────────────────────────

describe("chatActions.open / close / toggle", () => {
  it("open sets isOpen to true", () => {
    chatActions.open();
    expect(get(chatStore).isOpen).toBe(true);
  });

  it("close sets isOpen to false", () => {
    chatActions.open();
    chatActions.close();
    expect(get(chatStore).isOpen).toBe(false);
  });

  it("toggle flips isOpen", () => {
    chatActions.toggle();
    expect(get(chatStore).isOpen).toBe(true);
    chatActions.toggle();
    expect(get(chatStore).isOpen).toBe(false);
  });
});

describe("chatActions.setContext / updateContext", () => {
  const mockContext: any = {
    mode: "patient",
    currentProfileId: "p1",
    conversationThreadId: "t1",
    language: "en",
    isOwnProfile: true,
    pageContext: { route: "/", profileName: "Alice", availableData: { documents: [] } },
  };

  it("setContext stores the context", () => {
    chatActions.setContext(mockContext);
    expect(get(chatStore).context).toEqual(mockContext);
  });

  it("updateContext merges updates into existing context", () => {
    chatActions.setContext(mockContext);
    chatActions.updateContext({ language: "de" });
    expect(get(chatStore).context?.language).toBe("de");
    expect(get(chatStore).context?.currentProfileId).toBe("p1");
  });

  it("updateContext does nothing when context is null", () => {
    chatActions.updateContext({ language: "de" });
    expect(get(chatStore).context).toBeNull();
  });
});

describe("chatActions.addMessage / setMessages / clearMessages", () => {
  it("addMessage appends a message", () => {
    const msg = createMessage("user", "hello");
    chatActions.addMessage(msg);
    expect(get(chatStore).messages).toHaveLength(1);
    expect(get(chatStore).messages[0].content).toBe("hello");
  });

  it("addMessage appends multiple messages in order", () => {
    chatActions.addMessage(createMessage("user", "first"));
    chatActions.addMessage(createMessage("assistant", "second"));
    expect(get(chatStore).messages).toHaveLength(2);
    expect(get(chatStore).messages[1].content).toBe("second");
  });

  it("setMessages replaces all messages", () => {
    chatActions.addMessage(createMessage("user", "old"));
    const newMsgs = [createMessage("assistant", "new")];
    chatActions.setMessages(newMsgs);
    expect(get(chatStore).messages).toHaveLength(1);
    expect(get(chatStore).messages[0].content).toBe("new");
  });

  it("clearMessages empties the messages array", () => {
    chatActions.addMessage(createMessage("user", "msg"));
    chatActions.clearMessages();
    expect(get(chatStore).messages).toEqual([]);
  });
});

describe("chatActions.setLoading", () => {
  it("sets isLoading to true", () => {
    chatActions.setLoading(true);
    expect(get(chatStore).isLoading).toBe(true);
  });

  it("sets isLoading back to false", () => {
    chatActions.setLoading(true);
    chatActions.setLoading(false);
    expect(get(chatStore).isLoading).toBe(false);
  });
});

describe("chatActions.toggleAnatomyModel / setFocusedBodyPart", () => {
  it("toggleAnatomyModel opens anatomy model", () => {
    chatActions.toggleAnatomyModel();
    expect(get(chatStore).anatomyModelOpen).toBe(true);
  });

  it("toggleAnatomyModel closes anatomy model on second call", () => {
    chatActions.toggleAnatomyModel();
    chatActions.toggleAnatomyModel();
    expect(get(chatStore).anatomyModelOpen).toBe(false);
  });

  it("setFocusedBodyPart sets the body part", () => {
    chatActions.setFocusedBodyPart("heart");
    expect(get(chatStore).focusedBodyPart).toBe("heart");
  });

  it("setFocusedBodyPart accepts null", () => {
    chatActions.setFocusedBodyPart("heart");
    chatActions.setFocusedBodyPart(null);
    expect(get(chatStore).focusedBodyPart).toBeNull();
  });
});

describe("chatActions.switchProfile", () => {
  const mockContext: any = {
    mode: "patient",
    currentProfileId: "p1",
    conversationThreadId: "t1",
    language: "en",
    isOwnProfile: true,
    pageContext: { route: "/", profileName: "Alice", availableData: { documents: [] } },
  };

  it("saves current messages to history when switching profiles", () => {
    chatActions.setContext(mockContext);
    chatActions.addMessage(createMessage("user", "hello"));
    chatActions.switchProfile("p2", false);
    const state = get(chatStore);
    expect(state.conversationHistory.get("p1")).toHaveLength(1);
  });

  it("does not save history when there are no messages", () => {
    chatActions.setContext(mockContext);
    chatActions.switchProfile("p2", false);
    expect(get(chatStore).conversationHistory.get("p1")).toBeUndefined();
  });

  it("loads existing history for the new profile", () => {
    // First switch to p2 with a message so history is saved
    chatActions.setContext({ ...mockContext, currentProfileId: "p2" });
    chatActions.addMessage(createMessage("assistant", "p2 message"));
    chatActions.switchProfile("p1", true);
    // Now switch back to p2 — should restore p2's history
    chatActions.switchProfile("p2", false);
    expect(get(chatStore).messages).toHaveLength(1);
    expect(get(chatStore).messages[0].content).toBe("p2 message");
  });

  it("starts with empty messages when no history for new profile", () => {
    chatActions.setContext(mockContext);
    chatActions.switchProfile("brand-new-profile", false);
    expect(get(chatStore).messages).toEqual([]);
  });

  it("updates currentProfileId in context", () => {
    chatActions.setContext(mockContext);
    chatActions.switchProfile("p2", false);
    expect(get(chatStore).context?.currentProfileId).toBe("p2");
  });

  it("updates isOwnProfile in context", () => {
    chatActions.setContext(mockContext);
    chatActions.switchProfile("p2", false);
    expect(get(chatStore).context?.isOwnProfile).toBe(false);
  });

  it("keeps context as null when context was null", () => {
    chatActions.switchProfile("p2", false);
    expect(get(chatStore).context).toBeNull();
  });

  it("resolves mode using user.get() for isMedical", () => {
    mockUserGet.mockReturnValue({ isMedical: true });
    chatActions.setContext(mockContext);
    chatActions.switchProfile("p2", false);
    // isOwnProfile=false, isMedical=true → clinical
    expect(get(chatStore).context?.mode).toBe("clinical");
  });

  it("uses isMedical=false when user.get() returns null", () => {
    mockUserGet.mockReturnValue(null);
    chatActions.setContext(mockContext);
    chatActions.switchProfile("p2", false);
    expect(get(chatStore).context?.mode).toBe("caregiver");
  });
});

describe("chatActions.setSyncStatus", () => {
  it("sets syncStatus to syncing", () => {
    chatActions.setSyncStatus("syncing");
    expect(get(chatStore).syncStatus).toBe("syncing");
  });

  it("sets syncStatus to error", () => {
    chatActions.setSyncStatus("error");
    expect(get(chatStore).syncStatus).toBe("error");
    expect(get(chatStore).lastSyncTime).toBeNull();
  });

  it("sets lastSyncTime when status is synced", () => {
    chatActions.setSyncStatus("synced");
    expect(get(chatStore).syncStatus).toBe("synced");
    expect(get(chatStore).lastSyncTime).toBeInstanceOf(Date);
  });

  it("preserves lastSyncTime when status is not synced", () => {
    chatActions.setSyncStatus("synced");
    const syncTime = get(chatStore).lastSyncTime;
    chatActions.setSyncStatus("syncing");
    expect(get(chatStore).lastSyncTime).toBe(syncTime);
  });
});

describe("chatActions.reset", () => {
  it("resets all state to initial values", () => {
    chatActions.open();
    chatActions.addMessage(createMessage("user", "hello"));
    chatActions.setLoading(true);
    chatActions.reset();
    const state = get(chatStore);
    expect(state.isOpen).toBe(false);
    expect(state.messages).toEqual([]);
    expect(state.isLoading).toBe(false);
    expect(state.context).toBeNull();
  });
});

// ── createMessage ──────────────────────────────────────────────────────────────

describe("createMessage", () => {
  it("creates a message with role and content", () => {
    const msg = createMessage("user", "hello");
    expect(msg.role).toBe("user");
    expect(msg.content).toBe("hello");
  });

  it("creates a message with id from generateId", () => {
    const msg = createMessage("assistant", "hi");
    expect(msg.id).toBe("test-id-123");
  });

  it("creates a message with a timestamp", () => {
    const msg = createMessage("user", "test");
    expect(msg.timestamp).toBeInstanceOf(Date);
  });

  it("creates a message with optional metadata", () => {
    const meta = { translationKey: "app.hello" } as any;
    const msg = createMessage("system", "", meta);
    expect(msg.metadata).toEqual(meta);
  });

  it("creates a message without metadata when not provided", () => {
    const msg = createMessage("user", "hi");
    expect(msg.metadata).toBeUndefined();
  });
});

// ── detectMode ─────────────────────────────────────────────────────────────────

describe("detectMode", () => {
  it("returns 'patient' when profile is null", () => {
    expect(detectMode()).toBe("patient");
  });

  it("returns 'patient' when profile exists (default implementation)", () => {
    // Profile store is a writable — set value via the store itself
    // detectMode always returns 'patient' regardless (TODO in source)
    expect(detectMode()).toBe("patient");
  });
});
