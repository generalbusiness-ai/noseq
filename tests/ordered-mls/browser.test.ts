import { test, expect } from "@playwright/test";
import type { Scenario } from "./scenarios.ts";
import { writeFileSync } from "node:fs";
const cases: Scenario[] = ["authenticated-leaves", "provisional-state", "competing-self-echo-welcome", "signed-order-boundaries", "pending-interleaving", "restart-boundaries", "future-exclusion", "opaque-failure-halts"];
for (const name of cases) {
  test(`ordered.browser.${name}`, async ({ page, browser }) => {
    await page.goto("/");
    await page.waitForFunction(() => "runOrderedMlsScenario" in window);
    const result = await page.evaluate(async name => {
      const w = window as typeof window & { runOrderedMlsScenario: (name: string) => Promise<{ status: string }> };
      return { result: await w.runOrderedMlsScenario(name), userAgent: navigator.userAgent, secure: isSecureContext };
    }, name);
    expect(result.result.status).toBe("passed"); expect(result.secure).toBe(true);
    expect(result.userAgent).toContain("HeadlessChrome/");
    const observed = { ...result, browserVersion: browser.version() };
    writeFileSync(`${process.env.NOSEQ_ORDERED_RUN}/browser-${name}.json`, JSON.stringify(observed), { flag: "wx" });
    await test.info().attach("actual-runtime", { body: JSON.stringify({ browserVersion: browser.version(), userAgent: result.userAgent, secure: result.secure }), contentType: "application/json" });
  });
}
