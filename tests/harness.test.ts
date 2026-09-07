import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vitest";
import { assertReportPassed, sha256File, validateEvidence, verifyRawReports, vitestCases, playwrightCases, writeNewRecord,
  type Context, type Evidence, type SuiteContract } from "../scripts/evidence.ts";

const context: Context = {
  source: { commit: "a".repeat(40), tree: "b".repeat(40) },
  lockfileSha256: "c".repeat(64),
  profile: { id: "test-profile", sha256: "d".repeat(64) },
  fixtures: { fixture: "e".repeat(64) }, runtime: { node: "test-runtime" },
};
const contracts: SuiteContract[] = [{ id: "fixture", command: "fixture runner", requiredCases: ["one", "two"] }];
const valid = (): Evidence => ({
  schema: "noseq/evidence@1", runId: "00000000-0000-4000-8000-000000000000", stage: "P0",
  command: "npm run test:harness", context: structuredClone(context), required: structuredClone(contracts),
  suites: [{ id: "fixture", command: "fixture runner", exitCode: 0, reportSha256: "f".repeat(64),
    cases: [{ id: "one", status: "passed" }, { id: "two", status: "passed" }] }],
});
const rejected = (mutate: (record: Evidence) => void): void => {
  const record = valid(); mutate(record);
  assert.throws(() => validateEvidence(record, context, contracts));
};

test("node.complete", () => {
  assert.equal(typeof process.versions.node, "string");
  validateEvidence(valid(), context, contracts);
});
test("node.identity", () => {
  for (const key of ["source", "lockfileSha256", "profile", "fixtures", "runtime"]) {
    rejected(record => { (record.context as unknown as Record<string, unknown>)[key] = "wrong"; });
  }
  rejected(record => { record.command = "other" as Evidence["command"]; });
  rejected(record => { record.stage = "P1" as "P0"; });
  rejected(record => { record.runId = "-".repeat(36); });
  rejected(record => { record.suites[0]!.reportSha256 = "wrong"; });
  rejected(record => { record.required[0]!.requiredCases.pop(); });
});
test("node.suites", () => {
  rejected(record => { record.suites = []; });
  rejected(record => { record.suites.push(structuredClone(record.suites[0]!)); });
  rejected(record => { record.suites[0]!.command = "other"; });
  assert.throws(() => validateEvidence(valid(), context, []));
});
test("node.cases", () => {
  rejected(record => { record.suites[0]!.cases.pop(); });
  rejected(record => { record.suites[0]!.cases = []; });
  rejected(record => { record.suites[0]!.cases[1]!.id = "one"; });
  rejected(record => { record.suites[0]!.cases[1]!.id = "unrequested"; });
  rejected(record => { record.suites[0]!.cases.push({ id: "extra", status: "passed" }); });
});
test("node.outcomes", () => {
  for (const status of ["skipped", "failed", "pending", "todo", "missing"]) {
    rejected(record => { record.suites[0]!.cases[0]!.status = status; });
  }
  rejected(record => { record.suites[0]!.exitCode = 1; });
  assert.throws(() => validateEvidence({}, context, contracts));
});
test("node.raw-reports", () => {
  assert.throws(() => assertReportPassed({ success: false, testResults: [] }, "node"));
  assert.deepEqual(vitestCases({ success: true, testResults: [] }), []);
  assert.deepEqual(vitestCases({ success: false, testResults: [{ assertionResults: [{ fullName: "failure", status: "failed" }] }] }),
    [{ id: "failure", status: "failed" }]);
  const report = { errors: [], suites: [{ specs: [{ title: "browser",
    tests: [{ expectedStatus: "passed", results: [{ status: "passed" }] }] }] }] };
  assert.deepEqual(playwrightCases(report), [{ id: "browser", status: "passed" }]);
  report.suites[0]!.specs[0]!.tests[0]!.results.push({ status: "passed" });
  assert.throws(() => playwrightCases(report));
  const directory = mkdtempSync(join(tmpdir(), "noseq-raw-"));
  try {
    const path = join(directory, "node.json");
    writeNewRecord(path, { success: true, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0,
      numFailedTestSuites: 0, testResults: [{ assertionResults: [{ fullName: "one", status: "passed" }] }] });
    const evidence = valid();
    evidence.suites = [{ id: "node", command: "test", exitCode: 0,
      cases: [{ id: "one", status: "passed" }], reportSha256: sha256File(path) }];
    verifyRawReports(evidence, directory);
    evidence.suites[0]!.cases[0]!.status = "skipped";
    assert.throws(() => verifyRawReports(evidence, directory));
    evidence.suites[0]!.cases[0]!.status = "passed";
    writeFileSync(path, "{}");
    assert.throws(() => verifyRawReports(evidence, directory));
    rmSync(path);
    assert.throws(() => verifyRawReports(evidence, directory));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test("node.future-stages", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const future = ["test:crypto-feasibility", "gate:protocol", "test:protocol", "test:runtime", "test:definition", "test:workers", "test:relay", "test:mirror", "test:client", "test:recovery", "test:ui", "test:dynamic-apps", "test:flows", "acceptance", "benchmark"];
  assert.equal(future.length, 15); // Preserve every reserved P0 command, including the two new closed gate readers.
  for (const command of future) {
    const args = (pkg.scripts[command] as string).split(" "); assert.equal(args.shift(), "node");
    const result = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.equal(result.status, 1); assert.match(result.stderr, /stage not implemented/);
  }
  const aggregate = spawnSync(process.execPath, ["scripts/verify-evidence.ts"], { encoding: "utf8" });
  assert.equal(aggregate.status, 1);
  assert.match(aggregate.stderr, /stage not implemented/);
});
test("node.failed-runs", () => {
  const directory = mkdtempSync(join(tmpdir(), "noseq-evidence-"));
  try {
    const path = join(directory, "failure.json");
    writeNewRecord(path, { status: "failed" });
    assert.throws(() => writeNewRecord(path, { status: "passed" }));
    assert.equal(JSON.parse(readFileSync(path, "utf8")).status, "failed");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
