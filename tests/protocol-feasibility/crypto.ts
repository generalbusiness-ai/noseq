import * as mls from "../../artifacts/crypto-preflight/sources/marmot-ts/ts-mls/dist/src/index.js";
import { action, b64, canonical, check, clone, decoder, equal, eventBytes, fields, hash, hex, hex32, integer, kinds, limits, parse, publicKey, read, readAction, sign, unb64, utf8, type Context, type Signed, type Action } from "./wire.ts";
import { createOpening, type Opening } from "./opening.ts";

export interface Binding { account: string; device: string; leaf: string }
export interface Device { accountKey: string; deviceKey: string; binding: Binding; keys: { publicPackage: mls.KeyPackage; privatePackage: mls.PrivateKeyPackage } }
export const encodeState = (s: mls.ClientState): string => b64(mls.encode(mls.clientStateEncoder, s));
export function decodeState(s: string): mls.ClientState {
  const b = unb64(s, limits.archive); const r = mls.clientStateDecoder(b, 0); check(r && r[1] === b.length, "MLS state/trailing bytes"); return r[0];
}
export const encodeMessage = (m: mls.MlsMessage): string => b64(mls.encode(mls.mlsMessageEncoder, m));
export function decodeMessage(s: string): mls.MlsMessage {
  const b = unb64(s); const r = mls.mlsMessageDecoder(b, 0); check(r && r[1] === b.length, "MLS message/trailing bytes"); return r[0];
}
export function privateMessage(s: string): mls.MlsFramedMessage {
  const m = decodeMessage(s); check(m.wireformat === mls.wireformats.mls_private_message, "private MLS message required"); return m;
}
export function binding(credential: mls.Credential, key: Uint8Array, ctx: Context): Binding {
  check(credential.credentialType === mls.defaultCredentialTypes.basic && "identity" in credential, "Basic credential required");
  const e = read(decoder.decode(credential.identity), "proof", ctx); const c = parse(e.content);
  fields(c, ["type", "device", "suite", "leaf"]); check(c.type === "account-leaf" && c.suite === 1 && c.leaf === hex(key), "leaf proof binding"); hex32(c.device); hex32(c.leaf);
  return { account: e.pubkey, device: c.device, leaf: c.leaf };
}
export async function environment(ctx: Context): Promise<mls.MlsContext> {
  return { cipherSuite: await mls.getCiphersuiteImpl("MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519"),
    authService: { async validateCredential(credential, key) { try { binding(credential, key, ctx); return true; } catch { return false; } } } };
}
export async function device(env: mls.MlsContext, ctx: Context, accountKey: string, deviceKey = accountKey): Promise<Device> {
  const pair = await env.cipherSuite.signature.keygen();
  const proof = sign(accountKey, "proof", ctx, { type: "account-leaf", device: publicKey(deviceKey), suite: 1, leaf: hex(pair.publicKey) });
  const credential = { credentialType: mls.defaultCredentialTypes.basic, identity: utf8.encode(eventBytes(proof)) };
  const keys = await mls.generateKeyPackageWithKey({ cipherSuite: env.cipherSuite, signatureKeyPair: pair, credential, extensions: [] });
  return { accountKey, deviceKey, keys, binding: binding(credential, pair.publicKey, ctx) };
}
export function members(s: mls.ClientState, ctx: Context): Binding[] {
  return mls.getGroupMembers(s).map(l => binding(l.credential, l.signaturePublicKey, ctx)).sort((a, b) => a.device.localeCompare(b.device));
}
export function checkMembers(value: unknown): asserts value is Binding[] {
  check(Array.isArray(value) && value.length > 0 && value.length <= limits.devices, "device limit");
  for (const b of value) { fields(b, ["account", "device", "leaf"]); hex32(b.account); hex32(b.device); hex32(b.leaf); }
  const bs = value as Binding[]; check(new Set(bs.map(b => b.device)).size === bs.length && new Set(bs.map(b => b.leaf)).size === bs.length, "duplicate member");
  check(new Set(bs.map(b => b.account)).size <= limits.accounts, "account limit"); equal(bs, [...bs].sort((a, b) => a.device.localeCompare(b.device)), "member ordering");
}
export interface Submission { type: "commit" | "application"; epoch: number; version: number; bytes: string; welcome: string | null }
export function submission(e: Signed, ctx: Context): Submission {
  read(eventBytes(e), "submission", ctx); const c = parse(e.content); fields(c, ["type", "epoch", "version", "bytes", "welcome"]);
  check(c.type === "commit" || c.type === "application", "submission type"); integer(c.epoch); integer(c.version);
  check(c.welcome === null || typeof c.welcome === "string", "Welcome hash"); if (c.welcome !== null) hex32(c.welcome);
  check(typeof c.bytes === "string", "ciphertext type"); const m = decodeMessage(c.bytes);
  check(m.wireformat === mls.wireformats.mls_private_message && String(m.privateMessage.epoch) === String(c.epoch) && hex(m.privateMessage.groupId) === ctx.genesis, "MLS public header binding");
  return c as unknown as Submission;
}
export interface Control { version: number; epoch: number; submission: string; members: Binding[] }
export function control(e: Signed, ctx: Context): Control {
  read(eventBytes(e), "admission", ctx); check(e.pubkey === ctx.owner, "owner signature required");
  const c = parse(e.content); fields(c, ["version", "epoch", "submission", "members"]); integer(c.version); integer(c.epoch); hex32(c.submission); checkMembers(c.members);
  check(c.members.some(m => m.account === ctx.owner), "cannot remove every owner device"); return c as unknown as Control;
}
export interface Entry { position: number; previous: string; submission: Signed; admission: Signed | null }
export function entry(e: Signed, ctx: Context): Entry {
  read(eventBytes(e), "order", ctx); check(e.pubkey === ctx.sequencer, "sequencer proof");
  const c = parse(e.content); fields(c, ["position", "previous", "submission", "admission"]); integer(c.position); check(c.position > 0, "positive position"); hex32(c.previous);
  const sub = read(eventBytes(c.submission as Signed), "submission", ctx); submission(sub, ctx);
  if (c.admission !== null) control(c.admission as Signed, ctx);
  return { position: c.position, previous: c.previous, submission: sub, admission: c.admission as Signed | null };
}
export interface PublicState { version: number; epoch: number; members: Binding[] }
export function publicTransition(ctx: Context, state: PublicState, e: Entry): PublicState {
  const sub = submission(e.submission, ctx); const author = state.members.find(m => m.device === e.submission.pubkey);
  check(author, "submitter not currently admitted");
  check(sub.epoch <= state.epoch && sub.version <= state.version, "future dependency");
  if (sub.epoch < state.epoch || sub.version < state.version) return state; // Public, common stale disposition.
  if (sub.type === "application") { check(e.admission === null && sub.welcome === null, "application control mismatch"); return state; }
  check(author.account === ctx.owner, "control proposer is not owner"); check(e.admission, "missing admission half"); const c = control(e.admission, ctx);
  check(c.submission === e.submission.id && c.epoch === state.epoch + 1 && c.version === state.version + 1, "admission/Commit mismatch");
  return { version: c.version, epoch: c.epoch, members: c.members };
}
// In-memory transport policy model. This is not the P4 sequencer/transaction implementation.
export class Journal {
  events: Signed[] = []; receipts: Record<string, Signed> = {}; halves: Record<string, { submission?: Signed; admission?: Signed }> = {};
  constructor(readonly ctx: Context, readonly key: string, public state: PublicState) {}
  restore(): Journal { const j = new Journal(this.ctx, this.key, clone(this.state)); j.events = clone(this.events); j.receipts = clone(this.receipts); j.halves = clone(this.halves); return j; }
  async append(sub: Signed, admission: Signed | null = null): Promise<Signed> {
    // Exact committed receipt lookup precedes current admission, including a revoked sender's retry.
    read(eventBytes(sub), "submission", this.ctx);
    if (this.receipts[sub.id]) { equal(entry(this.receipts[sub.id]!, this.ctx).submission, sub, "retry byte mismatch"); return clone(this.receipts[sub.id]!); }
    const body: Entry = { position: this.events.length + 1, previous: this.events.at(-1)?.id ?? this.ctx.genesis, submission: sub, admission };
    const next = publicTransition(this.ctx, this.state, body); const signed = sign(this.key, "order", this.ctx, body); read(eventBytes(signed), "order", this.ctx);
    this.events.push(signed); this.receipts[sub.id] = signed; this.state = clone(next); return signed;
  }
  async half(id: string, which: "submission" | "admission", value: Signed): Promise<Signed | null> {
    hex32(id); const record = this.halves[id] ??= {}; record[which] = clone(value);
    if (!record.submission || !record.admission) return null;
    check(record.submission.id === id && control(record.admission, this.ctx).submission === id, "substituted half");
    const result = await this.append(record.submission, record.admission); delete this.halves[id]; return result;
  }
}
interface Pending { event: Signed; state: string; base: string; plaintext: Signed | null; welcome: string | null }
export interface Outcome { position: number; logical: string; disposition: "apply" | "refuse" | "duplicate" | "stale" | "control"; value: string | null }
export interface Snapshot { state: string; pending: Pending | null; public: PublicState; events: Signed[]; outcomes: Outcome[]; logical: Record<string, string>; published: number[]; observed: Record<number, string>; fork: boolean; openings: Opening[]; released: Record<string, string> }
export class Client {
  constructor(readonly ctx: Context, readonly env: mls.MlsContext, readonly keys: Pick<Device, "accountKey" | "deviceKey" | "binding">, public data: Snapshot) {}
  snapshot(): string { return canonical(this.data); }
  lastGood(): string { const { observed: _, fork: __, ...rest } = this.data; return canonical(rest); }
  restart(): Client { return new Client(this.ctx, this.env, this.keys, parse(this.snapshot(), limits.archive) as unknown as Snapshot); }
  get epoch(): number { return Number(decodeState(this.data.state).groupContext.epoch); }
  async stageCommit(proposals: mls.Proposal[] = []): Promise<{ event: Signed; admission: Signed }> {
    check(!this.data.pending, "one pending operation"); check(this.keys.binding.account === this.ctx.owner, "owner offline or unavailable");
    check(proposals.length <= limits.proposals, "proposal count before crypto");
    const before = this.data.state; const state = decodeState(before);
    const additions = proposals.filter(p => p.proposalType === mls.defaultProposalTypes.add);
    const removals = proposals.filter(p => p.proposalType === mls.defaultProposalTypes.remove);
    check(members(state, this.ctx).length + additions.length - removals.length <= limits.devices, "device limit before crypto");
    for (const p of additions) {
      check(p.proposalType === mls.defaultProposalTypes.add && "add" in p && mls.encode(mls.keyPackageEncoder, p.add.keyPackage).length <= limits.keyPackage, "KeyPackage bytes before Commit crypto");
    }
    const result = await mls.createCommit({ context: this.env, state, extraProposals: proposals, ratchetTreeExtension: true });
    equal(encodeState(state), before, "accepted input mutated");
    const welcome = result.welcome ? encodeMessage(result.welcome) : null;
    const event = sign(this.keys.deviceKey, "submission", this.ctx, { type: "commit", epoch: this.epoch, version: this.data.public.version, bytes: encodeMessage(result.commit), welcome: welcome ? await hash(welcome) : null });
    const next = members(result.newState, this.ctx); checkMembers(next);
    const admission = sign(this.keys.accountKey, "admission", this.ctx, { version: this.data.public.version + 1, epoch: this.epoch + 1, submission: event.id, members: next });
    this.data.pending = { event, state: encodeState(result.newState), base: before, plaintext: null, welcome };
    for (const b of result.consumed) b.fill(0); return { event, admission };
  }
  async stageAction(value: string, logical: string, outcome: Action["outcome"] = "apply"): Promise<Signed> {
    check(!this.data.pending, "one pending operation");
    const plaintext = action(this.keys.accountKey, this.ctx, { logical, device: this.keys.binding.device, value, outcome });
    const result = await mls.createApplicationMessage({ context: this.env, state: decodeState(this.data.state), message: utf8.encode(eventBytes(plaintext)) });
    const event = sign(this.keys.deviceKey, "submission", this.ctx, { type: "application", epoch: this.epoch, version: this.data.public.version, bytes: encodeMessage(result.message), welcome: null });
    read(eventBytes(event), "submission", this.ctx);
    this.data.pending = { event, state: encodeState(result.newState), base: this.data.state, plaintext, welcome: null };
    for (const b of result.consumed) b.fill(0); return event;
  }
  async receive(signed: Signed): Promise<"accepted" | "duplicate" | "wait"> {
    const e = entry(signed, this.ctx); check(!this.data.fork, "observed fork halt");
    if (this.data.observed[e.position] && this.data.observed[e.position] !== signed.id) { this.data.fork = true; throw new Error("observed fork"); }
    this.data.observed[e.position] = signed.id;
    const previous = this.data.events[e.position - 1]; if (previous) { check(previous.id === signed.id, "fork"); return "duplicate"; }
    if (e.position > this.data.events.length + 1) return "wait";
    check(e.previous === (this.data.events.at(-1)?.id ?? this.ctx.genesis), "predecessor mismatch");
    const sub = submission(e.submission, this.ctx);
    if (sub.epoch > this.epoch || sub.version > this.data.public.version) return "wait";
    const nextPublic = publicTransition(this.ctx, this.data.public, e);
    const state = decodeState(this.data.state); check(state.groupActiveState.kind !== "removedFromGroup", "removed terminal");
    const next = clone(this.data);
    if (sub.epoch < this.epoch || sub.version < this.data.public.version) {
      next.events.push(signed); next.outcomes.push({ position: e.position, logical: e.submission.id, disposition: "stale", value: null }); this.data = next; return "accepted";
    }
    const member = this.data.public.members.find(m => m.device === e.submission.pubkey)!;
    const index = state.ratchetTree.findIndex(n => n?.nodeType === mls.nodeTypes.leaf && hex(n.leaf.signaturePublicKey) === member.leaf) / 2;
    check(index >= 0, "local membership/key mismatch");
    const pending = this.data.pending; const own = pending?.event.id === e.submission.id; let plaintext: Signed | null = null;
    if (own) { equal(pending.base, this.data.state, "pending base mismatch"); next.state = pending.state; plaintext = pending.plaintext; }
    else {
      const result = await mls.processMessage({ context: this.env, state, message: privateMessage(sub.bytes), callback: x => x.kind === "commit" && x.senderLeafIndex === index ? "accept" : "reject" });
      if (sub.type === "commit") check(result.kind === "newState" && result.actionTaken === "accept", "Commit not accepted");
      else { check(result.kind === "applicationMessage" && result.senderLeafIndex === index, "MLS sender/type mismatch"); plaintext = read(decoder.decode(result.message), "proof", this.ctx); }
      next.state = encodeState(result.newState); for (const b of result.consumed) b.fill(0);
    }
    const decoded = decodeState(next.state); const removed = decoded.groupActiveState.kind === "removedFromGroup";
    check(removed ? sub.type === "commit" && !own && Number(decoded.groupContext.epoch) === this.epoch : Number(decoded.groupContext.epoch) === this.epoch + (sub.type === "commit" ? 1 : 0), "epoch transition");
    if (sub.type === "commit") {
      // Removed state intentionally lacks the new ratchet tree; validate removal against prior member and owner declaration.
      if (removed) check(!nextPublic.members.some(m => m.device === this.keys.binding.device), "unexpected removal");
      else equal(members(decoded, this.ctx), nextPublic.members, "decrypted membership/owner declaration mismatch");
      next.public = clone(nextPublic); next.outcomes.push({ position: e.position, logical: e.submission.id, disposition: "control", value: null });
    } else {
      check(plaintext, "missing action"); const a = readAction(plaintext, this.ctx, member.account, member.device);
      check(a.outcome !== "runtime-failure", "runtime failure: preserve frontier");
      const prior = next.logical[a.logical]; if (prior) check(prior === plaintext.id, "logical identity reused with changed action");
      const disposition = prior ? "duplicate" : a.outcome;
      next.logical[a.logical] = plaintext.id; next.outcomes.push({ position: e.position, logical: a.logical, disposition, value: disposition === "apply" ? a.value : null });
      next.openings.push(await createOpening(decodeState(this.data.state), privateMessage(sub.bytes), this.env, e.position, e.submission.id, plaintext));
    }
    if (pending && !own && sub.type === "application") {
      const r = await mls.processMessage({ context: this.env, state: decodeState(pending.state), message: privateMessage(sub.bytes) });
      check(r.kind === "applicationMessage" && decoder.decode(r.message) === eventBytes(plaintext!), "pending interleaving differs");
      next.pending = { ...pending, state: encodeState(r.newState), base: next.state }; for (const b of r.consumed) b.fill(0);
    }
    if (own) { if (pending.welcome) next.released[e.submission.id] = pending.welcome; next.pending = null; }
    else if (pending && sub.type === "commit") next.pending = null;
    next.events.push(signed); this.data = next; return "accepted";
  }
  publish(): Outcome[] { const fresh = this.data.outcomes.filter(o => !this.data.published.includes(o.position)); this.data.published.push(...fresh.map(o => o.position)); return fresh; }
}
export function initialData(state: mls.ClientState, ctx: Context): Snapshot {
  return { state: encodeState(state), pending: null, public: { version: 0, epoch: Number(state.groupContext.epoch), members: members(state, ctx) }, events: [], outcomes: [], logical: {}, published: [], observed: {}, fork: false, openings: [], released: {} };
}
export async function initial(ctx: Context, env: mls.MlsContext, d: Device): Promise<Client> {
  check(d.binding.account === ctx.owner, "creator identity"); const state = await mls.createGroup({ context: env, groupId: Uint8Array.from(ctx.genesis.match(/../g)!, x => parseInt(x, 16)), keyPackage: d.keys.publicPackage, privateKeyPackage: d.keys.privatePackage });
  check(await env.authService.validateCredential(d.keys.publicPackage.leafNode.credential, d.keys.publicPackage.leafNode.signaturePublicKey), "founder proof");
  return new Client(ctx, env, d, initialData(state, ctx));
}
export const add = (d: Device): mls.Proposal => ({ proposalType: mls.defaultProposalTypes.add, add: { keyPackage: d.keys.publicPackage } });
export function remove(client: Client, d: Device): mls.Proposal {
  const s = decodeState(client.data.state); const node = s.ratchetTree.findIndex(n => n?.nodeType === mls.nodeTypes.leaf && hex(n.leaf.signaturePublicKey) === d.binding.leaf); check(node >= 0, "unknown removed leaf");
  return { proposalType: mls.defaultProposalTypes.remove, remove: { removed: node / 2 } };
}
export type History = Omit<Snapshot, "state" | "pending" | "released">;
export async function join(client: Client, d: Device, sub: Signed, acceptedArchive: History): Promise<Client> {
  const welcome = client.data.released[sub.id]; check(welcome && await hash(welcome) === submission(sub, client.ctx).welcome, "Welcome not accepted/released");
  check(acceptedArchive.events.some(e => entry(e, client.ctx).submission.id === sub.id), "archive does not cover join");
  const w = decodeMessage(welcome); check(w.wireformat === mls.wireformats.mls_welcome, "Welcome type");
  const state = await mls.joinGroup({ context: client.env, welcome: w.welcome, keyPackage: d.keys.publicPackage, privateKeys: d.keys.privatePackage });
  equal(members(state, client.ctx), acceptedArchive.public.members, "Welcome membership/archive mismatch");
  const data: Snapshot = { ...clone(acceptedArchive), state: encodeState(state), pending: null, released: {}, published: [] };
  return new Client(client.ctx, client.env, d, data);
}
export { mls };
