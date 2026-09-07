---
title: Proposed Noseq ordered MLS protocol v0
status: development feasibility candidate; no protocol adoption or security gate passed
profile: noseq/protocol-candidate@1
date: 2026-09-07
---

This is the complete byte-level proposal exercised by the P1c development
fixtures. It is an experimental Noseq binding of MLS to one signed order. It is
not Marmot interoperability, a production encryption stack, or the P2–P9 runtime.
[Recovery](confidentiality-and-recovery.md) and [relay policy](relay-profile.md)
are part of the proposal. The machine identity is
[`fixtures/crypto/protocol/profile.json`](../fixtures/crypto/protocol/profile.json).

The investigation decision is **continue the client/recovery investigation;
evaluate the prefix gateway boundary; keep adoption pending**. All G1–G5 remain
unpassed. The bounded direction selects membership at the gateway's highest verified
retained prefix, including old-history exposure after an unseen removal. Eight
real local gateway/strfry socket cases exercise that proposal. Independent review
and explicit production adoption remain absent. The pure policy model alone
cannot close a gate. Archive correctness also includes a declared owner
attestation trust boundary; it is not independently verified MLS control replay.

## Exact dependencies and scope

The source chain remains Marmot protocol `4a2bc65f8db5866cec3b2a127dedb37818eaf207`,
Marmot-ts `2f60dbb27d284f617ad873ccda568c0f2f07aa79`, and its ts-mls submodule
`2ca5c43b77241245ef41a5dd834f151674877c2d` (package `2.0.0-rc.14`). The existing
preflight still reproduces the incompatible Marmot proof and eager retraction
behavior. Neither current Marmot proof IDs nor branch witnesses, withdrawal
records or provisional-view callbacks are accepted inputs to this Noseq profile.

