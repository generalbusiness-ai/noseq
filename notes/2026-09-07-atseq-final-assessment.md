---
date: 2026-09-07
status: documentation assessment; separate P0/P1 investigations landed; G1–G5 unpassed
noseq_baseline: e5f1b276a04c7849791749db5763f4f5c0c5991c
atseq_evidence: e5856bd9c538b35c2dce4e87d51800f1eaa090f9
current_noseq_baseline: 499dc13e3ef05f8a30f844df225dc17ce4162297
tracking: "git:sha1:77aeeeb3fa42aeb6babdf961f6397ba73fada68b#git:sha1:ae8cb5e84bff85e1cf775b2624ef061c07d4846a"
rests_on:
  - git:sha1:fa8d62ed900d7697380a68652abb3e45d950a677#git:sha1:a0bd5a116dc784dd032bded6e9a46db2e254f2f0
  - git:sha1:fa8d62ed900d7697380a68652abb3e45d950a677#git:sha1:423afa90978dcce34a87443cfb86665b585f5c29
  - git:sha1:77aeeeb3fa42aeb6babdf961f6397ba73fada68b#git:sha1:d8b852f1e8f68829e6961a5f533bf9e7fc167d03
  - git:sha1:77aeeeb3fa42aeb6babdf961f6397ba73fada68b#git:sha1:6bf6a19dfd2911584bc7444a15b8dec0ee1e92c7
---

# Apply the completed Atseq spike to Noseq

The completed Atseq spike supports keeping Noseq's retained definitions,
canonical actions, verified order and bounded client fold. It does not validate
confidential replay over MLS, direct fold-maintained scenes, or efficient
long-lived histories. This assessment updates the conditional
[prototype plan](../plans/001-confidential-application-prototype.md) and
[architecture](2026-09-06-noseq-architecture.md); it adopts no crypto profile,
implements no runtime and authorizes no deployment. Separate requests have
commissioned and landed Noseq P0 and bounded P1 investigations during this
assessment; their status is recorded below.

The previous Noseq design and plan are preserved as independently reviewed
history. Their current publication is `e5f1b276a04c7849791749db5763f4f5c0c5991c`,
whose tree matches reviewed candidate `e106f95af01a6c6014bdea243dcebdec56fb50c5`.
The prior coordinator confirmed all work landed and released ownership before
this revision began in an isolated checkout. The original design-review and
supplementary-disposition files remain unchanged.

## Concurrent Noseq work, inspected on 2026-09-07

This revision was refreshed onto `499dc13e3ef05f8a30f844df225dc17ce4162297`.
P0 landed at `3321e70fcf42fbdb89f20db3f425ec3bc431c2d9`; its
[toolchain record](../docs/toolchain.md) reports 12 actual Node/workerd/Chromium
cases and hosted execution. P1a–P1d are independently reviewed, landed
investigations: [crypto feasibility](../docs/crypto-feasibility.md),
[proposed wire](../docs/protocol-v0.md),
[recovery](../docs/confidentiality-and-recovery.md),
[relay profile](../docs/relay-profile.md) and
[segmented recovery](../docs/segmented-recovery.md).
P1d's review records 115 actual tests and 44 evidence/closed-gate checks.
These results were inspected here, not rerun. Hosted baseline CI proves P0 only.
All G1–G5 remain unpassed; P2–P9 and deployment have not been commissioned.

P1a disproved compatibility of the originally pinned Marmot protocol/library
pair: protocol proof v2 uses component 0x8009; the candidate implements legacy
v1 extension 0xf2f1. Raw arbitrary-digest signing is a legacy-library requirement,
not an inherent requirement of current Marmot. P1b–P1d investigate a distinct
Noseq ordered MLS binding and actual message openings. Its recovery still trusts
owner-attested historical MLS controls; old grants/openings and owner vaults
retain capabilities. Named-prefix gateway authorization can expose old history
after an unseen removal. These are proposed trust choices requiring adoption,
not consequences that Atseq's public replay can validate.

