---
date: 2026-09-06
status: draft architecture; separate P0 and P1 feasibility work landed; full gates unpassed
origin: discussion of Nostr as a confidential substrate for gitseq-style applications
source_reviewed: 2026-09-07
tracking: "git:sha1:77aeeeb3fa42aeb6babdf961f6397ba73fada68b#git:sha1:0ddf7cdd0daa7e987a036e2cb85201ccce14f9a7"
workroom_genesis: 77aeeeb3fa42aeb6babdf961f6397ba73fada68b
---

# Noseq: confidential declarative applications over Nostr

Noseq explores a framework for small, purpose-specific applications whose
authenticated actions have one verifiable order and whose retained definitions
determine their meaning. Authorized participants decrypt and interpret the
history. A fold may produce a database, directly renderable JSON, geometry
buffers, or another useful result.

The proposed first deployment is a shared Cloudflare Worker service with one
Durable Object per application instance. Each object combines an opaque
sequencer, durable journal and primary Nostr relay. An independent relay retains
replicated events. A generic client loads app definitions, manages identities
and encryption, folds events and renders results.

This note consolidates the design discussion and research. It distinguishes
proposed contracts from candidate implementations and open questions. It does
not describe a shipped application. The [conditional implementation plan](../plans/001-confidential-application-prototype.md)
records P0 completion and separately commissioned P1 investigations. G1–G5
remain unpassed. The [final Atseq assessment](2026-09-07-atseq-final-assessment.md)
updates this draft with completed Atseq evidence and current Noseq boundaries.

## 1. Intent and lineage

Atseq demonstrates the folder-over-log model over ATproto: runtime-loaded
schemas, bounded JSONata behavior, retained views, signed intentions and a
separate sequencing authority. Its public retained substrate does not meet all
the confidentiality requirements motivating noseq.

GitSeq, Tailapps and atseq are architectural precursors. They establish useful
distinctions between ordering and interpretation, publication and activation,
retained inputs and disposable projections. They impose no wire compatibility
or runtime dependency on noseq. GitSeq requests track repository work only.

