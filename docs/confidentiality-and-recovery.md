---
title: Proposed confidentiality and recovery contract
status: owner-attested history candidate; no security gate passed
date: 2026-09-07
---

The P1c fixtures demonstrate a **full named prefix under an owner attestation**,
with independent cryptographic reopening of each ordered application message.
They do not demonstrate trustless MLS control-history replay, durable vault
storage or production all-device-loss onboarding. This distinction is part of
the proposal, not a qualification to omit from a future invitation. The exact
profile is [protocol v0](protocol-v0.md).

## What is archived and trusted

The shared archive contains the original owner-signed genesis, the complete
salted definition closure, initial public roster, every original signed ordered
entry from position 1 through the named tip, signed submission/control events,
original signed actions, per-message openings, recomputed outcomes and logical
ID index. An owner-signed kind-8796 checkpoint binds the entire body hash,
owner-vault hash, exact entry count and tip with type
`owner-attested-full-prefix@1`. The checkpoint and all event signatures use
ordinary NIP-01 signing. A caller must supply the independently trusted owner
and genesis, and should supply the expected checkpoint/tip for freshness.

An archive verifier checks the root before installation, all exact context and
signature bindings, contiguous positions/predecessors, owner admission changes,
complete application-opening coverage, final public state and recomputed
outcomes. It rejects missing/duplicate/extra openings, altered definition files,
truncation, coverage holes, mismatched roots/instances and incorrectly paired
valid signed actions. The trace retains the exact synthetic root, definition,
ordered ciphertext and accepted frontier; test success does not infer
correspondence merely from valid action signatures.

For every non-stale application the opening contains:

| Material | Capability supplied |
| --- | --- |
| That message's AES content key and nonce | Reopen its exact MLS ciphertext with actual AAD |
| That message's sender-data key and nonce | Reopen its encrypted sender index/generation |
| Public encoded GroupContext and ratchet tree | Verify actual MLS signature and account/leaf membership |
| Original account-signed action | Verify author/device/context and reproduce the fixture outcome |

The verifier decrypts both ciphertexts through the pinned real provider, checks
complete codecs/padding, MLS signature, original action bytes and Nostr account
signature, and compares the public tree with the ordered owner roster. Altering
an action while retaining a valid signature is insufficient: it must reopen the
original ordered ciphertext. Keys are message-specific; the shared archive
contains no epoch secret, secret tree, private leaf state or owner live vault.
A removed holder's old shared openings do not grant a future message key.

The **owner attests control-transition validity and the historical public
contexts over the entire interval genesis through the checkpoint tip**. A
newcomer checks signed control declarations and the complete ciphertext chain,
but does not independently replay the encrypted MLS Commit chain from an
original private leaf. Public trees and contexts used by application openings
are trusted through that owner attestation as well as checked against the
visible roster. This is a real trust boundary: a compromised or dishonest owner
can attest a false control history. Application ciphertext/signature checks
constrain that claim but do not eliminate owner authority. A valid signature or
body hash alone cannot turn this interval into independent MLS verification.

The synthetic outcomes are ordered string values/refusals, not the production
application fold. Exact retained definition bytes are authenticated; executing
schemas, JSONata, SVG/three.js outputs and reproducing their projection remains
P2/P3/P6. No SQLite requirement is introduced by recovery: the eventual fold
result can be the interface directly.

## Definition and export bytes

A definition is `{nonce,files}`. Nonce is random 32-byte hex, kept encrypted;
files are a sorted, unique list of `{path,bytes}`. Paths are bounded lowercase
relative paths with no empty, dot, traversal or absolute segment; a
`manifest.json` must exist. Total decoded bytes are at most 512 KiB in 64 files.
The public ID is SHA-256 of canonical
`["noseq/definition-closure@1",nonce,files]`. The secret random salt prevents
simple public equality/dictionary matching of identical definitions. Filenames,
source and assets are plaintext to archive recipients and the executing host.

The generic export wrapper is exactly `format`, `context`, `generation`,
`nonce`, `keyId`, `checkpoint`, `bytes`. Format is
`noseq/recovery-aes256gcm@1`; bytes are AES-256-GCM with a random 12-byte nonce and
128-bit tag, using the canonical remaining header as AAD. `keyId` is SHA-256 of
the random 32-byte key. Context binds all five instance/root/definition/owner/
sequencer fields. Generations are positive safe integers. Ciphertext is bounded
before base64 allocation and plaintext before parsing. Wrong keys, altered
headers/ciphertext, missing tags and foreign context fail before installation.
This is high-entropy raw-key export, not password-derived encryption or a
password-recovery mechanism.