P1d already avoids cloning accumulated records on ordinary receive and uses
independently keyed 128-entry/16 MiB intervals, a compact owner vault and exact
retention reservations. Its 32/64/128-entry work counters and 132-entry recovery
case are small-workload evidence. They are neither the planned 10,000-entry
benchmark nor production crash-atomic storage. This is distinct from Atseq's
unimplemented verified-prefix optimization and must be reused rather than
reimplemented blindly. A separately commissioned P1e closure investigation was
in progress at this source baseline; it has no landed results claimed here.

## Evidence inspected

Atseq `main` and `origin/main` were clean and equal to
[`e5856bd9c538b35c2dce4e87d51800f1eaa090f9`](https://github.com/generalbusiness-ai/atseq/tree/e5856bd9c538b35c2dce4e87d51800f1eaa090f9).
All links in this section pin that completed evidence rather than a moving
branch. Local source is `/Users/hughpyle/play/atseq` on the assessment machine.

- [Completion note](https://github.com/generalbusiness-ai/atseq/blob/e5856bd9c538b35c2dce4e87d51800f1eaa090f9/notes/2026-09-06-atseq-spike-completion.md):
  exact S0–S6 reviewed candidates and landings, independent findings and limits.
  S6 candidate `e60e603ce2f57fd0a3a85ef39c024f18533513a9` landed at
  `a68466608bc1f269d7296a5ed7d6d613d6cbd303`; documentation candidate
  `3f2901fdbbfb040cbeb9c789694a205151cefe51` landed at the evidence head above.
- [Result note](https://github.com/generalbusiness-ai/atseq/blob/e5856bd9c538b35c2dce4e87d51800f1eaa090f9/notes/2026-09-06-atseq-spike-results.md),
  [acceptance manifest](https://github.com/generalbusiness-ai/atseq/blob/e5856bd9c538b35c2dce4e87d51800f1eaa090f9/experiments/acceptance.json)
  and [logs](https://github.com/generalbusiness-ai/atseq/tree/e5856bd9c538b35c2dce4e87d51800f1eaa090f9/experiments/acceptance-logs):
  retained run completed 13/13 commands; the independent reviewer reproduced
  283 full-suite and 12 archive-gate tests and mutation-tested required fixes.
- [Definitions](https://github.com/generalbusiness-ai/atseq/blob/e5856bd9c538b35c2dce4e87d51800f1eaa090f9/docs/definitions.md),
  [evolution](https://github.com/generalbusiness-ai/atseq/blob/e5856bd9c538b35c2dce4e87d51800f1eaa090f9/docs/evolution.md),
  [archives](https://github.com/generalbusiness-ai/atseq/blob/e5856bd9c538b35c2dce4e87d51800f1eaa090f9/docs/archives.md),
  [interaction](https://github.com/generalbusiness-ai/atseq/blob/e5856bd9c538b35c2dce4e87d51800f1eaa090f9/docs/interaction.md)
  and [runtime profile](https://github.com/generalbusiness-ai/atseq/blob/e5856bd9c538b35c2dce4e87d51800f1eaa090f9/docs/runtime-profile.md):
  bounded retained inputs, exact retry, atomic activation and import boundaries.
- [Authoring record](https://github.com/generalbusiness-ai/atseq/blob/e5856bd9c538b35c2dce4e87d51800f1eaa090f9/experiments/agent-authored/mending-circle-tool-desk/README.md)
  and [verification](https://github.com/generalbusiness-ai/atseq/blob/e5856bd9c538b35c2dce4e87d51800f1eaa090f9/experiments/agent-authored/verification.json):
  22 adapter calls, five signed entries and 51 unchanged source/build hashes.
  The original creative run preceded corrections; the final run reused its
  source with an updated runtime profile. It is not evidence of a second fresh
  invention under the final runtime. Parent-captured hashes are inspectable
  evidence, not an independent observation of the author's process.

This assessment independently checked all 13 retained-output hashes, 13 log
hashes, 912 per-report source hashes and the 51 before/after host/build hashes.
It did not rerun acceptance or replay. `spike:acceptance` overwrites retained
evidence; `spike:report` regenerates the original snapshot before later review
annotations. Neither command was run. Reproductions must use isolated copies
and retain a separate run identity.

The independent approval events in Atseq's workroom are:

```text
S5: git:sha1:fa8d62ed900d7697380a68652abb3e45d950a677#git:sha1:fc90064e2a7373e65df91bc7110533a8d94c13ae
S6: git:sha1:fa8d62ed900d7697380a68652abb3e45d950a677#git:sha1:168677fe088151adc064955e1b4224ab268ce229
Closeout: git:sha1:fa8d62ed900d7697380a68652abb3e45d950a677#git:sha1:2f05adbb7edf0b8831b076d3f1dcee0255c0c5c2
```

## Measured transfer and proposed changes

These are planning dispositions. Confidence is high that the listed Atseq
observations occurred; whether their proposed Noseq adaptations work remains
subject to G1–G5 and P0–P9. Effort describes the additional prototype work.

| ID | Observation and implication for Noseq | Plan destination | Priority / effort / risk |
|---|---|---|---|
| AT-01 | Readers need the same exact authenticated input set. Verify the signed closure independently of extra local cached files; encryption adds sender/account proofs and history-key dependencies. An opaque sequencer cannot validate this plaintext closure. | G1/G2/G4, P2/P3/P6 | P1 / M / high |
| AT-02 | Exact retry survives lost replies and definition changes. Retain logical action identity, original randomized encrypted submission and sequencer receipt separately; permission changes cannot silently manufacture replacement work. | G3/G4, P2/P4/P6/P8 | P1 / S / high |
| AT-03 | Definition admission and evidence transport have different jobs. Separate aggregate plaintext definition/asset bounds, encrypted chunk/frame bounds and replay-source transport budgets. An over-limit transport is unavailable, never a manufactured invalid application outcome. | P1/P3/P5/P9 | P1 / M / high |
| AT-04 | A conflicting archive must fail before any device state changes. Preserve genesis, highest checkpoint, vault, crypto state, pending ciphertext and selected app across failed/interrupted import. First-import trust and history coverage require explicit policy. | G2, P6/P8 | P1 / M / high |
| AT-05 | Watchdogs must accommodate real replay without changing semantics. Local timeout/allocation failure pauses atomically; do not port Atseq's broad activation exception classification. | P3/P6/P9 | P1 / S / medium |
| AT-06 | Repeated full-prefix serving/verification dominates growing histories even with a tiny state. Keep cold replay as oracle; specify authenticated extension reuse and measure work counts before recommending long-lived use. | P2/P4/P5/P6/P9 | P1 / M–L / high |
| AT-07 | Failed acceptance must replace stale success visibly, with logs and hashes. Keep immutable run directories, started status, terminal failure and incomplete crash state; status derives from a complete required-case inventory. | P0/P9 | P1 / S / low |
| AT-08 | Agent authoring through public adapters is distinct from generated fixtures. Test creation, validation, preview, provision, participation and replay after host startup, with identity-sensitive rules and grants. | P4/P7/P8/P9 | P2 / M / medium |
| AT-09 | Compatible activation worked in Atseq but did not validate migrations, runtime upgrades or confidential grant transitions. Keep Noseq's definition fixed; record future entry-boundary requirements and refusal tests now. | P1/P2/P3; separate future request | P2 / S now / high later |
| AT-10 | Atseq's S6 SVG queries folded data; it does not validate a fold-maintained UI or 3D scene. Make the direct populated-document idea a bounded, falsifiable P7 experiment. | P3/P7/P9 | P2 / M / medium |

## Canonical meaning, retention and authority

A Noseq action must bind its genesis, pinned definition/profile, actor proof,
logical ID and payload using the G4 wire profile. Retain the exact enclosing
encrypted submission and sequencer proof. A receipt proves sequencing, not
business effectiveness, crypto readability, latest-head freshness or mirror
retention. Authorized clients validate/decrypt the same signed order and crypto
dependency set before committing state, outcomes and interpreted frontier.

Atseq's DID/P-256, PDS, XRPC and CAR/CBOR wire choices do not transfer by default.
Reuse its bounded evaluator and source-validation lessons behind Noseq's own
versioned profile. Nostr serialization, MLS epoch/account proof, confidential
source identifiers and encrypted retention remain Noseq gates. GitSeq and
Tailapps are precursors, with no runtime dependency or compatibility obligation.

The closure includes manifests, schemas, folds, optional queries, views and
assets. Local extra files cannot repair an undeclared dependency. Every accepted
semantic source must remain recoverable for its promised history interval;
transient use does not justify evicting acknowledged history. Keep encrypted
bytes and required recovery proof/key material under the declared G2 custody
policy; a public plaintext content hash can reveal equality or a known asset.
No external resource may enter interpretation or silently fetch plaintext-bearing
URLs during rendering. Shared aggregate caps can still be exhausted by an
authorized participant; refusal/pause and preserved evidence must be explicit.

Separate the creator, sequencer, transport submitter, authenticated inner actor,
application role, MLS member/device, recovery recipient and any future activation
authority. Possession of one authority does not grant another. A render binding
may advertise an action but cannot authorize it. Human controls and agent calls
use the same validation, permission, identity and durable-retry path. An agent
that sees confidential content is an authorized recipient, including its model
or tool service; the initial authoring trial uses synthetic content and no new
delegation protocol. Preview uses an explicit simulated actor context and cannot
be mistaken for a signed outcome or grant.

For future activation, staging/import/preview has no canonical effect. A proposed
control act must be authorized under the preceding definition/authority, compare
the expected current definition, retain its exact candidate closure and commit
new definition/state/frontier atomically at N; N+1 uses the new definition.
Offline old-definition submissions preserve their original bytes. Replacing one
requires explicit new work with a new logical identity. These are future design
requirements only. The first prototype must continue to refuse activation and runtime upgrades.

## Prefix cost and the next experiment

The retained [Node measurements](https://github.com/generalbusiness-ai/atseq/blob/e5856bd9c538b35c2dce4e87d51800f1eaa090f9/experiments/performance.json)
and [browser measurements](https://github.com/generalbusiness-ai/atseq/blob/e5856bd9c538b35c2dce4e87d51800f1eaa090f9/experiments/browser-performance.json)
show the cost despite canonical state of only 26–28 bytes:

| Entries | Confirmed append p50 / p95, s | Node cold replay, s | One-entry catch-up, s | Browser replay + transfer, s |
|---:|---:|---:|---:|---:|
| 100 | 0.174 / 0.186 | 0.087 | 0.075 | 0.155 |
| 1,000 | 1.460 / 1.490 | 0.811 | 0.646 | 1.355 |
| 10,000 | 18.656 / 39.524 | 7.885 | 6.591 | 15.422 |

This is one Apple M5 Max/64 GiB local run, Node 26.8.1, official PDS 0.5.31 over
loopback. Nine individual confirmations per size use nearest-rank quantiles;
signed setup batches are excluded. Node replay excludes per-entry projection
file fsync. Browser 153.0.8010.12 used a cold worker per size, possibly warm
browser cache, and includes transfer/returned state. Browser RSS sums processes
and may count shared pages more than once. These are neither Noseq measurements
nor Cloudflare capacity/pricing predictions.

Repeated linear prefix work suggests quadratic cumulative work as a history
grows, but this small series does not prove an asymptotic model or isolate every
cost. Noseq should record bytes served, entries/signatures checked, decryptions,
fold evaluations, durable writes and allocations separately. A tiny fold result
does not make serving, verifying, decrypting or retaining history constant-cost.

The proposed optimization retains a verified prefix identified by exact
genesis/head, profile/definition and crypto state, then authenticates only its
extensions. Cached state is local evidence of prior verification, not a new
trusted snapshot format. Fork/rollback, changed/corrupt checkpoint, missing
source and crypto convergence must remain visible. Cold replay remains available
and must yield identical state/outcomes/frontiers and presentation bytes. Atseq
has not implemented this optimization. Noseq may evaluate it only after G1
establishes stable interpretation; the plan must report a slow full-prefix
baseline honestly if extension reuse is not proven. Long-lived use remains
conditional on evidence, without inventing a latency SLO.

## Hypothesis: the populated document is the fold result

P7 will test a bounded canonical JSON document containing stable semantic object
IDs, already-bound values, object relationships, retained asset references and
declarative action bindings. It may be an interactive UI, an SVG-compatible
document, or a scene for a trusted Three.js/WebGL adapter. Auxiliary business
state is allowed; a separately materialized dataset and query file are optional.
The required experiment must render through an identity binding, with no query
that reconstructs the document from a separate dataset.

Use existing formats where their contracts fit:

- [SVG 2](https://www.w3.org/TR/SVG2/) supplies vector document vocabulary.
  Select a bounded inert subset and explicit host-owned actions; accepting SVG
  never grants scripts, event-handler strings, external resources or foreign HTML.
- [Three.js BufferGeometry](https://threejs.org/docs/pages/BufferGeometry.html)
  consumes attributes such as positions, indices and colors. Convert canonical
  fixed-point JSON into presentation-owned buffers under the pinned adapter.
  [Object3D](https://threejs.org/docs/pages/Object3D.html) supplies a scene object
  model; runtime IDs and mutable objects are not canonical application identity.
- [glTF 2.0](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc)
  is a candidate retained scene/asset interchange format, not an action log or
  permission system. P7 need not implement a general glTF importer. Any selected
  subset/extension and transitive asset closure need bounds and decoder review.

Those primary format sources were checked on 2026-09-06. They support reuse
possibilities, not a tested Noseq integration or an adopted serialization schema.

Stable IDs originate in signed creation input or deterministic derivation and
survive replay, updates and child reordering. Duplicate IDs, dangling references,
cycles outside the allowed tree, missing assets and stale action targets need
defined validation. A binding identifies a declared action and target with
bounded parameters. A user gesture or typed agent call creates the intent;
rendering, loading an archive and local animation do not sign actions.

Canonical semantics include semantic positions, labels, values and permissions.
Local camera motion, selection, hover, animation clocks, interpolated transforms
and GPU pixels are disposable presentation unless an explicit action records a
shared change. A drag commits quantized canonical coordinates through the normal
action path. GPU simulation must not feed silent canonical state. Compare replayed
document/state/outcomes and pinned conversion bytes, not camera frames or pixels.

Retain the integer-only fold profile and its 128 KiB state bound initially.
Pin fixed-point scale, overflow/rejection, rounding, traversal order and buffer
encoding. Do not solve an oversized scene by silently raising caps or introducing
native typed-array fold values. Measure whole-document copy/validation, buffer
conversion/transfer and object/GPU resource disposal separately from prefix
replay. A failed P7 experiment is useful evidence, not permission to weaken G1/G2
or force a database into every application.

## Acceptance additions and residual limits

Plan 001 maps AT-01–AT-10 into its existing gates. Retained evidence must prove
two unrelated apps authored after host startup, a distinct agent creative trial,
two-instance isolation, exact retry and identity-dependent refusal, offline
reconstruction with the promised recovery material, and populated-document
equivalence after edits and restart. One short-session app and one accumulating
workflow test intended lifetimes; neither claims automatic deletion, indefinite
availability or successful long-term operation from a short trial.

Every run records started status before execution, command/exit and case results,
logs, source/build/lockfile/profile/fixture/definition/frontier identities and
result hashes. Interrupted or failed runs remain visible beside later success.
Mutation cases must fail with the expected reason at trust, closure, failure
classification and evidence boundaries; a nonzero exit alone is insufficient.

Atseq still has first-import file trust with no unpin flow; authorized closure
exhaustion can make sync unavailable; some 503 and exact rejection reasons lack
tests; host restore stops at the first incompatible old-profile app; catchable
transient activation faults can become invalid; CLI pins require app and genesis
together. These limitations guide Noseq's tests and status language; they are
not Noseq behavior to inherit. Production authentication, private data, delegation,
deployment, migrations and runtime upgrades were outside Atseq's spike.

Not audited here: cryptographic library internals, current deployment services,
production security, Noseq runtime correctness by execution, or new performance
runs. Historical Noseq review records remain unchanged; the current plan records
the incompatible candidate and landed investigations. A successful documentation
review closes this revision only. Existing implementation requests retain their
scopes; later stages require their explicit gates and commissioning.
