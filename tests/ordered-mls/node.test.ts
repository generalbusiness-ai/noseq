import { test } from "vitest";
import { scenarios, runScenario, type Scenario } from "./scenarios.ts";
import { writeFileSync } from "node:fs";
import { check } from "./fixture.ts";
for (const name of Object.keys(scenarios) as Scenario[]) {
  test(`ordered.node.${name}`, async () => {
    const result = await runScenario(name);
    if (process.env.NOSEQ_ORDERED_RUN) writeFileSync(`${process.env.NOSEQ_ORDERED_RUN}/node-${name}.json`, JSON.stringify({ result, node: process.versions.node }), { flag: "wx" });
    check(result.status === "passed", result.error ?? "scenario failed");
  }, 30_000);
}
