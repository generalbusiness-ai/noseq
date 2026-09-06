import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync } from "node:fs";
import {
  assertReportPassed, collectContext, loadProfile, observeAttempt, playwrightCases,
  sha256File, validateEvidence, verifyRawReports, vitestCases, writeNewRecord,
  type Context, type Evidence, type SuiteResult,
} from "./evidence.ts";

const runId = randomUUID();
const directory = `artifacts/harness/${runId}`;
mkdirSync("artifacts/harness", { recursive: true });
mkdirSync(directory);
let context: Context | undefined;
const suites: SuiteResult[] = [];
const diagnostics: string[] = [];
const attempt = observeAttempt();
writeNewRecord(`${directory}/started.json`, { runId, attempt });

function run(id: string, args: string[]): number {
  console.log(`Running ${args.join(" ")}`);
  const logPath = `${directory}/${id}.log`;
  const log = openSync(logPath, "wx");
  const result = spawnSync(process.execPath, args, {
    stdio: ["ignore", log, log],
    env: { ...process.env, NOSEQ_EVIDENCE_DIR: directory, WRANGLER_SEND_METRICS: "false" },
    timeout: 180_000,
  });
  closeSync(log);
  process.stdout.write(readFileSync(logPath));
  if (result.error) diagnostics.push(result.error.message);
  return result.status ?? 1;
}

try {
  context = collectContext();
  const profile = loadProfile();
  writeNewRecord(`${directory}/context.json`, { runId, context, required: profile.suites });
  // Browser tests execute the production bundle rather than a test-only mock page.
  assert.equal(run("build", ["node_modules/vite/bin/vite.js", "build"]), 0, "Browser fixture build failed");
  for (const contract of profile.suites) {
    const rawPath = `${directory}/${contract.id}.json`;
    const args = contract.id === "browser"
      ? ["node_modules/@playwright/test/cli.js", "test"]
      : ["node_modules/vitest/vitest.mjs", "run", "--config",
        contract.id === "node" ? "vitest.config.ts" : "vitest.workers.config.ts",
        "--reporter=default", "--reporter=json", `--outputFile=${rawPath}`];
    let exitCode = run(contract.id, args);
    let cases: SuiteResult["cases"] = [];
    let reportSha256 = "";
    try {
      reportSha256 = sha256File(rawPath);
      const raw: unknown = JSON.parse(readFileSync(rawPath, "utf8"));
      cases = contract.id === "browser" ? playwrightCases(raw) : vitestCases(raw);
      assertReportPassed(raw, contract.id);
    } catch (error) {
      diagnostics.push(`${contract.id}: ${String(error)}`);
      exitCode = 1;
    }
    suites.push({ id: contract.id, command: contract.command, exitCode, cases, reportSha256 });
  }
  // Refuse successful evidence if the checkout/toolchain changed while tests ran.
  assert.deepEqual(collectContext(), context, "Source changed during the run");
  const evidence: Evidence = { schema: "noseq/evidence@1", runId, stage: "P0",
    command: "npm run test:harness", context, required: profile.suites, suites };
  writeNewRecord(`${directory}/evidence.json`, evidence);
  validateEvidence(evidence, context, profile.suites);
  verifyRawReports(evidence, directory);
  console.log(`P0 passed. Evidence: ${directory}/evidence.json`);
} catch (error) {
  diagnostics.push(error instanceof Error ? error.message : String(error));
  // A fresh UUID per attempt and exclusive writes preserve failures across retries.
  writeNewRecord(`${directory}/failure.json`, {
    runId, attempt, ended: observeAttempt(), context: context ?? null, suites, diagnostics,
  });
  console.error(`P0 failed. Retained run: ${directory}\n${diagnostics.join("\n")}`);
  process.exitCode = 1;
}
