import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * `src/data/objects.json` and `src/components/anatomy/objects.json` are two
 * independent regular files with identical contents, and consumers are split
 * across both copies — non-anatomy app code reaches into the component folder
 * for data. Editing one silently diverges from the other.
 *
 * The plugin widget consumes the `$data` copy while several app components
 * consume the `$components` copy, so drift would show up as the widget and the
 * app disagreeing about which meshes exist. Collapsing the duplicate is a
 * separate cleanup; until then this makes drift a red test instead of a silent
 * bug. See AI_PLUGIN.md §5.
 */
const ROOT = path.resolve(__dirname, "../..");
const A = path.join(ROOT, "src/data/objects.json");
const B = path.join(ROOT, "src/components/anatomy/objects.json");

describe("objects.json duplication", () => {
  it("keeps the two copies byte-identical", () => {
    expect(readFileSync(B, "utf8")).toBe(readFileSync(A, "utf8"));
  });
});
