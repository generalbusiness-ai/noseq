---
date: 2026-09-06
status: supplementary architecture review assessed as planning input
reviewed_at: 2554c582db730cd3d64490970a573eab1463672e
report: "git:sha1:77aeeeb3fa42aeb6babdf961f6397ba73fada68b#git:sha1:6032716a8718ead72fd6830e9f0f8ffb346c984b"
---

# Supplementary architecture review and dispositions

A second `noseq-reviewer` session filed report #60 after report #50 had been
accepted and the first plan candidate was under review. Both reports refer to
the same immutable architecture and workroom request #46. This document records
how the additional report affects [Plan 001](001-confidential-application-prototype.md).
It is the coordinator's assessment, not a rewritten reviewer verdict.

The original signed report and its complete attached review/fact sheet remain
in the GitSeq sequence. In an attached clone they can be read with:

```sh
git show 6032716a8718ead72fd6830e9f0f8ffb346c984b:attachments/review
```

Report #60 calls the architecture unready for detailed implementation planning
until five decisions are settled. We accept the underlying prerequisite risks.
Plan 001 addresses them through P1's mandatory decision/probe gates, which must
pass before production protocol/runtime integration. The current deliverable
is therefore a detailed **conditional** handoff with an executable feasibility
stage, not a claim that the architecture already works. Failed gates lead to a
reported stop and a reviewed design change. Neither report's acceptance adopts
its recommended cryptography or authorizes a deployment.

## Finding dispositions

The `N` identifiers below belong to report #60. Its `G1`–`G10` labels are local
to that report; they are not Plan 001's G1–G5 identifiers.

| Finding | Assessment and implementation disposition |
|---|---|
| N1: Testable confidentiality | Accepted. P1 must write an adversary-by-asset table including network observer, provider/primary/mirror, removed or malicious member, compromised host/device and archive recipient. Content, definition, identity, membership, existence, timing and size each need a declared visibility policy. P5/P8/P9 test it. |
| N2: History versus forward secrecy | Accepted. G2 covers members offline beyond the retained MLS window, newcomers and device loss. It must choose authenticated archive or explicitly trusted snapshot coverage before client implementation. The proposed static content-key shortcut is not adopted; future-epoch exclusion and its exact key rotation cannot be weakened to make a demo pass. |
| N3: Signed wire, retries and sizes | Accepted as a contract gate. G4/P2 retain proof closure and three identities, test exact persisted retries and measure every encoding layer. A universal 24 KiB action limit and mandatory external blob service are not established; see source checks below. P3's bounded retained chunks remain a valid candidate. |
| N4: Membership authority | Accepted. G3 fixes owner-signed public control records and their exact relationship to encrypted membership. Both remain independently verified. Transport refusal and sequenced-but-ineffective actions stay distinct; the suggestion that every post-removal submission must be appended is not adopted. |
| N5: Bounded relay surface | Accepted. P5 additionally advertises its selected limitations through NIP-11, allows behavior-changing instance paths, and evaluates NIP-70 with its actual scope. Configured strfry must pass real read/write/retention tests; neither stock defaults nor protected events establish per-instance private reads. |
| N6: Geometry semantics | Accepted. P3 retains integer canonical state; P7 converts through a pinned trusted adapter. Canonical state and buffer bytes are both compared. Byte comparison is a deliberate additional check; GPU-pixel equality is excluded. |
| N7: Projection capability boundary | Accepted. P7 validates adapter schemas, treats labels as text and rejects executable or external-resource bindings. Hostile strings/assets and size limits are tested. |
| N8: Stale definitions | Accepted with v0 scope. The definition is fixed. G4/P2 must specify transport refusal versus deterministic inner mismatch behavior; stale/foreign definitions cannot silently replace retained source. Activation and the broader Atseq migration rule remain deferred. |
| N9: Invitation/device state | Accepted. P1/P8 use an online owner, explicit pending states, idempotent Welcome delivery and declared history. Adding a device cannot rely on unfinished Marmot multi-device wire definitions. Missing all qualifying recovery material is reported as unrecoverable. |
| N10: Equivocation detection | Accepted. P2/P5/P6 pin prior checkpoints, compare conflicting signed tips and pause without automatic trust reset. Detection requires observing conflicting evidence; it is not guaranteed by the presence of a mirror alone. |
| N11: DO lifecycle/resources/cost | Accepted as tests and measurements, with qualified platform claims. P4 preserves transaction/output and restore invariants; P5 bounds attachments, sockets and retries; P9 measures cold wake, actual row writes and costs for the selected workload. We do not assume four billed rows per action, universal cost dominance or a request-rate guarantee. |
| N12: Executable gates/minimum deployment | Accepted. P0 defines scripts and hashed evidence; P9 composes them. Authenticated reservation/genesis provisioning remains in P4 because per-application opt-in is part of the requested comparison. A separate CLI executable is not needed: P7 supplies a generic typed agent adapter. |
| N13: Current ecosystem alignment | Accepted. P1 explicitly compares pinned Marmot library/protocol surfaces, transport bindings, account proofs and device paths. Applesauce remains replaceable plumbing. A failed MLS probe does not automatically switch to a static key or NIP-44 profile. |

