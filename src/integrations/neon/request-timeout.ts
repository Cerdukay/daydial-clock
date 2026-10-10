export const NEON_REQUEST_TIMEOUT_MS = 15_000;

export class RequestTimeoutError extends Error {
  constructor(message = "The request timed out") {
    super(message);
    this.name = "TimeoutError";
  }
}

/** Prevent an auth/token promise from keeping an Android save pending forever. */
export function withTimeout<T>(
  operation: PromiseLike<T>,
  timeoutMs = NEON_REQUEST_TIMEOUT_MS,
  message = "The request timed out",
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new RequestTimeoutError(message));
    }, timeoutMs);

    Promise.resolve(operation).then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** A fetch wrapper that aborts stalled Data API requests on mobile networks. */
export function createTimeoutFetch(
  baseFetch: typeof fetch = globalThis.fetch,
  timeoutMs = NEON_REQUEST_TIMEOUT_MS,
): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const upstreamSignal = init?.signal;
    const forwardAbort = () => controller.abort(upstreamSignal?.reason);

    if (upstreamSignal?.aborted) {
      forwardAbort();
    } else {
      upstreamSignal?.addEventListener("abort", forwardAbort, { once: true });
    }

    const timeoutError = new RequestTimeoutError("The Arcelira data request timed out");
    const timeout = setTimeout(() => controller.abort(timeoutError), timeoutMs);

    try {
      return await baseFetch(input, { ...init, signal: controller.signal });
    } catch (error) {
      if (controller.signal.reason === timeoutError) throw timeoutError;
      throw error;
    } finally {
      clearTimeout(timeout);
      upstreamSignal?.removeEventListener("abort", forwardAbort);
    }
  };
}
