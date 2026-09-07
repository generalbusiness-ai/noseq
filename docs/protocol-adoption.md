---
title: Proposed protocol selection and detached decision verification
date: 2026-09-07
status: P1e proposal and development contract; D1–D9 are not adopted
---

This capsule selects what the P1 evidence would support for an explicit later
decision. It selects ordering `noseq/protocol-candidate@1` and recovery
`noseq/segmented-recovery@2`. Existing v1 encrypted bytes and their 115 required
regressions remain unchanged. The v1 `G2-LONG-HISTORY` pending label describes
the old small archive; v2 supplies the separately reviewed segmented proposal.
Neither publication of this capsule nor a successful development command
adopts it or activates a full gate.

The machine contract is `fixtures/crypto/closure/profile.json`. It binds the
existing profile files, exact provider/internal API sources, runtime and lock
identities through the recursively checked evidence. V2 selects root kind 8800
and recovery kinds 8801–8806; original signed submission/order/admission/proof
bytes retain their ordering kinds. Legacy recovery routes are disabled on v2
roots. These remain experimental kinds, with no NIP registration claim.
The incompatible Marmot specification/candidate pair stays a STOP: this is a
Noseq binding to the pinned MLS 1.0 lower API, not Marmot interoperability.

| Proposed decision | Choice and practical consequence |
| --- | --- |
| D1 | Use immutable signed ordering with the pinned lower MLS API. Marmot branch selection and withdrawal are not inputs. |
| D2 | Supply complete genesis-to-sealed-T newcomer history only after the declared closure is eligible and retained. Ordinary opaque order receipts promise their order alone. Unsealed or absent suffixes remain explicit. |
| D3 | Trust the immutable owner to attest historical encrypted control validity and public contexts. Clients independently check original signatures, contiguous coverage and actual action/opening correspondence; they do not independently replay old MLS Commits. |
| D4 | Retain message openings and separately keyed history grants/vaults. This weakens forward secrecy for promised history. Copied old keys and plaintext remain usable; rewrapping does not revoke them. |
| D5 | Keep immutable owner authority and no owner transfer. An old owner vault has stronger continuation/signing capabilities than a shared grant. The account secret alone is not the declared recovery package, and changing a wrapping key does not cure owner-signing compromise. |
| D6 | Require an online owner device for membership changes. Invalid private content can stall the common last-good prefix; no local skip or repair is promised. |
| D7 | Authorize reads at the gateway's highest verified retained F. A removal hidden in an unseen suffix can permit newly retrieved old history. Known controls restrict subsequent sends; old cursors cannot lower authority. No globally current membership claim follows. |
| D8 | Accept infrastructure visibility of membership, identities, existence, timing and size. Trust the client host with in-use keys/plaintext. The actual local signer is supported; NIP-07/46 capability simulations establish no external interoperability, and passkey onboarding is not promised. |
| D9 | Keep exact experimental kinds, source/provider/internal API/runtime pins and joint resource limits. Bounded P1 observations remain separate from production persistence, deployment isolation, throughput and UI acceptance. |

Rejecting D3–D7 calls for a new design and probe commission, not an override
flag. Public relays, a globally current read service and a 128-entry instance
lifetime were rejected for this candidate. SQL, application interpreters,
Float32Array projections and UI remain later stages. TLS, a trusted-host supply
chain and private backend deployment remain production conditions; local
HTTP/WebSocket tests do not establish them.

The existing limits apply together: 65,536 entries and nonempty segments,
128 entries or 16 MiB per segment, 16 MiB grant/vault, 256 MiB aggregate required
signed retention and 64 MiB outbox, plus encoded event/frame/page/index limits.
Exact closure eligibility can refuse earlier. The 10,000-small-action encoding
estimate is not a throughput benchmark or a promise to fit every maximal action
and arbitrary export count. A full requested export can walk its selected keys;
ordinary receive/sealing does not regenerate the accumulated prefix.

## Selected client reconstruction contract

Two new cases run in actual Node and Chromium:
`offline-membership-churn` and `selected-profile-staged-state`. Their four
results follow all 115 earlier cases, producing 119 crypto/baseline results.
The separately enumerated authority suite is additional to that count.

The offline case spans more than four real epochs with additions/removals of
other devices and interleaved encrypted applications. Future input first waits;
reopened clients consume the missing signed prefix in varied batches and with
duplicates. A retained member catches up; another consumes its actual removal
and fails future crypto. Empty Commits alone do not satisfy this case.

The compact local fixture checkpoint is `noseq/compact-client@1`. It contains
the root/context and founder/public starting state, exact record count/tip,
bounded accepted/pending MLS state and signer binding, and at most 64 observed
future-position IDs plus the fork halt. Records and their openings remain in
immutable per-record files or IndexedDB. Reopening scans the declared records,
verifies original signatures/openings and recomputes outcomes/logical indexes;
it does not trust a saved projection or embed accumulated history in the private
checkpoint. Reconstruction is explicit asynchronous work. Inherited legacy
`restart()` and `publish()` refuse; a v2 publication marker is unsupported.