The conservative archive bound is 128 ordered entries and 16 MiB serialized
plaintext. A full-prefix export refuses above either cap. The prefix is never
silently shortened to fit. Ciphertext/tag/base64 expansion must fit a separate
file/export allocation. Relay transport must split large encrypted material
into authenticated chunks with complete retention receipts; the P1c 16 KiB
chunk vector measures expansion but does not implement P5 retention, a complete
chunk transfer or resumable download. An export file and key must be retained
outside the lost devices for all-device-loss recovery to be possible.

## Shared history and owner vault are separate capabilities

The owner-only export contains the verified shared archive **plus** complete
serialized MLS state, accepted/pending metadata, account/device signing keys and
exact leaf binding. Its vault hash must match the owner's signed checkpoint.
Recovery validates the archive first, key/public identity correspondence, final
MLS roster and epoch, and vault/history equality before constructing a client.
It creates a new public crypto environment and uses only declared export
material; no existing client or hidden live key package is passed into the
recovery path. The restored client produces a real future application that an
existing recipient decrypts.

The owner-only vault uses a fresh **different key** from the shared archive.
Newcomers receive only the shared archive key. The fixture explicitly verifies
that this key cannot decrypt the owner export. Reusing the shared key for the
owner vault would hand every history recipient owner signing and continuing MLS
authority; that is forbidden by the proposed custody contract. The generic
cryptographic helper takes raw keys and is not a production custody service;
P6/P8 must make this distinction structural in their storage/capability API.

A small `noseq/archive-key-delivery@1` packet contains context, recipient device,
shared archive key and checkpoint. It uses actual NIP-44 v2 with the authenticated
owner-device sender public key and recipient device private key. Plaintext is
capped at 1024 bytes, encoded packet at 2048 characters. The current NIP-44
library allows much larger payloads; this proposal deliberately sends only
small key material. The caller must already authenticate the sender and accepted
recipient admission. NIP-44 delivery is not an invitation or authorization
service. The owner-only vault key is never passed to this delivery API.

A newcomer obtains its own KeyPackage private material and an accepted Welcome,
verifies the promised archive, joins the actual accepted group, and checks the
Welcome-derived roster against that archive. It does not reuse the owner's MLS
state. The fixture transports released Welcome bytes directly; public relay
Welcome delivery, one-time invitation redemption and device storage remain
unimplemented. The tests reconstruct objects after serializing and ceasing to use
the original world as a recovery input. They do not claim browser closure, cross-process persistence
or power-loss safety. Durable verify-before-install is a requirement for P6.

## Rotation, removal and loss

| Retained material | What it still permits | What changes capability |
| --- | --- | --- |
| Old shared archive key and ciphertext | All plaintext and message openings in that exported interval forever | No rotation can erase a copied old export |
| Old shared message openings only | Reopening those specific messages, with historical identities | They do not provide new epoch or ratchet secrets |
| Old owner vault and its key | Owner/device signing and MLS catch-up, including later messages while still admitted | Removing that device in a real accepted MLS Commit excludes future epochs |
| Account Nostr secret alone | Account proof/signatures; for the owner, genesis/checkpoint authority | It is not a backup of the MLS vault; immutable-owner compromise has no transfer mechanism in v0 |
| New wrapping key without MLS removal | Protects a newly encrypted export from the old wrapping key | Does not revoke a retained working MLS vault |
| Neither surviving device nor usable export/key | No recovery claim | User must supply missing retained material or accept loss |

The rotation scenario first proves that an old wrapping key cannot decrypt the
new file, then proves the old vault holder can still catch up and decrypt. It
then removes the old owner device through another admitted owner device,
delivers the actual removal Commit, checks the terminal result and attempts
actual future MLS decryption, which fails. The removed-member scenario also
retains prior shared history/openings and checks old capabilities against future
ciphertext. P1b's non-removal positive control remains mandatory.

Retaining old plaintext/opening keys deliberately sacrifices forward secrecy
for the promised history. Retaining an owner vault adds future compromise
exposure until MLS membership/key recovery occurs. Export-key rotation and MLS
rekeying solve different problems. Secure deletion from copied exports cannot
be guaranteed. All-device-loss recovery from an old owner export can resume its
old device identity, but it must catch up the complete signed prefix and reject
removal or incompatible state; there is no magical account-secret-only restore.

