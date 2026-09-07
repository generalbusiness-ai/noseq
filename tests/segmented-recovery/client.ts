// Incremental development adapter. Only bounded private/public state is staged per entry.
import {
  Client,
  decodeState,
  encodeState,
  entry,
  initial,
  initialData,
  members,
  mls,
  privateMessage,
  publicTransition,
  submission,
  environment,
  decodeMessage,
  type Device,
  type Outcome,
  type PublicState,
  type Snapshot,
} from "../protocol-feasibility/crypto.ts";
import { createOpening } from "../protocol-feasibility/opening.ts";
import { read, readAction } from "../protocol-feasibility/wire.ts";
import { Records } from "./storage.ts";
import {
  bounds,
  check,
  clone,
  decoder,
  equal,
  eventBytes,
  hash,
  hex,
  integer,
  type Context,
  type Signed,
} from "./wire.ts";
import type { RecordCore } from "./types.ts";
export class StreamClient extends Client {
  observed = new Map<number, string>();
  pendingAdmission: Signed | null = null;
  constructor(
    ctx: Context,
    env: mls.MlsContext,
    keys: Pick<Device, "accountKey" | "deviceKey" | "binding">,
    data: Snapshot,
    readonly log: Records,
  ) {
    super(ctx, env, keys, data);
  }
  get tip() {
    return this.log.ids.at(-1) ?? this.ctx.genesis;
  }
  override restart(): never {
    throw new Error("v2 restart requires explicit asynchronous compact reconstruction");
  }
  override publish(): never {
    throw new Error("v2 publication marker unsupported; P6 deferred");
  }
  override async stageCommit(proposals: mls.Proposal[] = []) {
    check(!this.data.fork, "observed fork halt");
    const result = await super.stageCommit(proposals);
    this.pendingAdmission = clone(result.admission);
    return result;
  }
  override async stageAction(...args: Parameters<Client["stageAction"]>) {
    check(!this.data.fork, "observed fork halt");
    return super.stageAction(...args);
  }
  override async receive(signed: Signed): Promise<"accepted" | "duplicate" | "wait"> {
    const e = entry(signed, this.ctx);
    integer(e.position, bounds.entries);
    check(!this.data.fork, "observed fork halt");
    if (this.observed.has(e.position) && this.observed.get(e.position) !== signed.id) {
      this.data.fork = true;
      throw Error("observed fork");
    }
    if (e.position <= this.log.length) {
      if (this.log.ids[e.position - 1] !== signed.id) {
        this.data.fork = true;
        throw Error("observed fork");
      }
      return "duplicate";
    }
    // Reserve one slot for the next contiguous input so a full gap buffer can
    // still make progress; failed input keeps its identity for fork detection.
    check(
      this.observed.has(e.position) || this.observed.size < (e.position === this.log.length + 1 ? 64 : 63),
      "observed future-position capacity",
    );
    this.observed.set(e.position, signed.id);
    if (e.position > this.log.length + 1) return "wait";
    check(e.previous === this.tip, "predecessor mismatch");
    const state = decodeState(this.data.state);
    check(state.groupActiveState.kind !== "removedFromGroup", "removed terminal");
    const sub = submission(e.submission, this.ctx);
    if (sub.epoch > this.epoch || sub.version > this.data.public.version) return "wait";
    const nextPublic = publicTransition(this.ctx, this.data.public, e);
    // These history arrays/maps remain empty: Records owns persisted per-entry records and compact indexes.
    check(
      this.data.events.length === 0 &&
        this.data.outcomes.length === 0 &&
        this.data.openings.length === 0 &&
        Object.keys(this.data.logical).length === 0,
      "accumulated Snapshot is forbidden",
    );
    const next = clone(this.data);
    let record: RecordCore = { event: signed, opening: null };
    let outcome: Outcome;
    if (sub.epoch < this.epoch || sub.version < this.data.public.version)
      outcome = {
        position: e.position,
        logical: e.submission.id,
        disposition: "stale",
        value: null,
      };
    else {
      const member = this.data.public.members.find((m) => m.device === e.submission.pubkey)!;
      const index =
        state.ratchetTree.findIndex(
          (n) =>
            n?.nodeType === mls.nodeTypes.leaf && hex(n.leaf.signaturePublicKey) === member.leaf,
        ) / 2;
      check(index >= 0, "local membership/key mismatch");
      const pending = this.data.pending,
        own = pending?.event.id === e.submission.id;
      let plaintext: Signed | null = null;
      if (own) {
        equal(pending.base, this.data.state, "pending base mismatch");
        next.state = pending.state;
        plaintext = pending.plaintext;
      } else {
        const result = await mls.processMessage({
          context: this.env,
          state,
          message: privateMessage(sub.bytes),
          callback: (x) =>
            x.kind === "commit" && x.senderLeafIndex === index ? "accept" : "reject",
        });
        if (sub.type === "commit")
          check(
            result.kind === "newState" && result.actionTaken === "accept",
            "Commit not accepted",
          );
        else {
          check(
            result.kind === "applicationMessage" && result.senderLeafIndex === index,
            "MLS sender/type mismatch",
          );
          plaintext = read(decoder.decode(result.message), "proof", this.ctx);
        }
        next.state = encodeState(result.newState);
        for (const b of result.consumed) b.fill(0);
      }
      const decoded = decodeState(next.state),
        removed = decoded.groupActiveState.kind === "removedFromGroup";
      check(
        removed
          ? sub.type === "commit" && !own && Number(decoded.groupContext.epoch) === this.epoch
          : Number(decoded.groupContext.epoch) === this.epoch + (sub.type === "commit" ? 1 : 0),
        "epoch transition",
      );
      if (sub.type === "commit") {
        if (removed)
          check(
            !nextPublic.members.some((m) => m.device === this.keys.binding.device),
            "unexpected removal",
          );
        else equal(members(decoded, this.ctx), nextPublic.members, "decrypted owner membership");
        next.public = clone(nextPublic);
        outcome = {
          position: e.position,
          logical: e.submission.id,
          disposition: "control",
          value: null,
        };
      } else {
        check(plaintext, "missing action");
        const a = readAction(plaintext, this.ctx, member.account, member.device);
        check(a.outcome !== "runtime-failure", "runtime failure: preserve frontier");
        const prior = this.log.logical.get(a.logical);
        if (prior) check(prior === plaintext.id, "logical identity reused with changed action");
        outcome = {
          position: e.position,
          logical: a.logical,
          disposition: prior ? "duplicate" : a.outcome,
          value: !prior && a.outcome === "apply" ? a.value : null,
        };
        record = {
          event: signed,
          opening: await createOpening(
            decodeState(this.data.state),
            privateMessage(sub.bytes),
            this.env,
            e.position,
            e.submission.id,
            plaintext,
          ),
        };
      }
      if (pending && !own && sub.type === "application") {
        const r = await mls.processMessage({
          context: this.env,
          state: decodeState(pending.state),
          message: privateMessage(sub.bytes),
        });
        check(
          r.kind === "applicationMessage" && decoder.decode(r.message) === eventBytes(plaintext!),
          "pending interleaving differs",
        );
        next.pending = { ...pending, state: encodeState(r.newState), base: next.state };
        for (const b of r.consumed) b.fill(0);
      }
      if (own) {
        next.released = {};
        if (pending.welcome) next.released[e.submission.id] = pending.welcome;
        next.pending = null;
      } else if (pending && sub.type === "commit") next.pending = null;
    }
    await this.log.append({ record, outcome });
    if (record.opening) this.log.logical.set(outcome.logical, record.opening.action.id);
    this.data = next;
    this.observed.delete(e.position);
    if (!next.pending) this.pendingAdmission = null;
    return "accepted";
  }
  async projection(): Promise<string[]> {
    return (await this.log.outcomes())
      .filter((o) => o.disposition === "apply")
      .map((o) => o.value!);
  }
}
export async function initialStream(
  ctx: Context,
  env: mls.MlsContext,
  d: Device,
  log: Records,
): Promise<StreamClient> {
  const c = await initial(ctx, env, d);
  return new StreamClient(ctx, env, d, c.data, log);
}
export async function joinedStream(
  ctx: Context,
  env: mls.MlsContext,
  d: Device,
  welcome: string,
  expectedHash: string,
  publicState: PublicState,
  log: Records,
): Promise<StreamClient> {
  check((await hash(welcome)) === expectedHash, "Welcome identity");
  const w = decodeMessage(welcome);
  check(w.wireformat === mls.wireformats.mls_welcome, "Welcome type");
  const state = await mls.joinGroup({
    context: env,
    welcome: w.welcome,
    keyPackage: d.keys.publicPackage,
    privateKeys: d.keys.privatePackage,
  });
  equal(members(state, ctx), publicState.members, "Welcome archive membership");
  check(Number(state.groupContext.epoch) === publicState.epoch, "Welcome archive epoch");
  const data = initialData(state, ctx);
  data.public = clone(publicState);
  return new StreamClient(ctx, env, d, data, log);
}
