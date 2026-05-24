import { describe, it, expect } from "vitest";
import { sanitizeRedirect } from "./sanitize-redirect";

describe("sanitizeRedirect", () => {
  it.each([
    ["/med/profiles", "/med/profiles"],
    ["/med", "/med"],
    ["/med/documents?filter=1#frag", "/med/documents?filter=1#frag"],
  ])("returns %s unchanged for safe relative path", (input, expected) => {
    expect(sanitizeRedirect(input)).toBe(expected);
  });

  it.each([null, undefined, ""])(
    "falls back to /med for falsy input %s",
    (input) => {
      expect(sanitizeRedirect(input)).toBe("/med");
    },
  );

  it.each([
    ["relative-no-slash", "/med"],
    ["./relative", "/med"],
    ["../up", "/med"],
  ])("rejects non-root-relative path %s", (input, expected) => {
    expect(sanitizeRedirect(input)).toBe(expected);
  });

  it.each([
    ["//evil.com/path", "/med"],
    ["//evil.com", "/med"],
  ])("rejects protocol-relative URL %s", (input, expected) => {
    expect(sanitizeRedirect(input)).toBe(expected);
  });

  it.each([
    ["https://evil.com/abs", "/med"],
    ["http://evil.com", "/med"],
    ["/legit?ref=http://x.com", "/med"], // contains :// anywhere → rejected
    ["javascript://void(0)", "/med"],
  ])("rejects string containing :// — %s", (input, expected) => {
    expect(sanitizeRedirect(input)).toBe(expected);
  });
});
