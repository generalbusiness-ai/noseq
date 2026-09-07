import { test } from "vitest";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { runNative } from "./native.ts";
import { check, canonical } from "./wire.ts";
test("segmented.gateway.complete-reserved-history", async () => {
  const run = process.env.NOSEQ_SEGMENTED_RUN;
  check(run, "unique run directory required");
  const result = await runNative(join(run, "native"));
  writeFileSync(join(run, "native-result.json"), canonical(result), { flag: "wx" });
});
