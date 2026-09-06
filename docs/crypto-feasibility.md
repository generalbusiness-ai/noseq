# Crypto preflight: incompatible candidate and proposed next direction

Status: **P1a interim proposal; encryption profile not adopted.**

The pinned Marmot specification and candidate library do not share an identity
proof format. The candidate also permits withdrawing an application payload
previously delivered as accepted. **Stop production use of this candidate pair.**
The preflight reproduces those observations; it does not pass P1 or any G1–G5
gate. A separate protocol decision must be reviewed and ratified before dependent
production implementation.

## Reproduce the observations

Start with the pinned [P0 toolchain](toolchain.md) in a clean committed checkout:

```sh
npm ci
npm run check
npm run probe:crypto-preflight
npm run verify:crypto-preflight -- artifacts/crypto-preflight/runs/<uuid>/evidence.json
```

The first probe fetches the exact public source revisions below into ignored
`artifacts/crypto-preflight/sources/`. It installs the candidate's frozen pnpm
lock with lifecycle scripts disabled, explicitly builds ts-mls and the candidate,
and exercises its built public `/core` API. It runs four unmodified upstream
Node test files and seven Noseq preflight cases. Both suites must have their exact
required case sets with no skipped or failed cases. The setup needs GitHub/npm
access; the test network and stores are in-memory fixtures, not live relays.
Each external step has a three-minute limit. Do not repoint the existing cache:
wrong revisions, changed sources or lock drift fail. Preserve failed runs when
investigating setup problems.

A fresh UUID directory retains start/failure provenance, validated context,
process logs and raw test reports. The final record binds the Noseq commit/tree,
lockfile and runtime; the unchanged P0 profile; the preflight profile and public
vector; upstream revisions, selected source/fixture hashes, frozen lock hash and
observed crypto/tool versions; required cases, outcomes and raw-report hashes.
The verifier independently reloads these identities and required cases and
recomputes raw report outcomes. Success means **observations reproduced**, with
`G1` through `G5` still `unpassed`. Missing prerequisites or evidence fail rather
than becoming an inconclusive pass. These are reproducibility controls, not
attestation against someone able to rewrite the checkout and reports.

`npm run test:crypto-feasibility` and `npm run gate:protocol` still exit 1 with
`stage not implemented`. The P0 profile and all 12 P0 mandatory cases remain
unchanged. Bulk upstream checkouts and generated cryptographic test material are
ignored; only public synthetic vector data and its attribution are committed.

## Exact inputs and API surface

