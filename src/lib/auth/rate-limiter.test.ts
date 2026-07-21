import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { checkRateLimit } from "./rate-limiter";

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows the first request and reports correct remaining count", () => {
    const result = checkRateLimit("t-first", "user-1", 3, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
    expect(result.retryAfterMs).toBeUndefined();
  });

  it("decrements remaining on each allowed request within the window", () => {
    expect(checkRateLimit("t-decrement", "user-1", 3, 60_000).remaining).toBe(2);
    expect(checkRateLimit("t-decrement", "user-1", 3, 60_000).remaining).toBe(1);
    expect(checkRateLimit("t-decrement", "user-1", 3, 60_000).remaining).toBe(0);
  });

  it("rejects the (maxRequests + 1)-th request and returns retryAfterMs", () => {
    checkRateLimit("t-reject", "user-1", 2, 10_000);
    checkRateLimit("t-reject", "user-1", 2, 10_000);
    const result = checkRateLimit("t-reject", "user-1", 2, 10_000);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterMs).toBeGreaterThan(0);
    expect(result.retryAfterMs).toBeLessThanOrEqual(10_000);
  });

  it("resets the counter after the window expires", () => {
    checkRateLimit("t-reset", "user-1", 1, 10_000);
    const blocked = checkRateLimit("t-reset", "user-1", 1, 10_000);
    expect(blocked.allowed).toBe(false);

    vi.advanceTimersByTime(10_001);

    const result = checkRateLimit("t-reset", "user-1", 1, 10_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("isolates counters between different namespaces", () => {
    checkRateLimit("ns-a", "user-1", 1, 10_000);
    const sameUserDifferentNs = checkRateLimit("ns-b", "user-1", 1, 10_000);
    expect(sameUserDifferentNs.allowed).toBe(true);
  });

  it("isolates counters between different keys inside a namespace", () => {
    checkRateLimit("t-keys", "user-1", 1, 10_000);
    const otherUser = checkRateLimit("t-keys", "user-2", 1, 10_000);
    expect(otherUser.allowed).toBe(true);
  });

  it("reports decreasing retryAfterMs as time passes within the window", () => {
    checkRateLimit("t-retry", "user-1", 1, 10_000);
    const blockedEarly = checkRateLimit("t-retry", "user-1", 1, 10_000);

    vi.advanceTimersByTime(3_000);
    const blockedLate = checkRateLimit("t-retry", "user-1", 1, 10_000);

    expect(blockedEarly.allowed).toBe(false);
    expect(blockedLate.allowed).toBe(false);
    expect(blockedLate.retryAfterMs!).toBeLessThan(blockedEarly.retryAfterMs!);
  });

  it("prunes expired entries of other keys when any call is made", () => {
    // Put user-a at capacity
    checkRateLimit("t-prune", "user-a", 1, 5_000);

    // Advance past the window
    vi.advanceTimersByTime(6_000);

    // A fresh call for user-b triggers lazy prune; user-a's entry is now gone
    const freshCall = checkRateLimit("t-prune", "user-b", 1, 5_000);
    expect(freshCall.allowed).toBe(true);

    // user-a should be allowed again too
    const userAAgain = checkRateLimit("t-prune", "user-a", 1, 5_000);
    expect(userAAgain.allowed).toBe(true);
  });
});
