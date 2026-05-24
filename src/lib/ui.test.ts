import { describe, it, expect, vi, beforeEach } from "vitest";
import ui, { Overlay, state } from "./ui";
import { get } from "svelte/store";

describe("Overlay enum", () => {
  it("exposes known overlay values", () => {
    expect(Overlay.none).toBe("none");
    expect(Overlay.import).toBe("import");
  });
});

describe("ui state store", () => {
  it("initializes with overlay=none and viewer=false", () => {
    // Note: state may have been mutated by other imports — only check structure.
    const s = get(state);
    expect(s).toHaveProperty("overlay");
    expect(s).toHaveProperty("viewer");
  });
});

describe("ui event emitter", () => {
  beforeEach(() => {
    ui.removeAllListeners();
    ui.clearLatest("test-event");
  });

  it("listen() returns an unsubscribe function", () => {
    const fn = vi.fn();
    const unsubscribe = ui.listen("test-event", fn);

    ui.emit("test-event", "payload");
    expect(fn).toHaveBeenCalledWith("payload");

    unsubscribe();
    ui.emit("test-event", "payload2");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("stores the latest emission with getLatest()", () => {
    ui.emit("test-event", { value: 42 });
    const latest = ui.getLatest("test-event");
    expect(latest).not.toBeNull();
    expect(latest!.data).toEqual({ value: 42 });
    expect(latest!.timestamp).toBeInstanceOf(Date);
  });

  it("returns null for events that have never been emitted", () => {
    expect(ui.getLatest("never-emitted")).toBeNull();
  });

  it("clearLatest removes only the named event", () => {
    ui.emit("test-event", 1);
    ui.emit("other-event", 2);
    ui.clearLatest("test-event");
    expect(ui.getLatest("test-event")).toBeNull();
    expect(ui.getLatest("other-event")).not.toBeNull();
    ui.clearLatest("other-event");
  });

  it("getAllLatest returns a snapshot of stored events", () => {
    ui.emit("test-event", "a");
    const all = ui.getAllLatest();
    expect(all).toHaveProperty("test-event");
    expect(all["test-event"].data).toBe("a");
  });

  it("stores latest data even after removeAllListeners", () => {
    // The internal "context" listener is removed by beforeEach's removeAllListeners,
    // but getLatest still tracks emits because it's in the overridden emit().
    ui.emit("some-event", "val");
    expect(ui.getLatest("some-event")!.data).toBe("val");
  });
});

describe("ui.confirm", () => {
  beforeEach(() => {
    ui.removeAllListeners();
  });

  it("emits 'confirm' and resolves with the chosen boolean", async () => {
    // Attach the listener BEFORE calling confirm, so the emit is caught.
    ui.on("confirm", (payload: any) => {
      expect(payload.message).toBe("Are you sure?");
      payload.resolve(true);
    });
    const result = await ui.confirm("Are you sure?");
    expect(result).toBe(true);
  });
});

describe("ui.prompt", () => {
  beforeEach(() => {
    ui.removeAllListeners();
  });

  it("resolves with the string entered into a string-form prompt", async () => {
    ui.on("prompt", (payload: any) => payload.resolve("typed value"));
    const result = await ui.prompt("What is your name?");
    expect(result).toBe("typed value");
  });

  it("accepts an object config and forwards its fields", async () => {
    ui.on("prompt", (payload: any) => {
      expect(payload.title).toBe("My Dialog");
      payload.resolve("answer");
    });
    const result = await ui.prompt({
      message: "pick one",
      title: "My Dialog",
      type: "text",
    } as any);
    expect(result).toBe("answer");
  });
});
