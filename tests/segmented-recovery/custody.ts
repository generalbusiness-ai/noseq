import {
  decodeState,
  encodeState,
  mls,
  privateMessage,
  remove,
  submission,
} from "../protocol-feasibility/crypto.ts";
import { recoverOwner2, locator, deliverGrant, receiveGrant } from "./archive.ts";
import { refused, rewrite, small } from "./adversarial.ts";
import { Records } from "./storage.ts";
import {
  canonical,
  check,
  chunk,
  equal,
  hash,
  manifest,
  open,
  profile,
  random,
  unb64,
  unhex,
  utf8,
  type Signed,
} from "./wire.ts";
import { key } from "./fixture.ts";
import type { GrantCore, TextStore } from "./types.ts";
export async function custody(backing: TextStore, name: string) {
  const { w, p } = await small(backing, name),
    observed = [];
  const oldLocation = locator(p.locator, w.ctx, p.checkpoint),
    oldGrant = (await open(
      w.store,
      await w.store.get(oldLocation.grant),
      p.grantKey,
      w.ctx,
      "grant",
    )) as GrantCore;
  await w.apply("same epoch after old export", key(1100));
  const newer = await w.sealer.export(w.owner),
    newLocation = locator(newer.locator, w.ctx, newer.checkpoint),
    newHead = JSON.parse(newer.checkpoint.content).head;
  const rawDecrypt = async (e: Signed, key: string) => {
    const m = await manifest(e, w.ctx),
      cipher = new Uint8Array(m.meta.cipherBytes);
    for (let i = 0; i < m.chunks.length; i++)
      cipher.set(await chunk(await w.store.get(m.chunks[i]!), w.ctx, m, i), i * 16384);
    const k = await crypto.subtle.importKey(
      "raw",
      unhex(key) as Uint8Array<ArrayBuffer>,
      "AES-GCM",
      false,
      ["decrypt"],
    );
    return crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: unb64(m.meta.nonce) as Uint8Array<ArrayBuffer>,
        additionalData: utf8.encode(
          canonical([profile, "aead", m.meta]),
        ) as Uint8Array<ArrayBuffer>,
        tagLength: 128,
      },
      k,
      cipher,
    );
  };
  observed.push(
    await refused(
      "old grant key actual future grant AEAD",
      async () => rawDecrypt(await w.store.get(newLocation.grant), p.grantKey),
      "OperationError",
    ),
  );
  for (const [id, keyValue] of oldGrant.keys)
    observed.push(
      await refused(
        "old segment key actual future segment AEAD " + id,
        async () => rawDecrypt(await w.store.get(newHead), keyValue),
        "OperationError",
      ),
    );
  const oldStill = await open(
    w.store,
    await w.store.get(oldGrant.keys[0]![0]),
    oldGrant.keys[0]![1],
    w.ctx,
    "segment",
  );
  check(oldStill, "copied old material remains readable");
  const { client: carol, p: withCarol } = await w.newcomer();
  w.peers.push(carol);
  await w.control();
  await w.apply("nonremoval catch-up control", key(1200));
  equal(
    await w.bob.projection(),
    await w.owner.projection(),
    "retained Bob catches up before removal",
  );
  const beforeRemoval = w.bob.data.state,
    removed = await w.control([remove(w.owner, w.bobDevice)]);
  check(
    decodeState(w.bob.data.state).groupActiveState.kind === "removedFromGroup",
    "valid removal delivered to holder",
  );
  w.peers.splice(w.peers.indexOf(w.bob), 1);
  const future = await w.apply("after Bob removal", key(1201));
  equal(await carol.projection(), await w.owner.projection(), "remaining member future positive");
  const ordered = JSON.parse(future.content),
    message = privateMessage(submission(ordered.submission, w.ctx).bytes);
  observed.push(
    await refused(
      "removed holder direct future crypto",
      () => mls.processMessage({ context: w.env, state: decodeState(w.bob.data.state), message }),
      "OperationError",
    ),
  );
  observed.push(
    await refused(
      "old pre-removal state direct future crypto",
      () => mls.processMessage({ context: w.env, state: decodeState(beforeRemoval), message }),
      "OperationError",
    ),
  );
  observed.push(
    await refused("removed wrapper terminal", () => w.bob.receive(future), "removed terminal"),
  );
  let serial = 0;
  for (const [label, mutate, error] of [
    [
      "vault pending state",
      (r: any) => {
        r.vault.pending = {};
      },
      "compact vault checkpoint",
    ],
    [
      "vault wrong account key",
      (r: any) => {
        r.vault.accountKey = key(999);
      },
      "vault signer binding",
    ],
    [
      "vault wrong device key",
      (r: any) => {
        r.vault.deviceKey = key(998);
      },
      "vault signer binding",
    ],
    [
      "vault wrong public state",
      (r: any) => {
        r.vault.public.epoch++;
      },
      "vault public state",
    ],
    [
      "vault wrong epoch",
      (r: any) => {
        const s = decodeState(r.vault.state);
        s.groupContext.epoch++;
        r.vault.state = encodeState(s);
      },
      "vault group/epoch/active",
    ],
    [
      "vault wrong MLS signer secret",
      (r: any) => {
        const s = decodeState(r.vault.state);
        s.signaturePrivateKey = random();
        r.vault.state = encodeState(s);
      },
      "vault signing key correspondence",
    ],
  ] as const) {
    const bad = await rewrite(w, p, mutate);
    observed.push(
      await refused(
        label,
        () =>
          recoverOwner2(
            w.store,
            w.root.event,
            bad,
            { owner: w.ctx.owner, genesis: w.ctx.genesis, checkpoint: bad.checkpoint.id },
            new Records(backing, name + "-vault-" + ++serial),
          ),
        error,
      ),
    );
  }
  const delivery = deliverGrant(key(201), w.carolDevice.binding.device, w.ctx, withCarol);
  observed.push(
    await refused(
      "unauthorized sender before decryption",
      () =>
        receiveGrant(
          delivery,
          key(203),
          w.bobDevice.binding.device,
          w.ctx,
          withCarol.checkpoint.id,
          withCarol.locator.id,
        ),
      "authorized grant sender",
    ),
  );
  observed.push(
    await refused(
      "wrong intended checkpoint before decryption",
      () =>
        receiveGrant(
          delivery,
          key(203),
          w.ownerDevice.binding.device,
          w.ctx,
          p.checkpoint.id,
          withCarol.locator.id,
        ),
      "outer delivery context",
    ),
  );
  return {
    profile,
    case: name,
    context: w.ctx,
    oldCheckpoint: p.checkpoint.id,
    newCheckpoint: newer.checkpoint.id,
    sameEpochIndependentKeys: true,
    removed: removed.event.id,
    future: future.id,
    terminal: decodeState(w.bob.data.state).groupActiveState.kind,
    observed,
    remainingProjectionHash: await hash(await carol.projection()),
    capability: "copied old segments remain readable; no future segment or grant key derivation",
    status: "observed; no full gate pass",
  };
}
