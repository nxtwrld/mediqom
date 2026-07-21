import { describe, it, expect, vi, beforeEach } from "vitest";
import eventEmitter, { emit, emitShortcut } from "./shortcuts";

describe("shortcuts event emitter", () => {
  beforeEach(() => {
    eventEmitter.removeAllListeners();
  });

  it("emit(name) fires a listener registered via on()", () => {
    const listener = vi.fn();
    eventEmitter.on("test-event", listener);
    emit("test-event");
    expect(listener).toHaveBeenCalledOnce();
  });

  it("listen() returns an unsubscribe function", () => {
    const listener = vi.fn();
    const unsubscribe = eventEmitter.listen("my-event", listener);

    emit("my-event");
    expect(listener).toHaveBeenCalledOnce();

    unsubscribe();
    emit("my-event");
    expect(listener).toHaveBeenCalledOnce(); // no additional calls
  });
});

describe("emitShortcut", () => {
  // Polyfill DOM element constructors for instanceof checks in Node.
  class FakeInput {}
  class FakeTextarea {}

  beforeEach(() => {
    eventEmitter.removeAllListeners();
    (globalThis as any).HTMLInputElement = FakeInput;
    (globalThis as any).HTMLTextAreaElement = FakeTextarea;
  });

  function keyEvent(init: Partial<KeyboardEvent>, target?: EventTarget) {
    // Build a minimal KeyboardEvent-like object. emitShortcut reads target / shiftKey / ctrlKey / altKey / code.
    return {
      target: target ?? null,
      shiftKey: init.shiftKey ?? false,
      ctrlKey: init.ctrlKey ?? false,
      altKey: init.altKey ?? false,
      code: init.code ?? "",
    } as unknown as KeyboardEvent;
  }

  it("emits the default-mapped name for Ctrl+KeyS", () => {
    const save = vi.fn();
    const shortcutCatcher = vi.fn();
    eventEmitter.on("save", save);
    eventEmitter.on("shortcut", shortcutCatcher);

    emitShortcut(keyEvent({ ctrlKey: true, code: "KeyS" }));

    expect(save).toHaveBeenCalledOnce();
    expect(shortcutCatcher).toHaveBeenCalledWith("Ctrl+KeyS");
  });

  it("emits the raw chord as its own event (Ctrl+KeyS)", () => {
    const byChord = vi.fn();
    eventEmitter.on("Ctrl+KeyS", byChord);
    emitShortcut(keyEvent({ ctrlKey: true, code: "KeyS" }));
    expect(byChord).toHaveBeenCalledOnce();
  });

  it("includes Shift+ and Alt+ modifiers in the chord", () => {
    const byChord = vi.fn();
    eventEmitter.on("Shift+Ctrl+Alt+KeyA", byChord);
    emitShortcut(
      keyEvent({ shiftKey: true, ctrlKey: true, altKey: true, code: "KeyA" }),
    );
    expect(byChord).toHaveBeenCalledOnce();
  });

  it("does not emit when the event target is an input element", () => {
    const save = vi.fn();
    eventEmitter.on("save", save);

    const input = new FakeInput();
    emitShortcut(keyEvent({ ctrlKey: true, code: "KeyS" }, input as any));

    expect(save).not.toHaveBeenCalled();
  });
});
