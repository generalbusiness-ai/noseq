// Deliberately privileged fixture author: re-signs/re-encrypts every outer layer so semantic checks must run.
import {
  coreHash,
  checkpoint,
  descriptorIndex,
  locator,
  VerifiedHistory,
  type Package,
} from "./archive.ts";
import { Records } from "./storage.ts";
import {
  blankRange,
  bytes,
  check,
  clone,
  hash,
  hex,
  manifest,
  metrics,
  open,
  profile,
  random,
  seal,
  sign2,
  type ObjectStore,
  type Range,
  type Signed,
} from "./wire.ts";
import type { BodyCore, CheckpointCore, GrantCore, VaultCore, TextStore } from "./types.ts";
import { key, world } from "./fixture.ts";
export type World = Awaited<ReturnType<typeof world>>;
export interface Rewrite {
  bodies: BodyCore[];
  ranges: Range[];
  grant: GrantCore;
  vault: VaultCore;
  checkpoint: CheckpointCore;
}
export async function rewrite(
  w: World,
  p: Package,
  mutate: (r: Rewrite) => void,
): Promise<Package> {
  const c = checkpoint(p.checkpoint, w.ctx, { owner: w.ctx.owner, genesis: w.ctx.genesis }),
    l = locator(p.locator, w.ctx, p.checkpoint),
    index = await descriptorIndex(w.store, c, w.ctx, metrics());
  const g = (await open(
      w.store,
      await w.store.get(l.grant),
      p.grantKey,
      w.ctx,
      "grant",
    )) as GrantCore,
    v = (await open(w.store, await w.store.get(l.vault), p.vaultKey, w.ctx, "vault")) as VaultCore;
  const bodies: BodyCore[] = [],
    ranges: Range[] = [];
  for (let i = 0; i < index.length; i++) {
    const e = await w.store.get(index[i]![0]),
      m = await manifest(e, w.ctx);
    bodies.push((await open(w.store, e, g.keys[i]![1], w.ctx, "segment")) as BodyCore);
    const {
      ordinal,
      first,
      last,
      predecessor,
      tip,
      previous,
      entries,
      applications,
      before,
      after,
      checkpoint,
    } = m.meta;
    ranges.push({
      ordinal,
      first,
      last,
      predecessor,
      tip,
      previous,
      entries,
      applications,
      before,
      after,
      checkpoint,
    });
  }
  const r: Rewrite = { bodies, ranges, grant: clone(g), vault: clone(v), checkpoint: clone(c) };
  mutate(r);
  const keys: [string, string][] = [];
  let previous: string | null = null,
    plain = 0;
  for (let i = 0; i < r.bodies.length; i++) {
    const range = { ...r.ranges[i]!, previous };
    const e = await seal(w.store, key(101), w.ctx, "segment", r.bodies[i], range);
    keys.push([e.event.id, e.key]);
    previous = e.event.id;
    plain += e.manifest.meta.plainBytes;
  }
  const originalToNew = new Map(g.keys.map((x, i) => [x[0], keys[i]]));
  r.grant.keys = r.grant.keys.map((pair) => originalToNew.get(pair[0]) ?? pair);
  r.grant.head = previous!;
  // Preserve deliberately malformed key count/order; correct keys only for unchanged exact old pairs.
  r.checkpoint.head = previous!;
  r.checkpoint.plainBytes = plain;
  r.checkpoint.grantHash = await coreHash(r.grant);
  const grantKey = hex(random());
  r.vault.head = previous!;
  r.vault.grantHash = r.checkpoint.grantHash;
  r.vault.grantKey = grantKey;
  r.checkpoint.vaultHash = await coreHash(r.vault);
  const certificate = sign2(key(101), "checkpoint", w.ctx, r.checkpoint);
  const range = {
    ...blankRange(w.ctx),
    first: 1,
    last: r.checkpoint.last,
    tip: r.checkpoint.tip,
    previous: previous!,
    entries: r.checkpoint.last,
    applications: r.checkpoint.applications,
    after: r.checkpoint.finalStateHash,
    checkpoint: certificate.id,
  };
  const sg = await seal(w.store, key(101), w.ctx, "grant", r.grant, range, undefined, grantKey),
    sv = await seal(w.store, key(101), w.ctx, "vault", r.vault, range, undefined, p.vaultKey);
  const location = sign2(key(101), "locator", w.ctx, {
    profile,
    checkpoint: certificate.id,
    grant: sg.event.id,
    vault: sv.event.id,
  });
  await w.store.put(certificate);
  await w.store.put(location);
  return { checkpoint: certificate, locator: location, grantKey, vaultKey: p.vaultKey };
}
export async function refused(
  label: string,
  fn: () => Promise<unknown> | unknown,
  contains?: string,
): Promise<{ label: string; error: string }> {
  try {
    await fn();
  } catch (error) {
    const message = String(error);
    if (contains) check(message.includes(contains), label + " wrong refusal: " + message);
    return { label, error: message };
  }
  throw new Error(label + " unexpectedly accepted");
}
export async function small(backing: TextStore, name: string) {
  const w = await world(backing, name);
  await w.apply("first", key(1002));
  await w.sealer.flush();
  await w.control();
  await w.apply("second", key(1004));
  await w.sealer.flush();
  await w.apply("first", key(1002));
  await w.apply("declined", key(1006), "refuse");
  const p = await w.sealer.export(w.owner);
  return { w, p };
}
export async function adversarial(backing: TextStore, name: string) {
  const { w, p } = await small(backing, name);
  const observed = [];
  let serial = 0;
  const recover = (
    candidate: Package,
    store: ObjectStore = w.store,
    expected = candidate.checkpoint.id,
  ) =>
    VerifiedHistory.recover(
      store,
      w.root.event,
      candidate.checkpoint,
      candidate.locator,
      candidate.grantKey,
      { owner: w.ctx.owner, genesis: w.ctx.genesis, checkpoint: expected },
      new Records(backing, name + "-negative-" + ++serial),
    );
  const specs: [string, (r: Rewrite) => void, string][] = [
    [
      "missing genuine application opening",
      (r) => {
        r.bodies[0]!.records[1]!.opening = null;
      },
      "exact opening coverage",
    ],
    [
      "extra opening on control",
      (r) => {
        r.bodies[0]!.records[0]!.opening = clone(r.bodies[0]!.records[1]!.opening);
      },
      "extra control opening",
    ],
    [
      "cross-interval opening substitution",
      (r) => {
        r.bodies[1]!.records[1]!.opening = clone(r.bodies[0]!.records[1]!.opening);
      },
      "exact opening coverage",
    ],
    [
      "original order gap",
      (r) => {
        r.bodies[0]!.records.reverse();
      },
      "original order gap/fork",
    ],
    [
      "extra signed record",
      (r) => {
        r.bodies[0]!.records.push(clone(r.bodies[0]!.records[1]!));
      },
      "segment body count/profile",
    ],
    [
      "missing signed record",
      (r) => {
        r.bodies[0]!.records.pop();
      },
      "segment body count/profile",
    ],
    [
      "public state tampering",
      (r) => {
        r.bodies[1]!.before.version++;
      },
      "segment before state",
    ],
    [
      "extra founder control proof",
      (r) => {
        r.bodies[1]!.founder = clone(r.bodies[0]!.founder);
      },
      "extra founder",
    ],
    [
      "missing founder control proof",
      (r) => {
        r.bodies[0]!.founder = null;
      },
      "initial owner state",
    ],
    [
      "interval overlap",
      (r) => {
        r.ranges[1]!.first--;
        r.ranges[1]!.last--;
      },
      "interval gap/overlap/link",
    ],
    [
      "wrong descriptor ordinal",
      (r) => {
        r.ranges[1]!.ordinal = 1;
      },
      "manifest purpose/ordinal",
    ],
    [
      "whole-prefix count tampering",
      (r) => {
        r.checkpoint.last++;
      },
      "whole checkpoint totals/boundary",
    ],
    [
      "missing grant key",
      (r) => {
        r.grant.keys.pop();
      },
      "exact grant key count",
    ],
    [
      "extra future key",
      (r) => {
        r.grant.keys.push([key(999), key(998)]);
      },
      "exact grant key count",
    ],
    [
      "reordered grant keys",
      (r) => {
        r.grant.keys.reverse();
      },
      "grant key order/extra/missing",
    ],
    [
      "wrong retained definition identity",
      (r) => {
        r.grant.definition = key(997);
      },
      "grant checkpoint binding",
    ],
  ];
  for (const [label, mutate, error] of specs) {
    const candidate = await rewrite(w, p, mutate);
    observed.push(await refused(label, () => recover(candidate), error));
  }
  await w.apply("later", key(1099));
  const later = await w.sealer.export(w.owner);
  observed.push(
    await refused(
      "valid older checkpoint rejected when newer expected",
      () => recover(p, w.store, later.checkpoint.id),
      "expected checkpoint differs",
    ),
  );
  observed.push(
    await refused(
      "missing exact object",
      () =>
        recover(p, {
          put: async () => {},
          get: async (id) => {
            if (id === JSON.parse(p.checkpoint.content).head) throw new Error("object missing");
            return w.store.get(id);
          },
        }),
      "object missing",
    ),
  );
  observed.push(
    await refused(
      "wrong exact object",
      () => recover(p, { put: async () => {}, get: async () => p.checkpoint }),
      "requested recovery identity",
    ),
  );
  const valid = await recover(p);
  check(valid.log.length === 6 && valid.descriptors.length === 3, "unchanged valid control");
  return {
    profile,
    case: name,
    context: w.ctx,
    checkpoint: p.checkpoint.id,
    entries: 6,
    segments: 3,
    observed,
    positiveProjectionHash: await hash(await valid.log.outcomes()),
    status: "observed; no full gate pass",
  };
}
