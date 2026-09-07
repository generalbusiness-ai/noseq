# P0 toolchain and evidence

P0 supplies a reproducible local build and test baseline for [Plan 001](../plans/001-confidential-application-prototype.md).
The page is an empty application host with a dedicated-worker handshake. The
Cloudflare Worker exposes only `GET /health`. These are real entry points for
later work; security feasibility and stages P1–P9 remain incomplete.

## Install and run

Use a clean committed checkout. Select Node `26.8.1` with your Node version
manager and npm `11.19.0` (`npm install --global npm@11.19.0` if needed). From the
repository root:

```sh
npm ci
npm run browser:install
npm run check
npm run test:harness
npm run build
```

On Linux, install the Chromium system libraries with
`npm run browser:install -- --with-deps`. The Playwright command needs network
access for the pinned browser download; dependency installation also needs the
npm registry. Tests use local processes and loopback HTTP, without a Cloudflare
account or remote bindings. The browser server requires free port `4173`.

`check` generates the pinned Workers type surface into ignored `.generated/`
and typechecks Node tooling, browser DOM code, the dedicated worker and the
Cloudflare Worker separately. `build` produces `dist/client` and `dist/worker`;
the Worker step is Wrangler's local `--dry-run`, with no deployment. `npm run dev`
opens the generic Vite host on loopback for local development.

