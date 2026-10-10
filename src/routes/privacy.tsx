import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/daydial/AppShell";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Arcelira" },
      {
        name: "description",
        content: "Privacy policy for Arcelira — what data we collect and how we use it.",
      },
    ],
  }),
  component: PrivacyPolicy,
});

function PrivacyPolicy() {
  return (
    <AppShell>
      <article className="prose prose-invert mx-auto max-w-2xl px-4 py-8 text-sm leading-relaxed text-foreground">
        <h1 className="text-2xl font-bold">Privacy Policy</h1>
        <p className="text-muted-foreground">Last updated: August 10, 2026</p>

        <h2 className="mt-6 text-lg font-semibold">1. Overview</h2>
        <p>
          Arcelira (&ldquo;the app&rdquo;) is a radial daily planner. We respect your privacy and
          collect only the minimum data needed to provide calendar, reminder, and cross-device sync
          features. We do not sell or rent your data to third parties.
        </p>

        <h2 className="mt-6 text-lg font-semibold">2. Data We Collect</h2>
        <ul className="list-disc pl-5">
          <li>
            <strong>Account data (Clerk):</strong> Your email address and a Clerk user ID when you
            create an account. Passwords are managed by Clerk and never stored or accessible to
            Arcelira.
          </li>
          <li>
            <strong>Calendar &amp; event data (Neon Postgres):</strong> Events, reminders,
            calendars, categories, and preferences you create. This data is end-user-scoped via Row
            Level Security — only your account can read or modify your data.
          </li>
          <li>
            <strong>Push notification tokens (Firebase Cloud Messaging):</strong> A device token is
            stored so reminders can be delivered when the app is closed. The token is removed when
            you sign out.
          </li>
          <li>
            <strong>Local storage (guest mode):</strong> If you use the app without an account,
            events are stored only in your browser&apos;s localStorage and never sent to any server.
          </li>
        </ul>

        <h2 className="mt-6 text-lg font-semibold">3. Data We Do NOT Collect</h2>
        <ul className="list-disc pl-5">
          <li>No analytics or tracking SDKs</li>
          <li>No advertising SDKs</li>
          <li>No location data</li>
          <li>No contacts, photos, or media files</li>
          <li>No financial information</li>
          <li>No health or biometric data</li>
        </ul>

        <h2 className="mt-6 text-lg font-semibold">4. Third-Party Services</h2>
        <ul className="list-disc pl-5">
          <li>
            <strong>Clerk</strong> — authentication provider. See{" "}
            <a
              href="https://clerk.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              clerk.com/privacy
            </a>
            .
          </li>
          <li>
            <strong>Neon (Lakebase Postgres)</strong> — database hosting. See{" "}
            <a
              href="https://neon.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              neon.com/privacy
            </a>
            .
          </li>
          <li>
            <strong>Firebase Cloud Messaging</strong> — push notification delivery. See{" "}
            <a
              href="https://firebase.google.com/support/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              firebase.google.com/support/privacy
            </a>
            .
          </li>
        </ul>

        <h2 className="mt-6 text-lg font-semibold">5. Data Retention &amp; Deletion</h2>
        <p>
          Your data is retained for as long as your account is active. You can delete your account
          and all associated data from the in-app Settings screen, or by contacting us at the email
          below. Push tokens are automatically removed on sign-out.
        </p>

        <h2 className="mt-6 text-lg font-semibold">6. Children&apos;s Privacy</h2>
        <p>
          Arcelira is not directed at children under 13 and we do not knowingly collect data from
          children. If you believe a child has provided us with personal data, please contact us so
          we can delete it.
        </p>

        <h2 className="mt-6 text-lg font-semibold">7. Security</h2>
        <p>
          All data in transit uses HTTPS/TLS. Database access is protected by Row Level Security
          policies tied to your Clerk JWT — no other user or role can access your rows. The reminder
          scheduler uses a privileged service role that bypasses RLS only to scan due reminders and
          dispatch push notifications.
        </p>

        <h2 className="mt-6 text-lg font-semibold">8. Changes to This Policy</h2>
        <p>
          We may update this policy from time to time. The &ldquo;Last updated&rdquo; date above
          reflects the most recent revision.
        </p>

        <h2 className="mt-6 text-lg font-semibold">9. Contact</h2>
        <p>
          For privacy questions or data deletion requests, contact:{" "}
          <a href="mailto:privacy@daydial.app" className="text-primary underline">
            privacy@daydial.app
          </a>
        </p>
      </article>
    </AppShell>
  );
}
