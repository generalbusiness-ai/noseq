# Crypto preflight: incompatible candidate and proposed next direction

Status: **P1a compatibility result and P1b bounded API investigation; encryption profile not adopted.**

The pinned Marmot specification and candidate library do not share an identity
proof format. The candidate also permits withdrawing an application payload
previously delivered as accepted. **Stop production use of this candidate pair.**
The preflight reproduces those observations; it does not pass P1 or any G1–G5
gate. A separate protocol decision must be reviewed and ratified before dependent
production implementation.

P1b investigates the pinned lower-level ts-mls API separately from the incompatible
Marmot candidate. Its [ordered-MLS observations](#p1b-ordered-mls-api-observations)
support continuing the investigation, with all five full gates still unpassed.

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

## P1b ordered-MLS API observations

**Continue the bounded investigation with this lower API. Do not adopt a production
profile.** The development fixture reproduces provisional Commit/Welcome handling,
authenticated winner and loser self-echo, accepted-prefix preservation, serialized
continuation and future-message exclusion after removal. The same eight scenarios
execute in actual Node and actual Chromium. These are 16 bounded observations;
they do not establish the complete G1–G5 contract.

```sh
npm ci
npm run browser:install
npm run probe:ordered-mls
npm run verify:ordered-mls -- artifacts/ordered-mls/runs/<uuid>/evidence.json
```

The command first reruns the unchanged P1a preflight, fetching and building the
same exact sources and frozen dependency graph if needed. It then checks the
separate ordered-probe TypeScript configuration, builds a development browser
bundle, and runs eight Node plus eight Chromium cases. This browser page is a
dedicated test fixture; the application host and Cloudflare Worker remain unchanged.
Use a free loopback port `4175`. No relay, signing extension, cloud account or
deployment participates.

### Source choice and ownership

The choice is the already pinned ts-mls fork at
[`2ca5c43b77241245ef41a5dd834f151674877c2d`](https://github.com/hzrd149/ts-mls/tree/2ca5c43b77241245ef41a5dd834f151674877c2d),
package version `2.0.0-rc.14`, built public entry `dist/src/index.js`.
Its exact MIT notice is already retained in [NOTICE](../NOTICE). Source checks
cover the exports, Commit/application/message APIs, state codecs, authentication
service and selected provider implementations. The source revision and frozen
P1a lock fix the full implementation; this is not a claim about a separately
published package tarball.

The fixture calls `generateKeyPackageWithKey`, `createGroup`, `createCommit`,
`joinGroup`, `createApplicationMessage`, `processMessage`, the public state/message
codecs and `getCiphersuiteImpl`. Ciphersuite 1 uses X25519, AES-128-GCM, SHA-256
and Ed25519. The pinned default provider uses WebCrypto for Ed25519 when available,
WebCrypto digest/AEAD through the selected HPKE implementation, and the pinned
Noble/HPKE dependencies for its remaining operations. The fixture's independent
account and order signatures use Noble BIP-340. Node and Chromium both execute
real encryption, signature verification and decryption. Other ciphersuites,
other browsers, browser workers and workerd crypto remain untested.

Each client owns an accepted serialized MLS state and an optional separate pending
operation. `createCommit` returns `newState`, Commit, optional Welcome and consumed
secret buffers. The probe checks that its input state remains unchanged. It
serializes the result before clearing returned consumed buffers; accepted bytes
are never aliased into a call. Pending Commit, pending application, their exact
base and withheld Welcome round-trip separately. The general `decode` helper
does not check trailing bytes, so the fixture checks the public decoder's consumed
length explicitly. This is a local boundary check, not the complete G4 validator.

An authenticated ordered self-echo matching the exact pending envelope and base
promotes the returned state. A competing accepted Commit discards only the losing
pending state and its withheld Welcome. A peer processes actual MLS bytes. The
fixture never combines unrelated secret trees. When an accepted application
interleaves before a local echo, it replays those same bytes through both accepted
and provisional MLS states with `processMessage`, verifies identical plaintext,
and records both continuations. The Commit's retained parent epoch makes that
specific replay possible; no secret-tree fields are hand-merged. This behavior
has its own Node and browser case, including restart and pending application echo.

The fixture allows one pending outbound operation per client. It refuses another
local generation until that operation is accepted or loses; it still processes
earlier ordered applications from peers. This local scheduling bound prevents
generating repeatedly from unchanged accepted sender state. Multiple simultaneous
local sends and crash-safe reservation of sender generations remain unproved.
There is no global pause or skipped valid application while a Commit is pending.

The tested default retention policy keeps four epochs and ten generations, with
a 200-step forward-ratchet bound. Retained accepted/pending snapshots and parent
epoch material affect forward secrecy. JavaScript strings and snapshots are not
securely erased; clearing returned buffers is not a key-custody proof. Choosing
retention and safe persistent custody remains part of G2/G4.

### Experimental authentication and order

All keys are public synthetic test material or newly generated test MLS keys.
The closed fixture recognizes Alice, Bob, Carol and Dave. Each account signs a
SHA-256 digest of a UTF-8 JSON array with BIP-340; MLS Basic credential bytes hold
the proof. The exact leaf proof array is:

```text
["noseq/ordered-mls-probe/account-leaf@1", instance, genesis,
 accountPublicKey, deviceName, 1, mlsSignaturePublicKey]
```

Validation checks the exact domain, instance/genesis, permitted synthetic account,
device name, ciphersuite and actual MLS leaf signature key, then verifies the
account signature. The MLS authentication callback performs these checks; it
does not accept all credentials. The founder is checked explicitly because the
library's `createGroup` path does not itself authenticate its own leaf. Tampered
signatures, wrong domain and key substitution fail, including a malformed join
KeyPackage presented through the actual Commit API. This fixed fixture account set
is a test trust root, not owner-authorized production admission or a Nostr signer.

An author-signed envelope binds experimental kind (`commit` or `application`),
epoch, author, the exact private MLS message bytes and optional Welcome hash to
`noseq/ordered-mls-probe/envelope@1`, instance and genesis. Its signature covers
the SHA-256 of that ordered JSON array. Independent action proof uses the domain
`noseq/ordered-mls-probe/action@1`, instance, genesis, author and plaintext value.
The receiver checks the outer author against the authenticated current leaf and
the actual MLS sender. These classes deliberately do not reuse a Marmot or Nostr
authorization domain.

The synthetic sequencer signs the SHA-256 of:

```text
["noseq/ordered-mls-probe/order@1", instance, genesis,
 position, previousEntryHash, completeAuthorSignedEnvelope]
```

The entry ID is that digest. Clients verify the actual sequencer signature,
instance/genesis, contiguous position, preceding hash and author proof before
MLS acceptance. A signed entry observed at a waiting or failed position remains
recorded, so a different signed replacement at that position is an observed fork,
including after snapshot reconstruction. An identical accepted entry is a no-op;
a gap or unavailable future epoch waits without moving the accepted frontier.
Malformed signatures or a seen fork refuse. A verified old-epoch envelope is
recorded as stale from its authenticated header, without using local decryption
failure as a reason to skip an opaque position. Current-epoch cryptographic or
local-secret failures halt at that position and preserve last-good state.

This demonstrates first-valid-Commit selection for the tested common sequences.
It does not solve the general invalid-control repair/stall policy: a current-epoch
invalid control is not skipped to find a later winner. Only comparing observed
signed histories reveals a fork; an unseen fork or selective withholding remains
possible. JSON encoding here is an exact fixture contract, not P2 wire validation,
a registered Nostr event kind or a P4 sequencer implementation.

Welcome is withheld until its Commit is accepted, then checked against the bound
Welcome hash and inviter's accepted ledger. The new member verifies that signed
prefix and joins with the actual MLS Welcome API, checking the resulting branch.
Losing and substituted Welcome bytes are refused by this wrapper. The inviter's
decrypted acceptance ledger is still trusted by this test join flow; order
signatures alone do not prove membership validity to a newcomer. The fixture
does not claim owner-control, fresh-device history or independently authenticated
archive/admission closure. The removal case delivers the same signed removal
Commit to all three members. The removed recipient authenticates it and records
the actual MLS `removedFromGroup` terminal result; unlike active members, it keeps
its old epoch and does not derive the next epoch's keys. Direct MLS processing
with that resulting state fails AES-GCM decryption of the future payload while
remaining members decrypt it. This is distinct from a wrapper's terminal denial.
A paired non-removal control first shows that a lagging member also cannot decrypt
new-epoch data, then delivers the ordinary Commit: that retained member advances
and decrypts successfully. The terminal marker survives serialized reconstruction.
Previously learned plaintext and historic keys are not revoked.

Independent review P1B-01 identified that the original case only tried untouched
old state against new-epoch ciphertext, which did not distinguish removal from
lag. The corrected case includes both actual Commit-delivery paths above and
records their outcomes in each runtime's trace. The wrapper's active-member
epoch-advance check remains strict; only the actual removed-member result has
the explicit terminal path.

### Evidence, restart limits and next decision

Each UUID run retains source/lock/profile/fixture identities, actual runtime
observations, signed public fixture traces, raw test reports, every process result,
the generated browser bundle, and its exact successful P1a prerequisite. File
hashes bind those outputs; the public verifier rechecks the current pinned inputs,
all required cases, raw outcomes, runtime observations and prerequisite record.
Skipped, missing, duplicated or failed cases cannot produce accepted evidence.
The result always says `continue-investigation` with G1–G5 unpassed. Failed runs
and successful reruns have different IDs. Logs are ignored bulk evidence, not a
cryptographic attestation against someone rewriting their checkout and reports.

Restart cases reconstruct objects from serialized accepted and pending state
before/after generation, staging, Commit acceptance, application decryption and
recorded outcome publication. A retained publication marker prevents a second
local publication; without persisting that marker an external effect could be
delivered twice. No process is killed and no durable filesystem transaction or
crash recovery is proved. The browser reloads fresh pages for its cases, but that
does not turn the snapshot exercises into durable browser recovery.

The next bounded decision must address full signed-prefix and adversarial input
coverage, restart/storage atomicity, owner-authorized membership controls,
newcomer/recovery history closure, signer capability/domain validation and relay
policies. The fixture exposes sender/account identifiers, group/epoch, routing,
order, byte sizes and timing to its synthetic service; ciphertext remains opaque,
but traffic metadata is not hidden. Neither Marmot interoperability nor a finished
Noseq production profile follows from these API observations. Stop or change the
candidate if these surviving requirements cannot be demonstrated.

## P1c proposed protocol and recovery observations

P1c adds a separate `noseq/protocol-candidate@1` proposal and real Node/Chromium
fixtures. Read [protocol v0](protocol-v0.md), [confidentiality and recovery](confidentiality-and-recovery.md)
and [relay profile](relay-profile.md) together. The P1a candidate remains
incompatible with current Marmot; P1b remains a bounded API investigation.
Neither earlier result is silently upgraded by the new profile.

The new paths exercise ordinary Nostr signed account/device/leaf bindings,
provisional Commit/Welcome, one owner-admission boundary, competing changes,
interleaved applications, full-prefix recovery, explicit cipher/identity/coverage
negatives, multi-device removal, local-key failure isolation, strict wire bytes,
encoded resource expansion and a pure private-relay policy model. Sixteen named
cases run in each real client runtime. The prerequisite P1b removal fixture
retains the actual removal Commit, terminal result, direct future crypto failure
and non-removing positive control required by its independent review.

The recovery proposal is explicitly **owner-attested over all historical control
transitions**, with independently checked per-message content/sender AEAD
openings, MLS signatures and original account-signed actions for every ordered
application. Shared history contains no live owner MLS state. The owner's vault
is separate, checkpoint-bound and encrypted under a different key. The old-vault
rotation control demonstrates why re-encrypting a backup alone cannot revoke a
retained MLS client; actual device removal is needed for future exclusion.
Object reconstruction demonstrates the declared input boundary, not durable
browser/process crash recovery. The documents state the retained-secret and
immutable-owner compromise limits without claiming trustless history.

The local pinned strfry build now permits real acceptance/readback tests. It
reproduces the 64 KiB default event limit, full-frame overhead at 128 KiB, and
unauthenticated COUNT leakage despite a denied restricted-kind REQ. The latter
is a negative infrastructure result. An independent membership gateway/private
store now has nine real isolated socket cases. The ratified investigation
selects highest verified retained-prefix membership, explicitly permitting old
history through 40 after an unseen removal at 41. Known removals cut off queued
and subsequent output, and stale restores require external reconciliation.
These experiments are not production deployment, persistence or adoption.

The bounded decision is continue evaluating the client/archive proposal, change
the bare relay boundary and keep adoption pending. All G1–G5 remain UNPASSED.
The strict candidate evidence can pass while `test:crypto-feasibility` and
`gate:protocol` remain nonzero. An actual independent exact-profile review and
an explicitly authorized, separately reviewed gate-activation record/validator
are required after the remaining cases and policy decisions; an author boolean
or arbitrary report ID cannot activate this candidate. No P2–P9 implementation
or production crypto adoption follows from P1c publication.

P1c review identified two bounded gateway gaps: intact reconstruction could lose
a learned out-of-order control fence, and encrypted objects/declarations bypassed
aggregate retention accounting. The corrected fixtures preserve that fence,
account every retained identity including older closure declarations, and
reconstruct the counter. Dedicated archive max/+1 vectors also delimit the
128-entry/16 MiB export capability. **G2-LONG-HISTORY** remains an open adoption
decision for authenticated segment composition over larger admitted histories;
no smaller instance lifetime or Plan 001 workload change has been selected.

The follow-up review exposed the corresponding failure-path gaps after native
acceptance with a lost response. The candidate now persists conservative
per-identity reservations before publication and keeps verified contiguous
control denial before a fallible quota/retention step. Real lost-response,
reconstruction, retry and full-buffer controls are required in G5-F09. Earlier
passing records do not establish those later requirements.
