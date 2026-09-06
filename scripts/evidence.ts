import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkToolchain } from "./check-toolchain.ts";

export interface CaseResult { id: string; status: string }
export interface SuiteContract { id: string; command: string; requiredCases: string[] }
export interface Profile {
  id: string;
  runtime: Record<string, string>;
  fixtures: string[];
  suites: SuiteContract[];
}
export interface Context {
  source: { commit: string; tree: string };
  lockfileSha256: string;
  profile: { id: string; sha256: string };
  fixtures: Record<string, string>;
  runtime: Record<string, string>;
}
export interface SuiteResult {
  id: string;
  command: string;
  exitCode: number;
  cases: CaseResult[];
  reportSha256: string;
}
export interface Evidence {
  schema: "noseq/evidence@1";
  runId: string;
  stage: "P0";
  command: "npm run test:harness";
  context: Context;
  required: SuiteContract[];
  suites: SuiteResult[];
}

export function loadProfile(): Profile {
  return JSON.parse(readFileSync("fixtures/harness/profile.json", "utf8")) as Profile;
}
export function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
export function observeAttempt(): Record<string, unknown> {
  // Failure provenance is deliberately separate from validated, clean context.
  const observe = (read: () => unknown): unknown => {
    try { return read(); } catch (error) { return { error: String(error) }; }
  };
  const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
  return {
    at: new Date().toISOString(), node: process.versions.node, platform: process.platform, arch: process.arch,
    commit: observe(() => git("rev-parse", "HEAD")), tree: observe(() => git("rev-parse", "HEAD^{tree}")),
    status: observe(() => git("status", "--porcelain", "--untracked-files=all")),
    lockfileSha256: observe(() => sha256File("package-lock.json")),
    profileSha256: observe(() => sha256File("fixtures/harness/profile.json")),
  };
}
export function collectContext(): Context {
  checkToolchain();
  const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
  assert.equal(git("status", "--porcelain", "--untracked-files=all"), "", "Evidence requires a clean committed checkout");
  const profile = loadProfile();
  return {
    source: { commit: git("rev-parse", "HEAD"), tree: git("rev-parse", "HEAD^{tree}") },
    lockfileSha256: sha256File("package-lock.json"),
    profile: { id: profile.id, sha256: sha256File("fixtures/harness/profile.json") },
    fixtures: Object.fromEntries(profile.fixtures.map(path => [path, sha256File(path)])),
    runtime: { ...profile.runtime, platform: process.platform, arch: process.arch },
  };
}

function object(value: unknown): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "Expected an object");
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, expected: string[]): void {
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), "Missing or unexpected fields");
}
function unique(values: string[]): void {
  assert(values.length > 0, "Required sets cannot be empty");
  assert(values.every(value => typeof value === "string" && value.length > 0));
  assert.equal(new Set(values).size, values.length, "Duplicate identifiers");
}

export function validateEvidence(value: unknown, context: Context, contracts: SuiteContract[]): void {
  const evidence = object(value);
  keys(evidence, ["schema", "runId", "stage", "command", "context", "required", "suites"]);
  assert.equal(evidence.schema, "noseq/evidence@1");
  assert.equal(evidence.stage, "P0");
  assert.equal(evidence.command, "npm run test:harness");
  assert(typeof evidence.runId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(evidence.runId), "Invalid run identity");
  assert.deepEqual(evidence.context, context, "Source, lockfile, runtime, profile or fixture identity mismatch");
  assert.deepEqual(evidence.required, contracts, "Required-case contract mismatch");
  unique(contracts.map(contract => contract.id));
  assert(Array.isArray(evidence.suites));
  assert.equal(evidence.suites.length, contracts.length, "Missing or extra suite");
  const ids = evidence.suites.map(suite => object(suite).id as string);
  unique(ids);
  for (const contract of contracts) {
    unique(contract.requiredCases);
    const suite = object(evidence.suites.find(suite => object(suite).id === contract.id));
    keys(suite, ["id", "command", "exitCode", "cases", "reportSha256"]);
    assert.equal(suite.command, contract.command, "Wrong suite command");
    assert.equal(suite.exitCode, 0, "Suite command failed");
    assert(typeof suite.reportSha256 === "string" && /^[0-9a-f]{64}$/.test(suite.reportSha256), "Invalid raw report hash");
    assert(Array.isArray(suite.cases));
    const cases = suite.cases.map(value => {
      const result = object(value);
      keys(result, ["id", "status"]);
      assert.equal(result.status, "passed", "Missing, skipped, failed or pending mandatory case");
      assert(typeof result.id === "string");
      return result.id;
    });
    unique(cases);
    assert.deepEqual([...cases].sort(), [...contract.requiredCases].sort(), "Required case set mismatch");
  }
}

export function vitestCases(value: unknown): CaseResult[] {
  const report = object(value);
  assert(Array.isArray(report.testResults));
  return report.testResults.flatMap(module => {
    const result = object(module);
    assert(Array.isArray(result.assertionResults));
    return result.assertionResults.map(item => {
      const test = object(item);
      assert(typeof test.fullName === "string" && typeof test.status === "string");
      return { id: test.fullName, status: test.status };
    });
  });
}

export function playwrightCases(value: unknown): CaseResult[] {
  const report = object(value);
  assert(Array.isArray(report.errors) && report.errors.length === 0, "Playwright runner failed");
  const cases: CaseResult[] = [];
  function visit(value: unknown): void {
    const suite = object(value);
    assert(Array.isArray(suite.specs));
    assert(suite.suites === undefined || Array.isArray(suite.suites));
    for (const item of suite.specs) {
      const spec = object(item);
      assert(typeof spec.title === "string" && Array.isArray(spec.tests));
      for (const item of spec.tests) {
        const test = object(item);
        assert.equal(test.expectedStatus, "passed", "Expected-failure tests cannot satisfy a gate");
        assert(Array.isArray(test.results) && test.results.length === 1, "Retries cannot hide a failure");
        const result = object(test.results[0]);
        assert(typeof result.status === "string");
        cases.push({ id: spec.title, status: result.status });
      }
    }
    for (const child of suite.suites ?? []) visit(child);
  }
  assert(Array.isArray(report.suites));
  for (const suite of report.suites) visit(suite);
  return cases;
}

export function assertReportPassed(value: unknown, suite: string): void {
  const report = object(value);
  if (suite === "browser") {
    const stats = object(report.stats);
    for (const field of ["skipped", "unexpected", "flaky"]) assert.equal(stats[field], 0);
    assert(Array.isArray(report.errors) && report.errors.length === 0);
  } else {
    assert.equal(report.success, true, "Vitest report failed");
    for (const field of ["numFailedTests", "numPendingTests", "numTodoTests", "numFailedTestSuites"]) {
      assert.equal(report[field], 0, `Vitest ${field} must be zero`);
    }
  }
}

export function verifyRawReports(evidence: Evidence, directory: string): void {
  for (const suite of evidence.suites) {
    assert(["node", "workers", "browser"].includes(suite.id), "Unknown report path");
    const path = join(directory, `${suite.id}.json`);
    assert(statSync(path).size <= 8_388_608, "Raw report exceeds 8 MiB");
    assert.equal(sha256File(path), suite.reportSha256, "Raw report hash mismatch");
    const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
    const cases = suite.id === "browser" ? playwrightCases(raw) : vitestCases(raw);
    assertReportPassed(raw, suite.id);
    assert.deepEqual(cases, suite.cases, "Raw report cases differ from evidence");
  }
}

export function writeNewRecord(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
}
