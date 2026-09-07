import { canonical, check, clone, equal, eventBytes, fields, hex32, integer, limits, parse, publicKey, random, read, readEvent, safeString, sign, signRaw, utf8, type Context, type Signed, type Signer } from "./wire.ts";
import { entry, type PublicState } from "./crypto.ts";

export interface Invite { recipient: string; nonce: string; expires: number; history: string; origin: string; version: number }
export function invite(key: string, ctx: Context, body: Invite): Signed { return sign(key, "proof", ctx, { type: "invitation", ...body }); }
export function validateInvite(e: Signed, ctx: Context, recipient: string, now: number, origin: string): Invite {
  read(eventBytes(e), "proof", ctx); check(e.pubkey === ctx.owner, "invitation owner"); const c = parse(e.content);
  fields(c, ["type", "recipient", "nonce", "expires", "history", "origin", "version"]);
  check(c.type === "invitation" && c.recipient === recipient && c.origin === origin && c.history === "owner-attested-full-prefix@1", "invitation binding");
  hex32(c.recipient); hex32(c.nonce); integer(c.expires); integer(c.version); check(c.expires >= now, "expired invitation");
  return c as unknown as Invite;
}
// This adapter assumes a separately authenticated NIP-46 RPC transport. Fixtures simulate it;
// no live bunker, relay encryption, connect/switch_relays or extension interoperability is claimed.
export function nip46Capability(request: unknown): Signer {
  check(typeof request === "function", "unsupported NIP-46 request transport");
  const call = request as (method: string, params: string[]) => Promise<string>;
  return { async getPublicKey() { const key = await call("get_public_key", []); hex32(key); return key; },
    async signEvent(template) { const response = await call("sign_event", [canonical(template)]); return readEvent(response); } };
}
export function frame(value: unknown): string { const bytes = canonical(value); check(utf8.encode(bytes).length <= limits.frame, "WebSocket frame bytes"); return bytes; }
export function readFrame(bytes: string): unknown[] { const f = parse(bytes, limits.frame); check(Array.isArray(f), "array frame"); return f; }
export interface Session { url: string; challenge: string; authenticated: string[]; generation: number; subscriptions: number }
export function authEvent(key: string, session: Session, now: number): Signed { return signRaw(key, 22242, [["relay", session.url], ["challenge", session.challenge]], "", now); }
export function authenticate(session: Session, e: Signed, now: number): void {
  readEvent(eventBytes(e), 22242); check(e.content === "" && Math.abs(now - e.created_at) <= 60, "AUTH time/content");
  equal(e.tags, [["relay", session.url], ["challenge", session.challenge]], "AUTH exact URL/challenge");
  if (!session.authenticated.includes(e.pubkey)) session.authenticated.push(e.pubkey);
}
// Pure conformance fixture for the required private boundary, NOT a working relay.
export class RelayPolicy {
  retained: Signed[] = []; bytes = 0; mirrorAcknowledged = new Set<string>();
  constructor(readonly ctx: Context, public admission: PublicState, readonly replicators: string[] = []) {}
  session(url: string, challenge: string): Session { return { url, challenge, authenticated: [], generation: 1, subscriptions: 0 }; }
  mayRead(s: Session): boolean { return s.authenticated.some(k => this.admission.members.some(m => m.device === k) || this.replicators.includes(k)); }
  retain(s: Session, e: Signed): void {
    check(s.authenticated.some(k => k === this.ctx.sequencer || this.replicators.includes(k)), "replication/publish authorization");
    read(eventBytes(e), "order", this.ctx); const existing = this.retained.find(r => r.id === e.id); if (existing) { equal(existing, e, "duplicate differs"); return; }
    const size = utf8.encode(eventBytes(e)).length; check(this.bytes + size <= limits.journal, "retention full: refuse without eviction");
    const c = entry(e, this.ctx); check(c.position === this.retained.length + 1 && c.previous === (this.retained.at(-1)?.id ?? this.ctx.genesis), "retention gap");
    this.retained.push(clone(e)); this.bytes += size;
  }
  history(s: Session, fixedTip: string, after: number, count: number = limits.pageEvents): Signed[] {
    check(this.mayRead(s), "history read restricted"); integer(after); integer(count, limits.pageEvents); check(count > 0, "zero limit unsupported by profile");
    const end = this.retained.findIndex(e => e.id === fixedTip); check(end >= 0, "unknown fixed tip");
    const result: Signed[] = []; let bytes = 0;
    for (const e of this.retained.slice(after, end + 1)) { const size = utf8.encode(eventBytes(e)).length; if (result.length >= count || bytes + size > limits.pageBytes) break; result.push(clone(e)); bytes += size; }
    return result;
  }
  live(s: Session, e: Signed, queuedEvents: number, queuedBytes: number): Signed {
    check(this.mayRead(s), "live read restricted"); read(eventBytes(e), "order", this.ctx);
    check(queuedEvents + 1 <= limits.liveEvents && queuedBytes + utf8.encode(eventBytes(e)).length <= limits.liveBytes, "slow reader: close/resync"); return clone(e);
  }
  subscribe(s: Session, filters: unknown[]): void {
    check(this.mayRead(s), "subscription read restricted"); check(filters.length > 0 && filters.length <= limits.filters, "filter count");
    check(s.subscriptions < limits.subscriptions, "subscription count");
    for (const f of filters) { fields(f, ["ids", "kinds", "limit"]); check(Array.isArray(f.ids) && f.ids.length <= limits.pageEvents, "ID filter bound"); for (const id of f.ids) hex32(id); equal(f.kinds, [8792], "unsupported kinds/filter"); integer(f.limit, limits.pageEvents); }
    s.subscriptions++;
  }
  metadata() { return { supported_nips: [1, 11, 42], limitation: { max_message_length: limits.frame, max_subscriptions: limits.subscriptions,
    max_limit: limits.pageEvents, max_subid_length: 32, max_event_tags: limits.tags, max_content_length: limits.event, auth_required: true, restricted_writes: true },
    noseq: { status: "proposed-conformance-fixture-only", event_bytes: limits.event, history_acl: "current admitted device", live_acl: "current admitted device", retains_acknowledged_history: true } }; }
}
