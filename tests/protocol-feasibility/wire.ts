// Proposed-profile feasibility code only; no host, sequencer or onboarding integration.
import { finalizeEvent, getPublicKey, getEventHash, verifyEvent } from "nostr-tools/pure";
import type { Event } from "nostr-tools/core";

export const domain = "noseq/protocol-candidate@1";
export const kinds = { genesis: 8790, submission: 8791, order: 8792, admission: 8793, proof: 8794, chunk: 8795, archive: 8796, welcome: 8797 } as const;
export const limits = { event: 131072, frame: 131200, action: 32768, chunk: 16384, closure: 524288, files: 64,
  devices: 16, accounts: 8, keyPackage: 8192, proposals: 16, tags: 16, tagBytes: 256, depth: 32, archive: 16777216, archiveEntries: 128,
  journal: 268435456, outbox: 67108864, connections: 32, subscriptions: 4, filters: 4, pageEvents: 128,
  pageBytes: 1048576, liveEvents: 128, liveBytes: 1048576, fetches: 8, replicationEvents: 64,
  replicationBytes: 1048576, replicas: 2, retrySeconds: [1, 300], creatorInstances: 10,
  identityRequestsPerMinute: 60, burst: 10, instanceRequestsPerMinute: 300 } as const;
export const utf8 = new TextEncoder();
export const decoder = new TextDecoder("utf-8", { fatal: true });
export function check(x: unknown, message: string): asserts x { if (!x) throw new Error(message); }
export const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
export function equal(a: unknown, b: unknown, message: string): void { check(canonical(a) === canonical(b), message); }
export const hex = (b: Uint8Array): string => Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
export function unhex(s: string): Uint8Array { check(typeof s === "string" && /^(?:[0-9a-f]{2})*$/.test(s), "hex bytes"); return Uint8Array.from(s.match(/../g) ?? [], x => parseInt(x, 16)); }
export function hex32(x: unknown): asserts x is string { check(typeof x === "string" && /^[0-9a-f]{64}$/.test(x), "32-byte identifier"); }
export const random = (n = 32): Uint8Array => crypto.getRandomValues(new Uint8Array(n));
export const publicKey = (key: string): string => getPublicKey(unhex(key));
export function safeString(s: unknown, max: number): asserts s is string {
  check(typeof s === "string" && s.length <= max, "string bound");
  check(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(s), "lone surrogate");
  check(utf8.encode(s).length <= max, "UTF-8 string bound");
}
export function integer(x: unknown, max = Number.MAX_SAFE_INTEGER): asserts x is number {
  check(typeof x === "number" && Number.isSafeInteger(x) && x >= 0 && x <= max && !Object.is(x, -0), "unsigned safe integer");
}
// This profile accepts exactly sorted-key, compact JSON. It is narrower than general NIP-01.
// Comparing original bytes rejects duplicate keys, alternate escapes/numbers and whitespace.
export function canonical(x: unknown, depth = 0): string {
  check(depth <= limits.depth, "JSON depth");
  if (x === null || typeof x === "boolean") return JSON.stringify(x);
  if (typeof x === "number") { integer(x); return JSON.stringify(x); }
  if (typeof x === "string") { safeString(x, limits.archive); return JSON.stringify(x); }
  if (Array.isArray(x)) return "[" + x.map(v => canonical(v, depth + 1)).join(",") + "]";
  check(typeof x === "object" && Object.getPrototypeOf(x) === Object.prototype, "plain object required");
  return "{" + Object.keys(x).sort().map(k => { check(!["__proto__", "prototype", "constructor"].includes(k), "unsafe key"); return canonical(k, depth + 1) + ":" + canonical((x as Record<string, unknown>)[k], depth + 1); }).join(",") + "}";
}
export function parse(s: string, max: number = limits.event): unknown {
  safeString(s, max);
  // Bound nesting before JSON.parse, independently of quoting/escaped brackets.
  let depth = 0; let quoted = false; let escape = false;
  for (const c of s) { if (quoted) { if (escape) escape = false; else if (c === "\\") escape = true; else if (c === '"') quoted = false; }
    else if (c === '"') quoted = true; else if (c === "[" || c === "{") check(++depth <= limits.depth, "JSON depth"); else if (c === "]" || c === "}") depth--; }
  const x: unknown = JSON.parse(s); check(canonical(x) === s, "noncanonical/duplicate JSON"); return x;
}
export function fields(x: unknown, expected: string[]): asserts x is Record<string, unknown> {
  check(!!x && typeof x === "object" && !Array.isArray(x), "object required");
  equal(Object.keys(x).sort(), [...expected].sort(), "unknown/missing fields");
}
export const hashBytes = async (bytes: Uint8Array): Promise<string> => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>)));
export const hash = (x: unknown): Promise<string> => hashBytes(utf8.encode(canonical(x)));
export function b64(bytes: Uint8Array): string { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); }
export function unb64(s: unknown, max: number = limits.event): Uint8Array {
  check(typeof s === "string" && s.length <= Math.ceil(max / 3) * 4 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s), "base64 bound/alphabet");
  const bytes = Uint8Array.from(atob(s), c => c.charCodeAt(0)); check(bytes.length <= max && b64(bytes) === s, "noncanonical base64"); return bytes;
}
export interface Context { instance: string; genesis: string; definition: string; owner: string; sequencer: string }
export type Signed = Event;
export type EventType = keyof typeof kinds;
export function eventBytes(event: Signed): string { return canonical(event); }
export function signRaw(key: string, kind: number, tags: string[][], content: string, time = 1788739200): Signed {
  const result = finalizeEvent({ kind, tags, content, created_at: time }, unhex(key));
  return clone(result); // Do not retain nostr-tools' mutable verified-symbol cache.
}
export function sign(key: string, type: EventType, ctx: Context, content: unknown): Signed {
  return signRaw(key, kinds[type], [["noseq", domain], ["h", ctx.genesis], ["i", ctx.instance], ["d", ctx.definition]], canonical(content));
}
export function readEvent(bytes: string, expectedKind?: number): Signed {
  const e = parse(bytes); fields(e, ["id", "pubkey", "created_at", "kind", "tags", "content", "sig"]);
  hex32(e.id); hex32(e.pubkey); integer(e.kind, 65535); integer(e.created_at);
  check(typeof e.sig === "string" && /^[0-9a-f]{128}$/.test(e.sig), "signature encoding");
  check(Array.isArray(e.tags) && e.tags.length <= limits.tags, "tag count");
  for (const tag of e.tags) { check(Array.isArray(tag) && tag.length <= 4 && tag.length >= 1, "tag shape"); for (const s of tag) safeString(s, limits.tagBytes); }
  safeString(e.content, limits.event);
  if (expectedKind !== undefined) check(e.kind === expectedKind, "wrong kind");
  const result = e as unknown as Signed;
  check(getEventHash(result) === result.id && verifyEvent(result), "event signature/id");
  return clone(result);
}
export function read(bytes: string, type: EventType, ctx: Context): Signed {
  const e = readEvent(bytes, kinds[type]);
  equal(e.tags, [["noseq", domain], ["h", ctx.genesis], ["i", ctx.instance], ["d", ctx.definition]], "profile/instance/genesis/definition tags");
  return e;
}
export interface Genesis { context: Context; event: Signed }
export async function genesis(ownerKey: string, sequenceKey: string, definition: string, instance = hex(random())): Promise<Genesis> {
  hex32(instance); hex32(definition);
  const content = { profile: domain, instance, definition, owner: publicKey(ownerKey), sequencer: publicKey(sequenceKey), history: "owner-attested-full-prefix@1" };
  const event = signRaw(ownerKey, kinds.genesis, [["noseq", domain]], canonical(content));
  return { event, context: { instance, genesis: event.id, definition, owner: content.owner, sequencer: content.sequencer } };
}
export function readGenesis(event: Signed, expectedOwner: string, expectedGenesis: string): Context {
  const e = readEvent(eventBytes(event), kinds.genesis); check(e.pubkey === expectedOwner && e.id === expectedGenesis, "wrong trusted root");
  equal(e.tags, [["noseq", domain]], "genesis domain"); const c = parse(e.content);
  fields(c, ["profile", "instance", "definition", "owner", "sequencer", "history"]);
  check(c.profile === domain && c.owner === expectedOwner && c.history === "owner-attested-full-prefix@1", "genesis policy");
  hex32(c.instance); hex32(c.definition); hex32(c.sequencer);
  return { instance: c.instance, genesis: e.id, definition: c.definition, owner: expectedOwner, sequencer: c.sequencer };
}
export interface Action { logical: string; device: string; value: string; outcome: "apply" | "refuse" | "runtime-failure" }
export function action(key: string, ctx: Context, a: Action): Signed {
  const content = canonical(a); check(utf8.encode(content).length <= limits.action, "action bytes");
  return sign(key, "proof", ctx, { type: "action", ...a });
}
export function readAction(event: Signed, ctx: Context, account: string, device: string): Action {
  const e = read(eventBytes(event), "proof", ctx); check(e.pubkey === account, "action account");
  const a = parse(e.content); fields(a, ["type", "logical", "device", "value", "outcome"]);
  check(a.type === "action" && a.device === device, "action device/domain"); hex32(a.logical); hex32(a.device);
  safeString(a.value, limits.action); check(["apply", "refuse", "runtime-failure"].includes(a.outcome as string), "action outcome class");
  const result = { logical: a.logical, device: a.device, value: a.value, outcome: a.outcome } as Action;
  check(utf8.encode(canonical(result)).length <= limits.action, "action bytes"); return result;
}
export interface Signer { getPublicKey(): Promise<string>; signEvent(event: { kind: number; created_at: number; tags: string[][]; content: string }): Promise<Signed> }
export const localSigner = (key: string): Signer => ({ async getPublicKey() { return publicKey(key); }, async signEvent(e) { return signRaw(key, e.kind, e.tags, e.content, e.created_at); } });
export function capability(value: unknown): Signer {
  check(!!value && typeof value === "object" && "getPublicKey" in value && typeof value.getPublicKey === "function" && "signEvent" in value && typeof value.signEvent === "function", "unsupported signer methods");
  return value as Signer;
}
export async function signerProof(signer: Signer, template: Omit<Signed, "id" | "pubkey" | "sig">): Promise<Signed> {
  const expected = await signer.getPublicKey(); hex32(expected);
  const response = await signer.signEvent(clone(template)); const e = readEvent(eventBytes(response));
  equal({ kind: e.kind, created_at: e.created_at, tags: e.tags, content: e.content }, template, "signer response substitution");
  check(e.pubkey === expected, "signer public key substitution"); return e;
}
export async function fail(fn: () => unknown | Promise<unknown>, contains?: string): Promise<string> {
  try { await fn(); } catch (e) { const reason = String(e); if (contains) check(reason.includes(contains), `unexpected failure: ${reason}`); return reason; }
  throw new Error("expected failure did not occur");
}
