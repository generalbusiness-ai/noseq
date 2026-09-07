import { v2 as nip44 } from "nostr-tools/nip44";
import { b64, canonical, check, clone, decoder, equal, eventBytes, fields, hash, hashBytes, hex, hex32, limits, parse, publicKey, random, read, readAction, readGenesis, sign, unb64, unhex, utf8, type Context, type Signed } from "./wire.ts";
import { binding, Client, privateMessage, decodeState, entry, environment, members, mls, publicTransition, submission, type Binding, type History, type PublicState, type Snapshot } from "./crypto.ts";
import { verifyOpening } from "./opening.ts";

export interface Definition { nonce: string; files: { path: string; bytes: string }[] }
export async function definitionId(d: Definition): Promise<string> {
  fields(d, ["nonce", "files"]); hex32(d.nonce); check(Array.isArray(d.files) && d.files.length > 0 && d.files.length <= limits.files, "definition closure count");
  const paths = new Set<string>(); let total = 0;
  for (const f of d.files) {
    fields(f, ["path", "bytes"]); check(typeof f.path === "string" && /^[a-z0-9][a-z0-9._/-]{0,127}$/.test(f.path) && !f.path.split("/").some(s => s === ".." || s === "." || !s), "definition path");
    check(!paths.has(f.path), "duplicate closure path"); paths.add(f.path); total += unb64(f.bytes, limits.closure).length; check(total <= limits.closure, "definition closure bytes");
  }
  check(paths.has("manifest.json"), "missing definition manifest"); equal(d.files.map(f => f.path), d.files.map(f => f.path).sort(), "definition closure order");
  // Salt is encrypted with the closure: the public commitment need not expose equality/fingerprints.
  return hash(["noseq/definition-closure@1", d.nonce, d.files]);
}
export interface Encrypted { format: string; context: Context; generation: number; nonce: string; keyId: string; checkpoint: string; bytes: string }
const aad = (e: Omit<Encrypted, "bytes">): Uint8Array => utf8.encode(canonical(e));
export async function encrypt(value: unknown, key: string, ctx: Context, generation: number, checkpoint: string): Promise<Encrypted> {
  hex32(key); hex32(checkpoint); const plaintext = utf8.encode(canonical(value)); check(plaintext.length <= limits.archive, "archive export capacity: refuse, never truncate");
  const header = { format: "noseq/recovery-aes256gcm@1", context: ctx, generation, nonce: b64(random(12)), keyId: await hashBytes(unhex(key)), checkpoint };
  const k = await crypto.subtle.importKey("raw", unhex(key) as Uint8Array<ArrayBuffer>, "AES-GCM", false, ["encrypt"]);
  return { ...header, bytes: b64(new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: unb64(header.nonce) as Uint8Array<ArrayBuffer>, additionalData: aad(header) as Uint8Array<ArrayBuffer>, tagLength: 128 }, k, plaintext))) };
}
export async function decrypt(e: Encrypted, key: string, ctx: Context): Promise<unknown> {
  fields(e, ["format", "context", "generation", "nonce", "keyId", "checkpoint", "bytes"]); hex32(key); hex32(e.keyId); hex32(e.checkpoint);
  equal(e.context, ctx, "recovery wrong instance/definition"); check(e.format === "noseq/recovery-aes256gcm@1", "recovery format");
  check(Number.isSafeInteger(e.generation) && e.generation >= 1, "recovery generation"); const nonce = unb64(e.nonce, 12); check(nonce.length === 12, "GCM nonce length");
  const ciphertext = unb64(e.bytes, limits.archive + 16); check(ciphertext.length >= 16, "GCM tag missing");
  check(await hashBytes(unhex(key)) === e.keyId, "wrong recovery key"); const { bytes: _, ...header } = e;
  const k = await crypto.subtle.importKey("raw", unhex(key) as Uint8Array<ArrayBuffer>, "AES-GCM", false, ["decrypt"]);
  const bytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce as Uint8Array<ArrayBuffer>, additionalData: aad(header) as Uint8Array<ArrayBuffer>, tagLength: 128 }, k, ciphertext as Uint8Array<ArrayBuffer>);
  return parse(decoder.decode(bytes), limits.archive);
}
export interface ArchiveBody { root: Signed; definition: Definition; initial: PublicState; snapshot: History }
export interface Archive { body: ArchiveBody; checkpoint: Signed }
export interface RecoveryExport { archive: Archive; vault: Snapshot; accountKey: string; deviceKey: string; binding: Binding }
export interface TrustedRoot { owner: string; genesis: string; tip?: string; checkpoint?: string }
export async function createArchive(owner: Client, root: Signed, definition: Definition, initial: PublicState): Promise<Archive> {
  check(owner.keys.binding.account === owner.ctx.owner, "archive correspondence attester must be owner");
  check(owner.data.events.length <= limits.archiveEntries, "archive prefix capacity"); check(await definitionId(definition) === owner.ctx.definition, "definition closure identity");
  check(owner.data.pending === null, "archive requires settled prefix");
  const { state: _, pending: __, released: ___, ...history } = clone(owner.data);
  const body: ArchiveBody = { root, definition, initial, snapshot: history };
  const checkpoint = sign(owner.keys.accountKey, "archive", owner.ctx, { type: "owner-attested-full-prefix@1", bodyHash: await hash(body), vaultHash: await hash(owner.data), count: owner.data.events.length, tip: owner.data.events.at(-1)?.id ?? owner.ctx.genesis });
  return { body, checkpoint };
}
// A branded result makes the normal consumer path verify before installing any history.
export class VerifiedArchive {
  private constructor(readonly context: Context, readonly snapshot: History, readonly definition: Definition, readonly checkpoint: Signed) {}
  static async verify(archive: Archive, root: TrustedRoot): Promise<VerifiedArchive> {
    fields(archive, ["body", "checkpoint"]); fields(archive.body, ["root", "definition", "initial", "snapshot"]);
    const ctx = readGenesis(archive.body.root, root.owner, root.genesis); const checkpoint = read(eventBytes(archive.checkpoint), "archive", ctx);
    check(checkpoint.pubkey === root.owner, "archive attester root"); if (root.checkpoint) check(checkpoint.id === root.checkpoint, "wrong archive checkpoint");
    const c = parse(checkpoint.content); fields(c, ["type", "bodyHash", "vaultHash", "count", "tip"]); hex32(c.vaultHash);
    check(c.type === "owner-attested-full-prefix@1" && c.bodyHash === await hash(archive.body), "archive attestation/hash");
    check(await definitionId(archive.body.definition) === ctx.definition, "wrong retained definition");
    const s = archive.body.snapshot; fields(s, ["public", "events", "outcomes", "logical", "published", "observed", "fork", "openings"]);
    check(Array.isArray(s.events) && s.events.length <= limits.archiveEntries && s.events.length === c.count, "archive truncated/coverage count");
    check((s.events.at(-1)?.id ?? ctx.genesis) === c.tip && (!root.tip || root.tip === c.tip), "archive coverage/freshness tip");
    check(!s.fork, "archive observed fork");
    let publicState = clone(archive.body.initial); check(publicState.version === 0 && publicState.epoch === 0 && publicState.members.length === 1 && publicState.members[0]!.account === root.owner, "archive initial authority");
    const env = await environment(ctx); const used = new Set<number>(); const recomputed: Snapshot["outcomes"] = []; const logical: Record<string, string> = {};
    for (let i = 0; i < s.events.length; i++) {
      const signed = s.events[i]!; const e = entry(signed, ctx); check(e.position === i + 1 && e.previous === (i ? s.events[i - 1]!.id : ctx.genesis), "archive gap/fork");
      const sub = submission(e.submission, ctx); const next = publicTransition(ctx, publicState, e);
      if (sub.epoch < publicState.epoch || sub.version < publicState.version) recomputed.push({ position: e.position, logical: e.submission.id, disposition: "stale", value: null });
      else if (sub.type === "commit") recomputed.push({ position: e.position, logical: e.submission.id, disposition: "control", value: null });
      else {
        const openings = s.openings.filter(o => o.position === e.position); check(openings.length === 1, "archive opening coverage hole/duplicate"); const opening = openings[0]!;
        check(opening.submission === e.submission.id, "opening/ciphertext mismatch"); used.add(e.position);
        const result = await verifyOpening(opening, privateMessage(sub.bytes), env, ctx); const proof = result.action;
        const openMembers = result.publicTree.filter(n => n?.nodeType === mls.nodeTypes.leaf).map(n => { check(n?.nodeType === mls.nodeTypes.leaf, "leaf"); return binding(n.leaf.credential, n.leaf.signaturePublicKey, ctx); }).sort((a, b) => a.device.localeCompare(b.device));
        equal(openMembers, publicState.members, "opening public membership");
        const member = publicState.members.find(m => m.device === e.submission.pubkey); check(member && result.leaf === member.leaf, "opening sender/account closure");
        const a = readAction(proof, ctx, member.account, member.device); check(a.outcome !== "runtime-failure", "cannot archive unfinalized runtime failure");
        const previous = logical[a.logical]; if (previous) check(previous === proof.id, "archive conflicting logical ID");
        const disposition = previous ? "duplicate" : a.outcome; logical[a.logical] = proof.id;
        recomputed.push({ position: e.position, logical: a.logical, disposition, value: disposition === "apply" ? a.value : null });
      }
      publicState = next;
    }
    check(used.size === s.openings.length, "extra opening outside promised interval"); equal(recomputed, s.outcomes, "archive outcomes not reproduced"); equal(logical, s.logical, "archive logical index"); equal(publicState, s.public, "archive final admission");
    return new VerifiedArchive(ctx, clone(s), clone(archive.body.definition), checkpoint);
  }
}
export async function exportOwner(owner: Client, archive: Archive, key: string, generation: number): Promise<Encrypted> {
  return encrypt({ archive, vault: owner.data, accountKey: owner.keys.accountKey, deviceKey: owner.keys.deviceKey, binding: owner.keys.binding }, key, owner.ctx, generation, archive.checkpoint.id);
}
export async function recoverOwner(e: Encrypted, key: string, ctx: Context, root: TrustedRoot): Promise<{ client: Client; verified: VerifiedArchive }> {
  const value = await decrypt(e, key, ctx); fields(value, ["archive", "vault", "accountKey", "deviceKey", "binding"]); hex32(value.accountKey); hex32(value.deviceKey);
  const verified = await VerifiedArchive.verify(value.archive as Archive, { ...root, checkpoint: e.checkpoint });
  const b = value.binding as Binding; check(publicKey(value.accountKey) === ctx.owner && b.account === ctx.owner && publicKey(value.deviceKey) === b.device, "recovered signer/owner binding");
  check(verified.snapshot.public.members.some(m => canonical(m) === canonical(b)), "recovered device not in membership");
  const vault = value.vault as Snapshot; const certificate = parse(verified.checkpoint.content) as { vaultHash: string };
  check(await hash(vault) === certificate.vaultHash, "owner vault checkpoint hash");
  const { state: _, pending: __, released: ___, ...history } = vault; equal(history, verified.snapshot, "vault/history mismatch");
  const finalState = decodeState(vault.state); equal(members(finalState, ctx), vault.public.members, "archive final MLS members");
  check(Number(finalState.groupContext.epoch) === vault.public.epoch, "archive final MLS epoch");
  // Only exported keys/state and re-created public crypto context are used; no prior live object is required.
  const client = new Client(ctx, await environment(ctx), { accountKey: value.accountKey, deviceKey: value.deviceKey, binding: b }, clone(vault));
  return { client, verified };
}
export function deliverKey(senderDeviceKey: string, recipientDevicePublic: string, ctx: Context, recoveryKey: string, checkpoint: string): string {
  const payload = canonical({ type: "noseq/archive-key-delivery@1", context: ctx, recipient: recipientDevicePublic, key: recoveryKey, checkpoint });
  check(utf8.encode(payload).length <= 1024, "key delivery bound"); return nip44.encrypt(payload, nip44.utils.getConversationKey(unhex(senderDeviceKey), recipientDevicePublic));
}
export function receiveKey(recipientDeviceKey: string, senderDevicePublic: string, bytes: string, ctx: Context): { key: string; checkpoint: string } {
  check(bytes.length <= 2048, "key packet bound"); const p = parse(nip44.decrypt(bytes, nip44.utils.getConversationKey(unhex(recipientDeviceKey), senderDevicePublic)));
  fields(p, ["type", "context", "recipient", "key", "checkpoint"]); check(p.type === "noseq/archive-key-delivery@1" && p.recipient === publicKey(recipientDeviceKey), "key recipient/domain"); equal(p.context, ctx, "key context"); hex32(p.key); hex32(p.checkpoint); return { key: p.key, checkpoint: p.checkpoint };
}