## Adversaries and observable assets

This table describes the **proposed service boundary**, not protection already
implemented by a deployed Noseq service. C = action content, D = definition/
source/assets, I = account/device/leaf identities, M = membership, E = instance
existence, T = timing and Z = size/volume. `Hidden` means ciphertext only under
the stated uncompromised-key/trusted-host assumption, not metadata anonymity.

| Adversary | C | D | I | M | E | T | Z | Mechanism, residual exposure and evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Passive network observer | Hidden with TLS + MLS | Hidden with TLS + encrypted closure | IP/endpoint correlation | Traffic inference | Endpoint/traffic inference | Visible | Visible | TLS required in deployment; local ws/http probes do not test TLS. No traffic padding or mix network; untested deployment property |
| Unauthenticated relay reader | Hidden | Hidden | Must be denied roster/events | Must be denied | Bootstrap/URL may reveal | Requests reveal own timing | Should not obtain counts | Prefix membership gateway required; bare strfry COUNT leak reproduced. G5 pending |
| Honest relay operator | Hidden plaintext | Hidden plaintext; salted commitment visible | Outer device/account roster visible | Public owner declarations visible | Visible | Visible | Visible | Relay cannot decrypt MLS/archive without keys; no metadata-hiding claim. Signed traces show public fields |
| Malicious relay or infrastructure provider | Hidden absent keys | Hidden absent keys | Visible to storage operator | Visible | Visible | Can withhold/reorder | Visible | Signatures/continuity detect alteration and observed forks; cannot prove availability or unseen freshness. Fixed-prefix and failure fixtures; full replication untested |
| Compromised web host / injected script | Exposed in use | Exposed | Exposed | Exposed | Exposed | Exposed | Exposed | Explicitly outside confidentiality guarantee: trusted host executes plaintext and can steal local keys. No code-integrity or sandbox immunity claim |
| Removed member holding old history | Old promised interval exposed; future excluded after actual removal | Retained definition exposed | Historical roster exposed | Historical roster exposed | Known | Old history and available transport metadata | Old history sizes | Real removal terminal and future crypto failure; copied material persists. Known-prefix removal denies new gateway output; unseen removal can still allow old-history retrieval through the mirror frontier. G5 pending review |
| Malicious current member | Exposed authorized history/current content | Exposed | Visible | Visible | Known | Visible | Visible | Can copy plaintext and submit opaque invalid data that safely stalls peers. Cannot forge another account proof; failure/admission fixtures |
| Stolen unlocked device / owner vault | Retained and future while admitted | Exposed | Device/account keys exposed | Visible | Known | Visible | Visible | Real removal limits future decrypt; copied owner account key still forges owner authority. No owner transfer or secure-erasure claim |
| Leaked shared encrypted archive alone | Hidden under random key | Hidden | Wrapper owner/context/checkpoint visible | Ciphertext only, sizes leak | Visible | Export generation/context leak | Visible | AES-GCM wrong-key/tamper tests; no password resistance claim |
| Leaked archive plus key or owner checkpoint authority | Historical interval exposed | Exposed | Historical identities exposed | Historical roster exposed | Known | Historical event times | Full history size | Shared openings do not grant continuing MLS state. Leaked owner vault is stronger; dishonest owner can attest control history. Rotation and negative archive cases |

Owner membership controls are intentionally public to the sequencer/relay so
transport admission can be checked without group keys. The salted definition ID
hides simple equality but not the fact that this instance has one stable
commitment. Nostr event timestamps, envelope sizes, author keys, genesis IDs and
connection timing remain metadata. Encryption alone does not meet a requirement
that infrastructure learn neither membership nor instance existence. Such a
requirement would need a different evaluated profile, not a broader claim for
this one.

The proposed transport policy intentionally permits outage reads using the
mirror's highest verified retained-prefix membership. If Bob is present at 40
and removal 41 is hidden by a partition, he can retrieve previously unfetched
old application/definition/archive ciphertext and metadata through 40. Retained
keys/openings can reveal new-to-him old plaintext. A newcomer admitted only at
41 remains denied there. Once 41 is verified, Bob loses all new history/live
service, including old cursors and closure requests. Already released bytes and
copied material persist. This bounded-investigation exposure was explicitly
ratified in direction `216ddf15ae48778bc148a65e46ef3f25fe6b4018`; production adoption
must reaffirm it after review. This profile makes no globally-current read
restriction or confidentiality against all historical members claim.
