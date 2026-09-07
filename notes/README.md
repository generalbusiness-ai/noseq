# Design and Implementation Notes

Dated notes (YYYY-MM-DD-title.md) to capture designs, implementation plans,
and discussion summaries. Frontmatter "status" should be maintained.

| Note | Status | Purpose |
|---|---|---|
| [Noseq architecture](2026-09-06-noseq-architecture.md) | Draft architecture; separate P0/P1 probes landed; G1–G5 unpassed | Confidential application framework, direct fold projections, Nostr ecosystem, sequencing/relay infrastructure and onboarding |
| [Final Atseq assessment](2026-09-07-atseq-final-assessment.md) | Documentation revision grounded in completed Atseq and current Noseq evidence | Source closure, archive trust, exact retry, prefix cost, populated-document hypothesis and P0–P9 dispositions |

The architecture records the design basis and open decisions. The
[prototype implementation plan](../plans/001-confidential-application-prototype.md)
maps the [independent design review](../plans/2026-09-06-design-review.md) to
ordered work packages and proposed verification gates. The
[plans index](../plans/README.md) tracks implementation stages. Experiment results
should get their own dated notes. This index distinguishes proposed from
implemented behavior. P0 is complete; P1 investigations are landed, with full
G1–G5 closure and adoption still pending at the assessment baseline.
GitSeq requests track repository work only and are not a noseq runtime dependency.

The initial publication is tracked by GitSeq request #10 in the workroom with
genesis `77aeeeb3fa42aeb6babdf961f6397ba73fada68b`:

```text
git:sha1:77aeeeb3fa42aeb6babdf961f6397ba73fada68b#git:sha1:0ddf7cdd0daa7e987a036e2cb85201ccce14f9a7
```

See the [repository README](../README.md) for actors, clone/attach instructions
and explicit source and sequence publishing. The architecture remains a draft.

The design-review and plan publication is tracked by GitSeq request #47:

```text
git:sha1:77aeeeb3fa42aeb6babdf961f6397ba73fada68b#git:sha1:c70578a4f674824f7b55ce948aff6f4c6d08f19c
```

The Atseq follow-on revision is tracked by request #108:

```text
git:sha1:77aeeeb3fa42aeb6babdf961f6397ba73fada68b#git:sha1:ae8cb5e84bff85e1cf775b2624ef061c07d4846a
```
