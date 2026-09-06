import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { collectContext, observeAttempt, sha256File, writeNewRecord, assertReportPassed, vitestCases, playwrightCases, type SuiteResult } from "./evidence.ts";
import { orderedContext, orderedProfile, profilePath, validateOrdered, verifyOrderedFiles, fileManifest, observationFiles, type OrderedEvidence } from "./ordered-mls-evidence.ts";

if (process.argv[2] === "--verify") {
  try {
    const path = process.argv[3]; assert(path, "Supply the ordered-MLS evidence.json path"); assert(statSync(path).size <= 1_048_576);
    const record: unknown = JSON.parse(readFileSync(path, "utf8")); validateOrdered(record, orderedContext()); verifyOrderedFiles(record, dirname(path));
    console.log("Bounded ordered-MLS evidence verified. G1-G5 remain UNPASSED; no production profile adopted.");
  } catch (error) { console.error(String(error)); process.exitCode = 1; }
} else {
  const runId = randomUUID(); const directory = resolve(`artifacts/ordered-mls/runs/${runId}`);
  mkdirSync(dirname(directory), { recursive: true }); mkdirSync(directory);
  const attempt = observeAttempt();
  const observe = (f: () => unknown) => { try { return f(); } catch (error) { return { error: String(error) }; } };
  const inputs = { profile: observe(orderedProfile), profileSha256: observe(() => sha256File(profilePath)),
    fixtures: observe(() => Object.fromEntries(orderedProfile().fixtures.map(p => [p, sha256File(p)]))) };
  writeNewRecord(join(directory, "started.json"), { runId, attempt, inputs });
  const suites: SuiteResult[] = []; const diagnostics: string[] = [];
  let context: ReturnType<typeof orderedContext> | undefined; let step = 0;
  function run(args: string[], timeout = 180_000): number {
    const path = join(directory, `${++step}.log`); const fd = openSync(path, "wx");
    console.log(`Ordered probe step ${step}: node ${args.join(" ")}`);
    const r = spawnSync(process.execPath, args, { stdio: ["ignore", fd, fd], timeout,
      env: { ...process.env, CI: "true", NOSEQ_ORDERED_RUN: directory } });
    closeSync(fd); process.stdout.write(readFileSync(path));
    writeNewRecord(join(directory, `${step}.command.json`), { command: process.execPath, args, cwd: process.cwd(), exitCode: r.status, signal: r.signal, error: r.error?.message ?? null });
    if (r.error) diagnostics.push(String(r.error)); return r.status ?? 1;
  }
  try {
    collectContext();
    // Reuse the unmodified P1a command to verify/fetch exact sources, frozen dependencies and observations.
    const priorDirectory = "artifacts/crypto-preflight/runs";
    mkdirSync(priorDirectory, { recursive: true }); const before = new Set(readdirSync(priorDirectory));
    assert.equal(run(["scripts/crypto-preflight.ts"], 600_000), 0, "P1a prerequisite failed");
    const newRuns = readdirSync(priorDirectory).filter(name => !before.has(name)); assert.equal(newRuns.length, 1, "Concurrent prerequisite runs are not supported");
    const priorPath = `${priorDirectory}/${newRuns[0]}/evidence.json`;
    const prerequisite = { path: priorPath, sha256: sha256File(priorPath) };
    context = orderedContext(); writeNewRecord(join(directory, "context.json"), { context, prerequisite, required: orderedProfile().suites });
    assert.equal(run(["node_modules/typescript/bin/tsc", "-p", "tsconfig.ordered-mls.json"]), 0, "Ordered probe typecheck failed");
    assert.equal(run(["node_modules/vite/bin/vite.js", "build", "--config", "ordered-mls.vite.config.ts", "--configLoader", "native"]), 0, "Actual browser bundle failed");
    for (const suite of orderedProfile().suites) {
      const rawPath = join(directory, suite.id + ".json");
      const args = suite.id === "browser" ? ["node_modules/@playwright/test/cli.js", "test", "--config", "ordered-mls.playwright.config.ts"]
        : ["node_modules/vitest/vitest.mjs", "run", "--config", "ordered-mls.config.ts", "--configLoader", "native", "--reporter=default", "--reporter=json", `--outputFile=${rawPath}`];
      let exitCode = run(args); let cases: SuiteResult["cases"] = []; let reportSha256 = "";
      try {
        reportSha256 = sha256File(rawPath); const raw: unknown = JSON.parse(readFileSync(rawPath, "utf8"));
        cases = suite.id === "browser" ? playwrightCases(raw) : vitestCases(raw); assertReportPassed(raw, suite.id);
      } catch (error) { diagnostics.push(String(error)); exitCode = 1; }
      suites.push({ id: suite.id, command: suite.command, exitCode, cases, reportSha256 });
    }
    assert.deepEqual(orderedContext(), context, "Source changed during probe");
    const record: OrderedEvidence = { schema: "noseq/ordered-mls-probe@1", runId, command: "npm run probe:ordered-mls",
      conclusion: "bounded-observations-reproduced; continue-investigation; no-security-gate-passed", context,
      gates: orderedProfile().gates, required: orderedProfile().suites, suites, prerequisite,
      observations: Object.fromEntries(observationFiles().map(file => [file, sha256File(join(directory, file))])),
      browserBundle: fileManifest(join(directory, "browser-bundle")) };
    writeNewRecord(join(directory, "evidence.json"), record); validateOrdered(record, context); verifyOrderedFiles(record, directory);
    console.log(`Bounded observations reproduced. CONTINUE investigation; G1-G5 UNPASSED.\nEvidence: ${directory}/evidence.json`);
  } catch (error) {
    diagnostics.push(String(error));
    writeNewRecord(join(directory, "failure.json"), { runId, attempt, inputs, ended: observeAttempt(), context: context ?? null, suites, diagnostics });
    console.error(`Ordered probe failed; retained ${directory}\n${diagnostics.join("\n")}`); process.exitCode = 1;
  }
}