The capsule is trusted local private fixture state, not an untrusted shared
archive or a new encrypted backup format. The shared archive/vault has its
separate authenticated recovery contract. The fixture has no process-crash,
fsync, IndexedDB transaction or atomic storage-promotion claim. It does test
before/after staging, interleaved input, winning/losing echo, Welcome release or
disposal, both admission-half orders, exact retries and retained gap/fork state.

## Signed decision graph

Keep these identities detached and acyclic:

`S/A/E → D → AD → Q → P → R → AR ≤ F`

S is the exact source commit/tree and exhaustive changed artifact map. A is its
decision artifact. E names S and the complete recursively checked observation
files. D is a GitSeq proposal resting on A, with an exact signed manifest
attachment. AD is the root's effective ratification of D. Q is the review request
resting on D, AD and every exact artifact; P is the independent review promise;
R is the actual guarded approved review at S, with strict signed JSON text
binding D and AD, manifest/profile/evidence digests and exhaustive decisions,
cases and artifacts. AR is the review requester's effective ratification of R.
All causal and strict sequence orderings are checked, not just timestamps.

D states a conditional selection: D1–D9 apply to the named profile/source only
with the independent approved review and every verification predicate satisfied.
GitSeq records AD immediately; this does not invent a pending ratification
status. No duplicate root adoption after R is needed. Replacing AD requires
fresh Q/P/R/AR. A later express operational commission remains necessary for
activation, and any changed validator/gate source requires its own exact
source/evidence/review bindings. No excluded hash region blesses future code.

The strict decision manifest has schema, source commit/tree, exact path/blob/
SHA-256 artifacts, selected profile and dependency/runtime identities, evidence
index digest, exhaustive required case IDs, and exact D1–D9 values. It contains
no future review or frontier IDs. The strict review content adds D, AD and its
human findings/summary; the export locates those existing acts. Unknown or
duplicate fields, extra/missing cases and unrecognized decision values refuse.

## Offline authority verification boundary

The development command receives a trusted policy separately from an untrusted
export. The policy pins genesis, root/reviewer/implementation fingerprints,
source/profile/case/decision expectations, the GitSeq executable and an external
minimum signed frontier. Bundle-supplied names, keys or booleans cannot set these
anchors. Synthetic policies are explicitly test-only and cannot activate gates.

Use a complete ordinary Git bundle containing the named signed sequence and
required source objects, plus every referenced raw evidence file. Import into
fresh isolated local repositories with hooks and network disabled. Pinned
`gs attach`, full `gs verify` and `gs status --server - --json` must agree on
genesis, exact F and depth. The local authority fold supplies effective acts,
historical authority, surviving `RatifiedBy`, independent review bindings,
retirements and source-world status; the wrapper does not invent those rules.

The separately built verifier is clean GitSeq
`d630554a7ba7d99c5f95eb77e1dfa7fd1f41637a`, Go 1.27.0, CGO disabled and
`-trimpath`, with module verification and exact binary/build provenance retained.
The shared dirty `bin/gs` is neither used nor relabelled. An actual public export
through Noseq #875 measured 1,184,444 bundle bytes, 2,933 Git objects and
5,212,874 unpacked object bytes; fresh attach/audit/local fold agreed at #875
while all network access was denied. This establishes compatibility, not D1–D9
adoption. The full command must report missing genuine adoption for this room.

The finite envelope caps are in the machine profile: 32 MiB bundle, 20,000 Git
objects/128 MiB unpacked Git bytes/16 MiB per object, 10,000 sequence depth,
1 MiB manifest, 16,384 evidence files/512 MiB aggregate/32 MiB per file,
240-byte safe relative paths and bounded subprocess time. Paths cannot escape,
be symlinks or carry executable hooks/configuration. Byte/count limits are
checked before expensive parsing/import where available, and decompression is
also bounded. These caps bound the audit tool, not the runtime's history quota.

The validator checks actual signing authority and surviving effective D/AD/R/AR,
strict Q/P/artifact/head bindings, independent principals, exact source and raw
evidence closure, and conflicting active selections. Ordinary reasoning
staleness is reported; retired decisions/reviews and superseded source worlds
refuse. Rehashed author-generated evidence cannot substitute for a signed
independent R attesting its exact digest.

F must descend from an independently trusted minimum. A valid old F can precede
a later revocation, and must fail when that revocation is inside the required
frontier. No offline bundle proves global freshness or discovers a hidden
first-contact sibling without an external witness. The output says valid at F
and names its exact bindings; it is a diagnostic, not a bearer approval token.
All full gate commands remain nonzero throughout P1e, including after synthetic
authority success. Root adoption and activation are outside this commission.