The CI workflow installs the same pins on Ubuntu 24.04, runs only these P0 gates,
and retains harness output even after failure. Its actions are pinned by commit.
P0 passed both macOS arm64 validation and a real Ubuntu run at source
`3321e70fcf42fbdb89f20db3f425ec3bc431c2d9`: [GitHub run 34064545219](https://github.com/generalbusiness-ai/noseq/actions/runs/34064545219).
That hosted run installed, typechecked, passed all 12 Node/workerd/Chromium cases
and built both targets. Its retained evidence UUID is
`0de623bf-133f-4e75-ae3b-c8fcfffbf952`. This establishes P0 hosted execution;
it is not a P1 crypto result or a deployed application.

## Pinned surfaces

`package-lock.json` fixes the full dependency graph. `package.json` pins direct
dependencies and the engines; `.node-version` repeats the Node pin.
`fixtures/harness/profile.json` fixes the mandatory case list and runtime profile.
The toolchain check rejects drift before accepting evidence.

| Surface | Pin / API used |
|---|---|
| Node / npm | 26.8.1 / 11.19.0; native TypeScript stripping for scripts |
| TypeScript / Node types | 7.0.2 / 26.4.1 |
| Vite | 8.2.2; production build and preview |
| Vitest | 4.1.11; Node runner and JSON reports |
| Cloudflare Vitest plugin | 1.1.4; `cloudflareTest` from `@cloudflare/vitest-plugin` |
| Wrangler / Miniflare | 4.129.0 / 5.20260903.0-alpha |
| workerd | 1.20260903.1; local Workers execution |
| Workers compatibility | 2026-09-03, `nodejs_compat`; no service or storage bindings |
| Playwright | 1.63.0; Chromium page and dedicated worker |
| Chromium | 153.0.8010.12, bundled revision 1243 |

The Cloudflare plugin requires the Vitest 4.1 line. Its current configuration
uses `cloudflareTest({ wrangler: { configPath }, remoteBindings: false })`; the
runtime tests call `exports.default.fetch` from `cloudflare:workers`.
See the official [configuration](https://developers.cloudflare.com/workers/testing/vitest-integration/configuration/)
and [test API](https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/)
references. These tests run in workerd and assert its environment, including
`WebSocketPair`; they do not implement WebSocket or Durable Object behavior.
Later WebSocket tests must follow the plan's supported storage and cleanup rules.

The browser fixture is a production Vite bundle served to the actual
[Playwright Chromium binary](https://playwright.dev/docs/browsers). Tests verify
the binary version and exercise a `DedicatedWorkerGlobalScope`, not a Node DOM
emulation. npm's lifecycle allowlist permits only the pinned esbuild and workerd
installers needed for their native binaries. Other lifecycle scripts remain
blocked by npm's default policy.

## Evidence contract

`npm run test:harness` creates a new UUID directory under `artifacts/harness/`
for every attempt. It writes records exclusively and never reuses a prior run.
`started.json` records the attempted source commit/tree, working-tree status,
lockfile/profile hashes, host runtime and time before the clean-checkout check.
A dirty checkout, toolchain mismatch or interruption cannot produce accepted
evidence. A started run with no completed evidence remains incomplete.

After validating the checkout, `context.json` records the accepted context and
required suites. Each suite retains its raw runner JSON, process log and any
browser attachments. `evidence.json` binds the UUID, P0 command, source commit
and tree, lockfile hash, runtime/profile/fixture identities, exact required-case
list, suite commands, exit codes, raw-report hashes and case outcomes.
`failure.json` preserves diagnostics, observed start/end provenance and available
results when the runner fails. Failed, skipped or missing cases remain failures;
a fresh successful run does not remove an earlier attempt.

To validate a completed run again, keep its raw reports beside the record and
use the same clean source commit and pinned runtime:

```sh
npm run verify:evidence -- artifacts/harness/<run-uuid>/evidence.json
```

The verifier compares the required cases with the independently loaded committed
profile, rejects missing/extra/duplicate suites and cases, and requires every
mandatory outcome to be `passed` with exit code zero. It checks raw-report hashes
and recomputes case results; skipped, failed, expected-failure and retried browser
tests cannot satisfy a gate. Changed source, fixtures, runtime or reports fail
validation. Node tests exercise missing suites, skipped cases, identity mismatch,
raw-report disagreement and exclusive failure-record writes.

These records support reproducibility and review, not proof against someone who
can rewrite the checkout and reports. P1 must establish the separate protocol
security contract. Bulk records are ignored locally; CI retains them for 30 days.
Later stages may commit the plan's explicitly scoped sanitized summaries. The
repository's GitSeq actor keys remain development workroom material, separate
from the application's future identity and keys.

During initial preparation, native esbuild file reads stalled in a linked
worktree under macOS Documents. Moving that same worktree with `git worktree move`
to `~/play/noseq-worktrees/prototype-p0` restored normal execution without replacing
any target or weakening a check. This was a local path-related observation,
not a diagnosis of esbuild or a claim that every Documents checkout is affected.
Exploratory failures preceded the complete harness; later acceptance attempts
retain their own evidence directories.

## Future command contracts

The following scripts exist and intentionally exit nonzero with
`stage not implemented`: `test:crypto-feasibility`, `gate:protocol`,
`test:protocol`, `test:runtime`, `test:definition`, `test:workers`, `test:relay`,
`test:mirror`, `test:client`, `test:recovery`, `test:ui`, `test:dynamic-apps`,
`test:flows`, `acceptance` and `benchmark`. In particular, `test:workers` remains
reserved for P4 storage/concurrency/crash behavior; the P0 health smoke tests run
through `test:harness`.

Calling `verify:evidence` without a P0 record also fails: the P9 aggregate gate
is not implemented. P0 success cannot unlock implementation beyond the plan's
P1 feasibility gates. Pin crypto, Nostr, schema, JSONata and three.js dependencies
and document their selected APIs only when their owning stage introduces them.


## P1a development probes

`probe:crypto-preflight` and `verify:crypto-preflight` exercise the isolated
[compatibility investigation](crypto-feasibility.md). They add exact dev-only
`pnpm` 10.34.5 and `@noble/curves` 2.2.0 dependencies. The candidate and MLS
submodule are fetched at exact Git revisions into ignored output storage; the
upstream frozen pnpm lock controls their separate dependencies. The application
host and Worker import none of them. The preflight profile records those source
and runtime identities, including all selected upstream fixture hashes.

The probe builds the candidate's declared public exports and runs its unmodified
Vitest 3.2.4 corpus with the native configuration loader. Noseq's additional
preflight tests use the existing Vitest 4.1.11 pin and are included in `check` by
`tsconfig.crypto-preflight.json`. Neither runner weakens the P0 required profile.
Successful preflight evidence retains an explicit incompatible-candidate verdict
and five unpassed gates; `test:crypto-feasibility` and `gate:protocol` still fail.
This is a bounded Node investigation, with no assertion of browser/Workers crypto,
current Marmot interoperability or an adopted encryption stack.

## P1b development probes

`probe:ordered-mls` reruns P1a and then exercises the pinned lower ts-mls public API
through eight actual Node and eight actual Chromium scenarios. Run
`verify:ordered-mls -- artifacts/ordered-mls/runs/<uuid>/evidence.json` to check its
retained evidence again at the same source. The dedicated browser bundle and
signed synthetic traces remain inside that unique run directory; it uses free
loopback port `4175`. No cloud service or production application imports this API.

The command checks `tsconfig.ordered-mls.json` after the pinned source is available;
ordinary `check` continues checking all P0/P1a and Node tooling surfaces from
`npm ci` alone. The ordered profile adds exact MLS source/API hashes and separate
fixture/case requirements. Successful execution means bounded observations
reproduced, including provisional state and interleaving; all full G1–G5 gates and
their reserved commands remain unpassed. [The feasibility note](crypto-feasibility.md#p1b-ordered-mls-api-observations)
defines the test proof/order domains and the limits of its join and restart claims.

The CI workflow still runs the P0 baseline only. Local P1b browser crypto is a
separate result; neither the P0 hosted run nor the P1a Node preflight stands in
for it. P1b does not add a crypto package to the production dependency graph.

## P1c proposed-profile probes

The application build and hosted CI remain P0-only. `npm ci`, `npm run check`
and `npm run build` still work without the separate upstream source caches.
`probe:protocol-feasibility` fetches/checks pinned reference sources, runs the P0
harness and unchanged P1a/P1b prerequisites, checks the dedicated P1c TypeScript
configuration, builds its actual Chromium page and runs 16 Node plus 16 Chromium
cases, then eight actual gateway/strfry socket cases. Its browser uses free
loopback port 4176. The native relay probe allocates
fresh loopback ports and stops its children. There is no deployment command.

```sh
npm ci
npm run browser:install
npm run check
npm run build
NOSEQ_STRFRY_ROOT=/absolute/path/to/retained/noseq-strfry-native npm run probe:protocol-feasibility
npm run verify:protocol-feasibility -- artifacts/protocol-feasibility/runs/<uuid>/evidence.json
npm run test:crypto-feasibility -- artifacts/protocol-feasibility/runs/<uuid>/evidence.json
npm run gate:protocol -- artifacts/protocol-feasibility/runs/<uuid>/evidence.json
```

The last two commands intentionally fail even for valid candidate observations.
They validate supplied evidence and explain the absent full gate/decision
closure. All 15 reserved command checks remain exercised by the P0 harness;
they have not been deleted when the two gate readers were introduced.

For this local investigation, `NOSEQ_STRFRY_ROOT` points to the coordinator's
retained `work/noseq-strfry-native` directory under this Codex task, containing
`source/strfry`, clean source/submodules, private `prefix/` and
`runs/a738aa02-a674-4649-b0c7-9b7971fe103c/record.json`. The exact source, binary and
build-record hashes are in the [machine profile](../fixtures/crypto/protocol/profile.json).
The record and `build.py` retain compiler, OS, existing libraries, four static
bottle hashes, private-prefix overrides and build logs. This is a pinned macOS
execution dependency, not an npm download or a portable rebuild promise.
Absent/changed native material makes the candidate run fail and leaves G5
pending; a different platform/build needs its own reviewed profile/evidence.
The verifier can inspect retained copied native inputs/results without launching
the binary. Do not install global dependencies or replace the selected source
implicitly to make the check green.

P1c adds exact dev-only nostr-tools 2.25.2 under its Unlicense, ws 8.21.0
under MIT, @types/ws 8.18.1 for the local gateway, and pins the
additional internal MLS helper source/built bytes. The production host/Worker
import neither. The protocol profile also pins the inspected NIP registry/files,
all fixture and specification bytes, required cases and explicit unpassed gates.
The native probe is a source-bound adaptation of the coordinator's synthetic
size/COUNT experiment; its expected negative result is not a security pass.

Each run has a new UUID, exclusive start/context/command/evidence/failure records,
raw test reports, browser bundle, synthetic signed fixture traces and native
configs/logs/results, gateway state snapshots and separate replication-process
traces. The isolation case also requires macOS `/usr/bin/sandbox-exec`; another
platform must supply a separately reviewed equivalent, not skip the case. Prerequisite evidence is hash-bound and recursively
validated against the same clean source/tree, lock and runtime. Missing cases,
retries, skipped outcomes, changed raw reports, foreign source and forged gate
claims fail. Ignored LMDB databases are retained separately from the hashed
native input/result manifest; no final artifact claims they are recovery proof.

Earlier failed or exploratory runs remain available. In P1c preparation an
ordered-MLS run detected a package/lock change during execution and correctly
failed its source check (`c1db86b7-959f-46e4-894c-19f52da5d9df`); it is not an
acceptance result. Exploration directories retain earlier typecheck and scenario
failures alongside later passes, including development of message-specific
archive openings and separate owner-vault custody. Only a clean exact-head
candidate run plus actual independent review supports the publication claim.
Hosted P0 success still cannot stand in for any P1c crypto/relay result.

The P1c review correction adds actual archive maximum/+1 refusal vectors and
gateway regression cases for learned-control reconstruction and aggregate
retention accounting. Earlier passing suites remain evidence of their narrower
coverage: the reviewer's retained extra socket experiment exposed these two gaps.
All prior records remain unchanged. G2-LONG-HISTORY composition and full gate
activation remain explicit pending adoption work.

The added full-size export vector initially exposed a V8 regexp stack overflow
in the grouped base64 validator. The corrected flat alphabet/padding scan keeps
canonical padding-bit verification and roundtrips the full bound. Its failed
exploratory run remains alongside the corrected runs; it is not an acceptance
result. The first focused gateway retry also used a relative output path where
the native launcher requires the runner's absolute run directory, and failed
before service execution; the absolute-directory rerun is recorded separately.
