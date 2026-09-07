import {
  decodeState,
  entry,
  privateMessage,
  publicTransition,
  submission,
  type PublicState,
} from "../protocol-feasibility/crypto.ts";
import { createOpening } from "../protocol-feasibility/opening.ts";
import { sign } from "../protocol-feasibility/wire.ts";
import { Sealer, VerifiedHistory } from "./archive.ts";
import { Records } from "./storage.ts";
import { refused, rewrite, small } from "./adversarial.ts";
import {
  b64,
  bytes,
  check,
  clone,
  hash,
  manifest,
  open,
  parse,
  profile,
  random,
  sign2,
} from "./wire.ts";
import { key } from "./fixture.ts";
import type { BodyCore, TextStore, RecordCore } from "./types.ts";
export async function boundaries(backing: TextStore, name: string) {
  const { w, p } = await small(backing, name),
    observed = [];
  let state = clone(w.initial);
  const originals: { record: RecordCore; after: PublicState }[] = [];
  let maximumSingle = 0;
  for (let i = 1; i <= 6; i++) {
    const record = (await w.owner.log.get(i)).record,
      next = publicTransition(w.ctx, state, entry(record.event, w.ctx));
    const body: BodyCore = {
      profile,
      records: [record],
      before: state,
      after: next,
      founder: i === 1 ? w.sealer.founder : null,
    };
    maximumSingle = Math.max(maximumSingle, bytes(body));
    originals.push({ record, after: next });
    state = next;
  }
  const bounded = new Sealer(w.store, w.ctx, key(101), w.sealer.founder, w.initial, maximumSingle);
  await bounded.initialize(w.definition);
  for (const item of originals) await bounded.append(item.record, item.after);
  const bytePackage = await bounded.export(w.owner);
  check(
    bounded.descriptors.length > 1 && bounded.descriptors.every((d) => d[10] <= maximumSingle),
    "real byte overflow seals short intervals",
  );
  const verified = await VerifiedHistory.recover(
    w.store,
    w.root.event,
    bytePackage.checkpoint,
    bytePackage.locator,
    bytePackage.grantKey,
    { owner: w.ctx.owner, genesis: w.ctx.genesis, checkpoint: bytePackage.checkpoint.id },
    new Records(backing, name + "-byte-recovered"),
  );
  check(verified.log.length === 6, "byte rollover preserves every record");
  const tiny = new Sealer(w.store, w.ctx, key(101), w.sealer.founder, w.initial, 1);
  await tiny.initialize(w.definition);
  observed.push(
    await refused(
      "single record plus mandatory proof cannot fit",
      () => tiny.append(originals[0]!.record, originals[0]!.after),
      "single entry and proof",
    ),
  );
  check(
    tiny.trace.records === 0 && tiny.descriptors.length === 0,
    "single overflow does not advance sealed prefix",
  );
  const sub = await w.owner.stageAction("conflicting action", key(1002)),
    opening = await createOpening(
      decodeState(w.owner.data.state),
      privateMessage(submission(sub, w.ctx).bytes),
      w.env,
      5,
      sub.id,
      w.owner.data.pending!.plaintext!,
    );
  const bad = await rewrite(w, p, (r) => {
    const previous = entry(r.bodies[2]!.records[0]!.event, w.ctx).previous;
    const changed = sign(key(109), "order", w.ctx, {
      position: 5,
      previous,
      submission: sub,
      admission: null,
    });
    r.bodies[2]!.records[0] = { event: changed, opening };
    const last = entry(r.bodies[2]!.records[1]!.event, w.ctx);
    r.bodies[2]!.records[1]!.event = sign(key(109), "order", w.ctx, {
      ...last,
      previous: changed.id,
    });
    r.ranges[2]!.tip = r.bodies[2]!.records[1]!.event.id;
    r.checkpoint.tip = r.ranges[2]!.tip;
  });
  observed.push(
    await refused(
      "genuine cross-segment conflicting logical action",
      () =>
        VerifiedHistory.recover(
          w.store,
          w.root.event,
          bad.checkpoint,
          bad.locator,
          bad.grantKey,
          { owner: w.ctx.owner, genesis: w.ctx.genesis, checkpoint: bad.checkpoint.id },
          new Records(backing, name + "-conflict"),
        ),
      "cross-segment logical conflict",
    ),
  );
  const head = JSON.parse(p.checkpoint.content).head,
    event = await w.store.get(head),
    m = await manifest(event, w.ctx);
  const originalKey = w.sealer.keys.get(head)!;
  const changed = clone(m);
  changed.meta.nonce = b64(random(12));
  changed.metaId = await hash([profile, "meta", changed.meta]);
  changed.chunks = [];
  for (const id of m.chunks) {
    const original = await w.store.get(id),
      c = parse(original.content) as Record<string, unknown>;
    const next = sign2(key(101), "chunk", w.ctx, { ...c, metaId: changed.metaId });
    await w.store.put(next);
    changed.chunks.push(next.id);
  }
  const badAad = sign2(key(101), "manifest", w.ctx, changed);
  await w.store.put(badAad);
  observed.push(
    await refused(
      "resigned metadata and chunk links still fail actual AEAD",
      () => open(w.store, badAad, originalKey, w.ctx, "segment"),
      "OperationError",
    ),
  );
  const extra = clone(m) as any;
  extra.unspecified = "forbidden";
  observed.push(
    await refused(
      "unknown manifest field",
      () => manifest(sign2(key(101), "manifest", w.ctx, extra), w.ctx),
      "fields",
    ),
  );
  return {
    profile,
    case: name,
    context: w.ctx,
    checkpoint: bytePackage.checkpoint.id,
    byteRolloverConfiguredLimit: maximumSingle,
    actualRanges: bounded.descriptors.map((d) => [d[2], d[3], d[10]]),
    observed,
    status: "observed; no full gate pass",
  };
}
