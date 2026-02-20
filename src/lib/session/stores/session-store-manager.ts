import { logger } from "$lib/logging/logger";
import type { SessionAnalysis } from "$components/session/types/visualization";
import { createSessionDataStoreInstance } from "./session-data-store-instance";
import type { SessionDataStoreInstance } from "./session-data-store-instance";
import { createSessionViewerStoreInstance } from "./session-viewer-store-instance";
import type { SessionViewerStoreInstance } from "./session-viewer-store-instance";

/**
 * Session Store Manager
 *
 * Manages isolated store instances using the new factory pattern.
 * No code duplication - reuses shared utility functions.
 */

export type StoreInstanceType = "document" | "global";

export interface StoreInstance {
  type: StoreInstanceType;
  id: string;
  cleanup: () => void;
}

export interface DocumentStoreInstance extends StoreInstance {
  type: "document";
  dataStore: SessionDataStoreInstance;
  viewerStore: SessionViewerStoreInstance;
}

// Global registry to track active store instances
const activeInstances = new Map<string, StoreInstance>();

/**
 * Generate unique instance ID
 */
function generateInstanceId(type: StoreInstanceType): string {
  return `${type}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
}

/**
 * Create a document store instance for viewing existing session data
 * Uses factory pattern - NO CODE DUPLICATION
 */
export function createDocumentStoreInstance(
  sessionData?: SessionAnalysis,
): DocumentStoreInstance {
  const instanceId = generateInstanceId("document");

  logger.session.info("Creating document store instance", { instanceId });

  // Create isolated data store using factory function (no duplication!)
  const dataStore = createSessionDataStoreInstance(instanceId);

  // Create isolated viewer store that uses the data store instance
  const viewerStore = createSessionViewerStoreInstance(dataStore, instanceId);

  // Load initial session data if provided
  if (sessionData) {
    dataStore.actions.loadSession(sessionData);
  }

  // Combined cleanup function
  const cleanup = () => {
    logger.session.info("Cleaning up document store instance", { instanceId });

    // Cleanup both stores
    viewerStore.cleanup();
    dataStore.cleanup();

    // Remove from registry
    activeInstances.delete(instanceId);
  };

  // Create combined instance
  const instance: DocumentStoreInstance = {
    type: "document",
    id: instanceId,
    cleanup,
    dataStore,
    viewerStore,
  };

  // Register instance
  activeInstances.set(instanceId, instance);

  return instance;
}

/**
 * Get the global store instance for live sessions
 * Returns the existing global stores from the original files
 */
export function getGlobalStoreInstance() {
  // Import the existing global stores
  const { sessionData, sessionDataActions } = require("./session-data-store");
  const {
    sessionViewerStore,
    sessionViewerActions,
  } = require("./session-viewer-store");
  const {
    unifiedSessionStore,
    unifiedSessionActions,
  } = require("./unified-session-store");

  logger.session.debug("Returning global store instance for live session");

  return {
    type: "global" as const,
    id: "global",
    cleanup: () => {
      logger.session.info(
        "Global store cleanup requested - resetting to initial state",
      );
      unifiedSessionActions.resetSession();
    },

    // Existing global stores
    unifiedStore: unifiedSessionStore,
    unifiedActions: unifiedSessionActions,
    dataStore: { sessionData, actions: sessionDataActions },
    viewerStore: { store: sessionViewerStore, actions: sessionViewerActions },
  };
}

/**
 * Cleanup a specific store instance by ID
 */
export function cleanupInstance(instanceId: string): boolean {
  const instance = activeInstances.get(instanceId);

  if (!instance) {
    logger.session.warn("Attempted to cleanup non-existent store instance", {
      instanceId,
    });
    return false;
  }

  logger.session.info("Cleaning up store instance", {
    instanceId,
    type: instance.type,
  });
  instance.cleanup();

  return true;
}

/**
 * Cleanup all active store instances
 */
export function cleanupAllInstances(): number {
  const count = activeInstances.size;

  logger.session.info("Cleaning up all store instances", { count });

  for (const [instanceId, instance] of activeInstances) {
    instance.cleanup();
  }

  activeInstances.clear();

  return count;
}

/**
 * Get information about active store instances (for debugging)
 */
export function getActiveInstances(): Array<{
  id: string;
  type: StoreInstanceType;
}> {
  return Array.from(activeInstances.values()).map((instance) => ({
    id: instance.id,
    type: instance.type,
  }));
}

/**
 * Check if a store instance exists
 */
export function hasInstance(instanceId: string): boolean {
  return activeInstances.has(instanceId);
}

/**
 * Get the total number of active instances
 */
export function getInstanceCount(): number {
  return activeInstances.size;
}
