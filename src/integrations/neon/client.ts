import { NeonPostgrestClient, fetchWithToken } from "@neondatabase/postgrest-js";
import type { Database } from "@/integrations/neon/types";
import { getClerkToken } from "./token";
import { createTimeoutFetch, NEON_REQUEST_TIMEOUT_MS, withTimeout } from "./request-timeout";

const timedFetch = createTimeoutFetch();
const getClerkTokenWithTimeout = () =>
  withTimeout(getClerkToken(), NEON_REQUEST_TIMEOUT_MS, "Clerk token request timed out");

function createNeonClient() {
  const dataApiUrl = import.meta.env["VITE_NEON_DATA_API_URL"] || process.env["NEON_DATA_API_URL"];
  if (!dataApiUrl) {
    throw new Error("Missing VITE_NEON_DATA_API_URL");
  }

  return new NeonPostgrestClient<Database>({
    dataApiUrl,
    options: {
      db: { schema: "public" },
      global: {
        fetch: fetchWithToken(getClerkTokenWithTimeout, timedFetch),
      },
    },
  });
}

let client: ReturnType<typeof createNeonClient> | undefined;

export const neon = new Proxy({} as ReturnType<typeof createNeonClient>, {
  get(_, prop, receiver) {
    if (!client) client = createNeonClient();
    return Reflect.get(client, prop, receiver);
  },
});
