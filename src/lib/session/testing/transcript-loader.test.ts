import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  TEST_TRANSCRIPTS,
  loadTestTranscript,
  streamTestTranscript,
  getAvailableTestTranscripts,
  getTestTranscriptInfo,
} from "./transcript-loader";

vi.mock("$lib/logging/logger", () => ({
  logger: {
    test: { debug: vi.fn(), info: vi.fn(), error: vi.fn() },
  },
}));

const sampleData = [
  { timestamp: "0:00", speaker: "doctor", text: "Hello" },
  { timestamp: "0:30", speaker: "patient", text: "Hi" },
  { timestamp: "1:00", speaker: "doctor", text: "How are you?" },
];

function makeFetchMock(data: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue(data),
  });
}

beforeEach(() => {
  global.fetch = makeFetchMock(sampleData);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// TEST_TRANSCRIPTS constant
// ---------------------------------------------------------------------------
describe("TEST_TRANSCRIPTS", () => {
  it("contains a chestpain key pointing to the correct URL", () => {
    expect(TEST_TRANSCRIPTS.chestpain).toBe(
      "/testData/transcripts/chestpain.json",
    );
  });
});

// ---------------------------------------------------------------------------
// getAvailableTestTranscripts
// ---------------------------------------------------------------------------
describe("getAvailableTestTranscripts", () => {
  it("returns array of transcript names", () => {
    const names = getAvailableTestTranscripts();
    expect(names).toContain("chestpain");
  });

  it("returns the keys of TEST_TRANSCRIPTS", () => {
    const names = getAvailableTestTranscripts();
    expect(names).toEqual(Object.keys(TEST_TRANSCRIPTS));
  });
});

// ---------------------------------------------------------------------------
// loadTestTranscript
// ---------------------------------------------------------------------------
describe("loadTestTranscript", () => {
  it("fetches from the correct URL", async () => {
    await loadTestTranscript("chestpain");
    expect(global.fetch).toHaveBeenCalledWith(
      TEST_TRANSCRIPTS.chestpain,
    );
  });

  it("returns an array with the correct length", async () => {
    const result = await loadTestTranscript("chestpain");
    expect(result).toHaveLength(sampleData.length);
  });

  it("each entry has id, text, confidence, timestamp, is_final, speaker", async () => {
    const result = await loadTestTranscript("chestpain");
    for (const entry of result) {
      expect(entry).toHaveProperty("id");
      expect(entry).toHaveProperty("text");
      expect(entry).toHaveProperty("confidence");
      expect(entry).toHaveProperty("timestamp");
      expect(entry).toHaveProperty("is_final");
      expect(entry).toHaveProperty("speaker");
    }
  });

  it("maps text from source entries", async () => {
    const result = await loadTestTranscript("chestpain");
    expect(result[0].text).toBe("Hello");
    expect(result[1].text).toBe("Hi");
    expect(result[2].text).toBe("How are you?");
  });

  it("maps speaker from source entries", async () => {
    const result = await loadTestTranscript("chestpain");
    expect(result[0].speaker).toBe("doctor");
    expect(result[1].speaker).toBe("patient");
    expect(result[2].speaker).toBe("doctor");
  });

  it("sets confidence to 0.95 for all entries", async () => {
    const result = await loadTestTranscript("chestpain");
    for (const entry of result) {
      expect(entry.confidence).toBe(0.95);
    }
  });

  it("sets is_final to true for all entries", async () => {
    const result = await loadTestTranscript("chestpain");
    for (const entry of result) {
      expect(entry.is_final).toBe(true);
    }
  });

  it("throws when fetch response is not ok", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(loadTestTranscript("chestpain")).rejects.toThrow("404");
  });

  it("throws and re-throws when fetch rejects", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network error"));
    await expect(loadTestTranscript("chestpain")).rejects.toThrow(
      "network error",
    );
  });
});

// ---------------------------------------------------------------------------
// streamTestTranscript — fixed delay mode
// ---------------------------------------------------------------------------
describe("streamTestTranscript (fixed delay)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls onTranscript for each entry when delay=0", async () => {
    const onTranscript = vi.fn();
    const promise = streamTestTranscript("chestpain", {
      onTranscript,
      delay: 0,
    });
    await vi.runAllTimersAsync();
    await promise;
    expect(onTranscript).toHaveBeenCalledTimes(sampleData.length);
  });

  it("calls onComplete after all transcripts are emitted", async () => {
    const onComplete = vi.fn();
    const promise = streamTestTranscript("chestpain", {
      onComplete,
      delay: 0,
    });
    await vi.runAllTimersAsync();
    await promise;
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("passes PartialTranscript objects to onTranscript", async () => {
    const received: unknown[] = [];
    const promise = streamTestTranscript("chestpain", {
      onTranscript: (t) => received.push(t),
      delay: 0,
    });
    await vi.runAllTimersAsync();
    await promise;
    expect(received).toHaveLength(sampleData.length);
    for (const t of received as Record<string, unknown>[]) {
      expect(t).toHaveProperty("text");
      expect(t).toHaveProperty("is_final", true);
      expect(t).toHaveProperty("confidence", 0.95);
    }
  });

  it("works without onTranscript or onComplete callbacks", async () => {
    const promise = streamTestTranscript("chestpain", { delay: 0 });
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBeUndefined();
  });

  it("throws when loadTestTranscript fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    // Attach rejection handler immediately to avoid unhandled-rejection warning
    // before running timers.
    const promise = streamTestTranscript("chestpain", { delay: 0 });
    const caught = promise.catch((e) => e);
    await vi.runAllTimersAsync();
    const err = await caught;
    expect(err).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// streamTestTranscript — realTime mode
// ---------------------------------------------------------------------------
describe("streamTestTranscript (realTime=true)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls onTranscript for each entry in realTime mode", async () => {
    // fetch is called twice: once by loadTestTranscript, once for raw data
    global.fetch = makeFetchMock(sampleData);
    const onTranscript = vi.fn();
    const promise = streamTestTranscript("chestpain", {
      onTranscript,
      realTime: true,
    });
    await vi.runAllTimersAsync();
    await promise;
    expect(onTranscript).toHaveBeenCalledTimes(sampleData.length);
  });

  it("calls onComplete in realTime mode", async () => {
    global.fetch = makeFetchMock(sampleData);
    const onComplete = vi.fn();
    const promise = streamTestTranscript("chestpain", {
      onComplete,
      realTime: true,
    });
    await vi.runAllTimersAsync();
    await promise;
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// getTestTranscriptInfo
// ---------------------------------------------------------------------------
describe("getTestTranscriptInfo", () => {
  it("returns the correct name", async () => {
    const info = await getTestTranscriptInfo("chestpain");
    expect(info.name).toBe("chestpain");
  });

  it("returns the correct entry count", async () => {
    const info = await getTestTranscriptInfo("chestpain");
    expect(info.entryCount).toBe(sampleData.length);
  });

  it("returns unique speakers", async () => {
    const info = await getTestTranscriptInfo("chestpain");
    expect(info.speakers.sort()).toEqual(["doctor", "patient"]);
  });

  it("calculates duration from first and last timestamps", async () => {
    // first = 0:00 (0s), last = 1:00 (60s) → duration = 1:00
    const info = await getTestTranscriptInfo("chestpain");
    expect(info.duration).toBe("1:00");
  });

  it("throws when fetch fails", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("fetch error"));
    await expect(getTestTranscriptInfo("chestpain")).rejects.toThrow(
      "fetch error",
    );
  });
});
