import { readFileSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { collectContext, loadProfile, validateEvidence, verifyRawReports, type Evidence } from "./evidence.ts";

if (import.meta.main) {
  try {
    const path = process.argv[2];
    if (!path) throw new Error("stage not implemented: P9 aggregate evidence; supply a P0 evidence.json path to validate P0 only");
    if (statSync(path).size > 1_048_576) throw new Error("Evidence exceeds 1 MiB");
    const evidence: unknown = JSON.parse(readFileSync(path, "utf8"));
    validateEvidence(evidence, collectContext(), loadProfile().suites);
    verifyRawReports(evidence as Evidence, dirname(path));
    console.log("P0 evidence verified for the current clean source.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
