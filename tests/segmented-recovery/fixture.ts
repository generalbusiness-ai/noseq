import {
  add,
  device,
  environment,
  Journal,
  submission,
  type Device,
} from "../protocol-feasibility/crypto.ts";
import type { Definition } from "../protocol-feasibility/archive.ts";
import { definitionId } from "../protocol-feasibility/archive.ts";
import { StreamClient, initialStream, joinedStream } from "./client.ts";
import { Sealer, VerifiedHistory, deliverGrant, receiveGrant } from "./archive.ts";
import { Objects, Records } from "./storage.ts";
import {
  b64,
  check,
  clone,
  decoder,
  equal,
  hash,
  hex,
  parse,
  profile,
  root2,
  utf8,
  type Signed,
} from "./wire.ts";
import type { TextStore } from "./types.ts";
export const key = (n: number) => n.toString(16).padStart(64, "0");
export async function world(backing: TextStore, name: string) {
  const definition: Definition = {
    nonce: key(301),
    files: [
      {
        path: "manifest.json",
        bytes: b64(utf8.encode('{"fixture":"segmented-recovery","projection":"ordered values"}')),
      },
    ],
  };
  const root = await root2(key(101), key(109), await definitionId(definition)),
    ctx = root.context,
    env = await environment(ctx);
  const ownerDevice = await device(env, ctx, key(101), key(201)),
    bobDevice = await device(env, ctx, key(102), key(202)),
    carolDevice = await device(env, ctx, key(103), key(203));
  const owner = await initialStream(ctx, env, ownerDevice, new Records(backing, name + "-owner")),
    initial = clone(owner.data.public),
    journal = new Journal(ctx, key(109), clone(initial)),
    store = new Objects(backing, name + "-objects");
  const founder = parse(
    decoder.decode(
      (ownerDevice.keys.publicPackage.leafNode.credential as { identity: Uint8Array }).identity,
    ),
  ) as unknown as Signed;
  await store.put(root.event);
  const sealer = new Sealer(store, ctx, key(101), founder, initial);
  await sealer.initialize(definition);
  const peers: StreamClient[] = [];
  const accepted = async (s: Signed, admission: Signed | null = null) => {
    const e = await journal.append(s, admission);
    check((await owner.receive(e)) === "accepted", "owner accepts fresh record");
    for (const peer of peers)
      check((await peer.receive(e)) === "accepted", "peer accepts fresh record");
    await sealer.append((await owner.log.get(owner.log.length)).record, owner.data.public);
    await store.put(e);
    return e;
  };
  const control = async (proposals: Parameters<StreamClient["stageCommit"]>[0] = []) => {
    const pending = await owner.stageCommit(proposals),
      e = await accepted(pending.event, pending.admission);
    return { pending, event: e, welcome: owner.data.released[pending.event.id] };
  };
  const first = await control([add(bobDevice)]);
  check(first.welcome, "initial real Welcome");
  const bobLog = new Records(backing, name + "-bob");
  await bobLog.append(await owner.log.get(1));
  const bob = await joinedStream(
    ctx,
    env,
    bobDevice,
    first.welcome,
    submission(first.pending.event, ctx).welcome!,
    owner.data.public,
    bobLog,
  );
  peers.push(bob);
  let serial = 0;
  const apply = async (value?: string, logical?: string, outcome: "apply" | "refuse" = "apply") => {
    serial++;
    return accepted(
      await owner.stageAction(value ?? "value " + serial, logical ?? key(1000 + serial), outcome),
    );
  };
  const newcomer = async () => {
    const join = await control([add(carolDevice)]),
      p = await sealer.export(owner),
      delivery = deliverGrant(key(201), carolDevice.binding.device, ctx, p),
      grantKey = receiveGrant(
        delivery,
        key(203),
        ownerDevice.binding.device,
        ctx,
        p.checkpoint.id,
        p.locator.id,
      );
    const verified = await VerifiedHistory.recover(
      store,
      root.event,
      p.checkpoint,
      p.locator,
      grantKey,
      { owner: ctx.owner, genesis: ctx.genesis, checkpoint: p.checkpoint.id, tip: owner.tip },
      new Records(backing, name + "-newcomer"),
    );
    check(join.welcome, "newcomer actual Welcome");
    const client = await joinedStream(
      ctx,
      env,
      carolDevice,
      join.welcome,
      submission(join.pending.event, ctx).welcome!,
      verified.publicState,
      verified.log,
    );
    return { p, delivery, verified, client };
  };
  evidenceWorlds.push({ root, ctx, definition, journal, owner, store });
  return {
    backing,
    name,
    root,
    ctx,
    env,
    definition,
    ownerDevice,
    bobDevice,
    carolDevice,
    owner,
    bob,
    initial,
    journal,
    store,
    sealer,
    peers,
    accepted,
    control,
    apply,
    newcomer,
  };
}
interface EvidenceWorld {
  root: { event: Signed };
  ctx: import("./wire.ts").Context;
  definition: Definition;
  journal: Journal;
  owner: StreamClient;
  store: Objects;
}
const evidenceWorlds: EvidenceWorld[] = [];
export function resetWorlds() {
  evidenceWorlds.length = 0;
}
export async function collectWorlds(result: unknown) {
  const ids = new Set<string>();
  const walk = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    for (const [name, child] of Object.entries(value)) {
      if (
        name.toLowerCase().includes("checkpoint") &&
        typeof child === "string" &&
        /^[0-9a-f]{64}$/.test(child)
      )
        ids.add(child);
      else walk(child);
    }
  };
  walk(result);
  const fixtures = [];
  for (const w of evidenceWorlds) {
    const checkpoints: Signed[] = [];
    for (const id of ids) {
      try {
        const e = await w.store.get(id);
        if (e.kind === 8803) checkpoints.push(e);
      } catch {
        /* Other workload namespaces deliberately have no such object. */
      }
    }
    fixtures.push({
      root: w.root.event,
      context: w.ctx,
      definition: w.definition,
      ordered: w.journal.events,
      acceptedTip: w.owner.tip,
      acceptedCount: w.owner.log.length,
      checkpoints,
    });
  }
  return fixtures;
}
