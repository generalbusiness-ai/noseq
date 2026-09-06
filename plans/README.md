# Implementation Plans

Prepared with the improve planning checklist on 2026-09-06 against source commit
`2554c582db730cd3d64490970a573eab1463672e`.

| Plan | Purpose | Priority / effort | Status |
|---|---|---|---|
| [001: Confidential application prototype](001-confidential-application-prototype.md) | Gated implementation of the Nostr comparison, with every design finding mapped to evidence | P1 / large, staged | TODO — implementation not commissioned |

The [independent design review](2026-09-06-design-review.md) contains eleven
findings and one direction recommendation. Signed report #50 was accepted as
planning input by #51. All findings are addressed by explicit decisions, gates
or scoped deferrals in Plan 001; no implementation gate is claimed to have passed.
The [supplementary review dispositions](2026-09-06-supplementary-review-dispositions.md)
assess the delayed report #60, map all N1–N13 findings, and distinguish accepted
risks from qualified solution suggestions. The plan receives its own independent
exact-head review in the GitSeq workroom.

## Execution stages

Read Plan 001 fully before starting. A failed dependency blocks later stages.
Only update a status after its named commands and evidence checks pass.

| Stage | Deliverable | Depends on | Status |
|---|---|---|---|
| P0 | Toolchain and evidence harness | Implementation request | TODO |
| P1 | Crypto/order/history and protocol gates | P0 | TODO |
| P2 | Signed wire and pure prefix verification | P1 | TODO |
| P3 | Retained definitions and bounded runtime | P2 | TODO |
| P4 | Durable sequencer and provisioning | P2 | TODO |
| P5 | Primary relay and independent mirror | P4, G5 | TODO |
| P6 | Client crypto persistence and replay | P2, P3, P1 adapter; P5 for integration/completion | TODO |
| P7 | Generic direct UI and unrelated apps | P3, P6 | TODO |
| P8 | Invitation, membership and recovery flows | P4, P5, P6, P7 | TODO |
| P9 | Fault matrix, measurements and comparison | P0–P8 | TODO |

P5 completes with independent signed/encrypted fixture-byte retrieval. P6 can
develop pure/store tests before P5, but P5 must complete before P6 integration
proves full mirror-only decryption, retained-definition loading and projection
reconstruction. P9 composes that end-to-end A5 evidence. This split resolves
PLAN-01 from the independent plan review; byte retrieval alone is not full replay.
P9 distinguishes local prototype completion from an actual Cloudflare
probe; unrun cloud cases must remain explicitly unverified.

The current task commissions review and planning only. Subsequent implementation
requires its own work request. Publishing this plan does not adopt unproven
crypto choices, report runtime work complete or authorize deployment. All findings are assessed; several supplementary solution suggestions are
qualified with primary-source evidence. Later features and their boundaries
are listed in the plan.

GitSeq request #47 tracks this documentation delivery:

```text
git:sha1:77aeeeb3fa42aeb6babdf961f6397ba73fada68b#git:sha1:c70578a4f674824f7b55ce948aff6f4c6d08f19c
```
