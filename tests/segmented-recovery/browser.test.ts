import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { caseNames } from "./scenarios.ts";
for (const name of caseNames)
  test("segmented.browser." + name, async ({ page, browser }) => {
    await page.goto("/");
    await expect.poll(() => page.evaluate(() => typeof window.segmentedProbe)).toBe("function");
    const result = await page.evaluate((name) => window.segmentedProbe(name), name);
    await writeFile(
      join(process.env.NOSEQ_SEGMENTED_RUN!, "browser-" + name + ".json"),
      JSON.stringify(
        {
          ...result,
          browserVersion: browser.version(),
          ...(await page.evaluate(() => ({
            secure: isSecureContext,
            userAgent: navigator.userAgent,
          }))),
        },
        null,
        2,
      ),
      { flag: "wx" },
    );
  });
