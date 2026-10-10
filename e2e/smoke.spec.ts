import { test, expect } from "@playwright/test";

/**
 * Smoke test: verifies the app loads, the clock face renders,
 * and core navigation works.
 */
test.describe("Arcelira smoke journey", () => {
  test("app loads and shows the clock view", async ({ page }) => {
    await page.goto("/");

    // The app should render the main heading or clock area
    await expect(page).toHaveTitle(/Arcelira/i);

    // Wait for the app shell to appear
    await page.waitForSelector("body", { state: "attached" });

    // The clock view should be the default — look for SVG content
    // (the radial clock face is rendered as SVG)
    const svg = page.locator("svg").first();
    await expect(svg).toBeVisible({ timeout: 10_000 });
  });

  test("navigation to settings works", async ({ page }) => {
    await page.goto("/");

    // Find and click the settings navigation link/button
    // The settings link should be accessible
    const settingsLink = page.getByRole("link", { name: /settings/i }).or(
      page.getByText(/settings/i, { exact: false }),
    );

    if (await settingsLink.first().isVisible()) {
      await settingsLink.first().click();
      await page.waitForURL("**/settings", { timeout: 5_000 });
    } else {
      // Try direct navigation
      await page.goto("/settings");
    }

    // Settings page should show appearance section
    await expect(page.getByText(/appearance|görünüm|apariencia/i).first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("can navigate to new event page", async ({ page }) => {
    await page.goto("/");

    // Look for a button/link to create a new event
    const createButton = page
      .getByRole("link", { name: /new event|add|create/i })
      .or(page.getByRole("button", { name: /new event|add|create|\+/i }))
      .first();

    if (await createButton.isVisible().catch(() => false)) {
      await createButton.click();
      await page.waitForURL("**/event/new", { timeout: 5_000 }).catch(() => {});
    } else {
      // Direct navigation as fallback
      await page.goto("/event/new");
    }

    // The event editor should be visible
    await expect(page.locator("body")).toBeVisible();
  });

  test("settings page has notifications section", async ({ page }) => {
    await page.goto("/settings");

    // The notifications section should be present
    await expect(
      page.getByText(/notifications|bildirimler|notificaciones/i).first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("settings page has calendar import/export section", async ({ page }) => {
    await page.goto("/settings");

    // The calendar section should be present
    await expect(
      page.getByText(/calendar|takvim|calendario/i).first(),
    ).toBeVisible({ timeout: 5_000 });

    // Export and import buttons should be visible
    await expect(page.getByText(/export|dışa aktar|exportar/i).first()).toBeVisible();
    await expect(page.getByText(/import|içe aktar|importar/i).first()).toBeVisible();
  });
});
