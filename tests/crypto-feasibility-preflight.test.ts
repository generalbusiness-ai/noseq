import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { schnorr } from "@noble/curves/secp256k1.js";
import { test } from "vitest";
import { profile, sourceContext, sources, validatePreflight, type PreflightEvidence } from "../scripts/crypto-preflight-evidence.ts";

const fixture = JSON.parse(readFileSync("fixtures/crypto/marmot-v2-vector.json", "utf8"));
const eventBytes = (v = fixture): string => JSON.stringify([0, v.pubkey, v.created_at, v.kind, v.tags, v.content]);
const digest = (v = fixture): Buffer => createHash("sha256").update(eventBytes(v)).digest();
const pubkey = Buffer.from(fixture.pubkey, "hex");
const signature = Buffer.from(fixture.sig, "hex");
const timestamp = Buffer.alloc(8); timestamp.writeBigUInt64BE(BigInt(fixture.created_at));
const proof = Buffer.concat([pubkey, timestamp, signature]);
// Execute the built public /core surface from the pinned source checkout.
const api = await import(pathToFileURL(join(sources, "marmot-ts/dist/core/index.js")).href);

test("preflight.v2-vector", () => {
  assert.equal(digest().toString("hex"), fixture.id);
  assert.equal(schnorr.verify(signature, digest(), pubkey), true);
  assert.equal(proof.length, 104);
  assert.equal(proof.readBigUInt64BE(32), 1700000000n);
  const spec = readFileSync(join(sources, "marmot-protocol/app-components/account-identity-proof-v2.md"), "utf8");
  assert(spec.includes(eventBytes()));
  assert(spec.includes(proof.toString("hex")));
});
test("preflight.v2-tamper", () => {
  for (const field of ["created_at", "kind", "content", "pubkey", "tags"]) {
    const changed = structuredClone(fixture);
    if (field === "created_at" || field === "kind") changed[field]++;
    else if (field === "tags") changed.tags[1][1] = "0x8008";
    else changed[field] = field === "pubkey" ? "0".repeat(64) : "changed";
    assert.equal(schnorr.verify(signature, digest(changed), pubkey), false);
  }
  const corrupt = Buffer.from(signature); corrupt[10] = corrupt[10]! ^ 1;
  assert.equal(schnorr.verify(corrupt, digest(), pubkey), false);
});
test("preflight.v1-incompatible", () => {
  assert.equal(api.ACCOUNT_IDENTITY_PROOF_EXTENSION_TYPE, 0xf2f1);
  assert.throws(() => api.decodeAccountIdentityProof(proof), /unsupported proof version/);
  const request = { accountIdentity: pubkey, mlsSignaturePublicKey: Buffer.from(fixture.tags[4][1], "hex"),
    ciphersuite: 1, signatureScheme: 0x0807 };
  const v1Digest = api.accountIdentityProofSigningDigest(request);
  assert.notEqual(Buffer.from(v1Digest).toString("hex"), fixture.id);
  assert.equal(schnorr.verify(signature, v1Digest, pubkey), false);
  // Public synthetic BIP-340 key 3 from the published fixture, never a user key.
  const secret = new Uint8Array(32); secret[31] = 3;
  const v1Signature = api.signAccountIdentityProof(request, secret);
  assert.equal(schnorr.verify(v1Signature, v1Digest, pubkey), true);
  const encoded = api.encodeAccountIdentityProof({ request, signature: v1Signature });
  assert.equal(encoded.length, 135); assert.equal(encoded[0], 1);
  const decoded = api.decodeAccountIdentityProof(encoded);
  assert.deepEqual(decoded.request.accountIdentity, new Uint8Array(pubkey));
});
test("preflight.public-api", () => {
  const pkg = JSON.parse(readFileSync(join(sources, "marmot-ts/package.json"), "utf8"));
  assert.equal(pkg.name, "@internet-privacy/marmot-ts"); assert.equal(pkg.version, "0.6.0");
  assert.equal(pkg.exports["./core"].import, "./dist/core/index.js");
  for (const name of ["decodeAccountIdentityProof", "encodeAccountIdentityProof", "accountIdentityProofSigningDigest",
    "signAccountIdentityProof", "buildAccountIdentityProofExtension", "verifyLeafAccountIdentityProof"]) {
    assert.equal(typeof api[name], "function", `Missing public API: ${name}`);
  }
});
test("preflight.source-contract", () => {
  const observed = sourceContext();
  assert.deepEqual(observed.files, profile().sourceFiles);
  const spec = readFileSync(join(sources, "marmot-protocol/protocol-core/convergence.md"), "utf8");
  assert.match(spec, /payloads are withdrawn/);
  const identity = readFileSync(join(sources, "marmot-protocol/app-components/account-identity-proof-v2.md"), "utf8");
  assert.match(identity, /MUST NOT be accepted as a substitute/);
});
test("preflight.evidence-rejection", () => {
  const p = profile();
  // Synthetic context tests the validator; the runner independently measures real context.
  const context = { synthetic: true } as unknown as PreflightEvidence["context"];
  const valid: PreflightEvidence = { schema: "noseq/crypto-preflight@1", runId: "00000000-0000-4000-8000-000000000000",
    command: "npm run probe:crypto-preflight", conclusion: "observations-reproduced; candidate-incompatible; no-security-gate-passed",
    context, required: p.suites, gates: p.gates, suites: p.suites.map(s => ({ id: s.id, command: s.command, exitCode: 0,
      reportSha256: "a".repeat(64), cases: s.requiredCases.map(id => ({ id, status: "passed" })) })) };
  validatePreflight(valid, context);
  const mutations: ((e: PreflightEvidence) => void)[] = [e => { e.suites.pop(); },
    e => { e.suites[0]!.cases.pop(); }, e => { e.suites[0]!.cases[0]!.status = "skipped"; },
    e => { e.suites[0]!.exitCode = 1; }, e => { e.gates.G1 = "passed"; },
    e => { e.required[0]!.requiredCases.pop(); }, e => { e.context = {} as typeof context; }];
  for (const mutate of mutations) {
    const e = structuredClone(valid); mutate(e); assert.throws(() => validatePreflight(e, context));
  }
});
test("preflight.gates-closed", () => {
  for (const command of ["test:crypto-feasibility", "gate:protocol"]) {
    const r = spawnSync("npm", ["run", command], { encoding: "utf8" });
    assert.equal(r.status, 1); assert.match(r.stderr, /stage not implemented/);
  }
  assert.deepEqual(profile().gates, { G1: "unpassed", G2: "unpassed", G3: "unpassed", G4: "unpassed", G5: "unpassed" });
});
