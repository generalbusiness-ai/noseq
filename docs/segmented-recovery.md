---
title: Segmented full-history recovery candidate
date: 2026-09-07
status: P1d executable feasibility proposal; independent review tracked in GitSeq; no adoption
---

This is the separately commissioned successor recovery experiment to the small
P1c archive. It preserves every ordered entry through a named sealed checkpoint,
including controls, stale entries, refusals and duplicates. It does not change
the existing v1 bytes or remove its 102 required tests. The ordering and MLS
binding stay pinned; recovery has a new signed root and explicit domain
`noseq/segmented-recovery@2`. All G1–G5 commands remain closed.

## Root, types and exact bytes

Use canonical sorted-key compact JSON, unsigned safe integers, strict fields,
canonical base64, lowercase 32-byte hex IDs, and the existing event/signature,
UTF-8, depth and context validation. No implicit version fallback is allowed.
The new root names the existing ordering profile separately from this recovery
profile. It commits instance, immutable definition, owner and sequencer. Its ID
is the genesis component of every original ordering proof and recovery object.
Original actions/submissions/order/admission still use their existing v1 kinds
and exact validators with this genesis; a v2 reader validates the v2 root first.

| Normal experimental kind | Purpose |
| --- | --- |
| 8800 | New root, signed by the owner |
| 8801 | Encrypted-object manifest, signed by the owner |
| 8802 | Exact encrypted transport chunk, signed by the owner |
| 8803 | Full-prefix checkpoint, signed by the owner |
| 8804 | Checkpoint-bound grant/vault locators, signed by the owner |
| 8805 | Small signed NIP-44 grant delivery, signed by an authorized owner device |
| 8806 | Exact prepared-retention reservation plan, signed by the owner |

