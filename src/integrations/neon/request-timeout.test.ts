import { afterEach, describe, expect, it, vi } from "vitest";
import { createTimeoutFetch, RequestTimeoutError, withTimeout } from "./request-timeout";

describe("Neon request timeouts", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects a stalled token operation", async () => {
    vi.useFakeTimers();
    const pending = withTimeout(new Promise<string>(() => undefined), 50);
    const assertion = expect(pending).rejects.toBeInstanceOf(RequestTimeoutError);

    await vi.advanceTimersByTimeAsync(50);
    await assertion;
  });

  it("aborts a stalled fetch", async () => {
    vi.useFakeTimers();
    let observedSignal: AbortSignal | undefined;
    const baseFetch = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          observedSignal = init?.signal ?? undefined;
          observedSignal?.addEventListener("abort", () => reject(observedSignal?.reason), {
            once: true,
          });
        }),
    ) as unknown as typeof fetch;
    const timedFetch = createTimeoutFetch(baseFetch, 75);
    const pending = timedFetch("https://example.test");
    const assertion = expect(pending).rejects.toBeInstanceOf(RequestTimeoutError);

    await vi.advanceTimersByTimeAsync(75);
    await assertion;
    expect(observedSignal?.aborted).toBe(true);
  });
});
