import { strict as assert } from "node:assert";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { preflightContext, sources, validatePreflight, verifyPreflightReports } from "./crypto-preflight-evidence.ts";
import { sha256File, vitestCases, playwrightCases, assertReportPassed, type SuiteContract, type SuiteResult } from "./evidence.ts";

export const profilePath = "fixtures/crypto/ordered-profile.json";
export function orderedProfile() {
  return JSON.parse(readFileSync(profilePath, "utf8")) as {
    id: string; api: string; ciphersuite: string; sourceFiles: Record<string, string>; fixtures: string[];
    suites: SuiteContract[]; gates: Record<string, string>;
  };
}
export function orderedContext() {
  const p = orderedProfile(); const preflight = preflightContext();
  const files = Object.fromEntries(Object.keys(p.sourceFiles).map(path => [path, sha256File(join(sources, "marmot-ts/ts-mls", path))]));
  assert.deepEqual(files, p.sourceFiles, "Lower MLS API/source identity changed");
  return { preflight, profile: { id: p.id, sha256: sha256File(profilePath) },
    fixtures: Object.fromEntries(p.fixtures.map(path => [path, sha256File(path)])), api: p.api, ciphersuite: p.ciphersuite, files };
}
export function fileManifest(directory: string): Record<string, string> {
  const result: Record<string, string> = {};
  function visit(path: string) {
    for (const file of readdirSync(join(directory, path), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = path ? `${path}/${file.name}` : file.name;
      if (file.isDirectory()) visit(relative);
      else { assert(file.isFile(), "Symlinks/special output files are not accepted"); result[relative] = sha256File(join(directory, relative)); }
    }
  }
  visit(""); assert(Object.keys(result).length > 0, "Missing generated output"); return result;
}
export interface OrderedEvidence {
  schema: "noseq/ordered-mls-probe@1"; runId: string; command: "npm run probe:ordered-mls";
  conclusion: "bounded-observations-reproduced; continue-investigation; no-security-gate-passed";
  context: ReturnType<typeof orderedContext>; gates: Record<string, string>; required: SuiteContract[]; suites: SuiteResult[];
  prerequisite: { path: string; sha256: string }; observations: Record<string, string>; browserBundle: Record<string, string>;
}
export function observationFiles(): string[] {
  return orderedProfile().suites.flatMap(s => s.requiredCases.map(name => `${s.id}-${name.slice(`ordered.${s.id}.`.length)}.json`));
}
export function validateOrdered(value: unknown, context: ReturnType<typeof orderedContext>): asserts value is OrderedEvidence {
  assert(value && typeof value === "object"); const e = value as OrderedEvidence; const p = orderedProfile();
  assert.deepEqual(Object.keys(e).sort(), ["schema", "runId", "command", "conclusion", "context", "gates", "required", "suites", "prerequisite", "observations", "browserBundle"].sort());
  assert.equal(e.schema, "noseq/ordered-mls-probe@1"); assert.equal(e.command, "npm run probe:ordered-mls");
  assert.equal(e.conclusion, "bounded-observations-reproduced; continue-investigation; no-security-gate-passed");
  assert.match(e.runId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.deepEqual(e.context, context);
  assert.deepEqual(p.gates, { G1: "unpassed", G2: "unpassed", G3: "unpassed", G4: "unpassed", G5: "unpassed" });
  assert.deepEqual(e.gates, p.gates); assert.deepEqual(e.required, p.suites);
  assert.equal(e.suites.length, p.suites.length); assert.equal(new Set(e.suites.map(s => s.id)).size, p.suites.length);
  assert.equal(new Set(p.suites.map(s => s.id)).size, p.suites.length);
  for (const contract of p.suites) {
    assert(contract.requiredCases.length > 0); assert.equal(new Set(contract.requiredCases).size, contract.requiredCases.length);
    const s = e.suites.find(s => s.id === contract.id)!; assert(s);
    assert.deepEqual(Object.keys(s).sort(), ["id", "command", "exitCode", "cases", "reportSha256"].sort());
    assert.equal(s.command, contract.command); assert.equal(s.exitCode, 0); assert.match(s.reportSha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(s.cases.map(c => c.id).sort(), [...contract.requiredCases].sort());
    for (const c of s.cases) { assert.deepEqual(Object.keys(c).sort(), ["id", "status"]); assert.equal(c.status, "passed"); }
  }
  assert.deepEqual(Object.keys(e.prerequisite).sort(), ["path", "sha256"]);
  assert.match(e.prerequisite.path, /^artifacts\/crypto-preflight\/runs\/[0-9a-f-]{36}\/evidence\.json$/);
  assert.match(e.prerequisite.sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(Object.keys(e.observations).sort(), observationFiles().sort());
  for (const value of Object.values(e.observations)) assert.match(value, /^[0-9a-f]{64}$/);
  assert(Object.keys(e.browserBundle).includes("index.html"));
}
export function verifyOrderedFiles(e: OrderedEvidence, directory: string): void {
  assert.equal(sha256File(e.prerequisite.path), e.prerequisite.sha256, "P1a evidence changed");
  assert(statSync(e.prerequisite.path).size <= 1_048_576);
  const prior: unknown = JSON.parse(readFileSync(e.prerequisite.path, "utf8"));
  validatePreflight(prior, e.context.preflight);
  verifyPreflightReports(prior, e.prerequisite.path.replace(/\/evidence\.json$/, ""));
  for (const suite of e.suites) {
    assert(["node", "browser"].includes(suite.id));
    const file = join(directory, suite.id + ".json"); assert(statSync(file).size <= 8_388_608);
    assert.equal(sha256File(file), suite.reportSha256);
    const raw: unknown = JSON.parse(readFileSync(file, "utf8")); assertReportPassed(raw, suite.id);
    assert.deepEqual(suite.id === "browser" ? playwrightCases(raw) : vitestCases(raw), suite.cases);
  }
  assert.deepEqual(fileManifest(join(directory, "browser-bundle")), e.browserBundle, "Browser bundle changed");
  for (const [name, hash] of Object.entries(e.observations)) {
    const file = join(directory, name); assert(statSync(file).size <= 8_388_608);
    assert.equal(sha256File(file), hash, "Signed trace/runtime observation changed");
    const observed = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(observed.result.name, name.replace(/^(node|browser)-/, "").replace(/\.json$/, ""));
    assert.equal(observed.result.status, "passed"); assert.equal(observed.result.gateStatus, "G1-G5 unpassed");
    assert(Array.isArray(observed.result.trace) && observed.result.trace.length > 0);
    if (name.startsWith("browser-")) {
      assert.equal(observed.browserVersion, e.context.preflight.baseline.runtime.chromium);
      assert(observed.userAgent.includes(`HeadlessChrome/${observed.browserVersion}`)); assert.equal(observed.secure, true);
    } else assert.equal(observed.node, e.context.preflight.baseline.runtime.node);
  }
}
