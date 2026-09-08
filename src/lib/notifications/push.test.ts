import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { registerPushNotifications, unregisterPushToken } from "./push";

// ---------------------------------------------------------------------------
// Hoisted mocks — vi.mock factories are hoisted above imports, so any values
// they close over must be created with vi.hoisted to be available at hoist time.
// ---------------------------------------------------------------------------
/** Shape of the chainable query-builder mock returned by neon.from(). */
interface ChainMock {
  upsert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
}

const mocks = vi.hoisted(() => {
  /** Chainable query-builder mock returned by neon.from(). */
  function makeChain(result: { error: unknown } | { data: unknown }): ChainMock {
    const chain: ChainMock = {
      upsert: vi.fn().mockResolvedValue(result),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue(result),
    };
    return chain;
  }

  return {
    neon: {
      from: vi.fn(),
    },
    // Firebase dynamic-import mocks
    initializeApp: vi.fn().mockReturnValue({ name: "[DEFAULT]" }),
    getMessaging: vi.fn().mockReturnValue({ app: "[DEFAULT]" }),
    getToken: vi.fn(),
    onMessage: vi.fn(),
    // sw-register mock
    registerFirebaseServiceWorker: vi.fn().mockResolvedValue(null),
    makeChain,
  };
});

vi.mock("@/integrations/neon/client", () => ({
  neon: mocks.neon,
}));

vi.mock("./sw-register", () => ({
  registerFirebaseServiceWorker: mocks.registerFirebaseServiceWorker,
}));

vi.mock("firebase/app", () => ({
  initializeApp: (...args: unknown[]) => mocks.initializeApp(...args),
}));

vi.mock("firebase/messaging", () => ({
  getMessaging: (...args: unknown[]) => mocks.getMessaging(...args),
  getToken: (...args: unknown[]) => mocks.getToken(...args),
  onMessage: (...args: unknown[]) => mocks.onMessage(...args),
}));

// Default env values — individual tests override via vi.stubEnv.
const FIREBASE_ENV = {
  VITE_FIREBASE_API_KEY: "test-api-key",
  VITE_FIREBASE_AUTH_DOMAIN: "test.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "test-project",
  VITE_FIREBASE_SENDER_ID: "1234567890",
  VITE_FIREBASE_APP_ID: "1:1234567890:web:abcdef",
  VITE_FIREBASE_VAPID_KEY: "test-vapid-key",
};

describe("push notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Stub Firebase env vars so the web path passes the config check by default.
    for (const [k, v] of Object.entries(FIREBASE_ENV)) {
      vi.stubEnv(k, v);
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // -------------------------------------------------------------------------
  // isCapacitorNative / web-path selection
  // -------------------------------------------------------------------------

  it("takes the web path (isCapacitorNative is false) in a non-Capacitor environment", async () => {
    // In the node test environment `window` is undefined, so isCapacitorNative()
    // returns false and registerPushNotifications routes to registerWebPush.
    // With Firebase env present but getToken returning a token, the web path
    // runs to completion — proving the capacitor path was NOT taken.
    mocks.neon.from.mockReturnValue(mocks.makeChain({ error: null }));
    mocks.getToken.mockResolvedValue("web-token-123");

    const result = await registerPushNotifications("user-1");

    // Web path calls initializeApp (firebase/app) — capacitor path would have
    // imported @capacitor/push-notifications instead.
    expect(mocks.initializeApp).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.token).toBe("web-token-123");
  });

  // -------------------------------------------------------------------------
  // registerPushNotifications — web path, missing Firebase config
  // -------------------------------------------------------------------------

  it("returns a Firebase config missing error when env vars are absent", async () => {
    vi.stubEnv("VITE_FIREBASE_API_KEY", "");
    vi.stubEnv("VITE_FIREBASE_PROJECT_ID", "");
    vi.stubEnv("VITE_FIREBASE_SENDER_ID", "");
    vi.stubEnv("VITE_FIREBASE_APP_ID", "");

    const result = await registerPushNotifications("user-1");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Firebase config missing in env");
    // Should bail before touching Firebase or Neon.
    expect(mocks.initializeApp).not.toHaveBeenCalled();
    expect(mocks.neon.from).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // syncTokenToNeon — upsert success (exercised via the web path)
  // -------------------------------------------------------------------------

  it("syncTokenToNeon upserts the token and returns success", async () => {
    const chain = mocks.makeChain({ error: null }) as ChainMock;
    mocks.neon.from.mockReturnValue(chain);
    mocks.getToken.mockResolvedValue("web-token-success");

    const result = await registerPushNotifications("user-1");

    expect(mocks.neon.from).toHaveBeenCalledWith("push_tokens");
    expect(chain.upsert).toHaveBeenCalledTimes(1);
    const [payload, opts] = chain.upsert.mock.calls[0]!;
    expect(payload).toMatchObject({
      user_id: "user-1",
      token: "web-token-success",
      platform: "web",
      is_active: true,
    });
    expect(opts).toEqual({ onConflict: "user_id,token" });
    expect(result).toEqual({ success: true, token: "web-token-success" });
  });

  // -------------------------------------------------------------------------
  // syncTokenToNeon — upsert error (exercised via the web path)
  // -------------------------------------------------------------------------

  it("syncTokenToNeon returns an error when upsert fails", async () => {
    const chain = mocks.makeChain({ error: { message: "upsert failed" } }) as ChainMock;
    mocks.neon.from.mockReturnValue(chain);
    mocks.getToken.mockResolvedValue("web-token-err");

    const result = await registerPushNotifications("user-2");

    expect(result.success).toBe(false);
    expect(result.error).toBe("upsert failed");
  });

  // -------------------------------------------------------------------------
  // unregisterPushToken
  // -------------------------------------------------------------------------

  it("unregisterPushToken deactivates tokens for the current user", async () => {
    const chain = mocks.makeChain({ data: null }) as ChainMock;
    mocks.neon.from.mockReturnValue(chain);

    await unregisterPushToken("user-3");

    expect(mocks.neon.from).toHaveBeenCalledWith("push_tokens");
    expect(chain.update).toHaveBeenCalledWith({ is_active: false });
    expect(chain.eq).toHaveBeenCalledWith("user_id", "user-3");
  });
});
