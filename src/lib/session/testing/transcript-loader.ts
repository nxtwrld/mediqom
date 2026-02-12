import type { PartialTranscript } from "../manager";
import { logger } from "$lib/logging/logger";

// Test transcript data interface (matches testData/transcripts format)
export interface TestTranscriptEntry {
  timestamp: string;
  speaker: "doctor" | "patient";
  text: string;
}

// Available test transcript files
export const TEST_TRANSCRIPTS = {
  chestpain: "/testData/transcripts/chestpain.json",
};

/**
 * Convert test transcript entry to PartialTranscript format
 */
function convertToPartialTranscript(
  entry: TestTranscriptEntry,
  index: number,
): PartialTranscript {
  return {
    id: `test_transcript_${Date.now()}_${index}`,
    text: entry.text,
    confidence: 0.95, // High confidence for test data
    timestamp: Date.now() + index * 1000, // Spread timestamps by 1 second
    is_final: true,
    speaker: entry.speaker,
  };
}

/**
 * Parse timestamp string to seconds
 */
function parseTimestamp(timestamp: string): number {
  const parts = timestamp.split(":");
  const minutes = parseInt(parts[0]);
  const seconds = parseInt(parts[1]);
  return minutes * 60 + seconds;
}

/**
 * Load and parse a test transcript file
 */
export async function loadTestTranscript(
  transcriptName: keyof typeof TEST_TRANSCRIPTS,
): Promise<PartialTranscript[]> {
  try {
    const url = TEST_TRANSCRIPTS[transcriptName];
    logger.test.debug("Loading test transcript:", url);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load transcript: ${response.status}`);
    }

    const data: TestTranscriptEntry[] = await response.json();
    logger.test.debug("Loaded transcript entries:", data.length);

    // Convert to PartialTranscript format
    const transcripts = data.map((entry, index) =>
      convertToPartialTranscript(entry, index),
    );

    logger.test.info(
      "Converted to PartialTranscript format:",
      transcripts.length,
    );
    return transcripts;
  } catch (error) {
    logger.test.error("Failed to load test transcript:", error);
    throw error;
  }
}

/**
 * Simulate real-time transcript streaming
 */
export async function streamTestTranscript(
  transcriptName: keyof typeof TEST_TRANSCRIPTS,
  options: {
    onTranscript?: (transcript: PartialTranscript) => void;
    onComplete?: () => void;
    delay?: number; // Delay between transcript entries in ms
    realTime?: boolean; // Use original timestamps for realistic timing
  } = {},
): Promise<void> {
  const { onTranscript, onComplete, delay = 2000, realTime = false } = options;

  try {
    logger.test.info("Starting test transcript stream:", transcriptName);
    const transcripts = await loadTestTranscript(transcriptName);

    if (realTime) {
      // Use original timestamps for realistic timing
      const rawData: TestTranscriptEntry[] = await fetch(
        TEST_TRANSCRIPTS[transcriptName],
      ).then((r) => r.json());

      for (let i = 0; i < transcripts.length; i++) {
        const transcript = transcripts[i];
        const rawEntry = rawData[i];

        // Calculate delay based on original timestamps
        if (i > 0) {
          const currentTime = parseTimestamp(rawEntry.timestamp);
          const previousTime = parseTimestamp(rawData[i - 1].timestamp);
          const realDelay = (currentTime - previousTime) * 1000; // Convert to ms
          const clampedDelay = Math.min(Math.max(realDelay, 500), 5000); // Clamp between 0.5-5 seconds
          await new Promise((resolve) => setTimeout(resolve, clampedDelay));
        } else {
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Initial delay
        }

        logger.test.debug(
          `[${rawEntry.timestamp}] ${rawEntry.speaker}: ${rawEntry.text}`,
        );
        onTranscript?.(transcript);
      }
    } else {
      // Use fixed delays
      for (const transcript of transcripts) {
        logger.test.debug(
          `Streaming: ${transcript.speaker}: ${transcript.text}`,
        );
        onTranscript?.(transcript);

        if (delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    logger.test.info("Test transcript stream completed");
    onComplete?.();
  } catch (error) {
    logger.test.error("Failed to stream test transcript:", error);
    throw error;
  }
}

/**
 * Get available test transcript names
 */
export function getAvailableTestTranscripts(): string[] {
  return Object.keys(TEST_TRANSCRIPTS);
}

/**
 * Get test transcript info
 */
export async function getTestTranscriptInfo(
  transcriptName: keyof typeof TEST_TRANSCRIPTS,
): Promise<{
  name: string;
  entryCount: number;
  speakers: string[];
  duration: string;
}> {
  try {
    const url = TEST_TRANSCRIPTS[transcriptName];
    const response = await fetch(url);
    const data: TestTranscriptEntry[] = await response.json();

    const speakers = [...new Set(data.map((entry) => entry.speaker))];
    const firstTimestamp = parseTimestamp(data[0].timestamp);
    const lastTimestamp = parseTimestamp(data[data.length - 1].timestamp);
    const durationSeconds = lastTimestamp - firstTimestamp;
    const durationFormatted = `${Math.floor(durationSeconds / 60)}:${(durationSeconds % 60).toString().padStart(2, "0")}`;

    return {
      name: transcriptName,
      entryCount: data.length,
      speakers,
      duration: durationFormatted,
    };
  } catch (error) {
    logger.test.error("Failed to get transcript info:", error);
    throw error;
  }
}
