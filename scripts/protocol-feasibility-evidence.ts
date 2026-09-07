import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { orderedContext, validateOrdered, verifyOrderedFiles, fileManifest } from "./ordered-mls-evidence.ts";
import { sha256File, assertReportPassed, playwrightCases, vitestCases, validateEvidence, verifyRawReports, loadProfile, type Evidence, type SuiteContract, type SuiteResult } from "./evidence.ts";
import { readGenesis, read, eventBytes, canonical, type Signed, type Context } from "../tests/protocol-feasibility/wire.ts";

export const profilePath = "fixtures/crypto/protocol/profile.json";
export function protocolProfile() {
  return JSON.parse(readFileSync(profilePath, "utf8")) as {
    id: string; api: string; sourceFiles: Record<string, string>; fixtures: string[]; documents: string[];
    nips: { url: string; commit: string; files: Record<string, string> };
    nostrTools: { version: string; files: Record<string, string> };
    gatewayRuntime: {ws:string;types:string;files:Record<string,string>};
    native: { source: string; binarySha256: string; buildRecordSha256: string };
    suites: SuiteContract[]; gates: Record<string, string>; closure: string;
  };
}
export function protocolContext() {
  const p = protocolProfile(); const ordered = orderedContext();
  const sourceFiles = Object.fromEntries(Object.keys(p.sourceFiles).map(path => [path, sha256File(`artifacts/crypto-preflight/sources/marmot-ts/ts-mls/${path}`)]));
  assert.deepEqual(sourceFiles, p.sourceFiles, "Pinned internal MLS API changed");
  const nips = "artifacts/protocol-feasibility/sources/nips";
  const git = (...args: string[]) => execFileSync("git", ["-C", nips, ...args], { encoding: "utf8" }).trim();
  assert.equal(git("rev-parse", "HEAD"), p.nips.commit); assert.equal(git("remote", "get-url", "origin"), p.nips.url);
  assert.equal(git("status", "--porcelain", "--untracked-files=all"), "", "Dirty NIP reference checkout");
  const nipFiles = Object.fromEntries(Object.keys(p.nips.files).map(path => [path, sha256File(join(nips, path))])); assert.deepEqual(nipFiles, p.nips.files);
  assert.equal(JSON.parse(readFileSync("node_modules/nostr-tools/package.json", "utf8")).version, p.nostrTools.version);
  const nostrFiles = Object.fromEntries(Object.keys(p.nostrTools.files).map(path => [path, sha256File(join("node_modules/nostr-tools", path))])); assert.deepEqual(nostrFiles, p.nostrTools.files);
  assert.equal(JSON.parse(readFileSync("node_modules/ws/package.json","utf8")).version,p.gatewayRuntime.ws);
  assert.equal(JSON.parse(readFileSync("node_modules/@types/ws/package.json","utf8")).version,p.gatewayRuntime.types);
  const gatewayFiles=Object.fromEntries(Object.keys(p.gatewayRuntime.files).map(path=>[path,sha256File(join("node_modules/ws",path))]));assert.deepEqual(gatewayFiles,p.gatewayRuntime.files);
  return { gatewayFiles, ordered, profile: { id: p.id, sha256: sha256File(profilePath) }, api: p.api, sourceFiles, nipRevision: p.nips.commit, nipFiles, nostrFiles,
    fixtures: Object.fromEntries(p.fixtures.map(path => [path, sha256File(path)])), documents: Object.fromEntries(p.documents.map(path => [path, sha256File(path)])) };
}
type Reference = { path: string; sha256: string };
export interface ProtocolEvidence {
  schema: "noseq/protocol-feasibility@1"; runId: string; command: "npm run probe:protocol-feasibility";
  conclusion: "observations-reproduced; protocol-pending; no-security-gate-passed";
  context: ReturnType<typeof protocolContext>; gates: Record<string, string>; closure: string;
  required: SuiteContract[]; suites: SuiteResult[]; prerequisites: { harness: Reference; ordered: Reference };
  observations: Record<string, string>; browserBundle: Record<string, string>; gatewayArtifacts: Record<string, string>; native: Record<string, string>;
}
export function observationFiles(): string[] {
  return protocolProfile().suites.flatMap(s => s.requiredCases.map(name => `${s.id}-${name.slice(`feasibility.${s.id}.`.length)}.json`));
}
export function validateProtocol(value: unknown, context: ReturnType<typeof protocolContext>): asserts value is ProtocolEvidence {
  assert(value && typeof value === "object"); const e = value as ProtocolEvidence; const p = protocolProfile();
  assert.deepEqual(Object.keys(e).sort(), ["schema", "runId", "command", "conclusion", "context", "gates", "closure", "required", "suites", "prerequisites", "observations", "browserBundle", "gatewayArtifacts", "native"].sort());
  assert.equal(e.schema, "noseq/protocol-feasibility@1"); assert.equal(e.command, "npm run probe:protocol-feasibility");
  assert.equal(e.conclusion, "observations-reproduced; protocol-pending; no-security-gate-passed");
  assert.match(e.runId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.deepEqual(e.context, context); assert.deepEqual(e.gates, p.gates);
  assert.deepEqual(p.gates, { G1: "unpassed", G2: "unpassed", G3: "unpassed", G4: "unpassed", G5: "unpassed" });
  assert.equal(e.closure, p.closure); assert.equal(p.closure, "pending-independent-review-and-explicit-adoption; prefix-policy-investigation-only");
  assert.deepEqual(e.required, p.suites); assert.equal(e.suites.length, p.suites.length); assert.equal(new Set(e.suites.map(s => s.id)).size, p.suites.length);
  for (const contract of p.suites) {
    assert(contract.requiredCases.length > 0); assert.equal(new Set(contract.requiredCases).size, contract.requiredCases.length);
    const s = e.suites.find(s => s.id === contract.id)!; assert(s);
    assert.deepEqual(Object.keys(s).sort(), ["id", "command", "exitCode", "cases", "reportSha256"].sort());
    assert.equal(s.command, contract.command); assert.equal(s.exitCode, 0); assert.match(s.reportSha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(s.cases.map(c => c.id).sort(), [...contract.requiredCases].sort());
    for (const c of s.cases) { assert.deepEqual(Object.keys(c).sort(), ["id", "status"]); assert.equal(c.status, "passed"); }
  }
  assert.deepEqual(Object.keys(e.prerequisites).sort(), ["harness", "ordered"]);
  for (const [name, r] of Object.entries(e.prerequisites)) {
    assert.deepEqual(Object.keys(r).sort(), ["path", "sha256"]); assert.match(r.sha256, /^[0-9a-f]{64}$/);
    assert.match(r.path, name === "ordered" ? /^artifacts\/ordered-mls\/runs\/[0-9a-f-]{36}\/evidence\.json$/ : /^artifacts\/harness\/[0-9a-f-]{36}\/evidence\.json$/);
  }
  assert.deepEqual(Object.keys(e.observations).sort(), observationFiles().sort());
  for (const hash of Object.values(e.observations)) assert.match(hash, /^[0-9a-f]{64}$/);
  assert(Object.keys(e.browserBundle).includes("index.html")); assert(Object.keys(e.native).includes("result.json"));
}
const readBounded = (path: string, max = 8_388_608): unknown => { assert(statSync(path).size <= max); return JSON.parse(readFileSync(path, "utf8")); };
export function verifyProtocolFiles(e: ProtocolEvidence, directory: string): void {
  for (const r of Object.values(e.prerequisites)) assert.equal(sha256File(r.path), r.sha256, "Prerequisite evidence changed");
  const ordered = readBounded(e.prerequisites.ordered.path, 1_048_576); validateOrdered(ordered, e.context.ordered); verifyOrderedFiles(ordered, dirname(e.prerequisites.ordered.path));
  const harness = readBounded(e.prerequisites.harness.path, 1_048_576) as Evidence;
  validateEvidence(harness, e.context.ordered.preflight.baseline, loadProfile().suites); verifyRawReports(harness, dirname(e.prerequisites.harness.path));
  for (const suite of e.suites) {
    assert(["node", "browser", "gateway"].includes(suite.id)); const path = join(directory, `${suite.id}.json`);
    assert.equal(sha256File(path), suite.reportSha256); const raw = readBounded(path); assertReportPassed(raw, suite.id);
    assert.deepEqual(suite.id === "browser" ? playwrightCases(raw) : vitestCases(raw), suite.cases);
  }
  assert.deepEqual(fileManifest(join(directory, "browser-bundle")), e.browserBundle);
  for (const [name, hash] of Object.entries(e.observations)) {
    const path = join(directory, name); assert.equal(sha256File(path), hash);
    if (name.startsWith("gateway-")) {
      const observed = readBounded(path) as { name: string; status: string; node: string; trace: unknown[]; notes: unknown[]; native: {source: string; binarySha256: string; configSha256: string}[]; scope: string };
      assert.equal(observed.name, name.slice(8,-5)); assert.equal(observed.status,"passed"); assert.equal(observed.node,e.context.ordered.preflight.baseline.runtime.node);
      assert(observed.trace.length > 0 && observed.notes.length > 0 && observed.native.length > 0);
      for (const identity of observed.native) { assert.equal(identity.source,protocolProfile().native.source); assert.equal(identity.binarySha256,protocolProfile().native.binarySha256); assert.match(identity.configSha256,/^[0-9a-f]{64}$/); }
      assert.equal(observed.scope,"isolated local socket feasibility; no G5 gate or production persistence pass"); continue;
    }
    const observed = readBounded(path) as { result: { name: string; status: string; observations: unknown[]; fixtures: { root: Signed; context: Context; definition: { nonce: string; files: unknown[] }; ordered: Signed[]; frontier: string; outcomes: { position: number }[] }[] }; node?: string; browserVersion?: string; secure?: boolean; userAgent?: string };
    assert.equal(observed.result.name, name.replace(/^(node|browser)-/, "").replace(/\.json$/, "")); assert.equal(observed.result.status, "passed");
    assert(Array.isArray(observed.result.observations) && observed.result.observations.length > 0);
    assert(Array.isArray(observed.result.fixtures) && observed.result.fixtures.length > 0, "Missing actual signed fixture/frontier inputs");
    for (const f of observed.result.fixtures) {
      assert.deepEqual(readGenesis(f.root, f.context.owner, f.context.genesis), f.context);
      assert.equal(createHash("sha256").update(canonical(["noseq/definition-closure@1", f.definition.nonce, f.definition.files])).digest("hex"), f.context.definition);
      assert(Array.isArray(f.ordered) && f.ordered.length > 0); let previous = f.root.id;
      for (const [index, signed] of f.ordered.entries()) {
        const e = read(eventBytes(signed), "order", f.context); assert.equal(e.pubkey, f.context.sequencer);
        const c = JSON.parse(e.content) as { position: number; previous: string; submission: Signed; admission: Signed | null };
        assert.equal(c.position, index + 1); assert.equal(c.previous, previous); read(eventBytes(c.submission), "submission", f.context);
        if (c.admission) { const a = read(eventBytes(c.admission), "admission", f.context); assert.equal(a.pubkey, f.context.owner); }
        previous = e.id;
      }
      const accepted = f.frontier === f.root.id ? 0 : f.ordered.findIndex(e => e.id === f.frontier) + 1;
      assert(accepted > 0 || f.frontier === f.root.id, "Unknown accepted frontier"); assert.equal(f.outcomes.length, accepted);
      assert.deepEqual(f.outcomes.map(o => o.position), Array.from({ length: accepted }, (_, i) => i + 1));
    }
    const runtime = e.context.ordered.preflight.baseline.runtime;
    if (name.startsWith("node-")) assert.equal(observed.node, runtime.node);
    else { assert.equal(observed.browserVersion, runtime.chromium); assert(observed.userAgent?.includes(`HeadlessChrome/${observed.browserVersion}`)); assert.equal(observed.secure, true); }
  }
  assert.deepEqual(gatewayManifest(directory), e.gatewayArtifacts, "Gateway config/trace/state/child evidence changed");
  // The native manifest excludes mutable LMDB databases; it binds exact inputs, outputs and logs.
  assert.deepEqual(nativeManifest(join(directory, "native-relay")), e.native);
  const native = readBounded(join(directory, "native-relay/result.json")) as { schema: string; source: string; binarySha256: string; buildRecordSha256: string; outcome: string; profiles: { name: string; outcome: string; cases: unknown[] }[] };
  const p = protocolProfile(); assert.equal(native.schema, "noseq/strfry-p1c-observations@1"); assert.equal(native.source, p.native.source);
  assert.equal(native.binarySha256, p.native.binarySha256); assert.equal(native.buildRecordSha256, p.native.buildRecordSha256);
  assert.equal(native.outcome, "observations-reproduced-not-G5-pass");
  assert.deepEqual(native.profiles.map(p => [p.name, p.outcome, p.cases.length]), [["default-sizes", "observed", 3], ["event-only-raised", "observed", 2], ["coherent-sizes", "observed", 3], ["restricted-count", "observed", 3]]);
  assert.equal(sha256File(join(directory, "native-relay/build-record.json")), p.native.buildRecordSha256);
}
export function nativeManifest(directory: string): Record<string, string> {
  const output: Record<string, string> = {};
  const visit = (path: string) => {
    for (const e of readdirSync(join(directory, path), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name === "db" && e.isDirectory()) continue;
      const relative = path ? `${path}/${e.name}` : e.name;
      if (e.isDirectory()) visit(relative); else { assert(e.isFile(), "Special native artifact rejected"); output[relative] = sha256File(join(directory, relative)); }
    }
  };
  visit(""); assert(Object.keys(output).length > 0); return output;
}

export function gatewayManifest(directory: string): Record<string,string> {
  const ids = protocolProfile().suites.find(s=>s.id==="gateway")!.requiredCases.map(c=>c.slice("feasibility.gateway.".length));
  return Object.fromEntries(ids.flatMap(id=>Object.entries(nativeManifest(join(directory,id))).map(([path,hash])=>[`${id}/${path}`,hash])));
}
