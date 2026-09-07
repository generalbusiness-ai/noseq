---
date: 2026-09-06
status: P0 complete; P1 investigations landed; G1–G5 unpassed; later stages gated
planned_at: 499dc13e3ef05f8a30f844df225dc17ce4162297
revised: 2026-09-07
tracking: "git:sha1:77aeeeb3fa42aeb6babdf961f6397ba73fada68b#git:sha1:ae8cb5e84bff85e1cf775b2624ef061c07d4846a"
---

# Plan 001: Prove a confidential application framework over Nostr

Build a small, generic host in which retained application definitions control
behavior, authorized devices interpret one signed order, and fold results can
drive the interface directly. The comparison succeeds only if confidentiality,
recovery and deterministic replay work together. A working Nostr connection and
a spatial-board demonstration are insufficient.

This is an implementation handoff, not an implementation completion report.
Documentation request #108 covers this revision only. Separate requests have
commissioned P0 and bounded P1 investigations; no G1–G5 gate has passed. Later
work must satisfy its gates and be commissioned in GitSeq. Publication of this
revision does not adopt an unproven cryptographic profile or authorize deployment.

> **Executor:** Read this file completely. Implement the stages in dependency
> order, retain the specified evidence, and stop at a failed gate. Do not replace
> a failed security or replay requirement with a weaker demonstration. Update
> the stage status in `plans/README.md` only with evidence of completed work.

## Status and scope

| Field | Value |
|---|---|
| Priority / effort / risk | P1 / large, staged / high protocol-integration risk |
| Category | Direction, protocol feasibility, implementation handoff |
| Baseline | `499dc13e3ef05f8a30f844df225dc17ce4162297`, 2026-09-07; initial design review at `2554c582db730cd3d64490970a573eab1463672e` |
| Prerequisites | Independent architecture review #46; separate implementation request |
| Outcome | Reproducible comparative prototype with explicit supported security and recovery policy |

Noseq now contains the P0 toolchain and generic shell/health endpoint plus bounded
P1a–P1d crypto, protocol, relay and segmented-recovery probes. P0 is complete;
P1 is in progress. Read [toolchain](../docs/toolchain.md),
[crypto feasibility](../docs/crypto-feasibility.md) and
[segmented recovery](../docs/segmented-recovery.md) before changing their paths.
The latest inspected P1d review reports 115 actual tests plus 44 evidence/gate
checks; this plan revision did not rerun them. Hosted CI proves P0 only.
`check`, `build`, `test:harness` and the named `probe:*`/`verify:*` scripts exist.
Full `test:crypto-feasibility`/`gate:protocol` remain closed; P2–P9 command
placeholders fail. Do not recreate existing files or mistake a successful probe
for protocol adoption. The original design-review reports remain historical.

Run this drift check before implementation, from the repository root:

```sh
git status --short
git diff --stat 499dc13e3ef05f8a30f844df225dc17ce4162297..HEAD -- package.json package-lock.json .node-version .gitignore tsconfig.json vitest.config.ts vite.config.ts wrangler.jsonc index.html src tests scripts fixtures examples docs infra .github NOTICE README.md
```

Documentation published with this revision is expected. Inspect runtime changes
since the baseline and reconcile existing probes before implementing any stage.
Keep unrelated local changes. Use `request/<work-package>` branches, exact-path
artifacts, independently reviewed exact heads and GitSeq landing under `AGENTS.md`
and the installed GitSeq skill. Commits must cite their work request with a
`Rests-On:` trailer. Do not self-request or self-review.

**Allowed implementation scope:** the paths in the drift check, plus
`plans/README.md` stage status and evidence links. Nested paths are assigned to
stages below. Preserve attribution in `NOTICE` for any Atseq port. Definition
and protocol decision records go in `docs/`; do not silently rewrite the dated
architecture draft as if it had already resolved the review.

**Deferred:** automatic sequencer failover, provider migration, cross-instance
transactions, arbitrary executable app code, SQL projection adapters, native
clients, general device delegation/revocation, anonymous transport metadata,
unattended group admission, definition activation/migration, native typed-array
fold values, and broad Nostr-client interoperability. A stage may record that a
deferred capability is required; it must then stop for a new scoped decision.

## Baseline and reuse

