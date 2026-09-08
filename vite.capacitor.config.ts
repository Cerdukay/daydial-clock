/**
 * Vite config for the Capacitor client-only SPA build.
 *
 * This config intentionally does NOT use the @lovable.dev/vite-tanstack-config
 * plugin or the TanStack Start SSR pipeline. Instead it produces a plain
 * client-side bundle that Capacitor's WebView can load from local files.
 *
 * Build:  npx vite build --config vite.capacitor.config.ts
 * Output: dist/  (set as Capacitor's webDir)
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tsconfigPaths(), tailwindcss()],
  define: {
    // capacitor-index.html already ships the document shell, and this build
    // mounts the router into <div id="root"> inside it. The root route uses
    // this flag to skip its own <html>/<head>/<body> shell — see __root.tsx.
    "import.meta.env.VITE_SPA_SHELL": JSON.stringify("1"),
  },
  build: {
    outDir: "dist",
    // Capacitor loads from the local file system, so use relative base.
    base: "./",
    // Code-split vendor chunks to reduce initial WebView load time.
    rollupOptions: {
      input: "capacitor-index.html",
    },
    chunkSizeWarningLimit: 1500,
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
});
