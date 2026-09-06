import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { collectContext, sha256File, vitestCases, assertReportPassed, type SuiteContract, type SuiteResult } from "./evidence.ts";

export const sources = resolve("artifacts/crypto-preflight/sources");
export const profilePath = "fixtures/crypto/preflight-profile.json";
export function profile() {
  return JSON.parse(readFileSync(profilePath, "utf8")) as {
    id: string; pnpm: string; sources: Record<string, { url: string; commit: string }>;
    upstreamLockSha256: string; upstreamPackages: Record<string, string>;
    sourceFiles: Record<string, string>; suites: SuiteContract[]; gates: Record<string, string>;
  };
}
const packageVersion = (base: string, name: string): string =>
  JSON.parse(readFileSync(join(base, "node_modules", name, "package.json"), "utf8")).version;
export function sourceContext() {
  const p = profile();
  const revisions: Record<string, string> = {};
  for (const [name, pin] of Object.entries(p.sources)) {
    const path = name === "ts-mls" ? join(sources, "marmot-ts/ts-mls") : join(sources, name);
    const git = (...args: string[]) => execFileSync("git", ["-C", path, ...args], { encoding: "utf8" }).trim();
    assert.equal(git("status", "--porcelain", "--untracked-files=all"), "", `Dirty upstream source: ${name}`);
    revisions[name] = git("rev-parse", "HEAD");
    assert.equal(revisions[name], pin.commit, `Wrong upstream revision: ${name}`);
    assert.equal(git("remote", "get-url", "origin"), pin.url, `Wrong upstream origin: ${name}`);
  }
  const files = Object.fromEntries(Object.keys(p.sourceFiles).map(path => [path, sha256File(join(sources, path))]));
  assert.deepEqual(files, p.sourceFiles, "Pinned upstream fixture/source bytes changed");
  const upstreamLockSha256 = sha256File(join(sources, "marmot-ts/pnpm-lock.yaml"));
  assert.equal(upstreamLockSha256, p.upstreamLockSha256, "Upstream lockfile changed");
  return { revisions, files, upstreamLockSha256 };
}
export function preflightContext() {
  const p = profile();
  const upstream = sourceContext();
  const packages = Object.fromEntries(Object.keys(p.upstreamPackages)
    .map(name => [name, packageVersion(join(sources, "marmot-ts"), name)]));
  assert.deepEqual(packages, p.upstreamPackages, "Upstream runtime dependencies changed");
  assert.equal(packageVersion(".", "pnpm"), p.pnpm);
  return { baseline: collectContext(), profile: { id: p.id, sha256: sha256File(profilePath) },
    fixtureSha256: sha256File("fixtures/crypto/marmot-v2-vector.json"), upstream, packages, pnpm: p.pnpm };
}
export interface PreflightEvidence {
  schema: "noseq/crypto-preflight@1"; runId: string; command: "npm run probe:crypto-preflight";
  conclusion: "observations-reproduced; candidate-incompatible; no-security-gate-passed";
  context: ReturnType<typeof preflightContext>; required: SuiteContract[];
  gates: Record<string, string>; suites: SuiteResult[];
}
export function validatePreflight(value: unknown, expected: ReturnType<typeof preflightContext>): asserts value is PreflightEvidence {
  assert(value && typeof value === "object");
  const e = value as PreflightEvidence;
  assert.deepEqual(Object.keys(e).sort(), ["schema", "runId", "command", "conclusion", "context", "required", "gates", "suites"].sort());
  assert.equal(e.schema, "noseq/crypto-preflight@1");
  assert.equal(e.command, "npm run probe:crypto-preflight");
  assert.equal(e.conclusion, "observations-reproduced; candidate-incompatible; no-security-gate-passed");
  assert.match(e.runId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.deepEqual(e.context, expected);
  const p = profile();
  assert.deepEqual(p.gates, { G1: "unpassed", G2: "unpassed", G3: "unpassed", G4: "unpassed", G5: "unpassed" });
  assert.deepEqual(e.gates, p.gates);
  assert.deepEqual(e.required, p.suites);
  assert.equal(e.suites.length, p.suites.length);
  assert.equal(new Set(e.suites.map(s => s.id)).size, p.suites.length);
  for (const contract of p.suites) {
    assert(contract.requiredCases.length > 0);
    assert.equal(new Set(contract.requiredCases).size, contract.requiredCases.length);
    const suite = e.suites.find(s => s.id === contract.id)!;
    assert(suite);
    assert.deepEqual(Object.keys(suite).sort(), ["id", "command", "exitCode", "cases", "reportSha256"].sort());
    assert.equal(suite.command, contract.command);
    assert.equal(suite.exitCode, 0);
    assert.match(suite.reportSha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(suite.cases.map(c => c.id).sort(), [...contract.requiredCases].sort());
    for (const c of suite.cases) {
      assert.deepEqual(Object.keys(c).sort(), ["id", "status"]);
      assert.equal(c.status, "passed");
    }
  }
}
export function verifyPreflightReports(e: PreflightEvidence, directory: string): void {
  for (const suite of e.suites) {
    assert(["upstream", "preflight"].includes(suite.id));
    const path = join(directory, `${suite.id}.json`);
    assert(statSync(path).size <= 8_388_608, "Report exceeds 8 MiB");
    assert.equal(sha256File(path), suite.reportSha256);
    const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
    assertReportPassed(raw, suite.id);
    assert.deepEqual(vitestCases(raw), suite.cases);
  }
}
