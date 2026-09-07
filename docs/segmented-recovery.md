---
title: Segmented full-history recovery candidate
date: 2026-09-07
status: P1d contract; implementation and independent review pending; no adoption
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
logical/outcome indexes from verified records. Pending operations are refused
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