## Source checks and refinements

The following primary checks were performed while reconciling report #60.
They qualify recommendations where a fact sheet mixes protocol requirements,
relay defaults and proposed design choices.

**Relay endpoints.** NIP-01 permits paths that change relay behavior. P5 may use
an instance path with actual instance isolation and URL-bound AUTH; separate
hostnames are not required just to distinguish instances. The architecture's
“where necessary” wording is retained as draft history.
[NIP-01](https://github.com/nostr-protocol/nips/blob/c3fd9af17939316bf6d0d83a5759100f8b0a1bdb/01.md)

**Protected publication.** NIP-70 can require the event's own author to authenticate
when publishing a protected event. It does not map a genesis tag to the authorized
sequencer, prohibit every other event author or enforce reader membership. A
third-party replicator cannot simply republish a protected sequencer event to a
conforming relay without the required author authentication. G5 must decide
whether that tradeoff fits direct sequencer replication, export and restore.
[NIP-70](https://github.com/nostr-protocol/nips/blob/c3fd9af17939316bf6d0d83a5759100f8b0a1bdb/70.md)

**Relay information.** NIP-11 provides limitation fields for message/content size,
subscriptions, filters and authentication-related policy. Advertise the actual
tested surface, including byte-versus-character units. Retention remains a
separate explicit contract; a capabilities document is not a retention proof.
[NIP-11](https://github.com/nostr-protocol/nips/blob/c3fd9af17939316bf6d0d83a5759100f8b0a1bdb/11.md)

**Encoded sizes.** The pinned strfry configuration sets normalized event size to
65,536 bytes and WebSocket payload size to 131,072 bytes. Plan 001's proposed
128 KiB event profile therefore requires deliberate configuration, including
larger framing capacity, or a reviewed smaller profile. It is not compatible
with those defaults by assertion. NIP-44 uses stepped padding buckets, not
uniform rounding of every input to the next power of two. The selected MLS and
Noseq envelopes may differ again. G4 measures exact worst-case encoded bytes;
a generic 24 KiB plaintext ceiling cannot substitute for that test. Definition
chunking is specified and tested before deciding whether an external blob
service is required. [strfry configuration](https://github.com/hoytech/strfry/blob/4cd3cf64850caf47dda46c2a2abbbf3525a64d10/strfry.conf),
[NIP-44](https://github.com/nostr-protocol/nips/blob/c3fd9af17939316bf6d0d83a5759100f8b0a1bdb/44.md)

**Mirror reads.** The same pinned configuration documents both restricted read
kinds and an option requiring the authenticated public key in a filter's author
or recipient set. Thus it is too strong to say the configuration says nothing
about read semantics. That still does not establish Noseq's current per-instance
membership boundary or prevent alternate query paths bypassing it. P5 verifies
the actual source/configuration and all enabled query paths before accepting a
private-mirror claim. A private access boundary or alternate relay remains a
reviewed fallback. [strfry configuration](https://github.com/hoytech/strfry/blob/4cd3cf64850caf47dda46c2a2abbbf3525a64d10/strfry.conf)

**Marmot version and devices.** The pinned protocol marks its multi-device
feature a branch draft, with unfinished wire definitions unsuitable for interop.
A compatibility claim cannot be based on an older README's general description.
P1 must test actual account-proof, transport and device-admission surfaces from
the pinned pair, and name any Noseq-specific binding. No draft external-commit
flow is silently implemented as an adopted standard. A scoped supported device
model must be proven or that gate stops. [Marmot multi-device](https://github.com/marmot-protocol/marmot/blob/4a2bc65f8db5866cec3b2a127dedb37818eaf207/features/multi-device.md),
[Marmot application payloads](https://github.com/marmot-protocol/marmot/blob/4a2bc65f8db5866cec3b2a127dedb37818eaf207/foundation/application-messages.md)

## Additional acceptance requirements

Plan 001 incorporates the following explicit additions from this assessment:

- G1/G2/G3 test an existing member offline beyond the crypto retention window,
  protocol/library version mismatch and unsupported device paths.
- G4/G5 test complete EVENT-frame expansion against configured relay limits;
  a 128 KiB normalized event cannot be assumed to fit a 128 KiB frame.
- P5 serves truthful NIP-11 metadata, tests distinct instance paths, evaluates
  protected-event publication/restore and exercises all enabled mirror read paths.
- P9 reports cold-wake latency, actual storage writes and workload-specific cost
  estimates. Cloud claims require the separately identified cloud evidence.

These additions do not weaken the original design findings or PLAN-01's corrected
stage order. The resulting exact source head receives a fresh independent plan
review before landing.
