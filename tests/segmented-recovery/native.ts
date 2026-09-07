import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  Peer,
  readbackProxy,
  startNative,
  type Frame,
} from "../protocol-feasibility/gateway-native.ts";
import { add, remove, submission } from "../protocol-feasibility/crypto.ts";
import { refused } from "./adversarial.ts";
import { VerifiedHistory, deliverGrant, receiveGrant } from "./archive.ts";
import { SegmentedGateway } from "./gateway.ts";
import { closurePlan, planDeclaration } from "./eligibility.ts";
import { diskStore } from "./store-node.ts";
import { Records } from "./storage.ts";
import {
  bytes,
  canonical,
  check,
  equal,
  hash,
  limits,
  profile,
  type ObjectStore,
  type Signed,
} from "./wire.ts";
import { key, world, collectWorlds, resetWorlds } from "./fixture.ts";
import { joinedStream } from "./client.ts";
export async function runNative(directory: string) {
  resetWorlds();
  mkdirSync(directory);
  const backing = await diskStore(join(directory, "objects")),
    w = await world(backing, "native"),
    trace: Frame[] = [],
    observed: unknown[] = [];
  await w.apply("first", key(1002));
  await w.sealer.flush();
  await w.control();
  await w.apply("second", key(1004));
  await w.sealer.flush();
  await w.apply("first", key(1002));
  const admitted = await w.control([add(w.carolDevice)]),
    p = await w.sealer.export(w.owner);
  check(admitted.welcome, "native newcomer real Welcome");
  const delivery = deliverGrant(key(201), w.carolDevice.binding.device, w.ctx, p);
  writeFileSync(join(directory, "delivery.json"), canonical(delivery), { flag: "wx" });
  const native = await startNative(join(directory, "strfry")),
    proxy = await readbackProxy(native.url, trace),
    statePath = join(directory, "gateway.json");
  let gateway: SegmentedGateway | undefined;
  const peers: Peer[] = [];
  const connect = async (url: string, name: string, keyValue: string) => {
    const peer = await Peer.connect(url, name, trace);
    peers.push(peer);
    check((await peer.auth(keyValue, url))[2] === true, "actual NIP42 auth");
    return peer;
  };
  const command = async (peer: Peer, frame: unknown[], id: unknown, success = true) => {
    peer.send(frame);
    const reply = await peer.take((m) => (m[0] === "OK" && m[1] === id) || m[0] === "NOTICE", 6500);
    check(
      success
        ? reply[0] === "OK" && reply[2] === true
        : reply[0] === "NOTICE" || reply[2] === false,
      "command outcome " + canonical(reply),
    );
    return reply;
  };
  let pageCount = 0;
  try {
    gateway = new SegmentedGateway(
      w.ctx,
      w.root.event,
      statePath,
      w.initial,
      w.sealer.founder,
      [],
      trace,
    );
    await gateway.start(proxy.url);
    let operator = await connect(gateway.operatorUrl, "segmented-operator", key(109));
    const orders: Signed[] = [];
    for (let i = 1; i <= w.owner.log.length; i++) {
      const e = (await w.owner.log.get(i)).record.event;
      orders.push(e);
      if (i < 6) await command(operator, ["EVENT", e], e.id);
    }
    await VerifiedHistory.recover(
      w.store,
      w.root.event,
      p.checkpoint,
      p.locator,
      p.grantKey,
      { owner: w.ctx.owner, genesis: w.ctx.genesis, checkpoint: p.checkpoint.id },
      new Records(backing, "prepared-client-verified"),
    );
    const plan = await closurePlan(w.store, w.root.event, p.checkpoint, p.locator, w.ctx, orders),
      d = planDeclaration(key(101), w.ctx, plan);
    await command(operator, ["SEG-BEGIN", d], d.id);
    await command(operator, ["SEG-COMPLETE", d.id], d.id, false);
    observed.push("unreserved partial plan cannot claim complete");
    for (let i = 0; i < plan.pairs.length; i += 128)
      await command(operator, ["SEG-PLAN", d.id, plan.pairs.slice(i, i + 128)], d.id);
    await command(operator, ["SEG-RESERVE", d.id], d.id);
    const reserved = gateway.journalBytes;
    check(reserved === plan.total + bytes(d), "all exact closure costs reserved before uploads");
    const candidate = plan.pairs.find(([id]) => !gateway!.data.retained[id])![0],
      event = await w.store.get(candidate);
    proxy.dropEose.add(candidate);
    await command(operator, ["SEG-OBJECT", event], event.id, false);
    check(
      gateway.journalBytes === reserved &&
        gateway.data.reservations[candidate] &&
        !gateway.data.retained[candidate],
      "uncertain write stays charged and unconfirmed",
    );
    await command(operator, ["SEG-COMPLETE", d.id], d.id, false);
    writeFileSync(join(directory, "uncertain.json"), readFileSync(statePath), { flag: "wx" });
    proxy.dropEose.clear();
    await gateway.close();
    gateway = new SegmentedGateway(
      w.ctx,
      w.root.event,
      statePath,
      w.initial,
      w.sealer.founder,
      [],
      trace,
    );
    gateway.loadIntact();
    check(
      gateway.journalBytes === reserved && !gateway.data.retained[candidate],
      "intact reconstruction preserves uncertainty and complete reservation",
    );
    await gateway.start(proxy.url);
    operator = await connect(gateway.operatorUrl, "segmented-operator-reconstructed", key(109));
    for (const [id] of plan.pairs)
      if (!gateway.data.retained[id]) {
        const e = await w.store.get(id);
        if (e.kind !== 8792) await command(operator, ["SEG-OBJECT", e], id);
      }
    check(gateway.journalBytes === reserved, "confirmation does not charge twice");
    await command(operator, ["SEG-COMPLETE", d.id], d.id, false);
    check(
      gateway.extension.completed.length === 0 && gateway.data.events.length === 5,
      "signed T6 cannot complete beyond retained F5",
    );
    await command(operator, ["EVENT", orders[5]], orders[5]!.id);
    await command(operator, ["SEG-COMPLETE", d.id], d.id);
    observed.push("actual T beyond F refused until missing final ordered entry is retained");
    observed.push("actual complete plan retained after uncertain-write retry and reconstruction");
    const bob = await connect(gateway.url, "segmented-newcomer-carol", key(203));
    bob.send(["SEG-OPEN", "offer", p.checkpoint.id, 6]);
    const offer = await bob.take((m) => m[0] === "SEG-OFFER" && m[1] === "offer");
    check(
      (offer[2] as any).sealedPrefix === 6 && (offer[2] as any).suffixAvailable === true,
      "named complete offer",
    );
    const socketStore = (peer: Peer): ObjectStore => ({
      put: async () => {
        throw new Error("read only socket");
      },
      get: async (id) => {
        const sub = "page-" + ++pageCount;
        peer.send(["SEG-GET", sub, p.checkpoint.id, [id]]);
        const end = await peer.take(
          (m) => (m[1] === sub && (m[0] === "EOSE" || m[0] === "CLOSED")) || m[0] === "NOTICE",
        );
        check(end[0] === "EOSE", "partial or removed page");
        const found = peer.messages.find((m) => m[0] === "EVENT" && m[1] === sub);
        peer.messages = peer.messages.filter((m) => m[1] !== sub);
        check(found, "missing exact page object");
        return found[2] as Signed;
      },
    });
    proxy.dropEvent.add(w.root.event.id);
    await refused(
      "actual backend page missing signed event",
      () => socketStore(bob).get(w.root.event.id),
      "partial or removed page",
    );
    proxy.dropEvent.clear();
    proxy.replaceEvent.set(w.root.event.id, p.checkpoint);
    await refused(
      "actual backend page wrong signed identity",
      () => socketStore(bob).get(w.root.event.id),
      "partial or removed page",
    );
    proxy.replaceEvent.clear();
    observed.push("actual suppressed/mismatched signed backend pages refused without page EOSE");
    const deliveredKey = receiveGrant(
      delivery,
      key(203),
      w.ownerDevice.binding.device,
      w.ctx,
      p.checkpoint.id,
      p.locator.id,
    );
    const verified = await VerifiedHistory.recover(
      socketStore(bob),
      w.root.event,
      p.checkpoint,
      p.locator,
      deliveredKey,
      { owner: w.ctx.owner, genesis: w.ctx.genesis, checkpoint: p.checkpoint.id, tip: w.owner.tip },
      new Records(backing, "socket-recovered"),
    );
    check(
      verified.log.length === 6 && verified.descriptors.length === 3 && pageCount > 3,
      "real multi-interval multi-page decrypted history",
    );
    const newcomer = await joinedStream(
      w.ctx,
      w.env,
      w.carolDevice,
      admitted.welcome,
      submission(admitted.pending.event, w.ctx).welcome!,
      verified.publicState,
      verified.log,
    );
    equal(
      await newcomer.projection(),
      await w.owner.projection(),
      "actual native newcomer full recovered projection",
    );
    w.peers.push(newcomer);
    observed.push(
      "newly admitted member verifies signed NIP44 grant and joins actual Welcome using socket-recovered full history",
    );
    await w.apply("unsealed suffix", key(1600));
    const suffix = (await w.owner.log.get(7)).record.event;
    await command(operator, ["EVENT", suffix], suffix.id);
    bob.send(["SEG-OPEN", "inside", null, 7]);
    const inside = await bob.take((m) => m[0] === "SEG-OFFER" && m[1] === "inside");
    check(
      (inside[2] as any).sealedPrefix === 6 &&
        (inside[2] as any).retainedPrefix === 7 &&
        (inside[2] as any).suffixAvailable === false,
      "inside later interval offers last sealed checkpoint only",
    );
    const nextPackage = await w.sealer.export(w.owner),
      nextPlan = await closurePlan(
        w.store,
        w.root.event,
        nextPackage.checkpoint,
        nextPackage.locator,
        w.ctx,
        w.journal.events,
      ),
      nextDeclaration = planDeclaration(key(101), w.ctx, nextPlan);
    await command(operator, ["SEG-BEGIN", nextDeclaration], nextDeclaration.id);
    for (let i = 0; i < nextPlan.pairs.length; i += 128)
      await command(
        operator,
        ["SEG-PLAN", nextDeclaration.id, nextPlan.pairs.slice(i, i + 128)],
        nextDeclaration.id,
      );
    const beforeCapacity = gateway.journalBytes,
      requiredCapacity =
        beforeCapacity +
        bytes(nextDeclaration) +
        nextPlan.pairs
          .filter(([id]) => !gateway!.data.reservations[id])
          .reduce((n, pair) => n + pair[1], 0);
    gateway.capacity = requiredCapacity - 1;
    await command(operator, ["SEG-RESERVE", nextDeclaration.id], nextDeclaration.id, false);
    check(
      gateway.journalBytes === beforeCapacity && gateway.extension.completed.at(-1)![2] === 6,
      "one-byte capacity refusal preserves last complete T",
    );
    gateway.capacity = requiredCapacity;
    await command(operator, ["SEG-RESERVE", nextDeclaration.id], nextDeclaration.id);
    check(
      gateway.journalBytes === requiredCapacity,
      "exact actual prepared-byte capacity accepted",
    );
    await command(operator, ["SEG-COMPLETE", nextDeclaration.id], nextDeclaration.id, false);
    check(
      gateway.extension.completed.at(-1)![2] === 6,
      "interrupted new closure never advances complete T",
    );
    gateway.capacity = limits.journal;
    observed.push({
      configuredCapacityMaximum: requiredCapacity,
      refusedAt: requiredCapacity - 1,
      meaning:
        "actual signed complete closure costs at discriminating configured boundary; no 256MiB physical store claim",
    });
    await command(bob, ["SEG-GET", "outside", p.checkpoint.id, [suffix.id]], "outside", false);
    observed.push("beyond-checkpoint object refused at newer retained F");
    bob.send(["SEG-GET", "before-removal", p.checkpoint.id, [w.root.event.id]]);
    await bob.take((m) => m[0] === "EOSE" && m[1] === "before-removal");
    const removal = await w.control([remove(w.owner, w.carolDevice)]);
    proxy.dropAck.add(removal.event.id);
    await command(operator, ["EVENT", removal.event], removal.event.id, false);
    check(
      !gateway.readable && gateway.data.knownControl?.id === removal.event.id,
      "known contiguous removal fences before failed retention",
    );
    bob.send(["SEG-GET", "after-removal", p.checkpoint.id, [w.root.event.id]]);
    await bob.take((m) => m[0] === "CLOSED" && m[1] === "after-removal");
    writeFileSync(join(directory, "known-control.json"), readFileSync(statePath), { flag: "wx" });
    proxy.dropAck.clear();
    await gateway.close();
    gateway = new SegmentedGateway(
      w.ctx,
      w.root.event,
      statePath,
      w.initial,
      w.sealer.founder,
      [],
      trace,
    );
    gateway.loadIntact();
    check(!gateway.readable, "control fence reconstructed");
    await gateway.start(proxy.url);
    operator = await connect(gateway.operatorUrl, "segmented-operator-removal", key(109));
    const old = await connect(gateway.url, "segmented-removed-carol", key(203));
    old.send(["SEG-OPEN", "reconstructed", p.checkpoint.id, 6]);
    await old.take((m) => m[0] === "CLOSED" && m[1] === "reconstructed");
    await command(operator, ["EVENT", removal.event], removal.event.id);
    old.send(["SEG-GET", "terminal", p.checkpoint.id, [w.root.event.id]]);
    await old.take((m) => m[0] === "CLOSED" && m[1] === "terminal");
    observed.push(
      "removal between pages, uncertainty and reconstruction never complete old reader",
    );
    const owner = await connect(gateway.url, "segmented-owner", key(201));
    await socketStore(owner).get(w.root.event.id);
    await command(owner, ["COUNT", "no-count", {}], "no-count", false);
    await command(owner, ["NEG-OPEN", "no-neg", {}, ""], "no-neg", false);
    return {
      profile,
      node: process.versions.node,
      fixtures: await collectWorlds({ checkpoint: p.checkpoint.id }),
      case: "native-segmented-composition",
      context: w.ctx,
      checkpoint: p.checkpoint.id,
      delivery: delivery.id,
      welcome: submission(admitted.pending.event, w.ctx).welcome,
      newcomer: w.carolDevice.binding.device,
      planHash: plan.hash,
      plannedBytes: plan.total,
      reservedBytes: reserved,
      planIdentities: plan.pairs.length,
      segments: verified.descriptors.map((d) => [d[2], d[3]]),
      pageCount,
      projectionHash: await hash(await verified.log.outcomes()),
      F: gateway.data.events.length,
      T: 6,
      tip: gateway.tip,
      observed,
      native: native.identity,
      scope:
        "real isolated child process and sockets; intact file reconstruction; no deployment isolation/fsync/P5 guarantee",
      status: "observed; no full gate pass",
    };
  } finally {
    for (const peer of peers) await peer.close();
    await gateway?.close();
    await proxy.stop();
    await native.stop();
    writeFileSync(join(directory, "trace.json"), canonical(trace), { flag: "wx" });
  }
}
