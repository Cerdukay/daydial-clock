import { defineConfig } from "@playwright/test";

/** Tests the actual SPA entry with no cloud credentials; not an iOS native test. */
export default defineConfig({
  testDir: "./e2e-capacitor",
  workers: 1,
  retries: 0,
  use: {
    channel: process.env["PLAYWRIGHT_BROWSER_CHANNEL"] || undefined,
    baseURL: "http://127.0.0.1:4181",
    viewport: { width: 390, height: 844 },
    locale: "en-US",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "npm run build:capacitor && npx vite preview --config vite.capacitor.config.ts --host 127.0.0.1 --port 4181 --strictPort",
    url: "http://127.0.0.1:4181",
    timeout: 60_000,
    reuseExistingServer: false,
    // Empty environment values override local .env without changing that file.
    env: {
      VITE_CLERK_PUBLISHABLE_KEY: "",
      CLERK_PUBLISHABLE_KEY: "",
      VITE_NEON_DATA_API_URL: "",
      NEON_DATA_API_URL: "",
    },
  },
});