These values are absent from the inspected [pinned NIP registry](https://github.com/nostr-protocol/nips/blob/c3fd9af17939316bf6d0d83a5759100f8b0a1bdb/README.md).
They are private experiment values, not registered or interoperable NIPs. Except
the root's single domain tag, tags are exactly `[noseq,domain]`, `[h,genesis]`,
`[i,instance]`, `[d,definition]`. Protected NIP-70 tags are refused unchanged.

The checked TypeScript schemas and machine profile name all exact fields.
Signed payloads repeat `profile` where their independent parsing needs it.
Hash domains distinguish plaintext cores, metadata and key identities. All
object purposes share bounded framing but have exact purpose-specific semantic
checks; using a grant as a segment or a segment as a definition fails.

## Acyclic identity and custody graph

1. A segment BodyCore contains only its interval's original signed ordered
   entries with exactly paired message-specific openings, and its before/after
   public states. The first interval includes the owner-signed founder binding.
2. Segment metadata commits context, purpose, ordinal, first/last positions,
   predecessor/tip IDs, previous manifest, counts, before/after state hashes,
   plaintext hash/length, ciphertext length, independent key ID and nonce.
   Its `checkpoint` is null. Metadata's domain-separated hash is `metaId`.
3. AES-256-GCM encrypts the canonical core with that metadata/domain as AAD, a
   fresh random 32-byte key, 12-byte nonce and 128-bit tag. Split ciphertext
   into exact 16 KiB chunks (only the last may be shorter). Each signed chunk
   binds `metaId`, index/count and bytes. No chunk names a later manifest.
4. The owner signs metadata, `metaId`, ordered chunk IDs and ciphertext hash
   in a manifest. Nonempty intervals link backwards by exact manifest ID.
5. One independently encrypted immutable definition core retains the salted
   definition closure. Its manifest is reused; definition bytes are not repeated
   in segments. Definition metadata has zero range/counts and no checkpoint.
6. A requested full export prepares GrantCore: context, last segment manifest,
   definition manifest, exact `[segmentManifest,key]` pairs and definition key.
   It contains no future keys or private MLS/vault state. Generate a fresh grant
   key for each new full grant; never extend a previously distributed grant.
7. VaultCore contains context, segment head, GrantCore hash/key, exact accepted
   MLS state, final public state, account/device/leaf binding and private signer
   keys, with `pending:null`. It contains no event/opening/outcome history.
8. Sign a checkpoint committing segment head/count, coverage start 1/end T,
   original tip, application/plaintext totals, final public-state hash,
   definition descriptor, GrantCore hash and VaultCore hash. Its increasing
   counter/previous checkpoint are owner assertions, not proof of freshness.
9. Encrypt grant and vault separately under independent keys with metadata/AAD
   bound to the now-existing checkpoint. Sign their locators afterward. The
   checkpoint does not name these later ciphertext IDs, avoiding a cycle.
10. An authorized owner device signs an 8805 event containing a small NIP-44
    payload bound to context, recipient, checkpoint, locator and grant key.
    Verify the entire outer event and expected sender before decryption. This
    follows the signed-context obligation in [pinned NIP-44](https://github.com/nostr-protocol/nips/blob/c3fd9af17939316bf6d0d83a5759100f8b0a1bdb/44.md).

Account attestation and owner-device delivery use distinct synthetic keys.
Checkpoint-signing authority alone does not derive random history keys. A
device that holds a delivery key can decrypt its own corresponding captured
deliveries; that capability is explicit. Newcomers receive only a grant key.
The all-device-loss package consists of independently trusted root/checkpoint,
all declared segment/definition/grant/vault objects and locators, plus the
separately retained vault key. No lost live client object is an input.

## Verification and retained trust

Discover descriptors backwards into a bounded compact index, rejecting cycles,
duplicates, wrong roots/owners/contexts, unknown versions and excess counts
before fetching bodies. Replay forwards one segment at a time. Require first
position 1, genesis predecessor, consecutive ordinals and positions, exact
previous manifest/entry IDs, before/after states and all checkpoint totals.
Verify every original order/submission/admission and every required real
sender-data/content AEAD opening, MLS signature and account/action/leaf binding.
An indexed lookup gives exactly one opening to each non-stale application and
none to a control/stale entry. A bounded global logical map spans segments:
identical actions are duplicates; conflicting actions under one logical ID
halt. Recompute outcomes rather than trusting an exported result array.

The owner still attests encrypted historical control validity and associated
public contexts over the entire genesis-to-T interval. This is not independent
historical MLS Commit replay. Checkpoint signatures or retained hashes cannot
replace client plaintext/correspondence verification. Old shared keys/openings
remain usable; rewrapping is not revocation. An old owner vault is stronger and
may expose immutable owner authority. No owner transfer or erasure guarantee is
introduced, and the MLS deletion assumptions are not strengthened.

Owner restore first verifies the complete shared history, definition and all
checkpoint/grant/vault bindings. Only then install accepted MLS state with
matching epoch, group, roster and own leaf/private binding. Rebuild historical
logical/outcome indexes from verified records. The recovered grant and compact
descriptor index also resume the sealer at that exact checkpoint, reusing the
immutable definition/interval keys and generating only new suffix keys. Pending operations are refused
at export; their production crash recovery remains P6.

## Bounds and work

| Dimension | Proposed cap |
| --- | --- |
| Total ordered entries / nonempty segments | 65,536 each |
| Segment entries / canonical plaintext | 128 / 16 MiB, whichever first |
| Full grant / compact vault plaintext | 16 MiB each |
| Definition | Existing 64 files / 512 KiB decoded |
| Transport chunk | Existing 16 KiB decoded, exact nonfinal size |
| Complete signed event / WebSocket frame | Existing 128 KiB / 131,200 bytes |
| Descriptor compact index | 32 MiB canonical, at most 65,536 tuples |
| Global logical map | 16 MiB canonical, at most 65,536 pairs |
| Prepared exact-ID cost index | 32 MiB canonical, at most 262,144 identities |
| Aggregate required retained signed bytes / unpublished outbox | Existing 256 MiB / 64 MiB |
| Public page | Existing 128 events / 1 MiB |

Adding entry 129 seals the previous interval and starts another. Byte overflow
also seals a nonempty interval; one entry plus its mandatory closure that cannot
fit refuses. An explicitly requested checkpoint seals a shorter current
interval. Once sealed or granted, an interval is never extended, including in
the same MLS epoch. Actual max/+1 vectors must measure manifest, chunk, grant,
index and frame encoding before treating these count choices as feasible.
The 10,000-event target means small actions; maximal actions can exhaust the
byte quota first.

Ordinary receive stores one verified record and updates bounded crypto/public
state plus compact indexes. It never clones accumulated history. Sealing visits
only the current interval and emits new immutable objects. Publishing an explicit
full checkpoint and recipient grant may walk the selected descriptor/key index
once. A disk/IndexedDB fixture object store retains serialized objects; the
decoder holds one segment plus bounded metadata/definition/state. Instrument
record visits, bytes encoded, segment encryptions, grant work and maximum
simultaneously decoded segments on small increasing workloads. This is not a
physical peak-memory measurement or streaming AEAD: WebCrypto holds an entire
bounded segment and temporary ciphertext/base64 copies.

## Eligibility, authority and acknowledgement

An ordinary opaque ordering receipt promises its signed order only. It is
distinct from a privately verified, exported and retained full-history
checkpoint. The latter exists only at a sealed T and only after its complete
prepared object closure fits both quotas and is actually retained/read back.
Prepare an exact `[eventID,encodedByteCost]` index for all required original
orders, manifests, chunks, definition, checkpoint, grant, vault and locator
objects. Deduplicate exact existing reservations, retaining uncertain writes
and old required roots. Validate the entire plan and reserve remaining costs
before publishing new bytes or promising the stronger boundary. An authorized
operator may stream bounded plan pages; the owner-signed plan hash/count/total
must match before that plan can be activated.

States are `idle -> prepared -> retaining -> complete`, or `refused/uncertain`.
No partial plan changes the complete T. Capacity refusal disables new work under
the stronger guarantee while preserving the prior complete T; it does not
rewrite previously issued opaque ordering receipts as recovery promises.
Prepared reservations transfer to per-identity native reservations without
double charging. Lost native ACK/EOSE retains conservative charges across retry
and intact reconstruction. Only complete actual readback permits the retained
checkpoint response; client verification is a separate required result.
Completion reads every planned exact identity through the selected backend,
including the root and original orders, and compares the stored bytes with
their confirmed reservation. Constructor-held proofs and a local journal alone
cannot establish that retention. The separately charged declaration must also
be confirmed and read back. A failed read preserves preparation and charges.
Invalid opaque crypto stalls at the last-good prefix. Production coupling to
DO transactions, durable outbox scheduling and fsync remains P4/P5/P6.

Keep gateway authorization frontier F, requested recovery checkpoint T and
complete retained closure separate. Require T<=F, exact journal correspondence
and declared object coverage no later than T/F. A mirror inside a later segment
can serve the prior sealed checkpoint, explicitly labelling its suffix
unavailable. The caller can require an exact newer checkpoint and reject an
older valid one. Descriptor/chunk/grant pages use current membership and the
existing learned-control/fork/restore fence at dequeue/send. Old cursors cannot
lower authority. Removal between pages revokes subsequent service. In-flight
bytes remain outside the cutoff. Named-prefix service still permits old-history
exposure after an unseen removal; final adoption must affirm that again.

The native composition probe must transfer multiple intervals/pages through the
real private gateway/strfry, perform newcomer decryption, and challenge missing,
wrongly bound and beyond-F objects, revocation between pages, uncertain writes
and incomplete sealing/transfer. No raw-backend shortcut or EOSE is client
recovery proof. Existing public COUNT/NEG/HLL/admin denial and backend isolation
remain required. All acceptance and adoption conclusions await actual evidence
and independent exact-head review.

## Executable package and measured scope

`npm run probe:segmented-recovery` requires the full 102-case P0/P1a/P1b/P1c
chain, then six new Node cases, the same six Chromium cases and one actual
native gateway composition case: 115 required tests plus the preserved native
size/COUNT probe. `npm run verify:segmented-recovery -- <evidence.json>` checks
its recursive prerequisites, clean commit/tree/lock/profile/source/provider and
runtime identities, signed root/definition/order/checkpoint/frontier inputs,
raw reports, browser bundle and native trace/config/state artifacts. Every run
uses a fresh UUID; failed/skipped/missing cases cannot produce an accepted
record. An accepted record is an observation result, never an adoption token.

The 132-entry case spans three intervals, retains a refusal and an ordered
stale entry, repeats an exact action across the first boundary, uses multiple
real epoch changes and authentic newcomer Welcome, then restores an owner using
only the declared package, sends a real future encrypted action, and exports/
verifies a fourth interval without rewriting any prior interval. Separate
owner-resigned and re-encrypted malformed packages challenge coverage, order,
public state, key maps, definition and freshness. A genuine conflicting logical
action and an altered-AAD ciphertext reach the inner checks. Custody vectors
attempt actual AEAD with every old interval key against a later same-epoch
segment and an old grant key against a new grant. Bob consumes his valid removal
Commit, reaches `removedFromGroup`, and fails direct future crypto while Carol
succeeds; a preceding non-removal catch-up is the positive control.

The maximum 16 MiB vector exercises actual canonical bytes, AES-GCM, 1,025
signed chunks and the actual manifest, with maximum-plus-one refusal. Its core
is deliberately a string: this is a framing/cryptography bound, not a valid
history. A separate maximum-count full GrantCore actually encrypts/reopens
65,536 exact key pairs; its encoded plaintext is below 16 MiB. More than 65,536
keys is rejected before use. Maximum descriptor/logical/retention indexes use
actual serialized tuples, with count-plus-one refusals. Safety ceilings do not
promise their simultaneous admission: complete wire cost can exhaust 256 MiB
earlier. Byte rollover uses real records at a deliberately smaller configured
segment limit, verifies every recovered record, and rejects a singleton whose
mandatory proof cannot fit. No claim is made that a maximal legal plaintext
BodyCore exists at every possible one-byte boundary.

The increasing 32/64/128-entry samples record one immutable log write per entry,
one new-record read on the next append, no old-segment encryption on append or
export, one key visit per selected segment on explicit export, and individual
canonical allocation sizes. Their two-member small-action record sizes are
about 6.8 KiB per entry. Linear extrapolation leaves room for 10,000 such entries
under the retained-byte ceiling with ordinary 128-entry sealing; it is an
encoding estimate, not a benchmark, capacity guarantee for larger rosters or a
promise to retain arbitrarily many full snapshot exports. Each actual snapshot
must pass exact complete-closure eligibility.

Recovered records are written to a fresh fixture namespace during verification.
That namespace is quarantine until `VerifiedHistory` is returned; failures leave
it as evidence and never install a live client. This fixture does not supply the
production atomic storage promotion, IndexedDB crash protocol or resumable
snapshot downloader. Normal append uses a compact live crypto snapshot and
file/IndexedDB per-record storage, while the existing signed-order transport
model remains an in-memory P4 precursor. No SQL, application runtime or UI has
been added.

## Socket reservation and recovery commands

The v2 fixture opts into the existing isolated gateway via a root validator,
strict reservation validator, extension-state hooks and extra commands. The
original v1 defaults and all original nine native regression scenarios remain
required. On a v2 root, legacy OBJECT/CLOSURE/NOSEQ-CLOSURE recovery routes are
explicitly disabled; original ordered EVENT/REQ and restore reconciliation remain. It is a small development extension, not a general relay framework.
Both listeners retain endpoint-bound NIP-42 AUTH. Only the private authenticated
sequencer/replica operator can call these write commands; all objects and plan
declarations also require the enrolled owner signature.

| Private command | Exact effect |
| --- | --- |
| `SEG-BEGIN declaration` | Start one owner-signed plan; no reservation or complete promise |
| `SEG-PLAN declarationID tuples` | Add at most 128 distinct exact-ID/cost tuples per page |
| `SEG-RESERVE declarationID` | Verify entire count/hash/total, reserve all missing costs, persist, then retain declaration |
| `SEG-OBJECT event` | Convert a planned cost to an actual conservative reservation before native publication/readback |
| `SEG-COMPLETE declarationID` | Reconstruct actual public object closure, check every chunk and original interval boundary, then record eligible T |

The owner-signed declaration is charged in addition to its plan. It is excluded
from its own hash-bound plan to avoid a self-reference. Old exports and uncertain
objects stay charged even when a new plan no longer lists them. Original orders
continue through the existing fenced `EVENT` route. One reserved preparation
must finish before replacement; there is no speculative refund or abandoned-plan
quota reclamation. Pending tuples, anticipated-cost tuples and completed
checkpoint pointers jointly fit a 32 MiB serialized metadata envelope. This
joint limit can refuse earlier than any individual count ceiling. Fixture
reconstruction checks these indexes against actual reservations and original
journal boundaries; it is not fsync/crash atomicity.

A public `SEG-OPEN subscription checkpointID-or-null requestedPosition` offers
an eligible sealed checkpoint and reports F, its tip, T and whether the suffix is
available. An exact checkpoint ID cannot silently select an older one.
`SEG-GET subscription checkpointID IDs` returns at most 128 exact objects within
1 MiB, with EOSE meaning that page only. The server rebuilds/caches a bounded
public closure ID index and rejects any requested object outside that checkpoint.
Every queued frame uses the base current-membership/fence check immediately
before `send`. No client plaintext/grant keys are disclosed to the gateway.
`suffixAvailable` means the offered sealed prefix reaches the caller's actual
requested position. It is false when that request exceeds F, even if T equals
F; clamping checkpoint selection to F does not change what the caller requested.

The native test verifies the prepared private archive before requesting stronger
retention, refuses a signed T=6 while F=5 until the last ordered entry arrives,
rejects genuinely suppressed or wrong signed backend page events, loses an actual native EOSE, reconstructs the file with uncertainty
still charged, retries and verifies complete recovery over multiple socket
pages. The reader is a newly admitted Carol: she verifies the owner device
signature and NIP-44 grant, then joins the actual Welcome against the socket-
verified history before receiving later live crypto and her removal. It tests exact prepared signed-byte capacity and one byte less using a
smaller configured fixture ceiling, preserving the previous T on refusal and
interrupted transfer. The production ceiling remains 256 MiB; this is not a
256 MiB physical-store or 10,000-event benchmark. Uploads are sequential, with at
most one event/frame in the publisher's active outbox, below the unchanged
64 MiB ceiling. Durable outbox scheduling remains P4/P5.

Completion regressions omit the root entirely, lose its native EOSE, and
reconstruct both incomplete states before exact retry. They suppress or
substitute already retained root, original order and declaration bytes during
completion. None advances T or refunds the reservation. Separate socket cases
cover requests below the first eligible T, exactly at T=F, beyond F, an unsealed
retained suffix, and an exact checkpoint whose closure is still unavailable.

A later unsealed suffix cannot leak through an older checkpoint. A learned
removal with a lost native ACK blocks subsequent old-history pages before
retention, after intact reconstruction, and after the removal is confirmed.
The retained owner remains a positive reader. The preserved P1c suite separately
repeats full-buffer, slow-reader, out-of-order-control, restore fence, public
COUNT/NEG/HLL and actual sandboxed private-backend isolation cases. The new local
client itself is not a deployment-wide network-isolation proof.

## Remaining gate and decision audit

This package's proposed decision is **continue to independent exact-profile
review and explicit adoption assessment**. It supplies a concrete full-prefix
segmentation/custody/eligibility proposal rather than selecting a 128-entry
instance lifetime. There is no automatic transition from its success to a gate.

| Gate | Evidence and remaining decision |
| --- | --- |
| G1 | P1a incompatibility remains a STOP for the Marmot candidate pair. P1b/P1c preserve actual lower-API ordered MLS evidence; the Noseq-specific RFC 9420/9750 binding still needs explicit reviewed adoption. |
| G2 | This candidate adds segmented full-prefix coverage, small real custody/restore/native composition and explicit conservative eligibility. Exact-head independent review and acceptance of owner-attested historical controls, retained openings and old-vault capabilities remain required. Production atomic outbox/storage coupling belongs to P4–P6. |
| G3 | Existing real admission/Commit and account/device/leaf checks remain prerequisites. Owner availability, immutable-owner compromise and failure/stall policy need explicit adopted profile approval. |
| G4 | Existing strict wire/definition/signer/privacy cases plus new kinds/graph/custody/bounds must receive exact-profile review and adoption. No NIP registration/interoperability is inferred. |
| G5 | Real private gateway/strfry prerequisites and new multi-page reservation paths remain bounded local evidence. Named-prefix unseen-removal old-history exposure must be affirmed again; deployment isolation, durability and platform portability remain P4/P5. |

All five gates also require genuine independent decision evidence, root adoption
and a separately commissioned, independently reviewed detached-decision validator
before activation. Neither a workroom publication approval, boolean, arbitrary
report ID nor rewritten JSON meets that requirement. Full gate commands remain
nonzero, and P2–P9 are not authorized by this investigation.