Use completed Atseq at
[`e5856bd9c538b35c2dce4e87d51800f1eaa090f9`](https://github.com/generalbusiness-ai/atseq/tree/e5856bd9c538b35c2dce4e87d51800f1eaa090f9),
available locally at `/Users/hughpyle/play/atseq` on the planning machine. Never
use an uncommitted checkout as a dependency or modify that repository.

| Pinned Atseq paths | Reuse and required adaptation |
|---|---|
| `src/runtime/profile.ts`, `values.ts`, `evaluator.ts` | Bounded JSONata and plain-JSON safe-integer profile; give Noseq its own profile identity |
| `src/definition/schemas.ts`, `load.ts` | Locally bundled Lexicon and complete immutable closure; remove PDS assumptions |
| `src/runtime/folder.ts` | Verified/interpreted frontiers and atomic state/outcome persistence; avoid copying the entire outcome history on every append |
| `src/client/store.ts` | IndexedDB transaction completion and revision checks; extend deliberately for MLS state and persisted pending ciphertext |
| `tests/runtime.test.ts` | Same deterministic corpus in Node and a Chromium worker |
| `tests/dynamic-apps.test.ts` | Host starts before two unrelated definitions are generated; unchanged host/build hashes |

DID/P-256 identities, PDS transactions, XRPC and `at://` bindings are not reusable
wire contracts. The evaluator's `canonicalJson` measures runtime values; use the
Nostr implementation's specified serialization for signed events.

Observed tools were Node `v26.8.1`, npm `11.19.0` and Git `2.50.1`. Docker's binary
existed at initial planning; it was not tested then. The current P0 toolchain
and native P1c/P1d relay probe records supersede that initial environment survey.
Use their pinned tested environment rather than treating these observations as
a supported dependency matrix.

The [dated final assessment](../notes/2026-09-07-atseq-final-assessment.md) records the
change from the original S4 pin, exact retained evidence and AT-01–AT-10 lessons.
Reuse the S5/S6 source-closure, archive-pin and worker-budget corrections; do not
port PDS wire, activation control or the full-prefix performance bottleneck.
Atseq's completed public-data spike does not prove Noseq crypto or privacy.

## Decisions and protocol gates

The original stage directions below are conditional requirements, not instructions
to discard later reviewed probes. Current proposed wire/crypto/recovery details
live in `docs/protocol-v0.md`, `docs/confidentiality-and-recovery.md`,
`docs/relay-profile.md` and `docs/segmented-recovery.md`. They do not acquire
adoption through this plan. Before P2, reconcile any original Marmot-specific
step with the explicitly adopted selected profile; stop on conflict. Preserve
existing P1 observation suites and retain exact decision provenance.

These are scoped prototype choices and required decision outputs. A choice
marked **gate** must be specified, implemented as an isolated probe and reviewed
before dependent work. Do not invent cryptography to make a gate pass.

| Topic | Prototype direction and boundary |
|---|---|
| Authority | One creator/owner initially governs membership and immutable genesis; transport administration is distinct from application permissions. No owner transfer in v0. |
| Order | One sequencer per instance; immutable entries and permanent interpreted outcomes at an accepted frontier. No reliance on relay arrival order or timestamps. |
| Encryption — gate G1 | The original Marmot pair is incompatible (P1a). Separately commissioned ordered MLS probes P1b–P1d are a Noseq-specific candidate, not Marmot interoperability. Complete independent decision evidence/adoption before activating G1. |
| History — gate G2 | Choose and test a recoverable history/archive policy, including its extra key-custody and forward-secrecy limits. “Back up the Nostr key” is insufficient. |
| Membership — gate G3 | Define the exact log boundary between public transport admission and encrypted group membership. Specify stale-epoch and removal behavior, including in-flight requests. |
| Signed wire — gate G4 | Specify retained actor proof, submission identity, sequencer proof, canonical bytes, cross-instance binding and all encoded-size limits. |
| Relay — gate G5 | Define a small explicit NIP-01/NIP-42 profile, retention and complete-history retrieval; verify primary and independent mirror capabilities. |
| Definitions | Fixed immutable definition per instance initially; retain its complete closure and recovery material independently of the primary. Reject stale/foreign definition identities. |
| Runtime | Port the bounded Atseq JSONata/plain-JSON safe-integer profile and local Lexicon validation; no schema-language migration in this comparison. |
| Direct UI | Identity projection is valid. JSON drives trusted SVG; fixed-point JSON coordinates drive a trusted Float32Array/three.js adapter. No SQL query is required. |
| Host trust | Start from a trusted local generic browser build. A mutable host that supplies malicious JavaScript can read keys/plaintext; opaque-provider claims exclude that host compromise. |
| Infra | One routing Worker and one SQLite-backed DO per instance, combining sequencer/journal/primary relay; one independently operated strfry mirror if its tested profile is sufficient. |
| Onboarding | Local identity creation by default, encrypted recovery export, invitation-led online owner admission. Existing signer and passkey paths are capability-gated additions. |

## Design-review dispositions

The independent [design report](2026-09-06-design-review.md) is signed report #50,
accepted as planning input by #51. It reviewed the immutable architecture at
`2554c582db730cd3d64490970a573eab1463672e`, independently of this plan. Acceptance of the report does not assert
that its feasibility gates have passed. Its findings are all covered below.
A delayed second report #60 is assessed separately in
[supplementary dispositions](2026-09-06-supplementary-review-dispositions.md),
including explicit reasons for qualifying several suggested solutions.

| Finding | Disposition and completion evidence |
|---|---|
| DESIGN-01: MLS branch revision | Mandatory G1/P1 gate; same authenticated input set, late witnesses/withdrawals, stable prefix extension, restart. Stop on incompatibility. |
| DESIGN-02: History and crypto durability | G2/P1 selects authenticated archive or explicitly trusted boundary; P6 proves atomic crypto/action/outcome persistence, cache rebuild and all-device-loss recovery. |
| DESIGN-03: Permanently unreadable input | P1 defines terminal-invalid versus missing-dependency/local-key/runtime failures; P6 tests identical disposition or explicit stop. An availability limitation must be stated. |
| DESIGN-04: Public admission authority | G3 defines owner control records and exact boundary; P2/P4/P8 test mismatch, grant/revoke races, stale epochs and revoked exact retries. |
| DESIGN-05: Invitation/device protocol | P1/P8 define signed invite, recipient/group/Welcome binding and recoverable transitions; P6 tests key-package/tab ownership; general delegated-device revocation deferred explicitly. |
| DESIGN-06: Wire and proof closure | G4/P2 specifies compliant signed action content, three retry identities, parser/encoding vectors and full retained sender/account proof closure. |
| DESIGN-07: Relay access/completeness | G5/P5 uses tested historical/live reader rules, fixed-tip backfill, explicit replication holes/readback and independent mirror recovery; freshness stays separate. |
| DESIGN-08: Journal/alarm/restore | P4/P5 test durable wakeup scheduling and all crash windows; stale provider restores stay read-only until externally reconciled. |
| DESIGN-09: DO resource budget | P1 freezes the budget below; P5/P9 test queues, paging, hibernation, retry exhaustion, quotas and overload refusals. |
| DESIGN-10: Runtime/buffer boundary | P3 fixes retained bounded JSON/Lexicon/JSONata; P7 specifies trusted fixed-point-to-buffer adapters, ownership and byte equality. Native buffer fold values deferred. |
| DESIGN-11: Reproducible integration | P0 establishes real commands and evidence rejection; P1 pins dependencies; P9 assembles the full fault matrix and honest cloud status. |
| DIRECTION-01: Unrelated second app | P7/P9 require unchanged host and deployment identities plus two-instance isolation; no application-specific host branch. |

### Final Atseq evidence dispositions (2026-09-07)

These extend the original review mapping without rewriting either signed report.
P1c/P1d already implement bounded candidates for several requirements; inspect
and reuse that evidence before proposing new work. This is a conditional handoff,
not adoption of new trust boundaries or permission to widen a live request.

| Lessons | Existing findings | Required stage evidence |
|---|---|---|
| AT-01/03: exact closure and separate bounds | DESIGN-02/03/06/10; N2/3/7/8 | P1/P3/P5/P6 compare readers with different caches and the same signed closure; missing, corrupt, oversized and external assets; explicit unavailable transport |
| AT-02/09: exact retry and fixed definition | DESIGN-04/06; N3/4/8 | P2/P4/P6/P8 preserve exact encrypted submission after lost reply/removal; reject changed content; no v0 activation |
| AT-04: trust before import writes | DESIGN-02/05/08; N2/9/10 | P6/P8 preserve pins, checkpoint, vault, outbox and crypto frontier on conflict/interruption; retain declared historical trust interval |
| AT-05/06: failure and prefix cost | DESIGN-08/09/10; N10/11 | P3/P6/P9 distinguish semantic budgets from operational watchdogs; compare incremental and cold replay, count actual work |
| AT-07: honest evidence | DESIGN-11; N12 | P0 already retains UUID started/failure records; P9 must retain all failed/interrupted runs and bind complete command/case/log/result/source identities |
| AT-08/10: authoring and populated document | DIRECTION-01, DESIGN-10; N6/7/12 | P7/P9 add agent creative trial, canonical stable-ID document, assets/actions, and local-camera/animation separation |

G1–G5 closure additionally needs genuine independent decision evidence and the
separately commissioned detached decision validator; a publication approval or
passing observation report cannot open the gates. The proposed owner-attested
history, old-vault capabilities and named-prefix unseen-removal exposure must
remain explicit. Read the current P1 proposal documents for exact contracts.

### Initial resource budget and current candidate

The table preserves the original planning targets. Current proposed encoded
contracts are in `docs/protocol-v0.md`, `docs/relay-profile.md` and
`docs/segmented-recovery.md`; inspect them before implementation. They already
resolve chunks, frame expansion, segmented custody and retention reservations
under separately reviewed investigations. Do not replace those measured bounds
with the initial targets below. G1–G5 and profile adoption remain incomplete.

These are proposed application limits, not claims about platform defaults. P1
must test encoded crypto expansion and actual relay acceptance, then freeze a
coherent versioned budget. A different value needs a recorded reason, updated
vectors and review before dependent code. Bounds apply before unbounded work.

| Surface | Initial target |
|---|---|
| Complete encoded event | 128 KiB; plaintext act also bounded to 32 KiB |
| Journal / unpublished outbox per instance | 256 MiB / 64 MiB; refuse new submissions before exceeding either; never evict acknowledged required history |
| Connections / subscriptions / filters | 32 connections per instance, 4 subscriptions per connection, 4 filters per subscription |
| History page / live queue | At most 128 events and 1 MiB per page; at most 128 events or 1 MiB queued per connection, whichever is reached first |
| Dependency retrieval | 8 concurrent fetches, 64 closure files, bounded retry budget and explicit missing-dependency pause |
| Replication activation | At most 64 events and 1 MiB, 2 destinations; 1–300 second persisted exponential retry delay with bounded jitter |
| Provisioning / ingress | Authenticated creator quota 10 active instances; 60 requests/minute per identity with burst 10 and a separate total per-instance cap of 300/minute |

G4 must show that legitimate group controls and encrypted source chunks fit the
event cap; split source bundles under their specified retained format. Rate and
memory limits must also bound unauthenticated connections/bytes before identity
checks, with provider-wide admission limits recorded for any cloud probe. P9
measures CPU/latency rather than promising a performance SLO before measurement.

## Delivery layout and interfaces

Create a single TypeScript package first; split packages only when tests expose
an actual deployment boundary. The public contracts below are names and
responsibilities to specify in P1/P2, not permission to omit wire details.

```text
src/protocol/     profile, genesis, signed intents/submissions/entries, receipts
src/crypto/       pinned MLS adapter, recovery archive, key-state transactions
src/definition/   immutable closure loader, local schema bindings
src/runtime/      bounded evaluator, pure folder, outcomes and profile
src/client/       vault, durable store, replay controller, invitation coordinator
src/ui/           generic host, explicit controls, SVG and geometry adapters
src/worker/       provisioning/router, AppSequencer, relay, replication outbox
scripts/          fixtures, conformance runner, dynamic-app and evidence tools
fixtures/         public synthetic vectors, malicious inputs, retained bundles
examples/         authorable spatial board and unrelated inventory application
tests/            protocol, crypto, runtime, workers, relay, client, UI and flows
infra/            pinned local mirror setup and optional synthetic cloud probe
```

- `VerifiedPrefix` names genesis, tip identity and position; a gap or conflicting
  predecessor prevents advancement. Freshness is separately reported.
- `CryptoAdapter` persists and recovers key state, stages ingestion, reports
  missing dependencies and produces authenticated inner intents. Its rewind,
  withdrawal and archive behavior must satisfy G1/G2 before use by the folder.
- `ProjectionSnapshot` names definition/profile, interpreted frontier, canonical
  state and outcome range. It exposes a read-only value to a trusted adapter.
- `DeviceStore.commitInterpretation` atomically persists the staged crypto state
  needed at that frontier, projection changes and outcomes. Separate durable
  pending submissions survive transport uncertainty and browser restarts.
- `AppendReceipt` proves an immutable entry; it does not promise mirror retention.
  Replication progress and observed freshness have separate status fields.

## Execution order

```text
P0 toolchain and evidence harness
  -> P1 protocol / encryption / recovery gates
  -> P2 wire and pure verification
       -> P3 retained definitions and bounded runtime
       -> P4 durable sequencer and provisioning -> P5 relay and mirror
       -> P6 client crypto and replay (needs P3; integration/completion after P5)
P3 + P6 -> P7 generic direct UI
P4 + P5 + P6 + P7 -> P8 onboarding and recovery flows
P0..P8 -> P9 fault matrix, resource evidence and comparison
```

Independent work may proceed only after its shared interface gates pass. Start
with one logical owner per work package. Do not parallelize edits to shared
profile or wire types without an agreed artifact.

### P0 — Establish a reproducible baseline and executable evidence harness

**Depends on:** implementation request. **Paths:** `package.json`,
`package-lock.json`, `.node-version`, `.gitignore`, `tsconfig.json`, `vitest.config.ts`,
`vite.config.ts`, `wrangler.jsonc`, `.github/workflows/check.yml`,
`scripts/verify-evidence.ts`, `tests/harness.test.ts`, `docs/toolchain.md`,
`index.html`, `src/ui/host.ts`, `src/worker/router.ts`.

1. Pin TypeScript, the test/build tools, a Node release verified with them, the
   browser binary revision and Workers compatibility date. Commit the lockfile.
   Add only a bootable generic host shell and Worker health endpoint so build and
   browser/Workers harnesses exercise real entry points; no pretend application.
   Pin the crypto, Nostr, schema, JSONata and three.js dependencies when first
   introduced; record source revisions and chosen API surfaces in `docs/toolchain.md`.
2. Establish Node tests, a Chromium worker/page harness and actual Workers-runtime
   tests. Current Cloudflare documentation uses `@cloudflare/vitest-plugin`;
   confirm its current API/version rather than importing an old pool example.
   Keep WebSocket integration tests in a supported shared-storage configuration,
   run serially with unique object names and explicit cleanup.
3. Create the command contracts in the table below. An unimplemented suite must
   exit nonzero with “stage not implemented”, never pass with zero required cases.
   `check` must typecheck every target; `build` must build client and Worker.
4. Preserve P0's existing UUID run directories and exclusive started/failure
   writes. An interrupted run remains incomplete; a later success cannot hide it.
   Define machine-readable evidence containing source commit, lockfile hash,
   runtime/profile/fixture identities, command, required-case list and results.
   Reject missing, skipped or mismatched required cases. Keep generated bundles,
   keys and bulk benchmark output ignored; commit only synthetic fixtures and
   sanitized summaries explicitly listed by later stages. P9 also binds every
   command exit, complete required-case inventory, logs and retained result hashes.
   Mutation tests reject a stale success, changed log/result and incomplete run.

**Verify:** `npm ci`, `npm run check`, `npm run test:harness`, `npm run build`
exit 0 in a clean checkout. Harness tests include an intentionally absent suite
and skipped mandatory case and confirm both are rejected. P1–P9 commands still
report incomplete until their complete implementations and decision evidence exist.
P0 is already complete at the inspected baseline; preserve its 12 mandatory cases
and command contracts rather than rebuilding this stage from scratch.

### P1 — Prove the security and replay contract before committing to the stack

**Depends on:** P0. **Paths:** `docs/protocol-v0.md`,
`docs/confidentiality-and-recovery.md`, `docs/relay-profile.md`,
`src/crypto/adapter.ts`, `tests/crypto-feasibility.test.ts`,
`fixtures/crypto/`, `scripts/protocol-gates.ts`.

1. Preserve the completed P1a incompatibility regression and inspect the P1b–P1d
   ordered MLS candidate before further probing. When evaluating Marmot, pin its
   protocol and implementation together. Compare current account-proof,
   transport, key-package and device-admission surfaces byte-for-byte; a library
   README or older NIP-EE description is not a compatible binding. Do not implement
   unfinished branch-draft multi-device wire as normative interop. Name any
   Noseq-specific transport binding. The original starting candidate was
   [`marmot-ts` 2f60dbb](https://github.com/marmot-protocol/marmot-ts/tree/2f60dbb27d284f617ad873ccda568c0f2f07aa79)
   and remains an unapproved, incompatible pair. Document required signer operations;
   P1a has since disproved this pair: protocol proof v2 (0x8009) differs from
   candidate legacy v1 (0xf2f1). Raw digest signing beyond `signEvent` belongs to
   that legacy library API, not inherently to current Marmot. Use the landed
   preflight as a regression; continue only the separately commissioned ordered
   MLS investigation. Do not restart production integration of the rejected pair.
   Exercise local signer, NIP-07 and NIP-46 capability probes and fail unsupported
   paths explicitly. Do not demand external signer support for the default flow.
2. **G1:** feed identical signed prefixes in different arrival batches to separate
   devices, including competing MLS commits, late witnesses/selected branches, withdrawal
   notifications, messages from previous epochs and a client offline through
   membership changes, including an existing member offline beyond the retained
   epoch window. Restart at every staged-state boundary. Test prefix
   extension stability over an explicitly defined authenticated crypto-input set:
   a later accepted entry cannot change the meaning or
   effectiveness of an already-finalized Noseq entry. Document how the selected
   adapter achieves this despite Marmot's branch convergence. If it cannot,
   stop and propose a reviewed protocol change; do not merely freeze a library
   callback or silently ignore a later valid branch.
3. **G2:** decide whether newcomers get full history or a specifically delimited
   history. Specify an archive of original authenticated actions and their full
   verification closure, authenticated coverage of a named prefix, root trust, key rotation,
   retention and recovery custody. Separate canonical event verification from
   decryption recovery. If accepting a snapshot, name its signer/checkpoint trust
   and the unverified historical interval. Test fresh-device replay of every
   promised interval and all-device-loss restoration. Explain exactly which
   archive keys weaken forward secrecy and who can retain them.
4. **G3:** specify owner-signed admission records and their sequencing boundary.
   For join/removal, define public admission version, encrypted MLS transition,
   which identities may propose each control record, and how they bind. Include
   owner offline, concurrent control requests, late old-epoch actions, a revoked
   submitter retrying an already committed ID, and recovery after only one part
   arrives. A relay AUTH session cannot grant encrypted membership.
5. State the availability policy for an admitted malicious member submitting
   undecryptable or invalid MLS content. Preserve a last-good frontier and show
   the failure; an opaque server cannot validate every inner group transition.
   If the only safe prototype behavior is a stalled instance, record that limit
   explicitly. If liveness requires a repair/skip protocol, design and review it
   here; no client-local skip of a common log position is permitted. Specify
   separate outcomes for provably invalid cryptographic/protocol input, temporary
   dependencies, locally missing/corrupt secrets, business refusal and runtime
   failure; all authorized clients must agree on terminal dispositions.
6. **G4/G5:** finish the wire and relay decision records needed by P2/P5. Specify
   numeric kinds and tag semantics for a private experimental profile after
   checking the pinned NIP registry. Normal retained events carry history;
   addressable discovery alone cannot retain a replay log. NIP-78's recommended
   owner access is not automatically suitable for a multiuser sequencer log.
   List precise public metadata, primary/mirror reader policies and what the
   mirror can expose if it lacks equivalent read authorization. G5 here approves
   a bounded profile and conformance fixtures; P5 remains the separate gate for
   proving that the actual primary and mirror implement it.
7. Write an adversary-by-asset threat table for network observer, primary/mirror
   reader/operator, malicious relay/provider, compromised host, removed
   member, admitted malicious member, stolen device and leaked recovery archive.
   Map each to protection, residual exposure and a fixture. Include confidential
   definitions/assets, identity, membership, instance existence, traffic timing
   and sizes, not just action payloads. For every cell state visible, hidden or
   bounded, and test the chosen meaning.
8. Bound initial library exploration to two engineering days per candidate before
   an interim result and explicit continue/change/stop decision. This is a research
   budget, not permission to mark an unresolved gate passed. Plain Nostr tooling
   may replace reactive plumbing; changing encryption/history requires review.

**Verify:** `npm run test:crypto-feasibility` and `npm run gate:protocol` exit 0
only with G1–G5 supported by runnable vectors and reviewed decision records. The
gate produces a manifest of exact profile/library/source revisions and signer
capabilities. Record limitations plainly. **STOP** if immutable interpretation,
the required recovery policy or future-epoch exclusion cannot be demonstrated.
The rest of this plan depends on the selected interface, not on guessing it now.

### P2 — Implement signed wire types and pure log verification

**Depends on:** P1. **Paths:** `src/protocol/{profile,genesis,intent,submission,entry,verify}.ts`,
`tests/protocol.test.ts`, `fixtures/protocol/`, `docs/protocol-v0.md`.

1. Implement the exact G4 profile: creator-signed genesis, signed inner intent,
   persisted outer encrypted submission, sequencer-signed entry and durable
   receipt. Carry the signed inner action structure in compliant Marmot app
   content; its protocol forbids adding a top-level Nostr signature to the inner
   event. Retain MLS sender/account binding as well as the nested action proof.
   Bind genesis, profile, definition, actor and stable logical ID in
   their specified domains. Retain independent actor proof; an unsigned NIP-59
   rumor alone is insufficient. Use maintained Nostr signing/verification code.
2. Define strict decode/validation before allocation or cryptographic work;
   reject duplicate object keys, conflicting reserved tags and ambiguous encodings.
   Fix Unicode treatment, integer ranges, unknown-field policy and tag ordering. Bound
   whole signed event size, ciphertext, tags, identifiers, counters and decoded
   values. Test plaintext near the limit whose encryption/wrapping exceeds the
   transport limit. Define counter exhaustion as an explicit refusal.
3. Implement `verifyPrefix`: signatures, identities, genesis binding, contiguous
   sequence and predecessor, fixed definition, duplicate equality and fork
   evidence. A valid shorter prefix does not prove freshness. Persist the highest
   previously trusted checkpoint; never silently replace it with an older tip.
4. Define retry semantics independent of encryption randomness: save bytes before
   first send, return the original receipt for identical ID/content, reject ID
   reuse with different content. Separate outer signer retry identity from any
   logical inner action duplicate rule fixed in G4. Distinguish logical action ID,
   exact encrypted submission ID and sequencer/relay event ID; pin dedup scope,
   storage lifetime and changed-byte rejection for each applicable identity.

**Verify:** `npm run test:protocol` passes published synthetic golden vectors,
one-byte tampering, replay across instances/definitions, reordered duplicates,
missing predecessor, two valid conflicting heads, stale tip and maximum-size
cases. Node and Chromium verify the same accepted/rejected vectors. Random test
seeds are recorded; no custom signature algorithm is introduced.

### P3 — Retain complete definitions and port the bounded pure runtime

**Depends on:** P2. **Paths:** `src/definition/{manifest,load,schemas}.ts`,
`src/runtime/{profile,values,evaluator,folder}.ts`, `tests/runtime.test.ts`,
`tests/definition.test.ts`, `fixtures/runtime/`, `docs/runtime-profile.md`, `NOTICE`.

1. Port the narrow pinned Atseq components listed above with attribution. Keep
   authored `manifest.json`, `schemas/*.json`, `folds/*.jsonata`, optional
   `queries/*.jsonata`, `views/*.json` and `assets/*`. Disallow external dependency
   lookup during interpretation. A manifest roots every binding and asset.
2. Start with Atseq's measured admission caps: state 128 KiB, act 32 KiB,
   evaluator input/output 256 KiB, program 64 KiB, closure 512 KiB across 64 files,
   AST 4,096 nodes/depth 64, input depth 32, evaluation depth 64/100,000 steps,
   sequence 16,384 elements, intermediate value 1 MiB and cumulative inspection
   16 MiB. Carry the remaining profile checks from its source, record their exact
   values and hash the resulting Noseq profile. G4's encoded transport cap is
   separate. Any changed cap requires updated vectors and a new profile identity.
3. Specify encrypted bundle chunking and retention within G4 bounds. Verify
   ciphertext identity before decrypting and closure identity after decrypting.
   State whether plaintext content identifiers leak equality/fingerprints and
   choose identifiers accordingly. Retain old source bytes even though v0 fixes
   the active definition. Never interpret a locally newer manifest by accident.
   Isolate the exact authenticated closure from extra cached files. Specify
   aggregate plaintext admission, encrypted transport and retained-evidence
   budgets separately, including alias/framing costs. Readers either verify
   the same available bytes or pause; transport refusal cannot fabricate an
   invalid definition. Carry forward P1d retention reservation evidence.
4. Expose pure fold results and per-entry outcomes; no required database/query
   layer. Schema/business refusal may produce a deterministic ineffective result.
   Missing source/key material, unknown profile and evaluator/runtime failure
   pause progress. An operational watchdog timeout cannot become a business
   outcome. Page outcome history so append cost does not copy all prior outcomes.
   Give replay/import a measured watchdog separate from preview. Test worker
   failure/timeout and cancellation at atomic boundaries without losing pending
   bytes. A catchable transient evaluator fault must pause, not become a terminal
   invalid-source result. Retain last-good state and the exact failing frontier.

**Verify:** `npm run test:runtime` runs the same corpus in Node and a Chromium
worker and compares canonical state, outcomes and profile identities.
`npm run test:definition` rejects missing/changed dependencies, traversal,
unknown profiles, resource exhaustion, non-finite/unsafe/fractional canonical
numbers and prototype-sensitive keys. Exact retained bundles recover without
the authoring server. A query-free definition emits a consumable projection.

### P4 — Implement one durable sequencer and authenticated provisioning

**Depends on:** P2; obey P1's membership profile. **Paths:**
`src/worker/{router,provisioning,AppSequencer,journal,outbox}.ts`,
`tests/workers/append.test.ts`, `tests/workers/provisioning.test.ts`,
`docs/operations.md`, `wrangler.jsonc`.

1. Route reservations to one DO each. Authenticate and quota provisioning before
   unbounded object allocation. Persist reservation owner, expiry and sequencing
   public key; finalize exactly once against creator-signed genesis. Retrying
   identical finalization returns the same instance; conflicting finalization
   fails. Public verification uses genesis identity, not a Cloudflare object ID.
2. Implement outer proof/admission/encoded-size checks, retry index and bounded
   per-instance quotas. Store entries, submission index, tip, admission version
   and outbox obligation in a single durable transaction. The table/index design
   must enforce sequence and submission uniqueness.
3. Serialize tip selection, async signing and committing across all append paths.
   `transactionSync` cannot contain an async callback. Document exactly which
   concurrency gate prevents a second append from signing the same predecessor
   while the first awaits signing. A promise/mutex alone is not durable state.
4. Return receipts only after commit; publish the exact stored bytes afterward.
   Persist replication destinations, retry counts/backoff and pending positions.
   Couple the outbox to a durably recoverable alarm schedule: interruption after
   journal commit cannot leave pending work without a future wakeup. Reconstruct
   all operational state after restart. A full journal refuses new
   work honestly; do not delete required history to regain capacity.
5. Never pass decryption keys/plaintext to the Worker. Avoid payloads, invites,
   key material and authorization tokens in telemetry. Tests use synthetic keys;
   production sequencing-key custody is a documented deployment prerequisite.
6. Restore of an older provider database must start read-only. Reconcile against
   the highest externally committed tip and recover all entries/retry bytes before
   enabling signing. If its completeness cannot be established, keep signing
   disabled and require a separately reviewed new-instance/handover decision.
   A restore must never mint another successor under the same key merely because
   an older local tip was restored.

**Verify:** `npm run test:workers` runs in the Workers runtime, including
concurrent async signing, identical/conflicting retries and injected interruption
before commit, after commit/before reply, after reply/before publication, and on
restart. Each accepted submission occupies exactly one position with one durable
outbox obligation. Reservation takeover, expiry, replay and quota tests pass.
A stale-database restore with a later mirror/client checkpoint stays read-only
and cannot produce a conflicting signed successor. Retain a SQL/journal audit
trace without secrets.

### P5 — Provide bounded relay delivery and independent retained recovery

**Depends on:** P4 and G5. **Paths:** `src/worker/{relay,relay-auth,replication}.ts`,
`tests/relay/`, `tests/workers/hibernation.test.ts`, `infra/mirror/`,
`scripts/mirror-conformance.ts`, `docs/relay-profile.md`, `docs/operations.md`.

1. Implement only the documented event kinds, filter fields, AUTH challenge
   semantics, publication responses, REQ/CLOSE/EOSE behavior and limits. Advertise
   unsupported features honestly. Bind AUTH to relay URL/challenge/time and
   re-check read/write authority at historical query and live-delivery boundaries.
   Test cross-instance routing and authorization isolation. Serve NIP-11 metadata
   with actual limitation units and supported features. Instance-specific relay
   paths are allowed when they change behavior; bind AUTH to the exact URL.
   Evaluate NIP-70 author-authenticated protected publication, including its
   constraint on third-party replication/restore. It supplies no membership read
   ACL and does not by itself bind a genesis to its authorized sequencer.
2. Specify a gap-free historical-to-live handoff against a captured journal tip;
   writes during a history query are delivered exactly once or deduplicated by
   identity. Bound history pages, filter count, connection/subscription count and
   live queues. Slow clients close with a resync path rather than unbounded memory.
3. Use hibernating inbound WebSockets with recoverable session attachments and
   persistent authority. Rehydrate subscriptions safely after constructor reload;
   expired/revoked admission cannot survive through an attachment. Outbound
   replication uses bounded batches and closes its sockets. Own the persisted
   retry schedule after Cloudflare alarm automatic retries are exhausted.
4. Pin strfry initially at
   [`4cd3cf6`](https://github.com/hoytech/strfry/tree/4cd3cf64850caf47dda46c2a2abbbf3525a64d10)
   or document and test a deliberate update. Provision retention and read/write
   policies, not only a URL. Verify the actual configured image and authentication
   behavior, including every enabled read/query/reconciliation path. The pinned
   defaults cap normalized events at 64 KiB and WebSocket payloads at 128 KiB;
   the proposed 128 KiB event budget needs explicit event and larger frame limits
   or a reviewed smaller profile. Test exact EVENT framing and encryption expansion.
   If it cannot meet G5's metadata access boundary, stop for a reviewed
   access gateway or alternate relay; write allowlisting is insufficient.
5. Define complete retrieval despite relay query limits and equal timestamps:
   use verifiable predecessor/ID backfill or the explicit retained export format.
   Do not infer a complete prefix from EOSE. Keep any Noseq HTTP export/paging API
   distinct from claimed NIP behavior. Fetch retained definition chunks and
   recovery artifacts as well as journal entries.
6. Distinguish committed, replication pending, mirror acknowledged and independently
   retrieved. Track replication coverage through a contiguous watermark plus
   explicit holes; the highest acknowledged sequence alone is insufficient.
   A successful relay OK is not a perpetual retention guarantee.
   Export and restore a synthetic instance; verify signed bytes by identity.

**Verify:** `npm run test:relay` and `npm run test:mirror` pass against the DO
endpoint and independent pinned relay. Cover AUTH expiry/removal, hibernation,
write/history races, abusive filters, slow readers, same-timestamp paging,
prolonged mirror failure and alarm restart. Then disable the sequencer and
primary, empty the relay test harness cache and retrieve retained signed history,
definition and recovery-artifact bytes from the mirror/export against the known
fixture identities and complete signed prefix. Retain the network trace proving
no primary fallback. This is a retained-byte transport proof; full decryption,
retained-definition loading and projection/outcome reconstruction belong to P6
integration after P5, with the complete A5 result composed in P9.

### P6 — Make client replay and encryption persistence crash-safe

**Depends on:** P2/P3 and the P1 adapter contract for pure/store development;
completed P5 is required for integration and P6 completion. **Paths:** `src/crypto/{adapter,archive}.ts`,
`src/client/{store,vault,replay,pending}.ts`, `tests/client/`,
`tests/recovery.test.ts`, `docs/confidentiality-and-recovery.md`.

1. Separate received events, verified prefix, durable cryptographic state,
   interpreted frontier and disposable presentation cache. Stage crypto ingestion
   and authenticated action/archive retention before atomic persistence. Implement transactional storage
   adapters or a journaled recovery procedure that cannot partially advance MLS
   state while leaving the replay frontier behind. Prove the procedure on restart.
2. Persist a submission's logical identity and randomized encrypted bytes before
   sending. Reuse them until a receipt or explicit rejection resolves uncertainty.
   Recover pending work after tab/browser restart. Coordinate two tabs with
   transactional version checks; a second writer must reload rather than reuse
   stale MLS state or overwrite a pending ciphertext. Enforce one active owner
   for a device MLS state/key package and prove one-time key-package consumption.
3. Apply verified/decrypted/validated actions in Noseq order. Preserve last-good
   UI plus actionable paused status for missing history, key dependencies,
   conflicts and unknown profile. Do not turn `unreadable` or `deferred` library
   states into an ineffective business action. Respect G1's finalized-prefix rule.
4. Implement the G2 recovery archive and export/import verification. Separate
   deleting only projection caches from removing the vault and all cryptographic
   state. Test corruption, rollback to an old archive, wrong recovery credential,
   missing history and interrupted import. Declare limitations when there is no
   independent checkpoint capable of detecting a stale but authentic backup.
   Before any import write, compare trusted owner/genesis and prior checkpoint.
   Quarantine verified input until atomic promotion; conflict or interruption
   preserves all pins, selected app, vault/crypto state, pending ciphertext and
   frontiers. Test a valid foreign archive against a populated existing device.

**Verify:** `npm run test:client` and `npm run test:recovery` cover every atomic
boundary with two devices and two tabs, forced termination, reordered relay
input, malformed ciphertext, partial key state, persisted retries and fresh
rebuild. After P5 completes, disable the primary/sequencer and clear disposable
event/projection caches. Use only the declared G2 recovery material and P5 mirror
or export path to decrypt the promised history, load the retained definition, and
reconstruct canonical state/outcomes at the target frontier. Record no-primary
network evidence; retained fixture-byte equality alone cannot pass this case.
Same authorized prefix/definition/profile produces identical canonical state
and outcomes. Neither cache deletion nor migration silently erases the
only recovery material. No test substitutes a fixed group key for G1/G2.

### P7 — Load unrelated applications and render direct projections

**Depends on:** P3/P6, with P4 provisioning and declared P1 owner/admission
fixtures for the agent creation trial. P8 supplies final onboarding integration.
**Paths:** `src/ui/{host,controls,bindings,svg,geometry}.ts`,
`src/client/agent.ts`, `examples/spatial-board/`, `examples/inventory/`, `tests/ui/`,
`tests/dynamic-apps.test.ts`, `scripts/generate-example-bundles.ts`.

1. Build a trusted generic host with declarative controls, schema-bound action
   submission and adapter selection. Definitions cannot execute arbitrary JS,
   fetch external code, access vault/signers or inject HTML/event handlers.
   Expose typed read-snapshot and submit-action calls through a generic agent
   adapter with the same identity, schema and permission checks as human controls.
   Bound view trees to the pinned profile (initial Atseq view cap 2,048 nodes,
   depth 24); sanitize resource URLs and constrain assets to the retained closure.
2. Define an identity binding from fold state to SVG/D3-compatible JSON, with no
   query file. Define generic geometry attributes over canonical fixed-point
   arrays. Pin scale, division/rounding semantics, attribute layout and comparison
   byte order; reject non-finite or over-limit values. Allocate/transfer presentation
   buffers without exposing mutable aliases to canonical state. Bind Float32Array
   to three.js through this trusted adapter; compare bytes, not GPU pixels.
3. Make the direct-document experiment explicit: the fold maintains populated
   bounded JSON with stable semantic IDs, relationships, values, retained asset
   references and declarative action bindings. Use an identity binding with no
   query that reconstructs the document from another dataset. IDs derive from
   signed creation input or deterministic rules, survive reorder/replay, and
   reject duplicates/dangling targets. Reuse an inert SVG subset and trusted
   Three.js adapters; general glTF import is optional and separately bounded.
   Local camera, hover, animation clocks and GPU pixels never mutate canonical
   state or sign actions. Shared gestures submit quantized data explicitly.
4. Author a collaborative spatial board and an unrelated inventory/count workflow
   entirely in retained manifests/schemas/folds/views/assets. Start the built host
   before generating and loading both bundles. Keep the same generic source and
   bundle hashes; no app-specific import, route, server deployment or rebuild.
5. Add a distinct agent creative trial after host startup, beyond generated
   fixtures. Through documented generic operations the author supplies retained
   source, validates/previews, creates an instance via P4, and submits/inspects
   actions. Exercise identity-dependent refusal and exact retry with synthetic
   participants. Record source/build/deployment hashes, sanitized calls, grants
   and independent authorized replay; preserve original versus repeated runs.
   Preview identity is explicit simulation, never a grant or signed outcome.
   One short-session app and an accumulating workflow test both intended uses;
   neither implies deletion guarantees or proven indefinite service.
6. Keep SQL absent from the projection path. SQLite in the DO remains legitimate
   journal storage. A future database projection can implement another consumer
   without changing the definition/order/crypto proof contract.

**Verify:** `npm run test:ui` compares fixed-point-to-Float32Array golden bytes
across Node and Chromium and checks capability/size violations, including
the generic typed agent adapter.
`npm run test:dynamic-apps` proves both unrelated bundles were created after host
startup, submitted actions through the generic controls, and produced the same
state/outcomes/buffer bytes on authorized clients. Include unchanged server
deployment identity and two independent instances: definitions, actions,
subscriptions, state and crypto material cannot cross between them. Retain before/after hashes,
trace and screenshots; screenshots alone do not prove determinism. Test stable
IDs through insert/update/delete/reorder and replay, missing assets, hostile
bindings and stale targets. Camera/animation changes leave the canonical hash
and log unchanged; a deliberate action changes them through the signed path.
Compare canonical documents, outcomes and buffer bytes across Node/Chromium.
Record whole-document copying, conversion, transfer and renderer resource disposal
separately. If required scenes exceed the existing 128 KiB state cap, stop for a
profile decision; do not silently introduce native typed-buffer folds.

### P8 — Connect invitation-led identity, membership and recovery

**Depends on:** P4/P5/P6/P7. **Paths:** `src/client/{identity,invite,join,recovery-flow}.ts`,
`src/ui/{onboarding,status}.ts`, `src/worker/invites.ts`, `tests/flows/`,
`docs/onboarding.md`, `docs/operations.md`.

1. Create a local Nostr identity automatically after the user chooses a name and
   accepts Join. Keep display identity, application role and device encryption
   state distinct. Provide an encrypted recovery-export flow with restore proof
   before treating recovery as configured. Never require raw secret-key paste in
   the default path. An existing signer is shown only after capability checks.
2. Bind invitations to trusted host origin, immutable genesis, intended authority,
   nonce, recipient or explicitly approved accepting key, requested rights,
   history policy, expiry and use policy in an inviter-signed invitation. Verify
   signatures and bind redemption proof to those values. Store only the needed token verifier server-side;
   prevent secrets leaking into referrers, analytics and server logs. Atomically
   redeem an invitation to the accepting public key, but record join as pending
   until the owner completes the G3 group transition and G2 history delivery.
   Validate Welcome group/credential/recipient binding before activating the UI;
   persist and retry each transition idempotently without consuming another key package.
3. Handle absent owner, expired/used invitation, duplicate redemption, interrupted
   key delivery, relay offline, denied admission, removed membership and resumed
   join. Each has a specific visible state and retry path. Provider choice is
   inherited from verified genesis; participants do not configure relays again.
4. Demonstrate adding a device, losing one device and losing every live device
   using G2's supported policy. If a shared account key is copied, explicitly
   document that one copy cannot be revoked independently. General delegated
   device credentials remain deferred. A supported account/device admission
   model must pass P1; an unfinished Marmot branch-draft External Commit is not
   a default. Do not present key copy as MLS history
   recovery. Passkey-unlocked vaults remain optional until PRF/origin/browser
   support and independent restoration are tested.
5. Remove a participant and exercise the exact admission boundary with live and
   offline clients. New protected content must be unavailable to the removed
   participant; historical content already learned remains available to them.

**Verify:** `npm run test:flows` runs the named join/recovery/removal cases in
fresh browser profiles against the real local Worker and independent mirror.
Assert visible state transitions and cryptographic results, including the owner's
absence and failure/resume cases. Search sanitized traces for seeded synthetic
secret canaries and fail on leakage. A manual flow record confirms the supported
default requires no raw key paste or infrastructure selection.

### P9 — Run the fault matrix and publish the comparative result

**Depends on:** P0–P8. **Paths:** `scripts/{acceptance,benchmark,verify-evidence}.ts`,
`tests/acceptance/`, `fixtures/acceptance/`, `infra/cloud-probe/`,
`docs/{acceptance-report,operations,comparison}.md`, `plans/README.md`.

1. Run the acceptance table below from a clean checkout. Repeat using the actual
   Workers runtime and pinned external mirror. A narrowly scoped synthetic
   Cloudflare deployment probe is a separate execution action: document required
   credentials, disposable resource names, isolation and cleanup before any use.
   Local emulation cannot certify cloud hibernation, quotas or operational cost.
   If no cloud probe is run, label those claims unverified and the deployment
   recommendation conditional; do not mark cloud-specific cases passed.
2. Measure append, retry, cold replay, cache rebuild and direct rendering for
   100/1,000/10,000 events with a fixed bounded state. Record hardware, versions,
   payload/state sizes, latency distributions including cold wake, actual storage
   row writes per action/retry, workload-specific cost estimates, storage bytes, network bytes and
   peak memory. Check that append does not duplicate all previous outcomes and
   that slow consumers/large inputs meet declared bounds. Initial measurements
   establish a baseline, not an invented service-level guarantee.
   Also count entries/signatures checked, decryptions, source bytes served and
   fold evaluations on one-entry catch-up/exact retry. Retain Atseq's 10,000-entry
   p50/p95 append 18.656/39.524 s, Node replay 7.885 s, catch-up 6.591 s and browser
   replay/transfer 15.422 s as a separate local reference, never a Noseq target.
   Reuse P1d's compact record/segment design where proven; its small counters do
   not close this benchmark. Evaluate verified-prefix/authenticated-extension
   reuse only after G1; compare each frontier/state/outcome to full cold replay
   under fork, rollback, restart, missing-source and crypto-control cases. Keep
   any unproven optimization explicit and long-lived use conditional.
3. Test resource boundaries just below/at/above every exposed cap, including
   complete encrypted event size, source closure, live queue and storage quota.
   The expected over-limit result is a specific refusal/pause without partial
   advancement. Independently audit exported signed history and dependency bytes.
4. Publish a comparison answering what another small application inherits,
   which infrastructure must operate continuously, which confidential data and
   metadata each operator sees, onboarding limitations, measured costs and
   unresolved gaps relative to Atseq. If G1/G2 forced a protocol change, explain
   it and its interoperability consequences. Do not claim production security
   from passing a prototype's self-authored tests.

**Verify:** `npm run acceptance` then `npm run verify:evidence` exit 0 for every
required local case and explicitly report the separate cloud probe status.
`npm run benchmark` produces the complete size-series report. Independent review
checks the exact source head, evidence identities, promised history policy and
all acceptance results. Only then mark local prototype stages complete; label
any unrun deployment gate separately.

## Command contracts

P0 has established these names and failing placeholders. Later stages must
fulfil their contracts before claiming a pass. Existing `probe:*` and `verify:*`
scripts are documented in `docs/toolchain.md`; successful bounded probes are not
full-stage acceptance. Run all commands from the Noseq root.

| Command | Required result when its stage is complete |
|---|---|
| `npm ci` | Installs exact lockfile dependencies in a clean checkout |
| `npm run check` / `npm run build` | All targets typecheck and client/Worker build |
| `npm run test:harness` | Missing/skipped required evidence is rejected |
| `npm run test:crypto-feasibility` / `npm run gate:protocol` | G1–G5 vectors and reviewed decision manifest validate |
| `npm run test:protocol` | Node/browser wire and prefix vectors pass |
| `npm run test:runtime` / `npm run test:definition` | Pinned runtime and retained closure corpus passes |
| `npm run test:workers` | Actual Workers storage/concurrency/crash tests pass |
| `npm run test:relay` / `npm run test:mirror` | Profile, hibernation, backfill and independent signed/encrypted fixture-byte retrieval pass; no full projection claim |
| `npm run test:client` / `npm run test:recovery` | Atomic replay, multi-tab and declared recovery policy pass, including full mirror-only decryption/definition/projection reconstruction after P5 |
| `npm run test:ui` / `npm run test:dynamic-apps` | Direct projections and unchanged generic host pass |
| `npm run test:flows` | Named onboarding/removal/loss cases pass |
| `npm run acceptance` / `npm run verify:evidence` | Complete bound evidence for required acceptance cases |
| `npm run benchmark` | Reproducible 100/1,000/10,000-event measurements |
| `git diff --check` | No whitespace errors in the candidate |

## Acceptance evidence and completion

Every result binds the source commit, lockfile, runtime/crypto profile,
application definition, exact frontier, fixture identity and command. No skipped
required test is a pass. This table maps the architecture's nine gates and the
additional security gates to their implementing stages.

| Gate | Evidence | Stages |
|---|---|---|
| A1: New apps use unchanged host | Two unrelated bundles created after host start; unchanged source/build hashes | P7 |
| A2: Same prefix, same result | Equal canonical state, outcomes and presentation-buffer bytes on authorized devices; stable prefix extension under crypto convergence | P1–P3, P6–P7 |
| A3: Delivery is not order | Duplicate/reorder/gap/fork/stale-tip cases; saved retry bytes; no silent rollback | P2, P5–P6 |
| A4: Durable append | Crash windows, concurrent signing, uniqueness and resumed outbox | P4–P5 |
| A5: Independent retention | P5 proves retained signed/encrypted bytes and identities with primary disabled; P6 reconstructs decrypted history/definition/state/outcomes using G2 material; P9 verifies the combined evidence | P5, P6, P9 |
| A6: Recovery is explicit | Cache-only rebuild versus new device, one-device loss and all-device loss; archive trust and FS tradeoff named | P1, P6, P8 |
| A7: Membership has effect | Declared newcomer history, atomic control boundary, removal excludes future epochs | P1, P4, P8 |
| A8: Onboarding is usable | Fresh invite/identity plus absence, expiry, interruption, recovery; no default raw-key paste | P8 |
| A9: Costs and direct rendering | Bounded state, replay and JSON-to-buffer measurements at three log sizes | P3, P7, P9 |
| A10: Protocol honesty | Malicious admitted ciphertext policy, privacy threat table, encoded limits, retained actor proof and relay access profile | P1–P2, P5, P9 |

P0 and P1 probe results exist at the inspected baseline; full application
acceptance remains absent. Implementation is complete
only when every local gate has its required evidence, the cloud-specific status
is accurately labeled, all changed implementation paths are in scope, and an
independent reviewer approves the exact candidate and report. The initial plan was
delivered through request #47. This evidence-based revision is documentation
request #108; its review/landing is separate from implementation commissioning.

## STOP conditions and maintenance

Stop the affected work package and report the failing vector and profile if:

- Marmot convergence can change an already-finalized Noseq outcome, or an adapter
  suppresses valid control events merely to hide that problem.
- The selected archive/recovery design cannot provide the history promised by
  invitations, or requires undeclared server access to decryption keys.
- Cryptographic state cannot be persisted/recovered atomically with its consumed
  prefix and pending submission bytes.
- Membership/removal behavior depends on arrival order, client-local skipping or
  opaque-provider interpretation of plaintext.
- Mirror retention or access behavior differs from G5; a configured URL or relay
  OK is the only evidence of a backup.
- A gate needs an out-of-scope runtime, automatic failover, delegated-device
  protocol or changed confidentiality claim. Write a proposed change and seek
  its normal workroom review before dependent implementation.
- Required validation keeps failing after two reasonable fixes, or code has
  materially drifted from the baseline. Preserve the evidence rather than
  weakening/skipping the test.

Protocol/library upgrades rerun G1–G5 and recovery vectors. Changes to runtime
caps, numeric conversion or source closure produce a new profile and rerun
Node/browser vectors. Storage migrations preserve pending ciphertext and crypto
state before deleting old representations. Operations review must cover expired
credentials, full journals, alarm exhaustion, mirror loss and restore drills.
Future native buffers, SQL adapters, definition activation and device delegation
need their own scoped plans; none is implied by a successful board demo.

## Primary references checked on 2026-09-06

- [Marmot TS pinned candidate](https://github.com/marmot-protocol/marmot-ts/tree/2f60dbb27d284f617ad873ccda568c0f2f07aa79)
  and [Marmot convergence](https://github.com/marmot-protocol/marmot/blob/4a2bc65f8db5866cec3b2a127dedb37818eaf207/protocol-core/convergence.md):
  alpha integration, account-proof capabilities and local settlement versus finality.
- [NIPs pinned source](https://github.com/nostr-protocol/nips/tree/c3fd9af17939316bf6d0d83a5759100f8b0a1bdb):
  NIP-01 event/relay semantics, NIP-42 authentication, NIP-44/NIP-59 encryption
  boundaries and NIP-78's application-data access recommendation.
- [Cloudflare SQLite storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/),
  [execution rules](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/),
  [WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
  and [alarms](https://developers.cloudflare.com/durable-objects/api/alarms/):
  transaction, concurrency, hibernation and retry constraints.
- [Workers test integration](https://developers.cloudflare.com/durable-objects/examples/testing-with-durable-objects/)
  and [known issues](https://developers.cloudflare.com/workers/testing/vitest-integration/known-issues/):
  actual Workers-runtime and WebSocket isolation requirements.
- [Applesauce models](https://applesauce.build/core/models.html) and
  [Nostrify stores](https://nostrify.dev/store/): candidate event/reactive plumbing.
  Adopt one only where useful; neither determines Noseq's authoritative frontier.
- [strfry pinned candidate](https://github.com/hoytech/strfry/tree/4cd3cf64850caf47dda46c2a2abbbf3525a64d10):
  independent retained relay and export/import candidate, subject to G5 conformance.
