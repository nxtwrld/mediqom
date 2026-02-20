import type { Signal } from "$lib/types.d";
import { getHealthDocument } from "./signals";
import { updateDocument } from "$lib/documents";
import { profiles, updateProfile } from "$lib/profiles";
import type { Profile } from "$lib/types.d";
import { log } from "$lib/logging/logger";
import definitions from "./definitions.json";

const healthLogger = log.namespace("Health", "🏥");

/**
 * Get the unit for a field from definitions
 */
function getFieldUnit(fieldKey: string): string {
  const def = definitions.find((d: any) => d.key === fieldKey) as any;
  if (!def) return "";

  // For time-series, get unit from items
  if (def.type === "time-series") {
    const valueItem = def.items?.find(
      (item: any) => item.key === fieldKey || item.key !== "date",
    );
    return valueItem?.unit || "";
  }

  return def.unit || "";
}

interface SignalCrudResult {
  success: boolean;
  error?: string;
}

/**
 * Add a new signal entry to a signal's values array
 *
 * @param profileId - The profile ID
 * @param signal - The signal name (e.g., 'height', 'weight')
 * @param entry - The entry to add (without signal name - will be added)
 */
export async function addSignalEntry(
  profileId: string,
  signal: string,
  entry: Omit<Signal, "signal">,
): Promise<SignalCrudResult> {
  try {
    const document = await getHealthDocument(profileId);
    if (!document) {
      return { success: false, error: "Health document not found" };
    }

    // Initialize signals if needed
    if (!document.content.signals) {
      document.content.signals = {};
    }

    // Initialize signal structure if needed
    if (!document.content.signals[signal]) {
      document.content.signals[signal] = {
        log: "full",
        history: [],
        values: [],
      };
    }

    const fullEntry: Signal = {
      ...entry,
      signal,
      source: entry.source || "input",
      unit: entry.unit || getFieldUnit(signal),
    };

    // Add to values array, sorted by date (newest first)
    document.content.signals[signal].values = [
      fullEntry,
      ...document.content.signals[signal].values,
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Update the document
    await updateDocument(document);

    // Update the profile in the store
    const profile = (await profiles.get(profileId)) as Profile;
    if (profile) {
      profile.health = {
        ...profile.health,
        signals: document.content.signals,
      };
      updateProfile(profile);
    }

    healthLogger.info("Signal entry added", {
      profileId,
      signal,
      date: entry.date,
    });
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    healthLogger.error("Failed to add signal entry", {
      profileId,
      signal,
      error: errorMessage,
    });
    return { success: false, error: errorMessage };
  }
}

/**
 * Update an existing signal entry by index
 *
 * @param profileId - The profile ID
 * @param signal - The signal name
 * @param index - Index in the values array
 * @param updates - Partial updates to apply
 */
export async function updateSignalEntry(
  profileId: string,
  signal: string,
  index: number,
  updates: Partial<Omit<Signal, "signal">>,
): Promise<SignalCrudResult> {
  try {
    const document = await getHealthDocument(profileId);
    if (!document) {
      return { success: false, error: "Health document not found" };
    }

    const signalData = document.content.signals?.[signal];
    if (!signalData || !signalData.values || !signalData.values[index]) {
      return { success: false, error: "Signal entry not found" };
    }

    // Check if entry is editable (manual entry)
    const entry = signalData.values[index];
    if (entry.source !== "input" && entry.refId) {
      return { success: false, error: "Cannot edit document-sourced entries" };
    }

    // Apply updates
    signalData.values[index] = {
      ...entry,
      ...updates,
      signal, // Ensure signal name is preserved
    };

    // Re-sort by date
    signalData.values.sort(
      (a: Signal, b: Signal) =>
        new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    // Update the document
    await updateDocument(document);

    // Update the profile in the store
    const profile = (await profiles.get(profileId)) as Profile;
    if (profile) {
      profile.health = {
        ...profile.health,
        signals: document.content.signals,
      };
      updateProfile(profile);
    }

    healthLogger.info("Signal entry updated", { profileId, signal, index });
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    healthLogger.error("Failed to update signal entry", {
      profileId,
      signal,
      index,
      error: errorMessage,
    });
    return { success: false, error: errorMessage };
  }
}

/**
 * Delete a signal entry by index
 *
 * @param profileId - The profile ID
 * @param signal - The signal name
 * @param index - Index in the values array
 */
export async function deleteSignalEntry(
  profileId: string,
  signal: string,
  index: number,
): Promise<SignalCrudResult> {
  try {
    const document = await getHealthDocument(profileId);
    if (!document) {
      return { success: false, error: "Health document not found" };
    }

    const signalData = document.content.signals?.[signal];
    if (!signalData || !signalData.values || !signalData.values[index]) {
      return { success: false, error: "Signal entry not found" };
    }

    // Check if entry is editable (manual entry)
    const entry = signalData.values[index];
    if (entry.source !== "input" && entry.refId) {
      return {
        success: false,
        error: "Cannot delete document-sourced entries",
      };
    }

    // Remove the entry - create new array to trigger reactivity
    const newValues = [
      ...signalData.values.slice(0, index),
      ...signalData.values.slice(index + 1),
    ];
    signalData.values = newValues;

    // Update the document
    await updateDocument(document);

    // Update the profile in the store with new object references for reactivity
    const profile = (await profiles.get(profileId)) as Profile;
    if (profile) {
      // Create new signals object with new signal data to trigger Svelte reactivity
      const newSignals = {
        ...document.content.signals,
        [signal]: {
          ...signalData,
          values: newValues,
        },
      };
      profile.health = {
        ...profile.health,
        signals: newSignals,
      };
      updateProfile(profile);
    }

    healthLogger.info("Signal entry deleted", { profileId, signal, index });
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    healthLogger.error("Failed to delete signal entry", {
      profileId,
      signal,
      index,
      error: errorMessage,
    });
    return { success: false, error: errorMessage };
  }
}

/**
 * Get all signal values for a specific signal
 */
export async function getSignalValues(
  profileId: string,
  signal: string,
): Promise<Signal[]> {
  try {
    const document = await getHealthDocument(profileId);
    return document?.content?.signals?.[signal]?.values || [];
  } catch (error) {
    healthLogger.error("Failed to get signal values", {
      profileId,
      signal,
      error,
    });
    return [];
  }
}
