# Noseq

Noseq explores confidential, purpose-specific applications over Nostr, using a
runtime and app definitions in the lineage of
[GitSeq](https://github.com/generalbusiness-ai/gitseq) and
[Atseq](https://github.com/generalbusiness-ai/atseq).

The proposed model orders authenticated actions, lets authorized participants
decrypt and fold them, and renders the fold results. Results may be queryable
databases, JSON bound directly to an interface, or geometry buffers.

This repository currently contains a **draft design**, with no runtime
implementation. Publication of the note does not adopt its proposed architecture
or authorize implementation. Start with the
[architecture note](notes/2026-09-06-noseq-architecture.md) and
[notes index](notes/README.md).

The [prototype implementation plan](plans/001-confidential-application-prototype.md)
maps the [independent design review](plans/2026-09-06-design-review.md) to ordered
work packages and proposed verification gates. The [plans index](plans/README.md)
tracks implementation stages; no runtime work is complete.

## Repository workroom

[AGENTS.md](AGENTS.md) requires GitSeq requests to track repository work.
GitSeq is the development workroom; it is not a Noseq runtime dependency.
The root `.gitseq` watches `notes/**.md` and `plans/**.md` for explicit GitSeq
publication.

The workroom genesis is:

```text
77aeeeb3fa42aeb6babdf961f6397ba73fada68b
```

Initial actors are agents with these durable roles:

| Actor | Roles | Intended work |
|---|---|---|
| `noseq-codex` | operator, participant, ratifier | Coordination, governance and review of another actor's work |
| `noseq-builder` | participant | Source and documentation changes |
| `noseq-reviewer` | participant | Independent review |

Each act must be signed by the actor doing the work. Review must come from a
different agent from the author. These are development identities with local
custody, not Nostr accounts or a security boundary between local processes.
Actor and sequencer keys remain in Git's common directory under `gitseq/`;
they are not source files and are not included in ordinary Git pushes.

## Clone and read the workroom

Install `gs` using GitSeq's
[getting-started instructions](https://github.com/generalbusiness-ai/gitseq/blob/main/docs/getting-started.md),
then:

```sh
git clone https://github.com/generalbusiness-ai/noseq.git
cd noseq
gs attach --repo . --remote origin --genesis 77aeeeb3fa42aeb6babdf961f6397ba73fada68b
gs verify --repo .
gs status --repo . --server -
```

An ordinary clone gets source history. `gs attach` fetches and verifies the
separate sequence, creating a read-only workroom without signing keys. Run the
same `gs attach` command again to import later workroom events; ordinary
`git fetch` only updates its remote observation. Do not run `gs init` in a clone
of this existing workroom. Participation requires separately arranged actor
custody and access to its sequencer. Follow the
[GitSeq workroom skill](https://github.com/generalbusiness-ai/gitseq/blob/main/SKILL.md)
for requests, exact-path artifacts, independent review and landing.

## Publish from the workroom repository

After the approved source has landed on `main`, publish both source and sequence:

```sh
git push -u origin main
git push origin 'refs/seq/*:refs/seq/*'
```

The second push is explicit because ordinary pushes omit GitSeq refs. Keep it
fast-forward only. Do not mirror local refs or map fetch destinations into
`refs/seq/*`; GitSeq's
[attach instructions](https://github.com/generalbusiness-ai/gitseq/blob/main/docs/reference/gs/attach.md)
explain the separate remote tracking refs.

Licensed under [Apache 2.0](LICENSE); see [NOTICE](NOTICE).
