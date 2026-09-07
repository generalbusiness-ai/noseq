---
title: Proposed private relay boundary and resource profile
status: G5 pending review/adoption; isolated prefix gateway proposal
date: 2026-09-07
---

The pinned bare strfry relay does not implement the proposal's dynamic reader
policy. P1c now executes a small real WebSocket gateway over network-private
strfry, nine socket scenarios, a pure policy model and native size/COUNT/NEG
observations. These are isolated feasibility results, not a deployed service,
production persistence or a G5/P5 pass.

The ratified bounded direction
`216ddf15ae48778bc148a65e46ef3f25fe6b4018` selects **membership at the serving
gateway's highest verified contiguous retained prefix**. It explicitly accepts
old-history exposure after an unseen removal for this investigation. This is not
globally current access. An eventual adoption must affirm the exposure again
after independent review; publication of these fixtures does not adopt it.

## Proposed public boundary

Each instance opts into an exact owner-signed genesis and sequencer public key.
A client uses its configured service endpoint and independently trusted root;
no global relay subscription is required to create an application. The same
Nostr signature can be stored at the primary and independent replicas. A URL,
`OK` acknowledgement or `EOSE` response supplies neither root trust nor recovery
coverage. Generic public Nostr relays are not approved repositories for the
private profile's event bodies/rosters.

NIP-01 carries ordinary signed normal events. NIP-42 AUTH proves possession of a
connection's signer key with kind 22242, empty content, exact relay URL and
challenge tags, and a 60-second window in this fixture. AUTH is separate from
membership, owner authority, MLS keys and replica publishing authority. The
policy fixture supports multiple authenticated keys on one session; the pinned
strfry implementation's one-key connection behavior is not assumed equivalent.
A gateway must either implement the declared behavior or use separate sessions.

The intended private boundary grants history and live events only to an admitted
device under the chosen authoritative read frontier, plus explicitly authorized
replicators. It authenticates the publisher separately: only the sequencer or an
allowed replica can retain ordered events. Owner admission still controls who
may submit plaintext-derived ciphertext to the sequencer; relay AUTH cannot
create that permission. Outer author signatures are checked even when another
authorized actor replicates the event.

The candidate does not add a NIP-70 `-` tag. That tag requires the publishing
connection to authenticate as the event author; it would prevent an independently
authenticated mirror from forwarding sequencer-authored events unless it held
the sequencer's signing authority. Keeping replica and author keys separate is
intentional. A generic write plugin also cannot enforce private historical,
live, COUNT or NEG reads.

The gateway must be the only network path to private storage. Bind strfry to a
private interface or loopback behind an authenticated tunnel; deny public bypass,
including HTTP, WebSocket, NEG and operator endpoints. If strfry is publicly
reachable, author/p-tag filtering is not the specified roster policy and a
front proxy cannot repair that bypass. Deployment/network enforcement is P5 and
has not been executed here.

## Freshness and independent mirrors: selected proposed policy

An owner can remove a member at the primary while an independent mirror is
partitioned. The mirror cannot know that unseen revocation from a valid older
prefix alone. The following policies are materially different:

| Policy | Partition behavior | Confidentiality consequence |
| --- | --- | --- |
| Strict current membership with authoritative fencing/check | Refuse private reads when current authority cannot be established | Preserves current-roster restriction by sacrificing independent read availability |
| Bounded lease | Read only within a declared signed authority lease | Revocation can lag by the lease bound; a lease must fence/order revocation if claiming stronger semantics |
| Named-prefix availability | Serve history no later than a verified mirror frontier using that frontier's roster | A member removed in an unseen later entry can read old history through the mirror frontier |

