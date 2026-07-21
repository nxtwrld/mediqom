import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mocks ────────────────────────────────────────────────────────────
const { mockApiFetch } = vi.hoisted(() => {
  return { mockApiFetch: vi.fn() };
});

vi.mock("$lib/api/client", () => ({ apiFetch: mockApiFetch }));
vi.mock("$lib/utils/id", () => ({ generateId: vi.fn().mockReturnValue("test-id") }));

import { ChatClientService } from "./client-service";
import type { ChatContext } from "./types.d";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSSEStream(events: any[]) {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i >= events.length) {
        controller.close();
        return;
      }
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(events[i++])}\n\n`),
      );
    },
  });
}

function makeOkResponse(stream: ReadableStream) {
  return { ok: true, status: 200, body: stream };
}

const ctx: ChatContext = {
  mode: "patient",
  currentProfileId: "p1",
  conversationThreadId: "t1",
  language: "en",
  pageContext: {
    route: "/",
    profileName: "Test",
    availableData: {
      documents: [],
      conditions: [],
      medications: [],
      vitals: [],
    },
    documentsContent: new Map(),
  },
  isOwnProfile: true,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ChatClientService — sendMessage", () => {
  let service: ChatClientService;

  beforeEach(() => {
    service = new ChatClientService();
    vi.clearAllMocks();
  });

  it("calls apiFetch with the correct URL and POST method", async () => {
    mockApiFetch.mockResolvedValueOnce(makeOkResponse(makeSSEStream([])));
    await service.sendMessage("hello", ctx, [], vi.fn());
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/v1/chat/conversation",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("includes the message in the serialized body", async () => {
    mockApiFetch.mockResolvedValueOnce(makeOkResponse(makeSSEStream([])));
    await service.sendMessage("my question", ctx, [], vi.fn());
    const callArg = mockApiFetch.mock.calls[0][1];
    const body = JSON.parse(callArg.body);
    expect(body.message).toBe("my question");
  });

  it("includes profileId and language from context", async () => {
    mockApiFetch.mockResolvedValueOnce(makeOkResponse(makeSSEStream([])));
    await service.sendMessage("hello", ctx, [], vi.fn());
    const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
    expect(body.profileId).toBe("p1");
    expect(body.language).toBe("en");
  });

  it("parses SSE events and calls onEvent for each", async () => {
    const events = [
      { type: "status", message: "Processing" },
      { type: "chunk", content: "Hello" },
      { type: "complete" },
    ];
    mockApiFetch.mockResolvedValueOnce(makeOkResponse(makeSSEStream(events)));

    const onEvent = vi.fn();
    await service.sendMessage("hi", ctx, [], onEvent);

    expect(onEvent).toHaveBeenCalledTimes(3);
    expect(onEvent).toHaveBeenNthCalledWith(1, { type: "status", message: "Processing" });
    expect(onEvent).toHaveBeenNthCalledWith(2, { type: "chunk", content: "Hello" });
    expect(onEvent).toHaveBeenNthCalledWith(3, { type: "complete" });
  });

  it("calls onEvent with error type when response.ok is false", async () => {
    mockApiFetch.mockResolvedValueOnce({ ok: false, status: 500, body: null });
    const onEvent = vi.fn();
    await service.sendMessage("hi", ctx, [], onEvent);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error" }),
    );
  });

  it("calls onEvent with error when response.body is null", async () => {
    mockApiFetch.mockResolvedValueOnce({ ok: true, status: 200, body: null });
    const onEvent = vi.fn();
    await service.sendMessage("hi", ctx, [], onEvent);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error" }),
    );
  });

  it("ignores AbortError and does not call onEvent with error", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    mockApiFetch.mockRejectedValueOnce(abortError);

    const onEvent = vi.fn();
    await service.sendMessage("hi", ctx, [], onEvent);
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("gracefully skips lines that are not valid JSON in the stream", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      pull(controller) {
        // A valid event followed by a malformed one
        controller.enqueue(
          encoder.encode(
            "data: {\"type\":\"chunk\",\"content\":\"ok\"}\n\ndata: not-json\n\n",
          ),
        );
        controller.close();
      },
    });
    mockApiFetch.mockResolvedValueOnce(makeOkResponse(stream));

    const onEvent = vi.fn();
    await service.sendMessage("hi", ctx, [], onEvent);
    // Only the valid event should be delivered
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith({ type: "chunk", content: "ok" });
  });

  it("skips empty data lines without calling onEvent", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      pull(controller) {
        // data: with only whitespace should be skipped
        controller.enqueue(encoder.encode("data:   \n\n"));
        controller.close();
      },
    });
    mockApiFetch.mockResolvedValueOnce(makeOkResponse(stream));

    const onEvent = vi.fn();
    await service.sendMessage("hi", ctx, [], onEvent);
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("serializes Map documentsContent as an array of entries", async () => {
    mockApiFetch.mockResolvedValueOnce(makeOkResponse(makeSSEStream([])));
    const ctxWithDocs: ChatContext = {
      ...ctx,
      pageContext: {
        ...ctx.pageContext,
        documentsContent: new Map([["doc1", { text: "content" }]]),
      },
    };
    await service.sendMessage("hi", ctxWithDocs, [], vi.fn());
    const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
    expect(body.pageContext.documentsContent).toEqual([["doc1", { text: "content" }]]);
  });
});

describe("ChatClientService — cancel", () => {
  let service: ChatClientService;

  beforeEach(() => {
    service = new ChatClientService();
    vi.clearAllMocks();
  });

  it("isProcessing returns false initially", () => {
    expect(service.isProcessing()).toBe(false);
  });

  it("cancel does nothing when no request is in progress", () => {
    // Should not throw
    expect(() => service.cancel()).not.toThrow();
    expect(service.isProcessing()).toBe(false);
  });

  it("cancel aborts an in-progress request and sets controller to null", async () => {
    // Use a stream that never closes so the service stays processing
    let streamController: ReadableStreamDefaultController<any>;
    const neverEndingStream = new ReadableStream({
      start(c) {
        streamController = c;
      },
    });
    mockApiFetch.mockResolvedValueOnce(makeOkResponse(neverEndingStream));

    const sendPromise = service.sendMessage("hi", ctx, [], vi.fn());
    // Give the async machinery a tick to reach `reader.read()` before cancelling
    await Promise.resolve();

    expect(service.isProcessing()).toBe(true);
    service.cancel();
    expect(service.isProcessing()).toBe(false);

    // Close the stream so the promise can settle
    streamController!.close();
    await sendPromise;
  });
});

describe("ChatClientService — second sendMessage aborts the first", () => {
  it("aborts the previous request when a new sendMessage is called", async () => {
    const service = new ChatClientService();
    vi.clearAllMocks();

    // First request: never-ending stream
    let firstStreamCtrl: ReadableStreamDefaultController<any>;
    const firstStream = new ReadableStream({ start(c) { firstStreamCtrl = c; } });
    mockApiFetch.mockResolvedValueOnce(makeOkResponse(firstStream));

    // Second request: immediately completes
    mockApiFetch.mockResolvedValueOnce(makeOkResponse(makeSSEStream([{ type: "complete" }])));

    const firstOnEvent = vi.fn();
    const firstPromise = service.sendMessage("first", ctx, [], firstOnEvent);

    await Promise.resolve(); // let first request reach reader.read()

    const secondOnEvent = vi.fn();
    const secondPromise = service.sendMessage("second", ctx, [], secondOnEvent);

    firstStreamCtrl!.close();
    await Promise.all([firstPromise, secondPromise]);

    // First request was aborted — no error event should be emitted for AbortError
    const firstErrors = firstOnEvent.mock.calls.filter(
      ([e]) => e.type === "error",
    );
    expect(firstErrors.length).toBe(0);

    // Second request completed normally
    expect(secondOnEvent).toHaveBeenCalledWith({ type: "complete" });
  });
});
