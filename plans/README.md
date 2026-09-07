# Implementation Plans

Prepared with the improve planning checklist on 2026-09-06; revised 2026-09-07
against `499dc13e3ef05f8a30f844df225dc17ce4162297` using the
[completed Atseq assessment](../notes/2026-09-07-atseq-final-assessment.md).
The original design review remains pinned to `2554c582db730cd3d64490970a573eab1463672e`.

| Plan | Purpose | Priority / effort | Status |
|---|---|---|---|
| [001: Confidential application prototype](001-confidential-application-prototype.md) | Gated implementation of the Nostr comparison, with every design finding mapped to evidence | P1 / large, staged | IN PROGRESS — P0 complete; P1 investigations landed; full gates unpassed |

The [independent design review](2026-09-06-design-review.md) contains eleven
findings and one direction recommendation. Signed report #50 was accepted as
planning input by #51. All findings are addressed by explicit decisions, gates
or scoped deferrals in Plan 001. P0 has since passed; G1–G5 remain unpassed.
The [supplementary review dispositions](2026-09-06-supplementary-review-dispositions.md)
assess the delayed report #60, map all N1–N13 findings, and distinguish accepted
risks from qualified solution suggestions. The plan receives its own independent
exact-head review in the GitSeq workroom.

## Execution stages

Read Plan 001 fully before starting. A failed dependency blocks later stages.
Only update a status after its named commands and evidence checks pass.

| Stage | Deliverable | Depends on | Status |
|---|---|---|---|
| P0 | Toolchain and evidence harness | Separate implementation request | DONE — 3321e70; 12 Node/workerd/Chromium cases, local and hosted |
| P1 | Crypto/order/history and protocol gates | P0 | IN PROGRESS — P1a–P1d landed at 499dc13; G1–G5 unpassed |
| P2 | Signed wire and pure prefix verification | P1 | TODO |
| P3 | Retained definitions and bounded runtime | P2 | TODO |
| P4 | Durable sequencer and provisioning | P2 | TODO |
| P5 | Primary relay and independent mirror | P4, G5 | TODO |
| P6 | Client crypto persistence and replay | P2, P3, P1 adapter; P5 for integration/completion | TODO |
| P7 | Generic populated document, unrelated apps and agent authoring | P3, P6; P4 for creation | TODO |
| P8 | Invitation, membership and recovery flows | P4, P5, P6, P7 | TODO |
| P9 | Fault matrix, measurements and comparison | P0–P8 | TODO |

P5 completes with independent signed/encrypted fixture-byte retrieval. P6 can
develop pure/store tests before P5, but P5 must complete before P6 integration
proves full mirror-only decryption, retained-definition loading and projection
reconstruction. P9 composes that end-to-end A5 evidence. This split resolves
PLAN-01 from the independent plan review; byte retrieval alone is not full replay.
P9 distinguishes local prototype completion from an actual Cloudflare
probe; unrun cloud cases must remain explicitly unverified.

Documentation request #108 commissions this assessment/revision only. Separate
requests commissioned P0 and P1 investigations; the overall conditional plan is
an authorized gated direction, not an adopted production crypto profile. P2–P9
remain uncommissioned at this source snapshot, and deployment is not authorized.
P0 evidence is in [toolchain](../docs/toolchain.md); P1 observations and remaining
trust/decision gates are in [crypto feasibility](../docs/crypto-feasibility.md)
and [segmented recovery](../docs/segmented-recovery.md). The P1d independent review
records 115 actual tests and 44 evidence/closed-gate checks; no full G gate passes
follow from that count. Hosted baseline CI verifies P0 only.

All findings are assessed; several supplementary solution suggestions are
qualified with primary-source evidence. Later features and their boundaries
are listed in the plan.

GitSeq request #47 tracked the initial plan delivery:

```text
git:sha1:77aeeeb3fa42aeb6babdf961f6397ba73fada68b#git:sha1:c70578a4f674824f7b55ce948aff6f4c6d08f19c
```

The final-Atseq documentation revision is tracked by request #108:

```text
git:sha1:77aeeeb3fa42aeb6babdf961f6397ba73fada68b#git:sha1:ae8cb5e84bff85e1cf775b2624ef061c07d4846a
```
