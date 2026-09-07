import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { scenarios, type Scenario } from "./scenarios.ts";
for (const name of Object.keys(scenarios) as Scenario[]) test(`feasibility.browser.${name}`, async ({ page, browser }) => {
  await page.goto("/"); await page.waitForFunction(() => "runProtocolScenario" in window);
  const result = await page.evaluate(async name => {
    const w = window as typeof window & { runProtocolScenario: (name: string) => Promise<{ status: string }> };
    return { result: await w.runProtocolScenario(name), userAgent: navigator.userAgent, secure: isSecureContext };
  }, name);
  writeFileSync(`${process.env.NOSEQ_PROTOCOL_RUN}/browser-${name}.json`, JSON.stringify({ ...result, browserVersion: browser.version() }), { flag: "wx" });
  expect(result.result.status).toBe("passed"); expect(result.secure).toBe(true); expect(result.userAgent).toContain("HeadlessChrome/");
});
