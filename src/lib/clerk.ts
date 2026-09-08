/**
 * Publishable key for Clerk, or undefined when authentication is not configured.
 *
 * The Capacitor build ships without a Clerk instance and runs guest-only, so
 * every auth entry point has to check this before rendering a Clerk component —
 * they throw outside <ClerkProvider>.
 */
export function clerkPublishableKey(): string | undefined {
  const fromVite = import.meta.env["VITE_CLERK_PUBLISHABLE_KEY"];
  if (fromVite) return fromVite as string;
  if (typeof process !== "undefined" && process.env) {
    return process.env["CLERK_PUBLISHABLE_KEY"];
  }
  return undefined;
}
