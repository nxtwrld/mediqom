import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sleep } from "./utils";

describe("sleep", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("resolves only after the configured delay elapses", async () => {
    const done = vi.fn();
    const promise = sleep(1000).then(done);

    // Not resolved before the delay
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    await promise;
    expect(done).toHaveBeenCalledOnce();
  });

  it("resolves nearly immediately for 0 ms", async () => {
    const p = sleep(0);
    await vi.advanceTimersByTimeAsync(0);
    await expect(p).resolves.toBeUndefined();
  });
});
