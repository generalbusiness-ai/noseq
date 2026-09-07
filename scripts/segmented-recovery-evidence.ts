import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  protocolContext,
  protocolProfile,
  validateProtocol,
  verifyProtocolFiles,
  nativeManifest,
  type ProtocolEvidence,
} from "./protocol-feasibility-evidence.ts";
import { fileManifest } from "./ordered-mls-evidence.ts";
import {
  sha256File,
  assertReportPassed,
  playwrightCases,
  vitestCases,
  type SuiteContract,
  type SuiteResult,
} from "./evidence.ts";
import {
  bounds,
  kinds,
  limits,
  profile as domain,
  readRoot2,
  read2,
  canonical,
  eventBytes,
  type Signed,
  type Context,
} from "../tests/segmented-recovery/wire.ts";
import { read } from "../tests/protocol-feasibility/wire.ts";
export const profilePath = "fixtures/crypto/segmented/profile.json";
const cases = [
  "complete-history",
  "inner-adversarial",
  "custody-and-exclusion",
  "encoded-capacity",
  "bounded-work",
  "semantic-boundaries",
];
const gates = { G1: "unpassed", G2: "unpassed", G3: "unpassed", G4: "unpassed", G5: "unpassed" };
export function segmentedProfile() {
  const p = JSON.parse(readFileSync(profilePath, "utf8")) as {
    schema: string;
    domain: string;
    kinds: typeof kinds;
    bounds: typeof bounds;
    prerequisiteCases: number;
    fixtures: string[];
    documents: string[];
    configs: string[];
    suites: SuiteContract[];
    gates: typeof gates;
    conclusion: string;
  };
  assert.equal(p.domain, domain);
  assert.deepEqual(p.kinds, kinds);
  assert.deepEqual(p.bounds, {
    ...bounds,
    journalBytes: limits.journal,
    outboxBytes: limits.outbox,
    eventBytes: limits.event,
    frameBytes: limits.frame,
    chunkBytes: limits.chunk,
    pageEvents: limits.pageEvents,
    pageBytes: limits.pageBytes,
  });
  assert.equal(p.prerequisiteCases, 102);
  assert.deepEqual(p.gates, gates);
  assert.deepEqual(
    p.suites.map((s) => [s.id, s.requiredCases]),
    [
      ["node", cases.map((c) => "segmented.node." + c)],
      ["browser", cases.map((c) => "segmented.browser." + c)],
      ["gateway", ["segmented.gateway.complete-reserved-history"]],
    ],
  );
  return p;
}
export function segmentedContext() {
  const p = segmentedProfile();
  return {
    protocol: protocolContext(),
    profile: sha256File(profilePath),
    files: Object.fromEntries(
      [...p.fixtures, ...p.documents, ...p.configs].map((f) => [f, sha256File(f)]),
    ),
  };
}
export interface SegmentedEvidence {
  schema: "noseq/segmented-feasibility@1";
  runId: string;
  command: "npm run probe:segmented-recovery";
  conclusion: string;
  context: ReturnType<typeof segmentedContext>;
  gates: typeof gates;
  required: SuiteContract[];
  suites: SuiteResult[];
  prerequisite: { path: string; sha256: string; cases: 102 };
  observations: Record<string, string>;
  browserBundle: Record<string, string>;
  native: Record<string, string>;
  commands: Record<string, string>;
}
export const observationFiles = () => [
  ...cases.flatMap((c) => ["node-" + c + ".json", "browser-" + c + ".json"]),
  "native-result.json",
];
const fields = (v: object, names: string[]) =>
  assert.deepEqual(Object.keys(v).sort(), names.sort());