The selected protocol is MLS 1.0, [RFC 9420](https://www.rfc-editor.org/rfc/rfc9420.html),
with wire protocol version 1 (`mls10: 1` in the pinned `src/protocolVersion.ts`).
MLS suite 1 is `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`: X25519 HPKE,
AES-128-GCM, SHA-256, Ed25519. The same default provider and upstream frozen lock
are retained. The machine profile pins the public API through the P1b profile,
and additionally pins source and built bytes for private-message, sender-data,
secret-tree, group-context, ratchet-tree and framed-content helpers. These
**internal APIs** provide per-message archive openings; they are not a stable
package contract. Any revision or provider change requires fresh evidence and
review. No cryptographic primitive has been replaced with a mock.

`nostr-tools` 2.25.2 provides ordinary NIP-01 event hashing/BIP-340 signatures and
NIP-44 v2 small-key delivery. It is development-only. Node 26.8.1 and actual
Chromium execute the client cases. P0 still exercises workerd separately; P1c
makes no Workers crypto claim. The local signer is real. NIP-07 and NIP-46
fixtures simulate capabilities; extension, bunker, authenticated RPC transport,
connection switching and live external interoperability remain untested.

## Roots, identities and signatures

An externally trusted `(owner public key, genesis event ID)` is required. A URL,
valid relay response or self-consistent archive cannot supply that trust. A
trusted invitation can additionally fix a checkpoint/tip. Genesis is an ordinary
owner-signed Nostr event of kind 8790, with the sole tag
`["noseq","noseq/protocol-candidate@1"]`. Its exact content fields are `profile`,
`instance`, `definition`, `owner`, `sequencer`, `history`. Instance is a random
32-byte lowercase hexadecimal nonce. History is
`owner-attested-full-prefix@1`. The genesis event ID becomes the MLS group ID;
this avoids a self-referential genesis hash. The salted definition commitment is
specified in the recovery document. Owner and sequencer identity changes are not
supported in this candidate; a new root would be a separate instance.

Three identities must remain distinct:

| Identity | Exact meaning | Retry behavior |
| --- | --- | --- |
| Logical action ID | Random/application-selected 32-byte ID inside an account-signed action | Same original signed action may be re-encrypted; changed content under the ID stalls |
| Submission ID | NIP-01 ID of one device-signed ciphertext envelope | Save and retry the exact event; no new timestamp/signature/ciphertext |
| Ordered entry ID | NIP-01 ID of the sequencer-signed position and predecessor | One common receipt; duplicate receipt is a no-op |

Account keys sign proof events. Device keys sign submission envelopes and AUTH.
The MLS leaf has its own Ed25519 signing key. A Basic credential embeds the exact
account-signed kind-8794 event whose content is
`{"type":"account-leaf","device":<device pubkey>,"suite":1,"leaf":<MLS pubkey>}`.
The ordinary profile tags bind this proof to genesis, instance and definition.
The authentication service verifies the real Nostr signature and exact leaf key;
founder validation is explicit. The gateway also verifies the owner-signed founder proof against its trusted
genesis before accepting the initial public roster. A valid account proof
identifies a leaf but does not admit it: the owner must approve its exact account/device/leaf tuple.

## Canonical wire rules

The authoritative parser is `tests/protocol-feasibility/wire.ts`. All objects
have exactly the documented fields; unknown/missing fields fail. JSON is compact
UTF-8 with recursively sorted object keys and the ordinary JSON string escaping
produced by `JSON.stringify`. Array order is significant. Numeric values are
unsigned safe integers, excluding negative zero; fractional/exponent spellings,
duplicate keys, alternate escapes, whitespace and unsafe prototype keys are
rejected by byte equality after parsing. Lone surrogates and invalid UTF-8 fail.
Depth is checked before JSON parsing and again during canonical encoding. This
is deliberately narrower than general Nostr JSON. NIP-01 signing still hashes
its standard `[0,pubkey,created_at,kind,tags,content]` tuple using nostr-tools.
The parser discards the library's mutable verification cache by round-tripping
through fresh JSON before verifying an incoming event.

An event has precisely `id`, `pubkey`, `created_at`, `kind`, `tags`, `content`,
`sig`. IDs/public keys use 64 lowercase hex characters; signatures use 128.
All ordinary profile events have these exact ordered tags:

```json
[["noseq","noseq/protocol-candidate@1"],["h","<genesis ID>"],["i","<instance nonce>"],["d","<salted definition ID>"]]
```

The `d` tag on normal events is a context tag, not addressable-event semantics.
Kinds 8790–8797 were absent from the inspected NIP registry at
`c3fd9af17939316bf6d0d83a5759100f8b0a1bdb`. They are unregistered experimental
normal kinds, not a reservation or global standard. The registry must be
rechecked before adoption. Kind 8794 proofs are normally nested/encrypted;
publishing them as public standalone events would disclose their contents.
No addressable discovery event is implemented here. Discovery, if later added,
must remain a replaceable hint and cannot stand in for retained normal history.

| Kind | Meaning | Exact content |
| --- | --- | --- |
| 8790 | Genesis | Fields above; owner signer |
| 8791 | Submission | `type` (`commit` or `application`), `epoch`, `version`, `bytes`, `welcome` |
| 8792 | Ordered entry | `position`, `previous`, complete `submission` event, complete `admission` event or null |
| 8793 | Owner admission | `version`, `epoch`, exact `submission` ID, sorted `members` |
| 8794 | Inner proof | Discriminated account-leaf, action, invitation, retention-closure or trusted-high-water object |
| 8795 | Encrypted chunk | Recovery-encryption envelope containing chunk index/count/bytes |
| 8796 | Archive checkpoint | Owner-signed `type`, `bodyHash`, `vaultHash`, `count`, `tip` |
| 8797 | Released Welcome | `commit` submission ID and exact MLS `bytes` |

`bytes` uses strict padded RFC 4648 base64, with length checked before decode,
re-encoding equality and no trailing TLS bytes. Private-message group ID and
public epoch must match the outer envelope. A Welcome field is null or SHA-256
of the **canonical JSON string containing base64 Welcome bytes**, matching
`hash(welcome)` in the fixture. The Welcome event refers to the exact Commit;
it is released only after the local client has accepted its ordered winner.
Welcome ciphertext is MLS recipient protection; it is not NIP-44 ciphertext.

Action proof content is exactly `type: "action"` plus `action`, where action is
`logical`, `device`, `value` and `outcome`. These bounded fixtures use string
values and outcomes `apply`, `refuse`, `runtime-failure`; they do not implement
JSONata, application schemas or the production fold. The MLS-authenticated
sender leaf, outer device and inner account proof must agree. Fixed synthetic
`created_at=1788739200` makes fixtures reproducible; timestamps never define log
order or freshness. AUTH and invitations use explicitly supplied times and
validate their own windows. No ordinary submission expiration is claimed.

## One accepted prefix

The journal fixture signs monotonically increasing positive positions beginning
at 1, with genesis as the first predecessor. It validates the authenticated
submitter, exact epoch/admission version and signature before admission. It
retrieves an existing exact submission receipt before applying the current
membership rule, so a removed sender can obtain its old receipt. That is a
narrow receipt capability, not a new submit or private-history read capability.
Changing the timestamp creates a new event and loses that exception.

Every Commit and its owner declaration occupy one common ordered entry.
A declaration includes the next epoch, next admission version and sorted,
unique complete roster of `(account,device,leaf)`. At least one owner device
must survive. A matching half pair can be buffered in either order; neither
half independently advances membership. The fixture reconstructs this buffer
from an object snapshot. Atomic durable storage of halves, receipt and order is
still P4/P6 work, not proven by these tests.

Owner devices can propose changes; ordinary members cannot. The active client
accepts the actual decrypted MLS Commit only when its sender is the declared
owner device and the resulting MLS roster exactly matches the signed public
roster. A lying owner declaration therefore causes the last accepted prefix to
stall; the transport cannot repair opaque ciphertext by itself. A removed client
handles the library's `removedFromGroup` terminal result explicitly. Surviving
clients advance epoch; the removed client cannot decrypt an actual future
message, even after receiving its removal Commit. The prerequisite P1b fixture
also includes a non-removing catch-up control to distinguish exclusion from lag.

A client retains accepted and one provisional outbound state. It publishes no
provisional outcome or Welcome. Exact self-echo promotes the provisional state;
a competing accepted Commit drops the loser and its Welcome. Earlier ordered
applications are actually decrypted against both accepted and provisional
states before a pending Commit can land. Peers can process the earlier prefix;
one outstanding local operation is not a global freeze. Restarts reconstruct
serialized accepted/pending state and publication markers. These are in-memory
serialization boundaries, not independent-process crashes, transactions,
IndexedDB persistence or power-loss durability.

Duplicate signed entries do nothing. Different signed entries at one observed
position cause a permanent visible halt. A missing predecessor or future
dependency waits. Publicly old epoch/version is a common stale disposition and
has no application effect. Signed current ciphertext that fails authentication
stalls the instance at its last accepted prefix; there is no local decrypt-skip
or secret-dependent resynchronization. Missing/corrupt local MLS state pauses
that client while a valid peer can progress. A deterministic business refusal
advances with its refusal outcome; a runtime failure pauses before installation.
The fixture has no repair protocol. Availability under malicious admitted
members is explicitly limited by this safe stall policy.

An offline client beyond four retained epochs catches up by processing every
missing ordered Commit from its retained state, not by decrypting the future
first or silently skipping old data. Withheld ciphertext cannot be reconstructed
from EOSE, a signature or a valid tip. A newly restored client needs a trusted
coverage tip to distinguish a correct old prefix from current state; unseen
forks and isolated equivocation remain possible until conflicting evidence is
observed or an independent trusted checkpoint is supplied.

## Admission, invitations and signers

A member can have multiple distinct devices with one account identity; each leaf
needs separate owner admission. Removing one device preserves another admitted
device of that account. Copying an account secret cannot itself be revoked;
owner identity and recovery authority need their own compromise policy.
Membership cannot change while every owner device is offline. Concurrent owner
changes compete at the same ordered boundary; a stale loser must re-propose
against the accepted roster rather than patch a private branch into history.

The owner-signed invitation proof carries `type`, `recipient`, `nonce`,
`expires`, `history`, `origin`, `version` and exact context tags. Tests reject
recipient/origin substitution and expiry. Its version is an expected admission
context; the fixture does not implement one-time redemption, recipient key
storage, Welcome transport or an onboarding service. P8 must bind redemption
to the exact accepted Commit/checkpoint, consume the nonce once, enforce the
advertised history interval and coordinate recovery exports. AUTH alone grants
neither admission, an invitation, archive keys nor MLS membership.

A local signer exposes `getPublicKey` and `signEvent`. Returned signatures must
match the exact requested template and announced key. NIP-07 uses those normal
capabilities. The NIP-46 adapter accepts an already authenticated RPC surface
with `get_public_key` and `sign_event`; transport authentication/encryption is
outside this probe. Missing capabilities and event substitution fail closed.
No legacy raw-digest signing is required by this proposal.

## Gateway extension bytes

The isolated gateway implements the named-prefix policy defined in the relay
document. Public REQ has 1–4 OR filters; every branch must carry exact singleton
`#h`, `#i`, `#d` context arrays, `kinds:[8792]` and a positive bounded `limit`.
`ids` may contain 1–128 exact IDs. Optional `noseq_tip` fixes the data tip; all
branches share it. Unknown/broad/cross-instance fields fail before storage work.
This is a declared Noseq filter extension, not a generic relay passthrough.
Without `noseq_tip`, REQ snapshots current history and continues live; EOSE is
only the end of that query, not proof of a complete retained prefix.

The separately authenticated private socket accepts sequencer/replica EVENT
ingestion and OBJECT (kind-8795 owner-device-signed encrypted chunk) storage.
CLOSURE carries an owner-signed kind-8794 proof with exact content
`type:retention-closure`, `tip`, complete owner-signed archive `checkpoint`,
`ids`. The checkpoint count/tip must match the accepted prefix, and each
encrypted object header must bind that checkpoint ID before any read output. It names required retained ciphertext
identities at that tip and is itself retained/read back. Public
`["NOSEQ-CLOSURE",subscription,tip]` checks reader authority and all named retained
identities before returning chunk EVENT messages and
`["NOSEQ-COMPLETE",subscription,tip,declaration]`. This certifies byte retention
under the owner declaration, not G2 plaintext/definition correspondence; the
separate archive verifier supplies that verification. Missing bytes or a slice
over the page budget return partial/unavailable, never COMPLETE. Resumable large
closure transfer remains P5/P6. Public EVENT, COUNT, HLL, NEG, export and admin
commands are denied.

After a stale restore, the private RECONCILE command requires a trusted external
owner-signed proof with `type:trusted-high-water`, fresh gateway `challenge`,
`position`, `tip`, plus exact context tags. That named prefix must be retained
and verified before reads are enabled. The external trusted source is required;
a local backup is not a substitute. This tests the isolated state machine and
actual file reconstruction, not production durable monotonic authority.

## Resource envelope and evidence closure

The full [resource table](relay-profile.md#resource-contract) records each cap,
its unit and the enforcement still owed by later stages. Real vectors measure a
32 KiB inner action inside its signed proof, MLS ciphertext, submission, signed
entry and full WebSocket EVENT response; a 16-device Commit and Welcome; and an
encrypted 16 KiB definition chunk. The observed byte counts are retained per
runtime, not inferred from plaintext. Full definitions are bounded at 64 files
and 512 KiB; no network resource can bypass the closure manifest. This candidate
adds a conservative 128-entry/16 MiB archive export bound. Exceeding it refuses
export; it never truncates the advertised prefix. Large archive transport and
retention behavior remain P5/P6 work.

`probe:protocol-feasibility` can exit zero only for the exact required bounded
observations, including P0 and P1a/P1b prerequisites, 32 client cases, eight real local
gateway cases and the native relay limitation observations. `verify:protocol-feasibility` revalidates source/tree, locks,
fixture/document/profile/library bytes, runtime, raw reports, every mandatory
case, generated browser bundle and native inputs/results. Runs have unique UUIDs
and exclusive start/evidence/failure files. A failed, skipped, missing, duplicate,
foreign-source or corrupted result cannot be relabelled as a successful run.
Generated fixture traces are synthetic and ignored; committed summaries must
remain sanitized. Successful reruns do not overwrite earlier failures.

`test:crypto-feasibility` and `gate:protocol` inspect an optional candidate record
but **always exit nonzero for this candidate**. There is no `approved: true`
switch or author-created report ID that enables them. Two-phase closure avoids
a circular demand for an approval inside the commit being reviewed:

1. Freeze this source/profile and obtain actual independent exact-head review;
   record its verdict and requester ratification in GitSeq. This approves only
   the stated investigation/publication scope.
2. Review the proposed prefix-read exposure and archive-trust decisions explicitly.
   Resolve **G2-LONG-HISTORY**: the current 128-entry/16 MiB archive refusal
   cannot recover every longer admitted prefix. Define and review authenticated
   segmented coverage/key custody, or separately authorize a matching instance
   lifetime and any Plan 001 deviation; this candidate chooses neither.
   Commission the resulting executable cases, and obtain independent review of
   that immutable profile and its complete G1–G5 evidence.
3. An explicitly authorized activation change must verify the detached signed
   decision/ratification and complete evidence against that immutable profile,
   implementing a narrow mapping to an adopted profile. Review that activation
   change separately. This candidate implements no such mapping.

Neither publication of this document nor an approved P1c review adopts crypto,
marks a gate passed or authorizes P2–P9. The existing 15 reserved P0 command
checks still exercise the actual command entries and require nonzero results.
