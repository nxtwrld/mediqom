import { describe, it, expect } from "vitest";
import { get } from "svelte/store";
import { state } from "./currentUser";

describe("currentUser state", () => {
  it("has sound effects enabled by default", () => {
    const s = get(state);
    expect(s.soundEffects).toBe(true);
  });

  it("can be updated", () => {
    state.set({ soundEffects: false });
    expect(get(state).soundEffects).toBe(false);
    // Restore default
    state.set({ soundEffects: true });
  });
});