The third policy is selected for this bounded proposal. Its privacy claim is
weaker than globally current membership and is named accordingly. Likewise a
short cache timeout is not proof that the roster is current. A signed prefix
provides authenticity and a coverage boundary, not knowledge of the newest
revocation. The pure `RelayPolicy` model is given a roster directly and does not prove this
policy. The separate real gateway fixture enforces it over actual private
strfry storage and public/private sockets. G5-F05 builds prefix 40, lets a
separate replication process exit, creates removal/admission 41 at the isolated
producer, and demonstrates that Bob can still retrieve all old entries through
40 while Carol, admitted only at 41, is denied. Once a new authenticated
replication process delivers 41, Bob loses every subsequent old-history request
and Carol can retrieve the named earlier history. No 41+ bytes are served under
authorization 40. These semantics include previously unfetched old ciphertext,
definitions/archive ciphertext and metadata; old keys can make this newly
learned old plaintext. They must remain visible in the privacy statement.

The gateway verifies trusted genesis, an owner-signed founder binding, owner
admission/control signatures, their exact ciphertext submission identity and
sequencer-signed contiguous order before advancing transport authority. It
holds gaps; any verified owner control conservatively disables reads before
fallible retention, until its contiguous retained prefix is reconciled. Conflicting observed positions halt. A half-control cannot advance
admission. This publicly verified transport authorization is distinct from the
owner-attested private MLS control-history trust in the G2 archive.

The read cutoff is synchronous: persist verified control knowledge and discard
unsent queues/subscriptions before native publication, a quota check or an
awaited response can fail. Successful retention/readback then advances the
authority frontier; only readers still authorized there may resume. Every dequeue
checks membership again immediately before `ws.send`, with no intervening await.
Bytes already handed to the socket are in flight and cannot be recalled. G5-F04
pauses actual output queues, learns removal, verifies their cancellation and
rejects old cursors, old closure reads, reconnect and re-AUTH. Caller-selected
older data tips never lower the authorization frontier.

G5-F06 reconstructs an intact JSON control file, preserving both accepted
removals and verified out-of-order control knowledge. The bounded signed pending
buffer is persisted before a buffered reply; reconstruction verifies it and keeps
reads disabled until its dependencies produce a contiguous verified prefix. A
separate highest known signed control preserves the denial even when the pending
buffer is full. G5-F09 also covers contiguous removals whose retention fails,
including quota refusal and a lost readback response, before and after intact
reconstruction. Exact retry or dependency fill can resume permitted readers; it
cannot restore a removed reader. Old
cursors, closure reads and reconnected readers remain denied across that
reconstruction. This is different from a removal that has never been seen. A
separate **stale restore mode** starts read-disabled, requires an external
owner-signed fresh-challenge high-water proof, and cannot enable reads until
that prefix has been ingested. Losing the external authority link leaves it
fenced. The operator must identify restore/loss; a file alone cannot prove it
was not rolled back. These actual file/state-machine checks do not claim fsync,
crash transactions, independent durable high-water storage or P5 restore safety.
The production design must preserve this distinction rather than trusting a
signed but stale local tip.

Independent assessment `389f159594d1dda04bc6e5b75436b788544eda21` and supplement
`9d9af3e02419988ac3d82fbfd79d22cd3f1dd2df` informed the direction. Their suggested
strict-current/lease alternatives are documented alternatives, not additional
implemented modes. Full G5 review and later explicit adoption remain pending.

## Query, retention and replication contract

Normal kinds 8790–8797 hold history; addressable discovery is currently absent.
A future addressable endpoint record can locate an instance but cannot replace
the original normal events or certify that a whole prefix has been retained.
Public bootstrap should expose only the minimum independently trusted locator/
root information. Invitations, genesis, definition commitments and key-delivery
metadata need an explicit public/private routing contract before any service
launch. A public or guessed instance URL may reveal existence.

Backfill fixes an exact target tip ID and uses positions/IDs within that prefix.
The fixture pages by exact retained order rather than seconds, deduplicates
identical event IDs and keeps later live arrivals outside the fixed historical
query. `EOSE` alone does not prove no gaps; clients verify every predecessor and
position from their trusted start through the target. A relay must refuse an
unknown tip or missing range and report its retained frontier. A valid old tip
must never be labelled current without a freshness basis.

