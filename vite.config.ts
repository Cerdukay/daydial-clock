// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  nitro: {
    // Cloudflare validates this in UTC; keep it on the latest accepted date
    // rather than deriving it from the local Istanbul calendar date.
    compatibilityDate: "2026-08-09",
  } as Record<string, unknown>,
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    build: {
      rolldownOptions: {
        // Capacitor native plugins are only available inside the Android/iOS
        // shell. They are loaded via dynamic import at runtime, so mark them
        // as external to prevent the web bundler from trying to resolve them.
        external: [
          "@capacitor/core",
          "@capacitor/push-notifications",
          "@capacitor/local-notifications",
          "@capacitor/haptics",
          "@capacitor/preferences",
        ],
      },
    },
  },
});
