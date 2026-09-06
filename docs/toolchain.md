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