The initial source review used atseq at
[6477b73](https://github.com/generalbusiness-ai/atseq/tree/6477b73f3be27880fd592f7015b4c7dcb1eda74a)
and gitseq at
[33f6995](https://github.com/generalbusiness-ai/gitseq/tree/33f69956167115d7cc3235b6b1864ed904f2802a).
See their [atseq architecture](https://github.com/generalbusiness-ai/atseq/blob/6477b73f3be27880fd592f7015b4c7dcb1eda74a/notes/2026-09-06-atseq-architecture.md)
and [GitSeq design](https://github.com/generalbusiness-ai/gitseq/blob/33f69956167115d7cc3235b6b1864ed904f2802a/notes/2026-08-05-gitseq-design.md).

The current reuse baseline is Atseq [e5856bd](https://github.com/generalbusiness-ai/atseq/tree/e5856bd9c538b35c2dce4e87d51800f1eaa090f9),
including independently landed S5/S6 corrections. The dated assessment preserves
exact evidence, measured prefix costs and limits; it does not transfer Atseq wire
contracts or establish Noseq confidentiality.

The experiment is worthwhile if an app definition can inherit confidential
collaboration, durable replay and direct rendering from a small shared host.
Creating another application should load new content into an existing runtime,
without rebuilding its client or deploying application-specific server code.

## 2. Responsibilities and trust

```text
trusted generic client
  identity vault + encryption + bounded interpreter + renderer adapters
          |
          | signed submission containing an encrypted action
          v
routing Worker
          |
          v
per-instance Durable Object
  sequencing key + ordered journal + primary relay + publication outbox
          |
          | replicate unchanged signed encrypted events
          v
independent relay(s)

authorized clients read either relay:
  verify complete prefix -> decrypt -> validate and fold -> projection/UI
```

The sequencer chooses order and enforces transport admission. Relays retain,
retrieve and distribute events. Folders determine application effects. The
client owns decryption and presentation. One deployment may perform several
roles, but their contracts remain separate.

There is one order per application instance, with no global application order.
The same definition may have many independent instances. Cross-instance atomic
transactions are outside the first prototype.

The provider holds the sequencing key and observes submission metadata. It does
not receive application decryption keys in the proposed opaque-sequencer mode.
It can censor, delay or create conflicting signed histories. Comparing
conflicting histories can reveal equivocation; signatures cannot prevent it
or guarantee availability. The client host is trusted with plaintext and
signing access. App definitions and renderers receive narrower capabilities.

## 3. Definitions and the runtime

Preserve the useful shape of atseq's authoring layout:

```text
manifest.json          purpose, runtime, ordering requirement and bindings
schemas/*.json         actions, state and projection interfaces
folds/*.jsonata        deterministic behavior
queries/*.jsonata      optional derived results over state
views/*.json           retained view descriptions and bindings
assets/*               referenced local resources
```

The manifest roots a complete immutable dependency closure. Pin the runtime
profile and every source dependency by content identity. Discovery of a current
manifest cannot silently replace the definition used to interpret old events.
Retain old definitions across activation boundaries. Definitions and assets
may themselves be confidential and require encrypted distribution. Every reader
must judge the same exact authenticated closure, isolated from extra local files.
Definition-admission caps, encrypted chunk/frame caps and aggregate evidence
transport caps are separate. Missing/corrupt/untransportable evidence pauses
verification; a transport cap cannot fabricate a semantic invalidity. Retention
must cover referenced assets and the recovery material for the promised interval.

Lexicon can remain a locally bundled validator for the first comparison; it
does not require a PDS merely to validate supplied schemas. JSON Schema is also
a candidate. Choose the authored schema language deliberately rather than
coupling a schema migration to a transport experiment.

Retain bounded evaluation, explicit input/output validation, and a pinned
numeric and value profile. Ambient time, randomness and external I/O enter as
attributed actions instead of hidden evaluator inputs. A rendering primitive
cannot expose signing keys or arbitrary network access. Human actions pass
through explicit controls; agents use explicit typed adapter calls.

Definition activation and state migration need their own rules. The intended
model is an authorized activation at an exact log boundary, interpreted under
the preceding authority. A prototype may initially keep the definition fixed.
Plan 001 fixes the definition for v0 and tests refusal of activation/upgrades.
Future activation must be governed by the preceding authority at N, commit
definition/state/frontier atomically, and affect N+1. Staging or preview has no
canonical effect. Old queued bytes stay unchanged; replacement is explicit new
work. The completed Atseq activation does not authorize this extension in Noseq.

## 4. Fold results can be the interface

The projection contract must support multiple useful forms:

| Projection | Consumer |
|---|---|
| JSON objects and arrays | Direct D3 data binding or trusted SVG rendering |
| Scene descriptions and typed buffers | three.js or another graphics adapter |
| Materialized database | Ad hoc queries, joins, reporting and indexes |
| Other bounded values | Audio, simulation, domain-specific inspection or agents |

SQLite and other materialized databases are valuable caches and query engines.
Some applications have no query requirement: the fold result already is the
data structure that drives the interface. An identity selector should be
enough to expose it. Multiple projections can consume the same authorized
history, and a projection may retain auxiliary state beyond what is visible.

Atseq already folds into JSON. Its named queries are expressions over captured
state, rather than database queries. Its present admission profile allows only
safe integers and plain JSON, so fractional geometry and `Float32Array` are
outside that profile. [Folder](https://github.com/generalbusiness-ai/atseq/blob/6477b73f3be27880fd592f7015b4c7dcb1eda74a/src/runtime/folder.ts),
[runtime profile](https://github.com/generalbusiness-ai/atseq/blob/6477b73f3be27880fd592f7015b4c7dcb1eda74a/docs/runtime-profile.md)

For the first geometry demonstration, canonical fixed-point coordinates may
be converted into `Float32Array` by the presentation adapter. If the fold itself
must emit typed buffers, specify another runtime profile: rounding, byte order,
buffer layout, non-finite values, limits and replay comparison. This is a
required design choice, not a reason to make every projection JSON or SQL.

The direct-document hypothesis is a fold-maintained populated UI, SVG-compatible
document or scene: stable semantic object IDs, already-bound values, retained
assets and declarative action bindings. A separate dataset/query is optional.
P7 must test an identity-bound document after creation, updates, child reordering
and restart. Reuse a bounded inert SVG vocabulary and trusted Three.js adapters;
glTF is a candidate retained asset format, not a required new importer. IDs must
come from signed input or deterministic derivation, not runtime-generated object
IDs. Duplicate/dangling targets and missing assets need explicit validation.

Camera movement, hover, animation clocks and GPU pixels remain local presentation.
A shared movement requires an explicit signed action with quantized coordinates.
Rendering and loading never sign; an action binding confers no permission. Compare
canonical documents and pinned buffer conversion bytes, not screenshots. Retain
the integer fold profile and state cap; native typed-buffer folds remain deferred.
Atseq S6 queries folded state to export SVG and has not validated this direct
document or 3D hypothesis.

Projection state, interpretation outcomes and frontier advance atomically.
Every result identifies its definition and exact verified prefix. Missing
history, missing decryption material or invalid runtime output pauses progress;
none becomes a fabricated ineffective action. Projections can be discarded and
rebuilt when the retained history and its required recovery material remain
available. UI caches and durable cryptographic state have different lifecycles.

## 5. Nostr's contribution and the framework's contribution

Nostr supplies signed event envelopes, relay publication and subscriptions,
identity conventions, and an ecosystem of storage, signer and encryption
components. It does not establish noseq's application order, completeness,
business schemas, definition activation or recovery policy.

Relay timestamps and arrival order cannot select the canonical fold order.
`EOSE` marks the end of a relay's historical response, not a proof that the
whole application history is present. Addressable events may discard previous
versions, so they cannot be the sole retained source of a replayable log.
[NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md)

The current NIP-78 describes addressable kind `30078` for custom app data and
normal kind `78` for multiple items. It may help an initial private app profile;
a broadly interoperable framework should define its event meanings explicitly.
NIP-89 provides handler discovery, without defining an executable app manifest
or declarative UI. Exact noseq kinds, schemas and wire encoding remain to be
specified. [NIP-78](https://github.com/nostr-protocol/nips/blob/master/78.md),
[NIP-89](https://github.com/nostr-protocol/nips/blob/master/89.md)

The proposed noseq contribution is the binding between retained definitions,
confidential actions, verifiable order, deterministic interpretation and
arbitrary projections. Existing reactive libraries can support that binding;
they do not establish it automatically.

## 6. Confidentiality and retained history

Distinguish three possible service profiles:

| Profile | Boundary |
|---|---|
| Private relay | Authentication and access rules restrict readers; the operator is trusted with any plaintext it stores. |
| Encrypted payloads | Clients encrypt content before submission; visible routing and admission metadata still needs a declared policy. |
| Encrypted groups | Membership changes govern future encryption epochs, device admission and permitted history sharing. |

NIP-42 authentication and NIP-29 private groups provide access-control
components. NIP-44 encrypts payloads; NIP-59 wraps events to obscure inner
content and much metadata. NIP-44 alone provides neither forward secrecy nor
post-compromise security. Routing, connection and timing observations remain
relevant even when content is encrypted.
[NIP-42](https://github.com/nostr-protocol/nips/blob/master/42.md),
[NIP-29](https://github.com/nostr-protocol/nips/blob/master/29.md),
[NIP-44](https://github.com/nostr-protocol/nips/blob/master/44.md),
[NIP-59](https://github.com/nostr-protocol/nips/blob/master/59.md)

Marmot, with MLS group encryption over Nostr, is the main group-security
candidate in the initial design. P1a has since shown the pinned protocol/library
pair incompatible, and P1b–P1d investigate a distinct ordered MLS binding; see
[crypto feasibility](../docs/crypto-feasibility.md). No production profile is
adopted. Evaluate existing implementations before new group cryptography. Pin a compatible
protocol/library pair and test signer support, persistence, admission, removal
and recovery. An advertised messaging capability is not evidence that the
application replay contract works. [Marmot/MDK](https://github.com/marmot-protocol/mdk),
[marmot-ts](https://github.com/marmot-protocol/marmot-ts)

Forward secrecy and indefinitely recoverable application history need an
explicit reconciliation. Once old decryption material is erased, a fresh device
cannot simply download ciphertext and replay everything. Choose a history-sharing,
encrypted-archive or snapshot policy. The archive and its recovery keys then
form a separate confidentiality boundary. A snapshot must name its provenance
and trust policy; accepting one is not equivalent to independently replaying
all original actions.

Removing a participant excludes them from future epochs under the chosen
protocol. It cannot withdraw data already decrypted. Distinct visibility within
an application may require separate encrypted streams or groups. UI filtering
does not enforce that boundary. A server-side folder or agent processing
plaintext is an authorized recipient and needs explicitly granted access.

Archive import verifies an existing trusted owner/genesis and prior checkpoint
before any pin, vault, crypto state, outbox or app selection is changed. A
self-consistent file does not authenticate its owner or latest head. First import
requires the declared external trust input; failed or interrupted import preserves
existing state. Retaining an owner-attested historical control interval must be
distinguished from independently replaying all MLS controls.

The first opaque sequencer may know submitter public keys, instance identifiers,
payload sizes and ordering metadata. Hiding submitter identity is a separate
profile, not a property to claim merely because gift wrapping is available.

## 7. The smallest sequencer

Use one logical writer, one sequencing key and one durable journal per instance.
The sequencer accepts a signed transport envelope containing encrypted action
bytes. It checks outer admission and limits, chooses a position and retains the
original payload. Authorized folders later check inner authorship, action
schema and application permission.

Conceptually, a sequencer-signed entry contains:

```text
application/genesis identity
sequence number
previous entry identity
stable submission identity
encrypted action envelope
```

The wire spike must define canonical bytes, domain separation, proof retention
and event identities using existing cryptographic implementations. Preserve
actor attribution separately from the sequencer's proof. In particular,
NIP-59's inner rumor is unsigned: durable actor-proof requirements must be
specified at the application layer or retain the required enclosing evidence.
Do not assume every decrypted object is independently actor-signed.

The submission path is:

1. Validate outer signature, destination, submitter admission and size bounds.
2. Look up the stable submission ID. Return its original receipt for an exact
   retry; reject reuse with different content.
3. Construct and sign the next entry against the current predecessor.
4. Atomically save the entry, retry index, local tip and publication obligation.
5. Return a durable receipt, then publish the exact saved event to relays.

Clients persist and retry the same envelope. Randomized encryption must not
turn a transport retry into another logical action. Concurrent async signing
must not escape the serialized append boundary. A crash after commit but before
reply or publication resumes from the persisted entry and outbox.

A well-formed action can be sequenced yet ineffective after decryption and
interpretation. Transport refusal, uncertain receipt, application rejection and
interpretation failure remain distinct. No generic business fold runs inside
the opaque sequencer.

Each entry commits to its predecessor. A second head record need not be
atomically published beside every entry: signed tips can be discovered, and
clients fetch missing predecessors before advancing. Knowing whether an
observed tip is current remains a separate freshness question. Publication to
ordinary relays supplies no cross-relay transaction or automatic replication.

Atseq measured 18.66 s median confirmed append, 6.59 s one-entry catch-up and
15.42 s browser replay/transfer at 10,000 entries in one local run despite tiny
state. These are not Noseq/Cloudflare results. Separate serving, verification,
decryption, fold, storage and rendering costs. Preserve cold replay as an oracle
when testing verified-prefix plus authenticated-extension reuse. Noseq P1d already
explores segmented history with small work counters; full-scale and production
storage evidence remain P4–P9. Local watchdog failures pause without semantic
advancement, and long replay requires its own measured operational budget.

## 8. Infrastructure: Durable Objects and relays

Deploy a routing Worker and an `AppSequencer` Durable Object class once. Allocate
one instance per live application, with SQLite-backed durable storage. Different
instances scale and can be placed separately; each application still has one
logical ordering authority. Cloudflare manages activation and persistence.
[Durable Objects](https://developers.cloudflare.com/durable-objects/concepts/what-are-durable-objects/),
[storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)

The smallest proposed object also serves the primary Nostr relay: history reads,
authenticated subscriptions and live delivery over its retained journal. That
relay implementation is work for the prototype, not an existing DO feature.
Implement the selected Nostr protocol surface with conformance tests and clear
kind/size limits. Use distinct relay hosts where necessary for per-instance
routing, respecting NIP-01 endpoint semantics instead of inventing invisible
path-dependent relay behavior.

Server-side WebSocket hibernation keeps client connections open while the
object sleeps. Outbound WebSockets cannot hibernate. Replication should use a
durable outbox and bounded delivery connections, closing them after a batch.
Alarms run at least once and have bounded automatic retries; the publisher
needs its own persisted retry/backoff schedule for a prolonged outage.
[WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/),
[alarms](https://developers.cloudflare.com/durable-objects/api/alarms/)

| Relay option | Use |
|---|---|
| Combined per-app DO | Smallest managed deployment; implement a bounded primary relay over the sequencing journal. |
| Nosflare | Existing Cloudflare relay using Workers, D1 and regional Durable Objects; more infrastructure, less relay code to start from. |
| strfry | Existing relay process with embedded LMDB, durable writes, streaming, reconciliation and import/export; suitable independent mirror. |

Sources: [Nosflare](https://github.com/Spl0itable/nosflare),
[strfry](https://github.com/hoytech/strfry).

The preferred comparison is the combined DO plus one independent strfry mirror.
The mirror may serve many instances and must accept the chosen events and
retention policy. Verify read access requirements for the selected relay;
write allowlisting or an advertised authentication NIP alone does not establish
confidential historical and live queries. If required metadata protection is
unavailable, use an appropriate private access boundary or another relay.

Distinguish "durably sequenced" from "replicated to the configured mirror".
A mirror outage leaves replication pending. A sequencer outage leaves existing
mirrored history readable while new committed actions wait. Keep independent
exports and verify recovery rather than treating another endpoint as a backup
without evidence of retained bytes.

Attachments and large source bundles may use encrypted blobs on Blossom or R2
behind a Blossom-compatible service. An R2 bucket does not itself implement
Blossom. Pin retained blob identities, verify bytes after retrieval and keep
their decryption material within the application's history policy.
[Blossom](https://github.com/hzrd149/blossom),
[R2](https://developers.cloudflare.com/r2/)

## 9. Provisioning and per-application opt-in

Separate an application's abstract requirement from an instance's service
selection:

| Declaration | Content |
|---|---|
| Definition | Required ordering/runtime profile, such as `single-sequencer-v1`. |
| Signed instance genesis | Initial definition, sequencing public key, service locator, initial authority and confidentiality policy. |
| Initial service configuration | Primary/mirror relay locations, retention and payload limits. |

Protocol/profile names here are illustrative. The implementation must specify
their identities before publishing interoperable applications.

Creation proceeds as follows:

1. The creator selects a provider, normally the generic host's configured
   default, and submits an authenticated provisioning request.
2. The provider reserves a private service allocation and returns the instance
   sequencing public key, submission endpoint and primary relay endpoint.
3. The creator signs the genesis binding the definition and authority. The
   provider verifies and permanently binds the reservation to that genesis.
4. Invitations carry the genesis identity and routing hints. Joining clients
   verify the anchor and use its authorized sequencing key and configured
   services automatically.

The creator initializes the encrypted application group on an authorized
device. Service provisioning receives public admission configuration and
encrypted artifacts; it does not require the group's decryption keys.

Use an immutable genesis identity for verification. Keep provider allocation IDs
and Cloudflare object IDs as implementation details. There is no requirement
to make a provisioned allocation ID equal a not-yet-created genesis hash.

Application authors declare the ordering requirement. Creators choose services.
Participants accept that choice through the invitation. The visible operation
can be "Start this app with provider X", provisioning sequencing, retention,
delivery and access configuration together.

Listing a mirror URL does not provision storage or cause replication. Adding a
managed mirror includes arranging access and retention and enabling publication.
Later locator changes can be authorized service updates. Replacing sequencing
authority requires an explicit handover at a log position, with rules for
excluding the former writer. Automatic failover and provider migration are
outside the first prototype.

## 10. Identity and onboarding

The desired joining experience is: open an invitation, choose a name, approve
Join, and see the application. Infrastructure choices already made by the
creator should not be repeated by each participant.

| Concern | Meaning |
|---|---|
| Identity | A key signs attributable actions; a display name supplies a label. |
| Membership | Application authority grants that identity particular permissions. |
| Encryption state | The device can decrypt specified groups, epochs and history. |

A Nostr key proves control of a key, not a legal name or organizational role.
Invitation policy or an external identity process supplies the needed human
context. Reusing a public key links contexts wherever that key is visible;
the host should support separate identities where that matters.

The generic host owns the identity vault and recovery experience. A new user
can create a local key automatically; an existing user reuses a chosen identity
or connects a NIP-07 browser signer or NIP-46 remote signer. Those signer paths
are optional first-use dependencies. A remote signer also introduces an online
dependency and its own custody boundary.
[NIP-07](https://github.com/nostr-protocol/nips/blob/master/07.md),
[NIP-46](https://github.com/nostr-protocol/nips/blob/master/46.md)

After signed invitation acceptance, application authority grants membership and
an authorized participant completes encrypted group admission. Relay admission
alone cannot grant decryption. The first implementation must state whether an
existing device must be online. Immediate unattended admission needs a reviewed
invitation/key-delivery design; it is not supplied by the opaque sequencer.

For native clients, use platform key storage with explicit recovery. For a
browser host, a passkey-unlocked encrypted vault is an attractive candidate.
A passkey is not automatically a Nostr signing key. WebAuthn PRF can support
vault encryption where implemented; compatibility, origin binding, device sync
and recovery need tests. App definitions and renderer adapters must not receive
the vault's keys. [WebAuthn extensions](https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API/WebAuthn_extensions)

Signing-key backup alone may not restore historical decryption or MLS group
state. Account backup/recovery must cover the chosen encryption and archive
policy. Browser cache deletion must not accidentally delete the only durable
cryptographic state. A lost device, adding a device, losing every device and
recovering from backup are distinct onboarding/recovery cases.

QR pairing can transfer an identity to another device. Copying a shared key
does not permit independent revocation of one copy. Separate device credentials
and an authorization relationship are a later protocol choice if that boundary
is required. Agent identities should likewise have explicit, limited access;
agents use the same application contracts through typed host adapters.

## 11. What Buzz contributes

Buzz demonstrates a Nostr-based workspace with signed human and agent actions,
relay-enforced community/channel access, search and workflow infrastructure.
Its documented server search/workflow path can read relevant application
content. Its product model therefore does not by itself prove noseq's opaque
provider model. [Buzz architecture](https://github.com/block/buzz/blob/main/ARCHITECTURE.md)

Its onboarding additions are substantial and reusable as design references:

| Addition | Evidence and relevance |
|---|---|
| Identity lifecycle | Local generation/restoration, OS keyring integration and missing/locked-key handling, with other storage paths also present. [Source](https://github.com/block/buzz/blob/main/desktop/src-tauri/src/app_state.rs) |
| Invitation service | Owner/admin invitation creation, expiry/use controls and signed redemption admitting the joining public key. [Source](https://github.com/block/buzz/blob/main/crates/buzz-relay/src/api/invites.rs) |
| Encrypted identity backup | NIP-49 backup creation and verification through an explicit user flow. [Source](https://github.com/block/buzz/blob/main/desktop/src-tauri/src/commands/identity.rs) |
| QR device pairing | Encrypted secret transfer with a short code confirmed on both devices; carried as a draft NIP-AB in Buzz's repository. [Specification](https://github.com/block/buzz/blob/main/crates/buzz-core/src/pairing/NIP-AB.md) |
| Hosted-service onboarding | A hosting account is linked to desktop Nostr identity by signed proof. [Support](https://block.github.io/buzz/support.html) |

These are product and protocol integration above basic Nostr. NIP-AB is a
draft carried by Buzz, not a claim of universal ecosystem adoption. Its key-copy
pairing explicitly lacks revocation of an already transferred key. No passkey
recovery capability was established by the reviewed onboarding paths.

Noseq should borrow the invitation and pairing experience while specifying its
own encrypted group admission and history recovery. A hosting account, relay
membership and a user's cryptographic identity remain separate.

## 12. Ecosystem reuse candidates

| Component | Proposed role and boundary |
|---|---|
| [Applesauce](https://applesauce.build/core/models.html) | First candidate for event plumbing and reactive custom models emitting arbitrary projection values. Noseq supplies deterministic ordering and interpretation. |
| [NDK](https://github.com/nostr-dev-kit/ndk) | Broader alternative for relay/signing/session integration, caches and React/Svelte clients. Select where it reduces integration work. |
| [Nostrify storage](https://nostrify.dev/store/) | Common event interface over memory, relays and SQL stores; useful for adapters and test infrastructure. |
| [Nostrify schemas](https://nostrify.dev/schema/) / [schemata](https://github.com/nostrability/schemata) | Zod and JSON Schema validation of Nostr structures. Application semantics and schema versions remain authored contracts. |
| [Marmot/MDK](https://github.com/marmot-protocol/mdk) / [marmot-ts](https://github.com/marmot-protocol/marmot-ts) | Candidate encrypted group layer. Verify version alignment, signer capabilities, persistence and history recovery. |
| [Blossom](https://github.com/hzrd149/blossom) / [nsite](https://nsite.run/) | Blob and static-site distribution. Retention, confidentiality and runtime trust remain explicit. |
| [Vector](https://github.com/VectorPrivacy/Vector) / [Webxdc](https://webxdc.org/docs/) | Embedded interactive-app precedent. Webxdc packages ordinary executable web apps; it does not supply noseq's bounded declarative interpreter. |

The current marmot-ts documentation names additional signer requirements for
full interoperability and lists encrypted-media work as in progress. Vector's
current README names NIP-17 direct messages and Concord communities; older
accounts of its encryption stack are not evidence of current behavior.

The source review found useful layers, but did not establish a ready-made
combination of immutable app definition, bounded runtime, confidential retained
actions and deterministic arbitrary projections. Candidate libraries were
reviewed through source and documentation, not installed or interoperability-tested.

## 13. Proposed comparative prototype

Use an encrypted collaborative spatial board as the first application. Multiple
clients move or edit objects concurrently. Folds produce directly renderable
JSON and a geometry-buffer presentation. A second unrelated definition loads
after the generic host starts, proving that application behavior is in retained
content rather than host-specific code.

The working recommendation is:

- Retain the atseq definition/evaluator structure where it fits.
- Use one explicit opaque sequencer per instance.
- Prototype the primary relay in the same DO and retain an independent mirror.
- Start with Applesauce as client plumbing; investigate Marmot before committing
  to an encrypted group and recovery contract.
- Keep SQL projections optional and prove a direct UI projection early.
- Give the generic host responsibility for identity, invitations and recovery.

Observable acceptance gates should cover:

1. Two unrelated definitions loaded without rebuilding the running host.
2. Concurrent actions yielding the same outcome and projection at the same
   verified frontier on authorized clients.
3. Duplicate/reordered delivery, unchanged retries, missing predecessors and
   conflicting histories, with correct pauses and no duplicated actions.
4. Crashes after journal commit but before response/publication; resumable
   delivery and honest sequencing/replication status.
5. Relay outage and independent retrieval from the configured mirror.
6. Projection-cache deletion and rebuild using explicitly retained history and
   recovery material; account recovery tested separately.
7. New-member admission with a declared history policy and removal excluding
   future epochs. Previously learned content remains previously learned.
8. First-use invitation flow, another-device setup and loss-of-device recovery,
   without requiring users to paste raw keys or select infrastructure again.
9. Measured replay, state limits and direct-rendering costs for the chosen
   profile, including the JSON-to-buffer boundary if used.

Before implementation, settle the confidentiality profile, proof and envelope
format, archive/recovery policy, definition retention, membership authority and
minimum interoperable relay surface. Automatic sequencer failover, arbitrary
cross-instance transactions, general device revocation and broad runtime
evolution can remain later work.

The prototype should be judged by how much infrastructure a small application
inherits, and by whether the confidentiality and replay tests remain simple
enough to operate. Nostr integration alone is not the acceptance criterion.
