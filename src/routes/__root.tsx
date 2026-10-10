import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { ClerkProvider } from "@clerk/react";

import appCss from "../styles.css?url";
import { PlannerProvider, usePlanner } from "@/lib/daydial/store";
import { I18nProvider } from "@/lib/i18n";
import { Toaster } from "@/components/ui/sonner";
import { registerFirebaseServiceWorker } from "@/lib/notifications/sw-register";
import { ErrorBoundary } from "@/components/daydial/ErrorBoundary";
import { clerkPublishableKey } from "@/lib/clerk";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-xs text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">This screen doesn't exist in Arcelira.</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground"
          >
            Back to today
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-xs text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your plan is safe. Try loading the day again.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-full border border-border bg-card px-5 text-sm font-medium text-foreground"
          >
            Back to today
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1",
      },
      { name: "theme-color", content: "#FAFAF8" },
      { title: "Arcelira — Plan your day around the clock" },
      {
        name: "description",
        content:
          "Arcelira is a calm radial daily planner. Place colorful time blocks around an analog clock and see your whole day at a glance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=Inter:wght@400;500;600;700&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  // The Capacitor build is a plain SPA: capacitor-index.html already provides
  // the document, and the router is mounted into <div id="root"> inside it.
  // <html>/<head>/<body> are React 19 host singletons — wherever they are
  // rendered they adopt the real document nodes — so emitting them from a
  // div-rooted tree marks document.body as part of a root whose container is
  // the div. React's event system then walks in a cycle between the two when a
  // document-level event fires (selectionchange, raised on every focus), and
  // the renderer spins forever: the editor freezes and typing does nothing.
  // Render just the app content there; React 19 still hoists HeadContent's
  // title/meta/link tags into the existing <head>.
  if (import.meta.env["VITE_SPA_SHELL"]) {
    return (
      <>
        <HeadContent />
        {children}
      </>
    );
  }

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

/**
 * Catches errors thrown by the active screen and clears them on navigation, so
 * one broken route cannot leave the whole app parked on the fallback.
 */
function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>;
}

/** Bridges the stored language preference into the translation provider. */
function LocalizedApp() {
  const { settings } = usePlanner();
  return (
    <I18nProvider language={settings.language}>
      {/* Required: nested routes render here. */}
      <RouteErrorBoundary>
        <Outlet />
      </RouteErrorBoundary>
      <Toaster position="top-center" />
    </I18nProvider>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const publishableKey = clerkPublishableKey();

  // Register the Firebase messaging service worker on the client side.
  // This is a no-op in SSR and Capacitor native.
  useEffect(() => {
    void registerFirebaseServiceWorker();
  }, []);

  // The native entry already provides auth/query/planner state and lifecycle
  // listeners. A second PlannerProvider would reconcile a different reminder
  // list and overwrite alarms whenever the app resumes.
  if (import.meta.env["VITE_SPA_SHELL"]) return <LocalizedApp />;

  // If Clerk key is missing or invalid, render without auth (guest-only mode).
  // This allows the app to work for local development and Capacitor builds
  // without a live Clerk instance.
  if (!publishableKey) {
    return (
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <PlannerProvider>
            <LocalizedApp />
          </PlannerProvider>
        </ErrorBoundary>
      </QueryClientProvider>
    );
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <PlannerProvider>
            <LocalizedApp />
          </PlannerProvider>
        </ErrorBoundary>
      </QueryClientProvider>
    </ClerkProvider>
  );
}
