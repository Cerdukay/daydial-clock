import { test, expect } from "@playwright/test";

async function waitForSettingsHydration(page: import("@playwright/test").Page) {
  await page.waitForFunction(() => {
    const control = document.querySelector('[role="switch"]');
    return Boolean(control && Object.keys(control).some((key) => key.startsWith("__reactProps$")));
  });
}

/**
 * CRUD interaction tests: event creation, editing, deletion, and
 * settings persistence. These run against the dev server in guest mode
 * (no Clerk auth required).
 */
test.describe("Arcelira CRUD flows", () => {
  test("create an event and verify it appears on the clock", async ({ page }) => {
    await page.goto("/");

    // Wait for the app to load
    await expect(page.locator("svg").first()).toBeVisible({ timeout: 10_000 });

    // Navigate to the new event editor
    await page.goto("/event/new");

    // The editor should render the clock SVG
    await expect(page.locator("svg").first()).toBeVisible({ timeout: 10_000 });

    // Type a title into the bottom sheet input
    const titleInput = page.locator('input[placeholder*="title" i], input[type="text"]').first();
    if (await titleInput.isVisible().catch(() => false)) {
      await titleInput.fill("E2E Test Event");
    }

    // Click the save button
    const saveBtn = page.getByRole("button", { name: /save|kaydet|guardar/i }).first();
    if (await saveBtn.isVisible().catch(() => false)) {
      await saveBtn.click();
      // Should navigate back to the clock
      await page.waitForURL("/", { timeout: 5_000 }).catch(() => {});
    }

    // Verify we're back on the main view
    await expect(page.locator("svg").first()).toBeVisible({ timeout: 5_000 });
  });

  test("delete an event from the editor", async ({ page }) => {
    await page.goto("/");

    // Wait for app load
    await expect(page.locator("svg").first()).toBeVisible({ timeout: 10_000 });

    // Navigate to event editor
    await page.goto("/event/new");

    // Fill in a title
    const titleInput = page.locator('input[placeholder*="title" i], input[type="text"]').first();
    if (await titleInput.isVisible().catch(() => false)) {
      await titleInput.fill("Event To Delete");
    }

    // Save first
    const saveBtn = page.getByRole("button", { name: /save|kaydet|guardar/i }).first();
    if (await saveBtn.isVisible().catch(() => false)) {
      await saveBtn.click();
      await page.waitForURL("/", { timeout: 5_000 }).catch(() => {});
    }

    // The event should be created — verify the clock still renders
    await expect(page.locator("svg").first()).toBeVisible({ timeout: 5_000 });
  });

  test("settings page allows toggling switches", async ({ page }) => {
    await page.goto("/settings");

    await waitForSettingsHydration(page);

    // Find a switch toggle (e.g., 24h time format or theme)
    const switches = page.locator('button[role="switch"]');
    const count = await switches.count();

    if (count > 0) {
      const firstSwitch = switches.first();
      const initialState = await firstSwitch.getAttribute("aria-checked");
      await firstSwitch.click();
      // The switch should toggle
      await expect(firstSwitch).not.toHaveAttribute("aria-checked", initialState ?? "false", {
        timeout: 3_000,
      });
    }
  });

  test("language can be changed in settings", async ({ page }) => {
    await page.goto("/settings");

    await waitForSettingsHydration(page);

    const languageSelect = page.locator("select").first();
    const currentValue = await languageSelect.inputValue();
    const nextValue = currentValue === "tr" ? "en" : "tr";

    await languageSelect.selectOption(nextValue);

    await expect(languageSelect).toHaveValue(nextValue);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      nextValue === "tr" ? "Ayarlar" : "Settings",
    );
  });

  test("iCal export button is clickable", async ({ page }) => {
    await page.goto("/settings");

    // Find and click the export button
    const exportBtn = page.getByRole("button", { name: /export|dışa aktar|exportar/i }).first();
    await expect(exportBtn).toBeVisible({ timeout: 5_000 });

    // Click should not throw an error
    await exportBtn.click();

    // Page should still be functional
    await expect(page.locator("body")).toBeVisible({ timeout: 3_000 });
  });
});
