import { expect, test } from "@playwright/test";
import profile from "../../fixtures/harness/profile.json" with { type: "json" };

test("browser.page", async ({ page, browser }) => {
  expect(browser.version()).toBe(profile.runtime.chromium);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Noseq" })).toBeVisible();
  await expect(page.getByText("No application loaded.")).toBeVisible();
  await expect(page.locator("#app")).toHaveAttribute("data-worker-ready", "true");
  expect(errors).toEqual([]);
});

test("browser.worker", async ({ page }) => {
  const workerReady = page.waitForEvent("worker");
  await page.goto("/");
  const worker = await workerReady;
  expect(await worker.evaluate(() => ({
    context: globalThis.constructor.name,
    document: typeof (globalThis as unknown as { document?: unknown }).document,
  }))).toEqual({ context: "DedicatedWorkerGlobalScope", document: "undefined" });
  await expect(page.locator("#app")).toHaveAttribute("data-worker-ready", "true");
});
