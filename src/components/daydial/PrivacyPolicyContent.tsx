import { PRIVACY_UPDATED, SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/support";

export function PrivacyPolicyContent({
  accountFeaturesEnabled,
}: {
  accountFeaturesEnabled: boolean;
}) {
  return (
    <article className="mx-auto max-w-2xl space-y-4 py-6 text-sm leading-relaxed text-foreground [&_h2]:pt-3 [&_h2]:text-lg [&_h2]:font-semibold [&_a]:text-primary [&_a]:underline">
      <h1 className="text-2xl font-bold">Privacy Policy</h1>
      <p className="text-muted-foreground">Last updated: {PRIVACY_UPDATED}</p>
      <p>
        Arcelira is a visual daily planner. This policy explains planner storage, reminders,
        optional online services and how to contact us. We do not sell your planner data.
      </p>
      <p className="rounded-2xl border border-border bg-card p-4">
        {accountFeaturesEnabled
          ? "You can use local guest mode. The optional account section below applies if you sign in or transfer guest data to your account."
          : "This edition runs without an account. Account sign-in, cloud synchronization and server push are not enabled in this edition."}
      </p>
      <h2>Local planner data</h2>
      <p>
        In guest mode, events and preferences are stored in the app or browser on your device. This
        includes titles, times, notes, location text you enter, categories, recurrence and reminder
        choices. Guest planner data is not automatically uploaded to our database. Location text is
        not GPS access; the planner does not require your contacts or system calendar.
      </p>
      <p>
        When you choose a calendar file to import, the app reads that file. Exported or shared
        calendar copies are under your control and may be processed by the apps or people you share
        them with.
      </p>
      <h2>Notifications and alarms</h2>
      <p>
        Local reminders provide event titles and scheduled times to your device’s operating system.
        Notification permission is optional. On supported iPhones, iOS 26 or later uses a separate
        AlarmKit permission for alarms. You can change these permissions in system Settings.
        Removing an event causes the app to reconcile and cancel its pending reminders.
      </p>
      <p>
        The current iPhone edition does not configure remote push notifications. Its local
        notifications and AlarmKit alarms do not require sending events to a reminder server.
      </p>
      {accountFeaturesEnabled ? (
        <section className="space-y-4" aria-label="Optional account services">
          <h2>Optional account services</h2>
          <p>
            Clerk processes authentication information, including your account identifier and email
            address. Signed-in planner events, calendars and preferences are stored using Neon.
            Account-scoped access controls protect these records; authorized server operations may
            also access data to provide the service.
          </p>
          <p>
            In editions configured for remote push, a device token is stored and Firebase Cloud
            Messaging delivers reminders. Signing out deactivates registered tokens; it does not
            delete your account or cloud data. Remote push is not configured in the current iPhone
            edition.
          </p>
          <p>
            To request deletion of account data, contact{" "}
            <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>. There is currently no in-app account
            deletion button.
          </p>
          <p>
            Provider policies: <a href="https://clerk.com/privacy">Clerk</a>,{" "}
            <a href="https://neon.com/privacy">Neon</a> and{" "}
            <a href="https://firebase.google.com/support/privacy">Firebase</a>.
          </p>
        </section>
      ) : null}
      <h2>Network services</h2>
      <p>
        Some editions, including the current iPhone build, load typefaces from Google Fonts. A font
        request conveys connection information such as your IP address to the font service. Event
        titles and notes are not included in font request URLs. See{" "}
        <a href="https://policies.google.com/privacy">Google’s Privacy Policy</a>. The planner does
        not include advertising or cross-app tracking functionality.
      </p>
      <h2>Retention and deletion</h2>
      <p>
        Local data remains until you remove events or clear the app or browser’s storage. Device and
        browser backups may contain separate copies. We cannot remotely delete guest data on your
        device or calendar files you have shared. Manage these copies and backups through your
        device, browser or recipient.
      </p>
      <p>
        If you email support, your address, message and any attachments are processed to answer your
        request. Send only information needed for the issue; do not send passwords, verification
        codes or private calendar files. You may request deletion of support correspondence by
        email; records required by law may need to be retained.
      </p>
      <h2>Privacy requests and changes</h2>
      <p>
        For privacy questions, deletion requests or concerns about a child’s personal information,
        email <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>. We may revise this policy when the app
        changes; the date above identifies this revision.
      </p>
    </article>
  );
}
