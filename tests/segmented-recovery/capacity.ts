import { grantKeyIndex } from "./archive.ts";
import {
  integer,
  bounds,
  bytes,
  check,
  clone,
  hash,
  hex,
  limits,
  manifest,
  open,
  profile,
  random,
  seal,
  sign2,
  utf8,
  blankRange,
} from "./wire.ts";
import { costIndex } from "./eligibility.ts";
import { refused, small } from "./adversarial.ts";
import { RecoveryBudget } from "./storage.ts";
import { key, world } from "./fixture.ts";
import type { TextStore, Descriptor, GrantCore } from "./types.ts";
export async function capacity(backing: TextStore, name: string) {
  const { w, p } = await small(backing, name),
    observed = [];
  const core = "x".repeat(bounds.segmentBytes - 2),
    range = {
      ...blankRange(w.ctx),
      ordinal: 1,
      first: 1,
      last: 1,
      entries: 1,
      before: key(900),
      after: key(901),
      predecessor: w.ctx.genesis,
      tip: key(902),
    };
  const sealed = await seal(w.store, key(101), w.ctx, "segment", core, range);
  check(
    sealed.manifest.meta.plainBytes === bounds.segmentBytes &&
      sealed.manifest.chunks.length === 1025,
    "actual maximum encoded object and chunk count",
  );
  check(
    (await open(w.store, sealed.event, sealed.key, w.ctx, "segment")) === core,
    "actual full-length GCM and chunk reconstruction",
  );
  observed.push(
    await refused(
      "segment plaintext maximum plus one",
      () => seal(w.store, key(101), w.ctx, "segment", core + "x", range),
      "object plaintext capacity",
    ),
  );
  const tooMany = clone(sealed.manifest);
  tooMany.chunks.push(key(999));
  observed.push(
    await refused(
      "manifest chunk count plus one",
      () => manifest(sign2(key(101), "manifest", w.ctx, tooMany), w.ctx),
      "chunk count/length",
    ),
  );
  const descriptors: Descriptor[] = [],
    keys: [string, string][] = [],
    logical: [string, string][] = [],
    costs: [string, number][] = [];
  let previous: string | null = null;
  for (let i = 1; i <= bounds.entries; i++) {
    const id = key(100000 + i);
    descriptors.push([
      id,
      i,
      i,
      i,
      previous,
      previous ?? w.ctx.genesis,
      id,
      key(910),
      key(911),
      1,
      1234,
    ]);
    keys.push([id, key(200000 + i)]);
    logical.push([key(300000 + i), id]);
    costs.push([id, limits.event]);
    previous = id;
  }
  const sizes = {
    descriptors: bytes(descriptors),
    keys: bytes(keys),
    logical: bytes(logical),
    costs: costIndex(costs).indexBytes,
  };
  check(
    sizes.descriptors <= bounds.descriptorIndexBytes &&
      sizes.keys < bounds.grantBytes &&
      sizes.logical <= bounds.logicalIndexBytes,
    "actual 65536 compact encoding budgets",
  );
  integer(descriptors.length, bounds.segments);
  observed.push(
    await refused("segment count ceiling plus one", () =>
      integer(descriptors.length + 1, bounds.segments),
    ),
  );
  const maxGrant: GrantCore = {
    profile,
    context: w.ctx,
    head: keys.at(-1)![0],
    definition: key(912),
    keys,
    definitionKey: key(913),
  };
  grantKeyIndex(maxGrant.keys);
  const grantRange = {
    ...blankRange(w.ctx),
    first: 1,
    last: bounds.entries,
    entries: bounds.entries,
    previous: maxGrant.head,
    tip: key(914),
    after: key(915),
    checkpoint: key(916),
  };
  const grantSeal = await seal(w.store, key(101), w.ctx, "grant", maxGrant, grantRange);
  const reopened = (await open(
    w.store,
    grantSeal.event,
    grantSeal.key,
    w.ctx,
    "grant",
  )) as GrantCore;
  check(
    reopened.keys.length === bounds.entries,
    "actual maximum-count grant encrypted and reconstructed",
  );
  observed.push(
    await refused(
      "grant key count ceiling plus one",
      () => grantKeyIndex([...keys, [key(917), key(918)]]),
      "grant key count capacity",
    ),
  );
  // Safety ceilings are independent. Joint admission rejects the actual full closure earlier when retained wire cost requires it.
  check(
    costIndex(costs).total > limits.journal,
    "count ceiling alone never establishes recoverability",
  );
  const planPairs = Array.from(
    { length: bounds.reservationEntries },
    (_, i) => [key(400000 + i), 1] as [string, number],
  );
  const planSize = costIndex(planPairs).indexBytes;
  observed.push(
    await refused(
      "exact-ID plan count maximum plus one",
      () => costIndex([...planPairs, [key(900000), 1]]),
      "retention plan count",
    ),
  );
  const rootBytes = bytes(w.root.event),
    budget = new RecoveryBudget(w.store, rootBytes);
  budget.account(w.root.event);
  budget.account(w.root.event);
  check(budget.total === rootBytes, "exact ID charged once at actual byte maximum");
  observed.push(
    await refused(
      "unique retained identity exceeds configured capacity",
      () => budget.account(p.checkpoint),
      "full closure recovery capacity",
    ),
  );
  const oneLess = new RecoveryBudget(w.store, rootBytes - 1);
  observed.push(
    await refused(
      "actual event one byte over configured capacity",
      () => oneLess.account(w.root.event),
      "full closure recovery capacity",
    ),
  );
  return {
    profile,
    case: name,
    context: w.ctx,
    checkpoint: p.checkpoint.id,
    framingOnlyMaximum: {
      plaintext: bytes(core),
      ciphertext: sealed.manifest.meta.cipherBytes,
      chunks: sealed.manifest.chunks.length,
      manifestBytes: bytes(sealed.event),
      scope: "actual GCM/framing bound; deliberately not a semantic archive BodyCore",
    },
    maximumGrant: {
      keys: keys.length,
      plaintext: bytes(maxGrant),
      ciphertext: grantSeal.manifest.meta.cipherBytes,
      chunks: grantSeal.manifest.chunks.length,
      manifestBytes: bytes(grantSeal.event),
      meaning:
        "largest key-count grant is below 16MiB; actual selected history must independently fit aggregate retained bytes",
    },
    compactIndexCount: bounds.entries,
    compactEncodedBytes: sizes,
    exactIdPlanCount: planPairs.length,
    exactIdPlanBytes: planSize,
    retentionHardCeiling: limits.journal,
    actualConfiguredBoundary: rootBytes,
    observed,
    status: "observed; no full gate pass",
  };
}
export async function complexity(backing: TextStore, name: string) {
  const samples = [];
  for (const count of [32, 64, 128]) {
    const w = await world(backing, name + count);
    for (let i = 2; i <= count; i++) await w.apply("bounded workload", key(10000 + i));
    await w.sealer.flush();
    const before = clone(w.sealer.trace),
      reads = w.owner.log.recordReads;
    const p = await w.sealer.export(w.owner),
      afterExport = clone(w.sealer.trace);
    check(
      afterExport.segmentEncryptions === before.segmentEncryptions &&
        afterExport.segmentPlainBytes === before.segmentPlainBytes,
      "export never re-encrypts sealed history",
    );
    await w.apply("new suffix", key(20000 + count));
    check(w.owner.log.recordReads - reads === 1, "ordinary append visits only new log record");
    check(w.owner.log.recordWrites === count + 1, "one immutable record write per append");
    check(
      w.sealer.trace.segmentEncryptions === afterExport.segmentEncryptions,
      "ordinary suffix never rewrites old segments",
    );
    samples.push({
      entries: count,
      recordWrites: count,
      recordBytes: before.recordBytes,
      sealedBytes: before.segmentPlainBytes,
      encryptions: before.segmentEncryptions,
      exportKeyVisits: afterExport.grantVisits - before.grantVisits,
      ordinaryAppendRecordReads: w.owner.log.recordReads - reads,
      maximumCanonicalBytes: before.maximumCanonicalBytes,
      checkpoint: p.checkpoint.id,
    });
  }
  check(
    samples[1]!.recordBytes < 3 * samples[0]!.recordBytes &&
      samples[2]!.recordBytes < 3 * samples[1]!.recordBytes,
    "bounded increasing record serialization",
  );
  return {
    profile,
    case: name,
    samples,
    scope:
      "logical counters and maximum individual canonical allocation; not physical peak memory or streaming AEAD",
    status: "observed; no full gate pass",
  };
}
