import { expect, test } from "@playwright/test";

test("guest settings exposes working support and privacy navigation", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("link", { name: "palamutapp@gmail.com" })).toHaveAttribute(
    "href",
    "mailto:palamutapp@gmail.com",
  );
  await page.getByRole("link", { name: "Privacy Policy", exact: true }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { name: "Privacy Policy", exact: true })).toBeVisible();
  await expect(
    page.getByText(/Account sign-in, cloud synchronization and server push are not enabled/),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Optional account services" })).toHaveCount(0);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
});

test("credential-free SPA opens, has one toaster, and persists the first time-format choice", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page).toHaveTitle(/Arcelira/);
  await expect(page.getByRole("radio", { name: /12/ })).toBeVisible();
  await page.getByRole("radio", { name: /12/ }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("region", { name: /^Notifications/ })).toHaveCount(1);
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("daydial.settings.v2") ?? "{}").timeFormat,
      ),
    )
    .toBe("12h");
  await page.reload();
  await expect(page.getByRole("radiogroup", { name: /time format/i })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("guest SPA saves a notification event once and retains it after reload", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    for (const key of [
      "daydial.timeFormatOnboarded.v1",
      "daydial.labelStyleOnboarded",
      "daydial.syncCardDismissed",
      "daydial.gestureHintDismissed",
    ]) {
      localStorage.setItem(key, "1");
    }
  });
  const start = new Date(Date.now() + 5 * 60_000).toISOString();
  const end = new Date(Date.now() + 35 * 60_000).toISOString();
  await page.goto(`/event/new?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
  await page.getByLabel("Event title", { exact: true }).fill("iOS preparation test event");
  await page.getByRole("button", { name: "Save event", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: /^Notification/ }).click();
  await page.waitForURL("/");
  const savedCount = () =>
    page.evaluate(() => {
      const events = JSON.parse(localStorage.getItem("daydial.events.v2") ?? "[]");
      return events.filter(
        (event: { title: string }) => event.title === "iOS preparation test event",
      ).length;
    });
  await expect.poll(savedCount).toBe(1);
  await page.reload();
  await expect(page).toHaveTitle(/Arcelira/);
  await expect.poll(savedCount).toBe(1);
  expect(errors).toEqual([]);
});
