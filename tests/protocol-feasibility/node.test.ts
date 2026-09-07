import { test } from "vitest";
import { writeFileSync } from "node:fs";
import { scenarios, runScenario, type Scenario } from "./scenarios.ts";
import { check } from "./wire.ts";
for (const name of Object.keys(scenarios) as Scenario[]) test(`feasibility.node.${name}`, async () => {
  const result = await runScenario(name);
  if (process.env.NOSEQ_PROTOCOL_RUN) writeFileSync(`${process.env.NOSEQ_PROTOCOL_RUN}/node-${name}.json`, JSON.stringify({ result, node: process.versions.node }), { flag: "wx" });
  check(result.status === "passed", result.error ?? "scenario failed");
}, 60000);
