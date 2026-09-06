# Design and Implementation Notes

Dated notes (YYYY-MM-DD-title.md) to capture designs, implementation plans,
and discussion summaries. Frontmatter "status" should be maintained.

| Note | Status | Purpose |
|---|---|---|
| [Noseq architecture](2026-09-06-noseq-architecture.md) | Draft for a comparative prototype; implementation not started | Confidential application framework, direct fold projections, Nostr ecosystem, sequencing/relay infrastructure and onboarding |

The architecture records the design basis and open decisions. The
[prototype implementation plan](../plans/001-confidential-application-prototype.md)
maps the [independent design review](../plans/2026-09-06-design-review.md) to
ordered work packages and proposed verification gates. The
[plans index](../plans/README.md) tracks implementation stages. Experiment results
should get their own dated notes. This index distinguishes proposed from
implemented behavior.
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
