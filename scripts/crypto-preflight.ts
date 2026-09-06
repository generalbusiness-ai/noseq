import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { collectContext, observeAttempt, sha256File, vitestCases, assertReportPassed, writeNewRecord, type SuiteResult } from "./evidence.ts";
import { preflightContext, profile, sourceContext, sources, validatePreflight, verifyPreflightReports, type PreflightEvidence } from "./crypto-preflight-evidence.ts";

if (process.argv[2] === "--verify") {
  try {
    const path = process.argv[3];
    assert(path, "Supply the retained preflight evidence.json path");
    assert(statSync(path).size <= 1_048_576);
    const e: unknown = JSON.parse(readFileSync(path, "utf8"));
    validatePreflight(e, preflightContext());
    verifyPreflightReports(e, dirname(path));
    console.log("Preflight observations verified. G1–G5 remain UNPASSED; candidate production use remains stopped.");
  } catch (error) { console.error(String(error)); process.exitCode = 1; }
} else {
  const runId = randomUUID();
  const directory = resolve(`artifacts/crypto-preflight/runs/${runId}`);
  mkdirSync(dirname(directory), { recursive: true }); mkdirSync(directory);
  const attempt = observeAttempt();
  const observe = (read: () => unknown): unknown => {
    try { return read(); } catch (error) { return { error: String(error) }; }
  };
  const inputs = {
    profile: observe(profile),
    profileSha256: observe(() => sha256File("fixtures/crypto/preflight-profile.json")),
    fixtureSha256: observe(() => sha256File("fixtures/crypto/marmot-v2-vector.json")),
  };
  writeNewRecord(join(directory, "started.json"), { runId, attempt, inputs });
  let context: ReturnType<typeof preflightContext> | undefined;
  const suites: SuiteResult[] = [];
  const diagnostics: string[] = [];
  let step = 0;
  function run(command: string, args: string[], cwd = process.cwd()): number {
    const path = join(directory, `${++step}.log`);
    console.log(`Preflight step ${step}: ${command} ${args.join(" ")}`);
    const log = openSync(path, "wx");
    const r = spawnSync(command, args, { cwd, stdio: ["ignore", log, log], timeout: 180_000,
      env: { ...process.env, CI: "true", NOSEQ_PREFLIGHT_RUN: directory } });
    closeSync(log); process.stdout.write(readFileSync(path));
    writeNewRecord(join(directory, `${step}.command.json`), {
      command, args, cwd, exitCode: r.status, signal: r.signal, error: r.error?.message ?? null,
    });
    if (r.error) diagnostics.push(String(r.error));
    return r.status ?? 1;
  }
  try {
    collectContext(); // Keep P0's clean source and pinned toolchain contract.
    const p = profile();
    mkdirSync(sources, { recursive: true });
    for (const name of ["marmot-protocol", "marmot-ts"]) {
      const pin = p.sources[name]!; const path = join(sources, name);
      if (!existsSync(path)) {
        assert.equal(run("git", ["clone", "--no-checkout", pin.url, path]), 0);
        assert.equal(run("git", ["-C", path, "checkout", "--detach", pin.commit]), 0);
      }
    }
    const candidate = join(sources, "marmot-ts");
    // Only the explicitly pinned MLS submodule is needed, not every upstream project.
    if (!existsSync(join(candidate, "ts-mls/.git"))) {
      assert.equal(run("git", ["-C", candidate, "submodule", "update", "--init", "--depth", "1", "ts-mls"]), 0);
    }
    sourceContext(); // Verify pins/bytes before executing dependency or build tools.
    const pnpm = resolve("node_modules/pnpm/bin/pnpm.cjs");
    assert.equal(run(process.execPath, [pnpm, "install", "--frozen-lockfile", "--ignore-scripts"], candidate), 0);
    assert.equal(run(process.execPath, [pnpm, "--filter", "ts-mls", "build"], candidate), 0);
    assert.equal(run(process.execPath, [pnpm, "exec", "tsc", "-b", "tsconfig.build.json"], candidate), 0);
    context = preflightContext();
    writeNewRecord(join(directory, "context.json"), { context, required: p.suites, gates: p.gates });
    for (const suite of p.suites) {
      const rawPath = join(directory, `${suite.id}.json`);
      const upstream = suite.id === "upstream";
      const cli = upstream ? join(candidate, "node_modules/vitest/vitest.mjs") : resolve("node_modules/vitest/vitest.mjs");
      const config = resolve(upstream ? "crypto-preflight.upstream.config.mjs" : "crypto-preflight.config.ts");
      let exitCode = run(process.execPath, [cli, "run", "--config", config, "--configLoader", "native",
        "--reporter=default", "--reporter=json", `--outputFile=${rawPath}`], upstream ? candidate : process.cwd());
      let cases: SuiteResult["cases"] = []; let reportSha256 = "";
      try {
        reportSha256 = sha256File(rawPath);
        const raw: unknown = JSON.parse(readFileSync(rawPath, "utf8"));
        cases = vitestCases(raw); assertReportPassed(raw, suite.id);
      } catch (error) { diagnostics.push(String(error)); exitCode = 1; }
      suites.push({ id: suite.id, command: suite.command, exitCode, cases, reportSha256 });
    }
    assert.deepEqual(preflightContext(), context, "Source changed during the probe");
    const e: PreflightEvidence = { schema: "noseq/crypto-preflight@1", runId,
      command: "npm run probe:crypto-preflight", conclusion: "observations-reproduced; candidate-incompatible; no-security-gate-passed",
      context, required: p.suites, gates: p.gates, suites };
    writeNewRecord(join(directory, "evidence.json"), e);
    validatePreflight(e, context); verifyPreflightReports(e, directory);
    console.log(`Observations reproduced. Candidate INCOMPATIBLE; G1–G5 UNPASSED.\nEvidence: ${directory}/evidence.json`);
  } catch (error) {
    diagnostics.push(String(error));
    writeNewRecord(join(directory, "failure.json"), { runId, attempt, inputs, ended: observeAttempt(), context: context ?? null, suites, diagnostics });
    console.error(`Preflight failed; retained ${directory}\n${diagnostics.join("\n")}`); process.exitCode = 1;
  }
}
