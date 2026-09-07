import { boundaries } from "./boundaries.ts";
import { capacity, complexity } from "./capacity.ts";
import { custody } from "./custody.ts";
import { adversarial } from "./adversarial.ts";
import { recoverOwner2, VerifiedHistory } from "./archive.ts";
import { Records } from "./storage.ts";
import { check, equal, hash, profile } from "./wire.ts";
import { key, world, resetWorlds, collectWorlds } from "./fixture.ts";
import type { TextStore } from "./types.ts";
export const caseNames = [
  "complete-history",
  "inner-adversarial",
  "custody-and-exclusion",
  "encoded-capacity",
  "bounded-work",
  "semantic-boundaries",
] as const;
async function runScenario(name: string, backing: TextStore) {
  if (name === "semantic-boundaries") return boundaries(backing, name);
  if (name === "encoded-capacity") return capacity(backing, name);
  if (name === "bounded-work") return complexity(backing, name);
  if (name === "custody-and-exclusion") return custody(backing, name);
  if (name === "inner-adversarial") return adversarial(backing, name);
  check(name === "complete-history", "unknown case");
  const w = await world(backing, name);
  for (let i = 2; i <= 126; i++)
    await w.apply("item-" + i, key(1000 + i), i === 10 ? "refuse" : "apply");
  const stale = await w.bob.stageAction("pre-control delayed action", key(15555));
  await w.control();
  await w.apply("first segment boundary", key(1128));
  check(
    w.sealer.descriptors.length === 1 && w.sealer.descriptors[0]![3] === 128,
    "128 entries seal first interval",
  );
  await w.apply("item-2", key(1002));
  await w.sealer.flush();
  await w.control();
  await w.accepted(stale);
  const { p, verified, client } = await w.newcomer();
  check(
    verified.log.length === 132 && verified.descriptors.length === 3,
    "full history composition",
  );
  equal(
    await client.projection(),
    await w.owner.projection(),
    "newcomer reproduces complete projection",
  );
  check(
    (await verified.log.get(129)).outcome.disposition === "duplicate",
    "cross-segment duplicate once",
  );
  check((await verified.log.get(10)).outcome.disposition === "refuse", "refusal retained");
  check(
    (await verified.log.get(131)).outcome.disposition === "stale",
    "stale ordered entry retained without an opening",
  );
  check(verified.trace.maximumDecodedSegments === 1, "one decoded segment");
  const restored = await recoverOwner2(
    w.store,
    w.root.event,
    { checkpoint: p.checkpoint, locator: p.locator, vaultKey: p.vaultKey },
    { owner: w.ctx.owner, genesis: w.ctx.genesis, checkpoint: p.checkpoint.id, tip: w.owner.tip },
    new Records(backing, name + "-owner-restored"),
  );
  equal(
    await restored.client.projection(),
    await client.projection(),
    "declared all-owner-device-loss projection",
  );
  check(restored.client.data.events.length === 0, "compact accepted state has no history snapshot");
  const future = await restored.client.stageAction("after owner loss", key(9999)),
    ordered = await w.journal.append(future);
  await restored.client.receive(ordered);
  await w.bob.receive(ordered);
  await client.receive(ordered);
  equal(
    await restored.client.projection(),
    await client.projection(),
    "restored actual future crypto",
  );
  await restored.sealer.append(
    (await restored.client.log.get(133)).record,
    restored.client.data.public,
  );
  const continued = await restored.sealer.export(restored.client);
  const afterLoss = await VerifiedHistory.recover(
    w.store,
    w.root.event,
    continued.checkpoint,
    continued.locator,
    continued.grantKey,
    { owner: w.ctx.owner, genesis: w.ctx.genesis, checkpoint: continued.checkpoint.id },
    new Records(backing, name + "-continued"),
  );
  check(
    afterLoss.log.length === 133 && afterLoss.descriptors.length === 4,
    "restored archive continuation preserves prior sealed intervals",
  );
  for (let i = 0; i < verified.descriptors.length; i++)
    check(
      afterLoss.descriptors[i]![0] === verified.descriptors[i]![0],
      "owner restore never rewrites old sealed bytes",
    );
  return {
    profile,
    case: name,
    context: w.ctx,
    checkpoint: p.checkpoint.id,
    tip: JSON.parse(p.checkpoint.content).tip,
    entries: 132,
    segments: verified.descriptors.map((d) => [d[2], d[3]]),
    epochChanges: w.owner.data.public.version,
    projectionHash: await hash(await client.projection()),
    metrics: {
      sealing: w.sealer.trace,
      verification: verified.trace,
      recordWrites: w.owner.log.recordWrites,
    },
    future: ordered.id,
    continuedCheckpoint: continued.checkpoint.id,
    status: "observed; no full gate pass",
  };
}

export async function runCase(name: string, backing: TextStore) {
  resetWorlds();
  const result = await runScenario(name, backing);
  return { result, fixtures: await collectWorlds(result) };
}
