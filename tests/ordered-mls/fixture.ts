// Development fixture only. It is neither a production protocol nor an admission service.
import * as mls from "../../artifacts/crypto-preflight/sources/marmot-ts/ts-mls/dist/src/index.js";
import { schnorr } from "@noble/curves/secp256k1.js";

export const instance = "noseq/p1b/synthetic-instance";
export const genesis = "9d4a62f7347b4e9d930735507d3170eb554865214d6382a7298309d037fa8401";
const domain = "noseq/ordered-mls-probe";
export const trace: unknown[] = [];
const utf8 = new TextEncoder();
const text = new TextDecoder("utf-8", { fatal: true });
export function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
export function equal(a: unknown, b: unknown, message: string): void { check(JSON.stringify(a) === JSON.stringify(b), message); }
export const hex = (bytes: Uint8Array): string => Array.from(bytes, n => n.toString(16).padStart(2, "0")).join("");
export function unhex(value: string): Uint8Array {
  check(/^(?:[0-9a-f]{2})*$/.test(value), "invalid hex");
  return Uint8Array.from(value.match(/../g) ?? [], b => parseInt(b, 16));
}
export async function digest(value: unknown): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", utf8.encode(JSON.stringify(value)))));
}
const testKey = (n: number): Uint8Array => { const key = new Uint8Array(32); key[31] = n; return key; };
const accounts = Object.fromEntries(["alice", "bob", "carol", "dave"].map((name, i) => [name, testKey(i + 11)]));
const sequenceKey = testKey(20);
const sequencePublic = hex(schnorr.getPublicKey(sequenceKey));
const account = (name: string): string => hex(schnorr.getPublicKey(accounts[name]!));
const signed = async (value: unknown, key: Uint8Array): Promise<string> => hex(schnorr.sign(unhex(await digest(value)), key));
const verifies = async (value: unknown, signature: string, publicKey: string): Promise<boolean> => {
  try { return schnorr.verify(unhex(signature), unhex(await digest(value)), unhex(publicKey)); } catch { return false; }
};
const leafBody = (name: string, publicKey: string) => [domain + "/account-leaf@1", instance, genesis, account(name), name, 1, publicKey];
export interface Device { name: string; publicPackage: mls.KeyPackage; privatePackage: mls.PrivateKeyPackage }
export async function environment() {
  const cipherSuite = await mls.getCiphersuiteImpl("MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519");
  const validation = { accepted: 0, rejected: 0 };
  const authService: mls.AuthenticationService = {
    async validateCredential(credential, publicKey) {
      let valid = false;
      try {
        check(credential.credentialType === mls.defaultCredentialTypes.basic && "identity" in credential, "basic credential required");
        const proof = JSON.parse(text.decode(credential.identity)) as { name: string; body: unknown; signature: string };
        check(Object.keys(proof).sort().join() === "body,name,signature", "unexpected credential fields");
        check(Object.hasOwn(accounts, proof.name), "account outside closed fixture");
        equal(proof.body, leafBody(proof.name, hex(publicKey)), "account/leaf/domain mismatch");
        valid = await verifies(proof.body, proof.signature, account(proof.name));
      } catch { valid = false; }
      validation[valid ? "accepted" : "rejected"]++;
      return valid;
    },
  };
  const context: mls.MlsContext = { cipherSuite, authService };
  const devices: Record<string, Device> = {};
  for (const name of Object.keys(accounts)) {
    const signatureKeyPair = await cipherSuite.signature.keygen();
    const body = leafBody(name, hex(signatureKeyPair.publicKey));
    const credential = { credentialType: mls.defaultCredentialTypes.basic,
      identity: utf8.encode(JSON.stringify({ name, body, signature: await signed(body, accounts[name]!) })) };
    const keys = await mls.generateKeyPackageWithKey({ cipherSuite, signatureKeyPair, credential, extensions: [] });
    check(await authService.validateCredential(keys.publicPackage.leafNode.credential, keys.publicPackage.leafNode.signaturePublicKey), "own leaf proof");
    devices[name] = { name, ...keys };
    trace.push({ kind: "verified-public-leaf", name, credential: JSON.parse(text.decode(credential.identity)), signaturePublicKey: hex(signatureKeyPair.publicKey) });
  }
  return { context, devices, validation };
}
export type Environment = Awaited<ReturnType<typeof environment>>;
const encodeState = (state: mls.ClientState) => hex(mls.encode(mls.clientStateEncoder, state));
export function decodeState(value: string): mls.ClientState {
  const bytes = unhex(value); const result = mls.clientStateDecoder(bytes, 0);
  check(result && result[1] === bytes.length, "state decode failed or trailing bytes"); return result[0];
}
const encodeMessage = (message: mls.MlsMessage) => hex(mls.encode(mls.mlsMessageEncoder, message));
const decodeMessage = (value: string): mls.MlsMessage => {
  const bytes = unhex(value); const result = mls.mlsMessageDecoder(bytes, 0);
  check(result && result[1] === bytes.length, "message decode failed or trailing bytes"); return result[0];
};
export interface Envelope {
  kind: "commit" | "application"; epoch: string; sender: string; bytes: string; welcomeHash: string | null; signature: string;
}
const envelopeBody = (e: Envelope) => [domain + "/envelope@1", instance, genesis, e.kind, e.epoch, e.sender, e.bytes, e.welcomeHash];
export const envelopeId = (e: Envelope) => digest(envelopeBody(e));
export async function resignEnvelope(e: Envelope): Promise<Envelope> {
  return { ...e, signature: await signed(envelopeBody(e), accounts[e.sender]!) };
}
export async function envelope(name: string, kind: Envelope["kind"], message: mls.MlsFramedMessage, welcome: string | null = null): Promise<Envelope> {
  check(message.wireformat === mls.wireformats.mls_private_message, "private fixture messages required");
  const e: Envelope = { kind, epoch: String(message.privateMessage.epoch), sender: name, bytes: encodeMessage(message),
    welcomeHash: welcome === null ? null : await digest(welcome), signature: "" };
  e.signature = await signed(envelopeBody(e), accounts[name]!); return e;
}
export interface Entry { instance: string; genesis: string; index: number; previous: string; envelope: Envelope; id: string; signature: string }
const orderBody = (e: Omit<Entry, "id" | "signature">) => [domain + "/order@1", e.instance, e.genesis, e.index, e.previous, e.envelope];
export async function order(previous: Pick<Entry, "index" | "id"> | null, payload: Envelope, overrides = {}): Promise<Entry> {
  const body = { instance, genesis, index: (previous?.index ?? 0) + 1, previous: previous?.id ?? genesis, envelope: payload, ...overrides };
  return { ...body, id: await digest(orderBody(body)), signature: await signed(orderBody(body), sequenceKey) };
}
async function verifyOrder(entry: Entry): Promise<void> {
  check(entry.instance === instance && entry.genesis === genesis, "wrong instance/genesis");
  check(Number.isSafeInteger(entry.index) && entry.index > 0, "invalid sequence index");
  check(entry.id === await digest(orderBody(entry)) && await verifies(orderBody(entry), entry.signature, sequencePublic), "invalid order signature");
}
async function verifyEntry(entry: Entry): Promise<void> {
  await verifyOrder(entry);
  const e = entry.envelope;
  check(Object.hasOwn(accounts, e.sender) && await verifies(envelopeBody(e), e.signature, account(e.sender)), "invalid author proof");
  check(e.kind === "commit" || e.kind === "application", "unknown envelope kind");
  check(/^(0|[1-9][0-9]*)$/.test(e.epoch), "invalid epoch");
  const message = decodeMessage(e.bytes);
  check(message.wireformat === mls.wireformats.mls_private_message, "private message required");
  check(String(message.privateMessage.epoch) === e.epoch && hex(message.privateMessage.groupId) === hex(utf8.encode(instance)), "MLS header/envelope mismatch");
}
export interface Pending { envelope: Envelope; state: string; welcome: string | null; base: string; plaintext: string | null }
interface Outcome { id: string; author: string; value: string }
interface Applied { entry: Entry; disposition: "commit" | "application" | "stale" }
export interface Snapshot {
  name: string; state: string; pending: Pending | null; applied: Applied[]; outcomes: Outcome[]; published: string[];
  released: Record<string, string>; discarded: number;
  observed: Record<number, string>;
  fork: boolean;
}
export class Client {
  constructor(readonly env: Environment, public data: Snapshot) {}
  snapshot(): string { return JSON.stringify(this.data); }
  lastGoodSnapshot(): string { const { observed: _, fork: __, ...accepted } = this.data; return JSON.stringify(accepted); }
  restart(): Client { return new Client(this.env, JSON.parse(this.snapshot()) as Snapshot); }
  get epoch(): bigint { return decodeState(this.data.state).groupContext.epoch; }
  get last(): Entry | null { return this.data.applied.at(-1)?.entry ?? null; }
  get frontier(): unknown { return { index: this.last?.index ?? 0, id: this.last?.id ?? genesis, outcomes: this.data.outcomes }; }
  // Accepted serialized bytes are never passed to mutating/consuming library APIs.
  async stageCommit(proposals: mls.Proposal[] = []): Promise<Envelope> {
    check(!this.data.pending, "one local pending operation at a time");
    const original = this.data.state; const state = decodeState(original);
    const before = encodeState(state);
    const result = await mls.createCommit({ context: this.env.context, state, extraProposals: proposals, ratchetTreeExtension: true });
    equal(encodeState(state), before, "createCommit changed its accepted input");
    const welcome = result.welcome ? encodeMessage(result.welcome) : null;
    const e = await envelope(this.data.name, "commit", result.commit, welcome);
    this.data.pending = { envelope: e, state: encodeState(result.newState), welcome, base: original, plaintext: null };
    for (const secret of result.consumed) secret.fill(0);
    equal(this.data.state, original, "staging changed accepted bytes");
    trace.push({ kind: "staged-commit", client: this.data.name, epoch: String(this.epoch), acceptedHash: await digest(original), pendingHash: await digest(this.data.pending.state), envelope: e });
    return e;
  }
  async stageApplication(value: string): Promise<Envelope> {
    check(!this.data.pending, "one local pending operation at a time");
    const body = [domain + "/action@1", instance, genesis, this.data.name, value];
    const plaintext = JSON.stringify({ author: this.data.name, value, signature: await signed(body, accounts[this.data.name]!) });
    const result = await mls.createApplicationMessage({ context: this.env.context, state: decodeState(this.data.state), message: utf8.encode(plaintext) });
    const e = await envelope(this.data.name, "application", result.message);
    this.data.pending = { envelope: e, state: encodeState(result.newState), welcome: null, base: this.data.state, plaintext };
    for (const secret of result.consumed) secret.fill(0);
    return e;
  }
  async receive(entry: Entry): Promise<"accepted" | "duplicate" | "wait"> {
    // Work on an isolated snapshot: any validation/decryption error leaves the full frontier intact.
    await verifyOrder(entry);
    check(!this.data.fork, "halted after observed signed fork");
    if (this.data.observed[entry.index] && this.data.observed[entry.index] !== entry.id) {
      this.data.fork = true; throw new Error("observed signed fork");
    }
    this.data.observed[entry.index] = entry.id; // Retain signed fork evidence even at a waiting/failed position.
    trace.push({ kind: "observed-signed-order", client: this.data.name, entry });
    await verifyEntry(entry);
    const existing = this.data.applied[entry.index - 1];
    if (existing) { check(existing.entry.id === entry.id, "observed signed fork"); return "duplicate"; }
    if (entry.index > (this.last?.index ?? 0) + 1) return "wait";
    if (entry.previous !== (this.last?.id ?? genesis)) { this.data.fork = true; throw new Error("hash continuity fork"); }
    check(decodeState(this.data.state).groupActiveState.kind !== "removedFromGroup", "removed-member terminal state");
    const e = entry.envelope; const currentEpoch = this.epoch;
    if (BigInt(e.epoch) > currentEpoch) return "wait"; // No local skip for unavailable epoch state.
    if (BigInt(e.epoch) < currentEpoch) {
      // Fixture policy: authenticated header proves old epoch. This is not a decryption-failure decision.
      this.data.applied.push({ entry, disposition: "stale" }); return "accepted";
    }
    const state = decodeState(this.data.state);
    const member = mls.getGroupMembers(state).find(leaf => {
      try { return "identity" in leaf.credential && JSON.parse(text.decode(leaf.credential.identity)).name === e.sender; } catch { return false; }
    });
    check(member && await this.env.context.authService.validateCredential(member.credential, member.signaturePublicKey), "author is not an authenticated current member");
    const pending = this.data.pending;
    const own = pending && await envelopeId(pending.envelope) === await envelopeId(e);
    let next: string; let plaintext: string | null = null;
    if (own) {
      equal(pending.base, this.data.state, "pending base no longer accepted");
      next = pending.state; plaintext = pending.plaintext;
    } else {
      const message = decodeMessage(e.bytes);
      check(message.wireformat === mls.wireformats.mls_private_message, "private message required");
      const memberIndex = state.ratchetTree.findIndex(node => node?.nodeType === mls.nodeTypes.leaf && hex(node.leaf.signaturePublicKey) === hex(member.signaturePublicKey)) / 2;
      const result = await mls.processMessage({ context: this.env.context, state, message,
        callback: incoming => incoming.kind === "commit" && incoming.senderLeafIndex === memberIndex ? "accept" : "reject" });
      if (e.kind === "commit") check(result.kind === "newState" && result.actionTaken === "accept", "commit was not accepted");
      else {
        check(result.kind === "applicationMessage", "application kind mismatch");
        check(result.senderLeafIndex !== undefined, "missing MLS sender");
        const leaf = state.ratchetTree[result.senderLeafIndex * 2];
        check(leaf?.nodeType === mls.nodeTypes.leaf && hex(leaf.leaf.signaturePublicKey) === hex(member.signaturePublicKey), "outer/MLS author mismatch");
        plaintext = text.decode(result.message);
      }
      next = encodeState(result.newState);
      for (const secret of result.consumed) secret.fill(0);
    }
    const nextEpoch = decodeState(next).groupContext.epoch;
    const removed = decodeState(next).groupActiveState.kind === "removedFromGroup";
    // Removed recipients authenticate the Commit but do not receive the next epoch's keys.
    check(removed ? e.kind === "commit" && !own && nextEpoch === currentEpoch
      : nextEpoch === currentEpoch + (e.kind === "commit" ? 1n : 0n), "unexpected MLS epoch transition");
    let outcome: Outcome | null = null;
    if (e.kind === "application") {
      check(plaintext, "missing plaintext");
      const action = JSON.parse(plaintext) as Outcome & { signature: string };
      check(action.author === e.sender && typeof action.value === "string", "action author/content mismatch");
      check(await verifies([domain + "/action@1", instance, genesis, action.author, action.value], action.signature, account(action.author)), "invalid action signature");
      outcome = { id: entry.id, author: action.author, value: action.value };
    }
    let carriedPending = pending;
    if (e.kind === "application" && pending && !own) {
      // Advance the same accepted input through the provisional branch using the MLS API.
      // A pending Commit retains its parent epoch; no hand-merged secret trees or state fields.
      const message = decodeMessage(e.bytes);
      check(message.wireformat === mls.wireformats.mls_private_message, "private message required");
      const carried = await mls.processMessage({ context: this.env.context, state: decodeState(pending.state), message });
      check(carried.kind === "applicationMessage" && text.decode(carried.message) === plaintext, "pending branch application replay differs");
      carriedPending = { ...pending, state: encodeState(carried.newState), base: next };
      for (const secret of carried.consumed) secret.fill(0);
    }
    this.data.state = next;
    this.data.pending = carriedPending;
    if (own) {
      if (pending.welcome) this.data.released[await envelopeId(e)] = pending.welcome;
      this.data.pending = null;
    } else if (e.kind === "commit" && pending) {
      this.data.pending = null; this.data.discarded++;
    }
    this.data.applied.push({ entry, disposition: e.kind });
    if (outcome) this.data.outcomes.push(outcome);
    trace.push({ kind: "accepted", client: this.data.name, id: entry.id, epoch: String(this.epoch), stateHash: await digest(next), frontier: structuredClone(this.frontier) });
    return "accepted";
  }
  publish(): Outcome[] {
    const fresh = this.data.outcomes.filter(o => !this.data.published.includes(o.id));
    this.data.published.push(...fresh.map(o => o.id)); return fresh;
  }
}
export function add(device: Device): mls.Proposal { return { proposalType: mls.defaultProposalTypes.add, add: { keyPackage: device.publicPackage } }; }
export async function initial(env: Environment): Promise<Client> {
  const a = env.devices.alice!;
  const state = await mls.createGroup({ context: env.context, groupId: utf8.encode(instance), keyPackage: a.publicPackage, privateKeyPackage: a.privatePackage });
  return new Client(env, { name: "alice", state: encodeState(state), pending: null, applied: [], outcomes: [], published: [], released: {}, discarded: 0, observed: {}, fork: false });
}
export async function join(inviter: Client, name: string, commit: Envelope, welcome: string): Promise<Client> {
  // This is the inviter's accepted ledger, not an independently verified full admission/history proof.
  const id = await envelopeId(commit);
  const accepted = inviter.data.applied.find(a => a.disposition === "commit" && a.entry.envelope.kind === "commit" && a.entry.envelope.bytes === commit.bytes);
  check(accepted && inviter.data.released[id] === welcome && await digest(welcome) === commit.welcomeHash, "Welcome is not released on accepted branch");
  for (let i = 0; i <= accepted.entry.index - 1; i++) {
    const entry = inviter.data.applied[i]!.entry; await verifyEntry(entry);
    check(entry.index === i + 1 && entry.previous === (i ? inviter.data.applied[i - 1]!.entry.id : genesis), "join order continuity");
  }
  const message = decodeMessage(welcome); check(message.wireformat === mls.wireformats.mls_welcome, "Welcome required");
  const d = inviter.env.devices[name]!;
  const state = await mls.joinGroup({ context: inviter.env.context, welcome: message.welcome, keyPackage: d.publicPackage, privateKeys: d.privatePackage });
  equal(hex(state.groupContext.treeHash), hex(decodeState(inviter.data.state).groupContext.treeHash), "join branch mismatch");
  equal(String(state.groupContext.epoch), String(inviter.epoch), "join epoch mismatch");
  return new Client(inviter.env, { name, state: encodeState(state), pending: null, applied: structuredClone(inviter.data.applied),
    outcomes: [], published: [], released: {}, discarded: 0, observed: structuredClone(inviter.data.observed), fork: inviter.data.fork });
}
export async function group() {
  const env = await environment(); const alice = await initial(env);
  const commit = await alice.stageCommit([add(env.devices.bob!), add(env.devices.dave!)]);
  check(Object.keys(alice.data.released).length === 0, "Welcome leaked before ordered acceptance");
  const entry = await order(null, commit); await alice.receive(entry);
  const welcome = alice.data.released[await envelopeId(commit)]!;
  const bob = await join(alice, "bob", commit, welcome); const dave = await join(alice, "dave", commit, welcome);
  return { env, alice, bob, dave };
}
export async function mustFail(f: () => Promise<unknown>, reason?: string): Promise<string> {
  try { await f(); } catch (error) { const result = String(error); if (reason) check(result.includes(reason), `wrong failure: ${result}`); return result; }
  throw new Error("expected failure did not occur");
}
export { mls };
