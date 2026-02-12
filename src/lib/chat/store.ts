import { writable, derived, get } from "svelte/store";
import type { Writable } from "svelte/store";
import type { ChatState, ChatMessage, ChatContext, ChatMode } from "./types.d";
import { profile } from "$lib/profiles";
import { generateId } from "$lib/utils/id";

const initialState: ChatState = {
  isOpen: false,
  messages: [],
  context: null,
  isLoading: false,
  anatomyModelOpen: false,
  focusedBodyPart: null,
  conversationHistory: new Map(),
  currentConversationId: null,
  syncStatus: "synced",
  lastSyncTime: null,
};

export const chatStore: Writable<ChatState> = writable(initialState);

// Derived stores for easy access
export const isOpen = derived(chatStore, ($chat) => $chat.isOpen);
export const messages = derived(chatStore, ($chat) => $chat.messages);
export const context = derived(chatStore, ($chat) => $chat.context);
export const isLoading = derived(chatStore, ($chat) => $chat.isLoading);
export const anatomyModelOpen = derived(
  chatStore,
  ($chat) => $chat.anatomyModelOpen,
);

// Chat actions
export const chatActions = {
  open: () => {
    chatStore.update((state) => ({ ...state, isOpen: true }));
  },

  close: () => {
    chatStore.update((state) => ({ ...state, isOpen: false }));
  },

  toggle: () => {
    chatStore.update((state) => ({ ...state, isOpen: !state.isOpen }));
  },

  setContext: (context: ChatContext) => {
    chatStore.update((state) => ({ ...state, context }));
  },

  updateContext: (updates: Partial<ChatContext>) => {
    chatStore.update((state) => ({
      ...state,
      context: state.context ? { ...state.context, ...updates } : null,
    }));
  },

  addMessage: (message: ChatMessage) => {
    chatStore.update((state) => ({
      ...state,
      messages: [...state.messages, message],
    }));
  },

  setMessages: (messages: ChatMessage[]) => {
    chatStore.update((state) => ({ ...state, messages }));
  },

  setLoading: (loading: boolean) => {
    chatStore.update((state) => ({ ...state, isLoading: loading }));
  },

  toggleAnatomyModel: () => {
    chatStore.update((state) => ({
      ...state,
      anatomyModelOpen: !state.anatomyModelOpen,
    }));
  },

  setFocusedBodyPart: (bodyPart: string | null) => {
    chatStore.update((state) => ({ ...state, focusedBodyPart: bodyPart }));
  },

  switchProfile: (profileId: string, isOwnProfile: boolean) => {
    const state = get(chatStore);

    // Save current conversation to history
    if (state.context?.currentProfileId && state.messages.length > 0) {
      const history = new Map(state.conversationHistory);
      history.set(state.context.currentProfileId, [...state.messages]);

      chatStore.update((s) => ({
        ...s,
        conversationHistory: history,
      }));
    }

    // Load conversation history for new profile
    const existingHistory = state.conversationHistory.get(profileId) || [];

    // Update context and messages
    chatStore.update((s) => ({
      ...s,
      messages: existingHistory,
      context: s.context
        ? {
            ...s.context,
            currentProfileId: profileId,
            isOwnProfile,
            mode: isOwnProfile ? "patient" : "clinical",
          }
        : null,
    }));
  },

  clearMessages: () => {
    chatStore.update((state) => ({ ...state, messages: [] }));
  },

  setSyncStatus: (status: "synced" | "syncing" | "error") => {
    chatStore.update((state) => ({
      ...state,
      syncStatus: status,
      lastSyncTime: status === "synced" ? new Date() : state.lastSyncTime,
    }));
  },

  reset: () => {
    chatStore.set(initialState);
  },
};

// Helper function to create a message
export function createMessage(
  role: ChatMessage["role"],
  content: string,
  metadata?: ChatMessage["metadata"],
): ChatMessage {
  return {
    id: generateId(),
    role,
    content,
    timestamp: new Date(),
    metadata,
  };
}

// Helper function to detect if user is viewing their own profile
export function detectMode(): ChatMode {
  const currentProfile = get(profile);
  if (!currentProfile) return "patient";

  // TODO: This would need to be implemented based on your user authentication
  // For now, defaulting to patient role
  return "patient";
}

// Remove automatic profile subscription - let the chat component handle initialization
// The chat will listen to UI events when it's active

export default chatStore;
