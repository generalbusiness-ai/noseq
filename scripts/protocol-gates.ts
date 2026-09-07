import { strict as assert } from "node:assert";
import { readFileSync, statSync } from "node:fs";
import { dirname } from "node:path";
import {segmentedContext,validateSegmented,verifySegmentedFiles} from "./segmented-recovery-evidence.ts";
import { protocolContext, validateProtocol, verifyProtocolFiles } from "./protocol-feasibility-evidence.ts";

// This candidate has no activation path. A boolean, arbitrary report ID or edited JSON
// cannot substitute for the separately authorized, reviewed closure implementation.
try {
  const [command, path, ...extra] = process.argv.slice(2);
  assert(command === "test:crypto-feasibility" || command === "gate:protocol", "Unknown gate command");
  assert.equal(extra.length, 0, "No self-asserted approval/override arguments accepted");
  if (path) {
    assert(statSync(path).size <= 1_048_576); const e: unknown = JSON.parse(readFileSync(path, "utf8"));
    if((e as {schema?:unknown})?.schema==="noseq/segmented-feasibility@1"){validateSegmented(e,segmentedContext());verifySegmentedFiles(e,dirname(path));}
    else {validateProtocol(e, protocolContext()); verifyProtocolFiles(e, dirname(path));}
  }
  throw new Error("full G1-G5 closure pending: segmented G2 composition is a proposed-profile investigation; actual exact-profile decisions, explicit root adoption and a separately reviewed detached-decision activation validator are required; see docs/segmented-recovery.md");
} catch (error) { console.error(`stage not implemented: protocol gate activation; ${String(error)}`); process.exitCode = 1; }