| Input | Revision or version |
|---|---|
| [Marmot specification](https://github.com/marmot-protocol/marmot/tree/4a2bc65f8db5866cec3b2a127dedb37818eaf207) | `4a2bc65f8db5866cec3b2a127dedb37818eaf207` |
| [marmot-ts candidate](https://github.com/marmot-protocol/marmot-ts/tree/2f60dbb27d284f617ad873ccda568c0f2f07aa79) | `2f60dbb27d284f617ad873ccda568c0f2f07aa79`, source package `@internet-privacy/marmot-ts` 0.6.0 |
| [Candidate ts-mls fork](https://github.com/hzrd149/ts-mls/tree/2ca5c43b77241245ef41a5dd834f151674877c2d) | `2ca5c43b77241245ef41a5dd834f151674877c2d`, source package 2.0.0-rc.14 |
| Candidate frozen pnpm lock | SHA-256 `9cf5049960026b335885651f74002fb527785cad64e5f1595ab11a3a7d424fd5` |
| Probe package manager | pnpm 10.34.5, dev-only exact dependency |
| Upstream test/compiler tools | Vitest 3.2.4, TypeScript 6.0.3 |
| Candidate direct crypto packages | `@hpke/core` 1.9.0; `@noble/ciphers`, `@noble/curves`, `@noble/hashes`, `@scure/base` 2.2.0 |
| Noseq vector primitive | `@noble/curves` 2.2.0, dev-only exact dependency |

The complete transitive graph is fixed by the upstream lock, including additional
crypto versions pulled by its other packages; the table is the checked direct
crypto surface, not a claim that no other version exists. The selected MLS
ciphersuite is `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`. The pinned default
provider uses Node WebCrypto and its selected Noble/HPKE implementations. This
preflight exercises Node 26.8.1 only. P0 browser and workerd smoke tests say
nothing about cross-runtime cryptography.

The candidate declares `/core` as `./dist/core/index.js`. The probe builds that
entry from the pinned source and checks `accountIdentityProofSigningDigest`,
`signAccountIdentityProof`, `encodeAccountIdentityProof`,
`decodeAccountIdentityProof`, `buildAccountIdentityProofExtension` and
`verifyLeafAccountIdentityProof`. It does not establish that an independently
published npm tarball has the same bytes. No candidate library is linked into
the generic application host or Worker. Third-party fixture and source notices
are retained in [NOTICE](../NOTICE).

## Observed compatibility verdict

**Identity proof: incompatible.** The current
[v2 component](https://github.com/marmot-protocol/marmot/blob/4a2bc65f8db5866cec3b2a127dedb37818eaf207/app-components/account-identity-proof-v2.md)
requires LeafNode application component `0x8009`, support/required-component
negotiation and exactly 104 proof bytes. The public vector reconstructs a
local-only NIP-01 kind-450 event, verifies its digest/signature and encoded bytes,
and rejects changed signed fields or a corrupted signature.

The candidate's
[v1 public implementation](https://github.com/marmot-protocol/marmot-ts/blob/2f60dbb27d284f617ad873ccda568c0f2f07aa79/src/core/account-identity-proof.ts)
uses custom extension `0xf2f1`, version byte 1 and a 135-byte codec for the chosen
32-byte MLS key. Its API rejects the v2 bytes and signs a different digest; a v2
signature cannot authenticate that v1 digest. The v1 signing/codec path works on
its own terms. The current specification explicitly excludes a v1 fallback.
Changing a constant or wrapping the old codec cannot establish v2 conformance:
carrier location, capability negotiation, credential binding and lifecycle
validation also matter.

The v1 `accountProofSigner` API needs arbitrary digest signing. The current
[authorization-proof template](https://github.com/marmot-protocol/marmot/blob/4a2bc65f8db5866cec3b2a127dedb37818eaf207/foundation/authorization-proofs.md)
uses ordinary Nostr event signing. Do not generalize the legacy raw-Schnorr
requirement to current Marmot. This vector is not a complete v2 validator:
placement, key validity, duplicate components, timestamp bounds, signer-response
substitution and membership authorization remain to be exercised. NIP-07 and
NIP-46 capability behavior has not been tested.

**Eager final outcomes: counterexample reproduced.** The candidate's
[commit-race corpus](https://github.com/marmot-protocol/marmot-ts/blob/2f60dbb27d284f617ad873ccda568c0f2f07aa79/src/__tests__/integration/ingest-commit-race.test.ts)
constructs two real MLS commits from one epoch. A receiver follows the higher
digest branch, decrypts its application payload and reports it accepted. A late
lower-digest commit causes rewind and an invalidation identifying that same
payload and branch. Other cases cover reversed arrival, deeper branches and
payload-witness preference. This disproves treating every eager callback as a
permanent Noseq outcome; it does not prove that every possible adapter fails.

The pinned specification's
[convergence contract](https://github.com/marmot-protocol/marmot/blob/4a2bc65f8db5866cec3b2a127dedb37818eaf207/protocol-core/convergence.md)
also requires withdrawing abandoned-branch effects. It additionally describes
bounded frozen input passes and observer-atomic application. A passing older
candidate test is therefore not current-protocol conformance. A timer, a
`Settled` label, withholding a callback, waiting indefinitely for a later branch
or silently rejecting valid Marmot input is not a demonstrated finality adapter.

**Restart: retained branch state is material.** The two
[rewind persistence cases](https://github.com/marmot-protocol/marmot-ts/blob/2f60dbb27d284f617ad873ccda568c0f2f07aa79/src/__tests__/integration/rewind-persistence.test.ts)
contrast restarting with the retained rewind tree against restarting with only
the current tip. The former recovers to the selected branch; the latter stays on
the losing branch. Recreating objects over an in-memory serialized store tests
the library's load path. It is not a filesystem crash, authenticated archive,
all-device-loss recovery or G2 proof.

The 26 upstream cases use real MLS crypto but some setup uses
`unsafeTestingAuthenticationService`, synthetic credential strings, a minimal
signer and mock network/storage. They do not prove authenticated account/device
admission, signed Noseq prefixes, live relay behavior, epoch exclusion or complete
current Marmot interoperability. KeyPackage and device-admission wire surfaces
still need systematic comparison; source pins and a README are not evidence of
compatibility. In particular, the candidate's optional v1 KeyPackage proof
production cannot satisfy mandatory current v2 presence by implication.

## Proposed next direction; separate adoption required

| Choice | Work needed | Interim disposition |
|---|---|---|
| Preserve Marmot | Find or implement the pinned current component/transport/admission contract, then demonstrate an adapter that finalizes a named authenticated crypto-input set without later changing Noseq outcomes while still honoring valid convergence input. | Continue only with a concrete finality design and runnable counterexample resolution; stop the current pair. |
| Define a Noseq MLS/Nostr binding | Specify one authenticated order for crypto controls and actions; use the first valid Commit for an epoch and hold a sender's provisional state until its own entry returns in that order. Define rejection, self-echo, Welcome delivery and recovery explicitly. | Preferred next bounded investigation, not adopted or proven. |

The second option follows the delivery model described in
[RFC 9750 §5.2.1](https://www.rfc-editor.org/rfc/rfc9750.html#section-5.2.1).
[RFC 9420 §14](https://www.rfc-editor.org/rfc/rfc9420.html#section-14) requires a
conflict-resolution method, separates Commit generation from changing current
state and delays Welcome delivery until acceptance. These rules motivate a
prototype direction; they do not certify a particular library, signed sequencer
or complete application protocol.

If adopted later, this would be an explicitly versioned **Noseq MLS/Nostr
profile**, not Marmot convergence. It would replace Marmot branch scoring,
witness-driven reselection and application-effect withdrawal with processing
one contiguous signed order. A client would finalize only against that accepted
prefix; it would not finalize from direct relay arrival or a local send.
Competing/stale controls would receive an agreed disposition under the new
profile. Pending local commits and their Welcome messages must be retained or
aborted consistently when the sender loses a race; they cannot become canonical
just because a relay acknowledged publication. The current eager `MarmotGroup`
API is not such an adapter unchanged: the next probe must demonstrate explicit
provisional state at a suitable MLS API boundary, including sender self-echo and
losing-commit cleanup before choosing that API for production.

Wire and interoperability consequences must be explicit: select RFC MLS version,
ciphersuite, credential/author-proof binding, capabilities, KeyPackage discovery
and reuse rules, control and application envelopes, Nostr experimental kinds/tags,
instance/genesis/domain binding, deduplication, and ordered entry/receipt encoding.
Marmot proof component IDs, routing components, exporter encryption, rumors and
join flows cannot be silently inherited as interoperable. Any retained Marmot
construction needs an explicit version and justification; changed proof classes
must not reuse their authority domains accidentally. Existing Marmot clients
would not be claimed compatible with this new profile.

The following requirements survive either direction:

- Keep action content, private definitions/assets and secrets opaque to sequencer,
  primary and mirror. Give those services only the explicitly reviewed routing,
  identity/admission and size/timing metadata. They order and retain bytes, not
  validate every decrypted transition.
- Authenticate each account/device-to-MLS-leaf binding and independent action
  author proof. Validate owner admission authority at the same named sequencing
  boundary as the encrypted membership change; relay AUTH grants no MLS access.
- Rotate epochs on membership change and prove future exclusion of removed
  devices. State precisely what an existing member, newcomer or recovered device
  may read; no design can revoke plaintext already learned by a member.
- Recover the promised history interval from original authenticated actions and
  their complete verification closure. Define archive roots, authenticated prefix
  coverage, custody, rotation and forward-secrecy tradeoffs before claiming G2.
- Detect conflicting signed sequencer histories when clients compare evidence,
  stop at a fork and preserve the last-good frontier. One valid signature does
  not rule out an unseen fork or selective withholding by a malicious service.
- Separate invalid protocol input, unavailable dependencies, missing local keys,
  business refusal and runtime failure. An opaque server cannot make decrypted
  validity decisions. Any common-log stall or repair policy needs explicit review;
  clients must not skip different positions independently.

## Required next evidence and stop conditions

All five gates remain unpassed. Bound any next candidate investigation to the
plan's two engineering days before another explicit continue/change/stop result.

| Gate | Required next runnable vectors and reviewed decisions |
|---|---|
| G1 | Separate authenticated clients replay identical signed prefixes in different batches; competing real MLS Commits, sender self-echo winning/losing, delayed Welcome, stale-epoch actions, duplicate inputs, missing dependencies, old-epoch payloads and offline membership changes. Restart before/after generation, staging, ordered acceptance, decryption, persistence and outcome publication. A later accepted prefix extension must never revise a finalized outcome. No mock authentication for the acceptance vectors. |
| G2 | Decide full or delimited newcomer history. Verify archive root and named-prefix coverage before persistence; include original action/definition closure, tampered or truncated archives, missing/corrupt keys, fresh-device and all-device-loss replay, recovery-key rotation and old recovery material after removal. Identify which retained keys weaken forward secrecy. |
| G3 | Bind owner-signed admission version to encrypted transition; exercise owner offline, concurrent join/removal, disallowed proposers, revoked submitter retry, only one half arriving, restart between halves, multiple devices and future-epoch exclusion. |
| G4 | Pin and validate the full wire/identity/domain/metadata profile against current registries; probe local signer, NIP-07 and NIP-46 operations, reject unsupported optional paths and altered signer responses, distinguish permanent invalidity from missing secrets and dependencies. |
| G5 | Choose bounded primary/mirror retention and reader policies with conformance fixtures; retain normal history events, declare public metadata, equivocation/withholding behavior and mirrored-reader exposure. Actual relay implementation remains P5. |

Cross-runtime crypto, the full adversary-by-asset matrix and every Plan 001
signer/history/admission/wire/relay condition remain required. Do not substitute
an unrotated shared group key. Stop if prefix stability, declared recovery or
future-epoch exclusion cannot be demonstrated. Review of this document permits
publishing the investigation and evaluating the proposal; it adopts neither
option nor any production encryption behavior.
