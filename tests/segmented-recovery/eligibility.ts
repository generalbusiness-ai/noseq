import { entry } from "../protocol-feasibility/crypto.ts";
import { checkpoint, descriptorIndex, locator } from "./archive.ts";
import {
  bounds,
  bytes,
  chunk,
  check,
  equal,
  fields,
  hash,
  hex32,
  integer,
  kinds,
  limits,
  manifest,
  metrics,
  parse,
  profile,
  read2,
  readRoot2,
  sign2,
  type Context,
  type ObjectStore,
  type Signed,
} from "./wire.ts";
import type { ReservationCore } from "./types.ts";
export type Cost = [string, number];
export interface Plan {
  pairs: Cost[];
  total: number;
  indexBytes: number;
  hash: string;
  checkpoint: Signed;
  locator: Signed;
}
export const planHash = (pairs: Cost[]) => hash([profile, "exact-retention-plan", pairs]);
export function costIndex(pairs: Cost[]): { total: number; indexBytes: number } {
  check(
    Array.isArray(pairs) && pairs.length > 0 && pairs.length <= bounds.reservationEntries,
    "retention plan count",
  );
  const seen = new Set<string>();
  let total = 0,
    indexBytes = 2;
  for (const pair of pairs) {
    check(Array.isArray(pair) && pair.length === 2, "exact retention tuple");
    hex32(pair[0]);
    integer(pair[1], limits.event);
    check(pair[1] > 0 && !seen.has(pair[0]), "retention plan duplicate/empty");
    seen.add(pair[0]);
    total += pair[1];
    indexBytes += bytes(pair) + (seen.size > 1 ? 1 : 0);
    check(indexBytes <= bounds.reservationIndexBytes, "retention plan index capacity");
  }
  return { total, indexBytes };
}
export function declaration(event: Signed, ctx: Context): ReservationCore {
  const e = read2(event, "reservation", ctx);
  check(e.pubkey === ctx.owner, "reservation owner");
  const c = parse(e.content) as unknown as ReservationCore;
  fields(c, ["profile", "checkpoint", "locator", "count", "encodedBytes", "planHash"]);
  check(c.profile === profile, "reservation profile");
  for (const id of [c.checkpoint, c.locator, c.planHash]) hex32(id);
  integer(c.count, bounds.reservationEntries);
  integer(c.encodedBytes, limits.journal);
  check(c.count > 0 && c.encodedBytes > 0, "nonempty reservation");
  return c;
}
export function planDeclaration(key: string, ctx: Context, plan: Plan): Signed {
  return sign2(key, "reservation", ctx, {
    profile,
    checkpoint: plan.checkpoint.id,
    locator: plan.locator.id,
    count: plan.pairs.length,
    encodedBytes: plan.total,
    planHash: plan.hash,
  });
}
// Public closure validation attests object retention only; plaintext/MLS correspondence is independently checked by VerifiedHistory.
export async function closurePlan(
  store: ObjectStore,
  root: Signed,
  certificate: Signed,
  location: Signed,
  ctx: Context,
  orders: readonly Signed[],
): Promise<Plan> {
  equal(readRoot2(root, ctx.owner, ctx.genesis), ctx, "closure root");
  const c = checkpoint(certificate, ctx, { owner: ctx.owner, genesis: ctx.genesis }),
    l = locator(location, ctx, certificate);
  check(c.last <= orders.length && orders[c.last - 1]!.id === c.tip, "closure retained frontier");
  const pairs: Cost[] = [],
    seen = new Set<string>();
  let total = 0,
    indexBytes = 2;
  const account = (e: Signed) => {
    if (seen.has(e.id)) return;
    const size = bytes(e);
    check(size <= limits.event, "retention event capacity");
    seen.add(e.id);
    pairs.push([e.id, size]);
    total += size;
    indexBytes += bytes(pairs.at(-1)) + (pairs.length > 1 ? 1 : 0);
    check(
      pairs.length <= bounds.reservationEntries &&
        indexBytes <= bounds.reservationIndexBytes &&
        total <= limits.journal,
      "complete closure capacity",
    );
  };
  const exact = async (id: string) => {
    const e = await store.get(id);
    check(e.id === id, "retention exact identity");
    account(e);
    return e;
  };
  account(root);
  account(certificate);
  account(location);
  for (let i = 0; i < c.last; i++) {
    const e = entry(orders[i]!, ctx);
    check(
      e.position === i + 1 && e.previous === (i ? orders[i - 1]!.id : ctx.genesis),
      "retention original order chain",
    );
    account(orders[i]!);
  }
  const index = await descriptorIndex(store, c, ctx, metrics());
  for (const d of index)
    check(
      d[5] === (d[2] === 1 ? ctx.genesis : orders[d[2] - 2]!.id) && d[6] === orders[d[3] - 1]!.id,
      "retention interval and original journal correspondence",
    );
  const object = async (id: string, purpose: string) => {
    const e = await exact(id),
      m = await manifest(e, ctx);
    check(m.meta.purpose === purpose, "closure object purpose");
    if (purpose === "grant" || purpose === "vault")
      check(
        m.meta.checkpoint === certificate.id &&
          m.meta.last === c.last &&
          m.meta.tip === c.tip &&
          m.meta.previous === c.head &&
          m.meta.after === c.finalStateHash,
        "closure snapshot coverage",
      );
    // Decode and bind each actual signed chunk, not an owner claim about its ID alone.
    for (let i = 0; i < m.chunks.length; i++) await chunk(await exact(m.chunks[i]!), ctx, m, i);
  };
  await object(c.definition, "definition");
  for (const d of index) await object(d[0], "segment");
  await object(l.grant, "grant");
  await object(l.vault, "vault");
  return {
    pairs,
    total,
    indexBytes,
    hash: await planHash(pairs),
    checkpoint: certificate,
    locator: location,
  };
}
