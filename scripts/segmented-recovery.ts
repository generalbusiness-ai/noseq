import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  collectContext,
  observeAttempt,
  sha256File,
  writeNewRecord,
  assertReportPassed,
  vitestCases,
  playwrightCases,
  type SuiteResult,
} from "./evidence.ts";
import { fileManifest } from "./ordered-mls-evidence.ts";
import { nativeManifest } from "./protocol-feasibility-evidence.ts";
import {
  segmentedContext,
  segmentedProfile,
  profilePath,
  validateSegmented,
  verifySegmentedFiles,
  observationFiles,
  type SegmentedEvidence,
} from "./segmented-recovery-evidence.ts";
if (process.argv[2] === "--verify") {
  try {
    assert.equal(process.argv.length, 4);
    const path = process.argv[3]!;
    assert(statSync(path).size <= 1_048_576);
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    validateSegmented(value, segmentedContext());
    verifySegmentedFiles(value, dirname(path));
    console.log(
      "Segmented recovery observations verified; independent review/adoption required; G1-G5 UNPASSED.",
    );
  } catch (error) {
    console.error(String(error));
    process.exitCode = 1;
  }
} else {
  const runId = randomUUID(),
    directory = resolve("artifacts/segmented-recovery/runs/" + runId);
  mkdirSync(dirname(directory), { recursive: true });
  mkdirSync(directory);
  const attempt = observeAttempt();
  writeNewRecord(join(directory, "started.json"), { runId, attempt });
  const diagnostics: string[] = [],
    suites: SuiteResult[] = [];
  let step = 0,
    context: ReturnType<typeof segmentedContext> | undefined;
  function run(args: string[], timeout = 180000) {
    const fd = openSync(join(directory, `${++step}.log`), "wx");
    console.log(`Segmented recovery step ${step}: node ${args.join(" ")}`);
    const r = spawnSync(process.execPath, args, {
      stdio: ["ignore", fd, fd],
      timeout,
      env: { ...process.env, CI: "true", NOSEQ_SEGMENTED_RUN: directory },
    });
    closeSync(fd);
    process.stdout.write(readFileSync(join(directory, `${step}.log`)));
    writeNewRecord(join(directory, `${step}.command.json`), {
      command: process.execPath,
      args,
      cwd: process.cwd(),
      exitCode: r.status,
      signal: r.signal,
      error: r.error?.message ?? null,
    });
    return r.status ?? 1;
  }
  try {
    assert.equal(process.argv.length, 2, "unknown probe arguments");
    collectContext();
    const parent = "artifacts/protocol-feasibility/runs";
    mkdirSync(parent, { recursive: true });
    const before = new Set(readdirSync(parent));
    assert.equal(
      run(["scripts/protocol-feasibility.ts"], 1200000),
      0,
      "all 102 prerequisites required",
    );
    const added = readdirSync(parent).filter((x) => !before.has(x));
    assert.equal(added.length, 1, "concurrent prerequisite writers unsupported");
    const prerequisite = {
      path: `${parent}/${added[0]}/evidence.json`,
      sha256: sha256File(`${parent}/${added[0]}/evidence.json`),
      cases: 102 as const,
    };
    context = segmentedContext();
    const p = segmentedProfile();
    writeNewRecord(join(directory, "context.json"), { context, prerequisite, required: p.suites });
    assert.equal(
      run([
        "node_modules/typescript/bin/tsc",
        "--noEmit",
        "-p",
        "tsconfig.segmented-recovery.json",
      ]),
      0,
      "segmented typecheck",
    );
    assert.equal(
      run([
        "node_modules/vite/bin/vite.js",
        "build",
        "--config",
        "segmented-recovery.vite.config.ts",
        "--configLoader",
        "native",
      ]),
      0,
      "actual browser bundle",
    );
    for (const suite of p.suites) {
      const path = join(directory, suite.id + ".json"),
        args =
          suite.id === "browser"
            ? [
                "node_modules/@playwright/test/cli.js",
                "test",
                "--config",
                "segmented-recovery.playwright.config.ts",
              ]
            : [
                "node_modules/vitest/vitest.mjs",
                "run",
                "--config",
                suite.id === "gateway"
                  ? "segmented-gateway.config.ts"
                  : "segmented-recovery.config.ts",
                "--configLoader",
                "native",
                "--reporter=default",
                "--reporter=json",
                `--outputFile=${path}`,
              ];
      let exitCode = run(args, 300000),
        cases: SuiteResult["cases"] = [],
        reportSha256 = "";
      try {
        reportSha256 = sha256File(path);
        const raw = JSON.parse(readFileSync(path, "utf8"));
        cases = suite.id === "browser" ? playwrightCases(raw) : vitestCases(raw);
        assertReportPassed(raw, suite.id);
      } catch (error) {
        diagnostics.push(String(error));
        exitCode = 1;
      }
      suites.push({ id: suite.id, command: suite.command, exitCode, cases, reportSha256 });
    }
    assert.deepEqual(segmentedContext(), context, "source drift during execution");
    const record: SegmentedEvidence = {
      schema: "noseq/segmented-feasibility@1",
      runId,
      command: "npm run probe:segmented-recovery",
      conclusion: p.conclusion,
      context,
      gates: p.gates,
      required: p.suites,
      suites,
      prerequisite,
      observations: Object.fromEntries(
        observationFiles().map((f) => [f, sha256File(join(directory, f))]),
      ),
      browserBundle: fileManifest(join(directory, "browser-bundle")),
      native: nativeManifest(join(directory, "native")),
      commands: Object.fromEntries(
        readdirSync(directory)
          .filter((f) => /^[1-9][0-9]*\.(log|command.json)$/.test(f))
          .map((f) => [f, sha256File(join(directory, f))]),
      ),
    };
    writeNewRecord(join(directory, "evidence.json"), record);
    validateSegmented(record, context);
    verifySegmentedFiles(record, directory);
    console.log(
      `Segmented observations reproduced, all 102 prerequisites retained. G1-G5 remain UNPASSED; no adoption.\nEvidence: ${directory}/evidence.json`,
    );
  } catch (error) {
    diagnostics.push(String(error));
    writeNewRecord(join(directory, "failure.json"), {
      runId,
      attempt,
      ended: observeAttempt(),
      context: context ?? null,
      suites,
      diagnostics,
    });
    console.error(`Segmented feasibility failed; retained ${directory}\n${diagnostics.join("\n")}`);
    process.exitCode = 1;
  }
}