export function validateSegmented(
  value: unknown,
  context: ReturnType<typeof segmentedContext>,
): asserts value is SegmentedEvidence {
  assert(value && typeof value === "object");
  const e = value as SegmentedEvidence,
    p = segmentedProfile();
  fields(e, [
    "schema",
    "runId",
    "command",
    "conclusion",
    "context",
    "gates",
    "required",
    "suites",
    "prerequisite",
    "observations",
    "browserBundle",
    "native",
    "commands",
  ]);
  assert.equal(e.schema, "noseq/segmented-feasibility@1");
  assert.equal(e.command, "npm run probe:segmented-recovery");
  assert.equal(
    e.conclusion,
    "segmented-feasibility-observed; independent-review-and-adoption-required",
  );
  assert.equal(e.conclusion, p.conclusion);
  assert.match(e.runId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.deepEqual(e.context, context);
  assert.deepEqual(e.gates, gates);
  assert.deepEqual(e.required, p.suites);
  assert.equal(e.suites.length, 3);
  assert.equal(new Set(e.suites.map((s) => s.id)).size, 3);
  for (const contract of p.suites) {
    const s = e.suites.find((s) => s.id === contract.id)!;
    assert(s);
    fields(s, ["id", "command", "exitCode", "cases", "reportSha256"]);
    assert.equal(s.command, contract.command);
    assert.equal(s.exitCode, 0);
    assert.match(s.reportSha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(s.cases.map((c) => c.id).sort(), [...contract.requiredCases].sort());
    for (const c of s.cases) {
      fields(c, ["id", "status"]);
      assert.equal(c.status, "passed");
    }
  }
  fields(e.prerequisite, ["path", "sha256", "cases"]);
  assert.equal(e.prerequisite.cases, 102);
  assert.match(
    e.prerequisite.path,
    /^artifacts\/protocol-feasibility\/runs\/[0-9a-f-]{36}\/evidence\.json$/,
  );
  assert.match(e.prerequisite.sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(Object.keys(e.observations).sort(), observationFiles().sort());
  for (const h of Object.values(e.observations)) assert.match(h, /^[0-9a-f]{64}$/);
  assert("index.html" in e.browserBundle);
  assert("trace.json" in e.native);
  assert.deepEqual(
    Object.keys(e.commands).sort(),
    Array.from({ length: 6 }, (_, i) => [`${i + 1}.log`, `${i + 1}.command.json`])
      .flat()
      .sort(),
    "exact required command provenance",
  );
}
const readBounded = (path: string, maximum = 8_388_608): any => {
  assert(statSync(path).size <= maximum, "oversized evidence input");
  return JSON.parse(readFileSync(path, "utf8"));
};
function verifyFixtures(fixtures: any[]) {
  assert(Array.isArray(fixtures) && fixtures.length > 0);
  for (const f of fixtures) {
    fields(f, [
      "root",
      "context",
      "definition",
      "ordered",
      "acceptedTip",
      "acceptedCount",
      "checkpoints",
    ]);
    const ctx = f.context as Context;
    assert.deepEqual(readRoot2(f.root, ctx.owner, ctx.genesis), ctx);
    assert.equal(
      createHash("sha256")
        .update(canonical(["noseq/definition-closure@1", f.definition.nonce, f.definition.files]))
        .digest("hex"),
      ctx.definition,
    );
    assert(f.ordered.length > 0 && f.ordered.length <= bounds.entries);
    let previous = ctx.genesis;
    for (const [i, signed] of (f.ordered as Signed[]).entries()) {
      const e = read(eventBytes(signed), "order", ctx);
      assert.equal(e.pubkey, ctx.sequencer);
      const b = JSON.parse(e.content);
      assert.equal(b.position, i + 1);
      assert.equal(b.previous, previous);
      read(eventBytes(b.submission), "submission", ctx);
      if (b.admission) {
        const a = read(eventBytes(b.admission), "admission", ctx);
        assert.equal(a.pubkey, ctx.owner);
      }
      previous = e.id;
    }
    assert(
      Number.isInteger(f.acceptedCount) &&
        f.acceptedCount > 0 &&
        f.acceptedCount <= f.ordered.length,
    );
    assert.equal(f.ordered[f.acceptedCount - 1].id, f.acceptedTip);
    assert(Array.isArray(f.checkpoints) && f.checkpoints.length > 0);
    for (const signed of f.checkpoints) {
      const e = read2(signed, "checkpoint", ctx);
      assert.equal(e.pubkey, ctx.owner);
      const c = JSON.parse(e.content);
      assert.equal(c.profile, domain);
      assert.equal(c.first, 1);
      assert(c.last > 0 && c.last <= f.ordered.length);
      assert.equal(c.tip, f.ordered[c.last - 1].id);
      assert(c.segments > 0 && c.segments <= c.last);
    }
  }
}
export function verifySegmentedFiles(e: SegmentedEvidence, directory: string) {
  assert.equal(sha256File(e.prerequisite.path), e.prerequisite.sha256);
  const prior = readBounded(e.prerequisite.path, 1_048_576);
  validateProtocol(prior, e.context.protocol);
  verifyProtocolFiles(prior, dirname(e.prerequisite.path));
  // Recursive validators retain each exact prerequisite contract; count the actual reports as an extra guard.
  const ordered = readBounded(prior.prerequisites.ordered.path),
    preflight = readBounded(ordered.prerequisite.path),
    harness = readBounded(prior.prerequisites.harness.path);
  const count = [...prior.suites, ...ordered.suites, ...preflight.suites, ...harness.suites].reduce(
    (n, s) => n + s.cases.length,
    0,
  );
  assert.equal(count, 102, "all 102 actual prerequisite cases");
  for (const suite of e.suites) {
    const path = join(directory, suite.id + ".json");
    assert.equal(sha256File(path), suite.reportSha256);
    const raw = readBounded(path);
    assertReportPassed(raw, suite.id);
    assert.deepEqual(suite.id === "browser" ? playwrightCases(raw) : vitestCases(raw), suite.cases);
  }
  assert.deepEqual(fileManifest(join(directory, "browser-bundle")), e.browserBundle);
  assert.deepEqual(nativeManifest(join(directory, "native")), e.native);
  for (const [name, digest] of Object.entries(e.observations)) {
    const path = join(directory, name);
    assert.equal(sha256File(path), digest);
    const observed = readBounded(path);
    if (name === "native-result.json") {
      assert.equal(observed.case, "native-segmented-composition");
      assert.equal(observed.profile, domain);
      assert.equal(observed.status, "observed; no full gate pass");
      assert.equal(observed.native.source, protocolProfile().native.source);
      assert.equal(observed.native.binarySha256, protocolProfile().native.binarySha256);
      assert.equal(observed.native.configSha256, e.native["strfry/strfry.conf"]);
      assert.equal(observed.observed.length, 7);
      assert.equal(observed.segments.length, 3);
      assert(observed.pageCount > 3 && observed.T === 6 && observed.F > observed.T);
      assert.equal(observed.node, e.context.protocol.ordered.preflight.baseline.runtime.node);
      verifyFixtures(observed.fixtures);
      continue;
    }
    assert.equal(observed.result.profile, domain);
    assert.equal(observed.result.case, name.replace(/^(node|browser)-/, "").replace(/\.json$/, ""));
    assert.equal(observed.result.status, "observed; no full gate pass");
    const expectedNegativeCounts: Record<string, number> = {
      "inner-adversarial": 19,
      "custody-and-exclusion": 15,
      "encoded-capacity": 7,
      "semantic-boundaries": 4,
    };
    if (observed.result.case in expectedNegativeCounts)
      assert.equal(observed.result.observed.length, expectedNegativeCounts[observed.result.case]);
    verifyFixtures(observed.fixtures);
    if (name.startsWith("node-"))
      assert.equal(observed.node, e.context.protocol.ordered.preflight.baseline.runtime.node);
    else {
      assert.equal(
        observed.browserVersion,
        e.context.protocol.ordered.preflight.baseline.runtime.chromium,
      );
      assert.equal(observed.secure, true);
      assert(observed.userAgent.includes(`HeadlessChrome/${observed.browserVersion}`));
    }
  }
  for (const [name, digest] of Object.entries(e.commands)) {
    assert(/^[1-9][0-9]*\.(log|command.json)$/.test(name));
    assert.equal(sha256File(join(directory, name)), digest);
    if (name.endsWith("command.json")) {
      const command = readBounded(join(directory, name));
      fields(command, ["command", "args", "cwd", "exitCode", "signal", "error"]);
      assert(typeof command.command === "string" && command.command.endsWith("/node"));
      assert(typeof command.cwd === "string" && command.cwd.startsWith("/"));
      const step = Number(name.split(".")[0]);
      const output = `--outputFile=${command.cwd}/artifacts/segmented-recovery/runs/${e.runId}/${step === 4 ? "node" : "gateway"}.json`;
      const expected: Record<number, string[]> = {
        1: ["scripts/protocol-feasibility.ts"],
        2: [
          "node_modules/typescript/bin/tsc",
          "--noEmit",
          "-p",
          "tsconfig.segmented-recovery.json",
        ],
        3: [
          "node_modules/vite/bin/vite.js",
          "build",
          "--config",
          "segmented-recovery.vite.config.ts",
          "--configLoader",
          "native",
        ],
        4: [
          "node_modules/vitest/vitest.mjs",
          "run",
          "--config",
          "segmented-recovery.config.ts",
          "--configLoader",
          "native",
          "--reporter=default",
          "--reporter=json",
          output,
        ],
        5: [
          "node_modules/@playwright/test/cli.js",
          "test",
          "--config",
          "segmented-recovery.playwright.config.ts",
        ],
        6: [
          "node_modules/vitest/vitest.mjs",
          "run",
          "--config",
          "segmented-gateway.config.ts",
          "--configLoader",
          "native",
          "--reporter=default",
          "--reporter=json",
          output,
        ],
      };
      assert.deepEqual(command.args, expected[step], "actual required command contract");
      assert.equal(command.exitCode, 0);
      assert.equal(command.signal, null);
      assert.equal(command.error, null);
    }
  }
}
