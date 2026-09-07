import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { collectContext, observeAttempt, sha256File, writeNewRecord, assertReportPassed, vitestCases, playwrightCases, type SuiteResult } from "./evidence.ts";
import { fileManifest } from "./ordered-mls-evidence.ts";
import { protocolContext, protocolProfile, profilePath, validateProtocol, verifyProtocolFiles, observationFiles, nativeManifest, gatewayManifest, type ProtocolEvidence } from "./protocol-feasibility-evidence.ts";

if (process.argv[2] === "--verify") {
  try {
    const path = process.argv[3]; assert(path, "Supply the protocol-feasibility evidence.json path"); assert.equal(process.argv.length, 4); assert(statSync(path).size <= 1_048_576);
    const record: unknown = JSON.parse(readFileSync(path, "utf8")); validateProtocol(record, protocolContext()); verifyProtocolFiles(record, dirname(path));
    console.log("Protocol candidate observations verified. All G1-G5 remain UNPASSED; no production profile adopted.");
  } catch (error) { console.error(String(error)); process.exitCode = 1; }
} else {
  const runId = randomUUID(); const directory = resolve(`artifacts/protocol-feasibility/runs/${runId}`);
  mkdirSync(dirname(directory), { recursive: true }); mkdirSync(directory);
  const attempt = observeAttempt(); const observe = (f: () => unknown) => { try { return f(); } catch (error) { return { error: String(error) }; } };
  const inputs = { profile: observe(protocolProfile), profileSha256: observe(() => sha256File(profilePath)) };
  writeNewRecord(join(directory, "started.json"), { runId, attempt, inputs });
  const suites: SuiteResult[] = []; const diagnostics: string[] = []; let step = 0;
  let context: ReturnType<typeof protocolContext> | undefined;
  function run(command: string, args: string[], timeout = 180_000): number {
    const path = join(directory, `${++step}.log`); const fd = openSync(path, "wx");
    console.log(`Protocol feasibility step ${step}: ${command} ${args.join(" ")}`);
    const r = spawnSync(command, args, { stdio: ["ignore", fd, fd], timeout,
      env: { ...process.env, CI: "true", NOSEQ_PROTOCOL_RUN: directory } });
    closeSync(fd); process.stdout.write(readFileSync(path));
    writeNewRecord(join(directory, `${step}.command.json`), { command, args, cwd: process.cwd(), exitCode: r.status, signal: r.signal, error: r.error?.message ?? null });
    if (r.error) diagnostics.push(String(r.error)); return r.status ?? 1;
  }
  const node = (args: string[], timeout?: number) => run(process.execPath, args, timeout);
  function prerequisite(path: string, script: string) {
    mkdirSync(path, { recursive: true }); const before = new Set(readdirSync(path));
    assert.equal(node([script], 900_000), 0, `${script} prerequisite failed`);
    const added = readdirSync(path).filter(x => !before.has(x)); assert.equal(added.length, 1, "Concurrent prerequisite runs unsupported");
    const record = `${path}/${added[0]}/evidence.json`; return { path: record, sha256: sha256File(record) };
  }
  try {
    assert.equal(process.argv.length, 2, "Unknown probe arguments"); collectContext();
    const harness = prerequisite("artifacts/harness", "scripts/run-harness.ts");
    const ordered = prerequisite("artifacts/ordered-mls/runs", "scripts/ordered-mls.ts");
    const p = protocolProfile(); const nips = "artifacts/protocol-feasibility/sources/nips";
    if (!existsSync(nips)) {
      mkdirSync(dirname(nips), { recursive: true }); assert.equal(run("git", ["clone", "--no-checkout", p.nips.url, nips]), 0);
      assert.equal(run("git", ["-C", nips, "checkout", "--detach", p.nips.commit]), 0);
    }
    context = protocolContext(); writeNewRecord(join(directory, "context.json"), { context, required: p.suites, prerequisites: { harness, ordered } });
    assert.equal(node(["node_modules/typescript/bin/tsc", "-p", "tsconfig.protocol-feasibility.json"]), 0, "Protocol typecheck failed");
    assert.equal(node(["node_modules/vite/bin/vite.js", "build", "--config", "protocol-feasibility.vite.config.ts", "--configLoader", "native"]), 0, "Actual browser bundle failed");
    for (const suite of p.suites) {
      const rawPath = join(directory, suite.id + ".json");
      const args = suite.id === "browser" ? ["node_modules/@playwright/test/cli.js", "test", "--config", "protocol-feasibility.playwright.config.ts"]
        : ["node_modules/vitest/vitest.mjs", "run", "--config", suite.id === "gateway" ? "protocol-gateway.config.ts" : "protocol-feasibility.config.ts", "--configLoader", "native", "--reporter=default", "--reporter=json", `--outputFile=${rawPath}`];
      let exitCode = node(args); let cases: SuiteResult["cases"] = []; let reportSha256 = "";
      try { reportSha256 = sha256File(rawPath); const raw: unknown = JSON.parse(readFileSync(rawPath, "utf8")); cases = suite.id === "browser" ? playwrightCases(raw) : vitestCases(raw); assertReportPassed(raw, suite.id); }
      catch (error) { diagnostics.push(String(error)); exitCode = 1; }
      suites.push({ id: suite.id, command: suite.command, exitCode, cases, reportSha256 });
    }
    assert.equal(node(["scripts/protocol-relay-probe.mjs"]), 0, "Pinned native relay observations unavailable or changed; G5 stays pending");
    assert.deepEqual(protocolContext(), context, "Source changed during probe");
    const record: ProtocolEvidence = { schema: "noseq/protocol-feasibility@1", runId, command: "npm run probe:protocol-feasibility",
      conclusion: "observations-reproduced; protocol-pending; no-security-gate-passed", context, gates: p.gates, closure: p.closure, required: p.suites, suites,
      prerequisites: { harness, ordered }, observations: Object.fromEntries(observationFiles().map(file => [file, sha256File(join(directory, file))])),
      browserBundle: fileManifest(join(directory, "browser-bundle")), gatewayArtifacts: gatewayManifest(directory), native: nativeManifest(join(directory, "native-relay")) };
    writeNewRecord(join(directory, "evidence.json"), record); validateProtocol(record, context); verifyProtocolFiles(record, directory);
    console.log(`Observations reproduced. Proposed prefix gateway observations complete; protocol remains pending; G1-G5 UNPASSED.\nEvidence: ${directory}/evidence.json`);
  } catch (error) {
    diagnostics.push(String(error)); writeNewRecord(join(directory, "failure.json"), { runId, attempt, inputs, ended: observeAttempt(), context: context ?? null, suites, diagnostics });
    console.error(`Protocol feasibility failed; retained ${directory}\n${diagnostics.join("\n")}`); process.exitCode = 1;
  }
}