No ACKed original event is silently evicted to fit capacity. At capacity, refuse
new retention/publication and expose degraded replication. Each mirror's
acknowledgement records the exact event/prefix identity and profile; an overall
status must distinguish local durable ACK, each replica ACK, pending retry and
complete retained prefix. Merely listing mirror URLs is not a replication result.
P1c reserves the exact encoded bytes of every unique ordered entry, encrypted
object and closure declaration in one 256 MiB retention quota **before** sending
native bytes. Reserved and confirmed identities are separate. Lost ACK/readback
responses leave the reservation charged through exact retry and intact
reconstruction; uncertainty never certifies retained coverage. Exact retries
reuse their reservation even at capacity. The fixture does not refund uncertain
writes automatically: reclaiming them would need explicit reconciliation.
Replacing a tip's closure index preserves the older signed declaration and its
charge. All three routes verify actual readback before confirming retention.

Intact reconstruction recomputes usage from all reservations, including uncertain
writes and older declarations. The compact file stores each reserved event once
and uses ID indexes for confirmed/public inventory. Its allocation envelope is
twice the journal cap, plus the 128-event pending buffer, one separate control
event and 1 MiB overhead, checked before reading. This is distinct from the
16 MiB archive-export limit and remains a fixture storage representation.

P1c tests gateway refusal, exact native retention/readback and a separately
AUTHed replication child that exits. It does not prove crash-atomic accounting,
fsync, physical disk retention, retry scheduling, independently operated
replication/failure domains or primary-loss recovery. Those remain P5.

A real gateway must apply one privacy decision to initial REQ, history pages,
every live delivery and all alternate routes. COUNT can reveal instance/event
existence even when EVENT payloads are denied. NEG/NEG-OPEN and related
synchronization inventory can disclose event IDs/counts. Deny these routes for
unauthorized sessions or implement equivalent authorization before access;
do not advertise unsupported NIPs. The implemented public fixture denies all
COUNT/HLL/NEG routes and validates every OR filter branch before backend work. Unknown commands and broad unsupported
filters should fail without exposing restricted state. Service bootstrap and
health responses must not leak roster or instance inventory.

## Actual pinned relay observations

Source: [`hoytech/strfry` at 4cd3cf64850caf47dda46c2a2abbbf3525a64d10](https://github.com/hoytech/strfry/tree/4cd3cf64850caf47dda46c2a2abbbf3525a64d10).
The coordinator built its unmodified source/submodules locally with Apple clang
21.0.0 on macOS 26.6.2, using a private prefix and pinned static bottles. Existing
OpenSSL 3.6.4, libuv 1.52.1 and zstd 1.5.7_1 plus SDK zlib were recorded. No global
native installation or cloud deployment occurred. The retained binary SHA-256 is
`028f26b98b0b895ed4d32f83642e3fa25173f3498330e9bfc2567a3fc06ffab4`.
The build record and its exact hash are pinned in the machine profile. This is
a specific local execution dependency, not a cross-platform reproducible-build
claim; a different native build needs a separately reviewed observation profile.

`protocol-relay-probe.mjs` adapts the coordinator's synthetic probe, verifies the
source commit/clean tree and binary, creates fresh local LMDB directories and
loopback ports, publishes actual NIP-01 events via Node WebSocket, reads accepted
events back byte-for-byte, records all replies/logs/config hashes, and terminates
every relay child. The results are:

| Event limit | Frame limit | Exact observation |
| --- | --- | --- |
| 65,536 bytes | 131,072 bytes | 65,535 and 65,536-byte events accepted/read back; 65,537 rejected |
| 131,072 bytes | 131,072 bytes | 131,000 accepted; a 131,072-byte event needs a 131,082-byte EVENT frame and the connection closes |
| 131,072 bytes | 131,200 bytes | 131,071 and 131,072 accepted/read back; 131,073 rejected |
| Restricted kind read enabled | Default size limits | Unauthenticated restricted REQ denied; COUNT `{}` and COUNT `{ids:[restrictedId]}` both disclose count 1 |

The size/COUNT probe intentionally succeeds when these **limitations** reproduce.
G5-F01 additionally exercises immutable author/p history and live behavior,
newcomer lack of old recipients, and actual NIP-77 paths. The default database
creates an all-events persistent tree; it leaks restricted IDs. A deliberately
on-demand ids query filters those IDs, while an explicitly configured author
tree leaks them. The first failed route-classification run is retained; no test
expectation was treated as evidence that the default tree was an in-memory
query. The same case verifies NIP-70 rejection for wrong/unauthenticated authors
and acceptance after exact-author AUTH. The gateway's own exact-tag profile
refuses all NIP-70 events rather than stripping tags or sharing author keys.

G5-F02 tests exact URL/challenge/expiry and multiple AUTH keys, unknown members,
all public bypass commands and mixed OR filters. An actual macOS sandboxed child
can reach the gateway port but is denied the backend port; the backend also has
no IPv6 listener. This is a real local process-isolation fixture. Deployment
firewalls, containers, hosts, IPv4/IPv6 alternate ports and operational bypasses
still require P5 verification. A trusted local operator outside that sandbox can
reach strfry and inspect ciphertext/metadata; no decryption key is supplied.

The nine socket cases do not prove physical disk exhaustion, fsync/crash
recovery, production retry scheduling or independently operated failover.
Source inspection or a successful socket observation must not become such a
claim.

## Resource contract

These limits are explicit prototype choices from Plan 001, with two additional
archive caps. Units matter: 1 KiB = 1024 bytes; NIP-11 `max_message_length` is
bytes, while `max_content_length` is Unicode characters. Event-byte validation
remains authoritative even when a character limit is advertised. The actual local gateway
serves NIP-11 metadata advertising only NIPs 1, 11 and 42 and labels its status
as a development fixture. F02 reads that HTTP response. The separate pure
policy-model metadata is not evidence of a deployed service or of the native
backend's advertised configuration.

| Resource | Cap | Executed enforcement / remaining owner |
| --- | --- | --- |
| Inner canonical action | 32 KiB | Before signing/encryption; actual maximum and +1 vectors |
| Complete signed Nostr event | 128 KiB | Parse/envelope construction; real strfry sizes |
| Complete WebSocket message | 131,200 bytes | Actual gateway maxPayload/parser and coherent native strfry profile; production ingress P4/P5 |
| Tags | 16, at most 4 strings each, each string 256 UTF-8 bytes | Strict parser, exact profile tags narrower |
| JSON depth | 32 | Before parse and canonical recursion |
| Definition closure | 64 files, 512 KiB decoded total | Closure validator; actual application loading P3 |
| Definition/source chunk | 16 KiB decoded | Encrypted expansion vector; complete transfer P5 |
| Group | 16 devices in 8 accounts | Exact roster checks, 16-device actual Commit/Welcome |
| KeyPackage/control | 8 KiB per encoded KeyPackage, 16 proposals, 16-device roster and 128 KiB whole event | Local proposal count/encoded size checked before Commit crypto; raw event bound before MLS decode; standalone admission upload remains P8 |
| Shared/owner archive | 128 entries, 16 MiB canonical plaintext | Export capacity refusal; additional conservative P1c bound |
| Aggregate retained bytes | 256 MiB per instance | Ordered entries, objects and closure declarations, including uncertain writes; exact-identity reservations and intact counter reconstruction. Physical capacity/crash accounting P4/P5 |
| Replication outbox | 64 MiB | P4/P5 scheduling/accounting pending |
| Connections | 32 per instance | Local gateway upgrade guard; production P4/P5 admission/accounting pending |
| Subscriptions/filters | 4 subscriptions per connection, 4 filters per request | Actual gateway sockets validate all branches and subscriptions |
| Historical page | 128 events and 1 MiB, whichever first | Actual fixed-tip socket queries and native byte readback |
| Live queue | 128 events and 1 MiB | Actual gateway queue refusal; OS/network slow-reader stress remains P5 |
| Concurrent client fetches | 8 | P6 enforcement pending |
| Replication batch | 64 events or 1 MiB | P5 enforcement pending |
| Independent replicas | 2 | P5 actual retention/failure-domain evidence pending |
| Retry delay | Exponential 1–300 seconds | P5 timer/jitter/persistence pending |
| Instances per creator | 10 | P4 admission/accounting pending |
| Identity rate | 60 requests/minute, burst 10 | P4 gateway enforcement pending |
| Per-instance rate | 300 requests/minute | P4 gateway enforcement pending |
| Small archive-key delivery | 1024 plaintext bytes, 2048 encoded characters | Actual NIP-44 helper limits |

A large encrypted closure/archive cannot be squeezed into a single event by
increasing unadvertised limits. A 32 KiB plaintext action is already larger
inside its proof/encrypted/signed envelopes; the retained `encoded-budgets`
observation contains the actual expansion for both runtimes. Unknown or missing
large closure pieces pause recovery; they never disappear from coverage claims.

## Executed fixture contract and remaining acceptance

| Case | Isolated execution |
| --- | --- |
| G5-F01 | Bare author/p history/live, newcomer old-history absence, COUNT leaks, on-demand/configured NEG paths, NIP-70 exact-author control |
| G5-F02 | Public bypass/filter/AUTH negatives, multi-key AUTH, truthful generic NIP-11, real OS-restricted client/backend isolation |
| G5-F03 | Internal owner admission before newcomer reads, original old journal without historic p tags, complete declared encrypted archive identities and actual G2 recovery verification |
| G5-F04 | Removal during paused queued history/live, cutoff accounting, old cursor/closure denial, reconnect and re-AUTH |
| G5-F05 | Separate replication process, named prefix 40 and unseen removal 41 exposure, later denial and newcomer grant |
| G5-F06 | Intact accepted and out-of-order control-fence reconstruction, stale-restore external high-water reconciliation, gaps, half-controls and observed fork halt |
| G5-F07 | 130 same-second entries over a 128-event cap, fixed-tip writes/dedup, real native middle-ID deletion, unavailable response and authenticated byte restore; closure holes |
| G5-F08 | Unauthorized/foreign/protected writes, no tag stripping, subscription/filter/frame/queue limits, all-route aggregate retention refusal, uncharged retries, older-declaration accounting and reconstructed counters |
| G5-F09 | Actual native acceptance with selectively lost ACK/EOSE, conservative object/closure reservations across retry and reconstruction, contiguous-control timeout/quota denial and resumed authority, full pending-buffer control fencing |

G5-F09 inserts a transparent local WebSocket proxy that suppresses selected real
native replies; strfry still receives and retains the original bytes. Capacity
edges inject the logical usage counter, then reconstruction recomputes the actual
reserved bytes. This tests ordinary failure handling, not physical disk fill,
crashes or fsync. Previously handed socket bytes remain outside the cutoff.

The sockets use ws 8.21.0 and exact local Node/native dependencies. Every case
retains raw sent/received frames, context/frontier notes, native config/source/
binary hashes, state files and child-process outputs. The crypto/archive cases
separately prove the actual G2 plaintext correspondence; G5-F03 also transfers a real encrypted archive through strfry/gateway, performs
NIP-44 key delivery and G2 decryption/opening verification at the newcomer, and
rejects objects bound to a different checkpoint before output. The gateway gets
no recovery keys and cannot infer private archive correspondence itself.

Independent exact-profile review is still required. Any unresolved acceptance
finding keeps G5 pending. P5 separately proves the actual primary DO and
independently operated mirror implement this policy, including production
service isolation, durable rollback fencing, complete closure transfer,
retention/restore, hibernation/retry and primary-disabled retrieval. Final
adoption must explicitly reaffirm the named-prefix exposure and owner-attested
history trust. No advertised NIP, URL, EOSE or author-created approval flag
substitutes for those decisions and experiments.
