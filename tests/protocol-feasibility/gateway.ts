// Isolated G5 socket feasibility fixture. No production routing, persistence or deployment claim.
import { strict as assert } from "node:assert";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, renameSync, statSync } from "node:fs";
import WebSocket, { WebSocketServer } from "ws";
import { Peer, type Frame } from "./gateway-native.ts";
import { entry, publicTransition, checkMembers, type PublicState } from "./crypto.ts";
import { authenticate, type Session } from "./policies.ts";
import { canonical, clone, equal, eventBytes, fields, hex, hex32, integer, limits, parse, random, read, readGenesis, unb64, type Signed, type Context } from "./wire.ts";

interface Stored { events: Signed[]; objects: Record<string, Signed>; closures: Record<string, Signed>; reservations: Record<string, Signed>; retained: Record<string, Signed>; pending: Signed[]; knownControl: Signed | null; initial: PublicState; public: PublicState; fork: boolean }
interface Saved { extension?: unknown; events: string[]; objects: string[]; closures: Record<string,string>; reservations: Signed[]; retained: string[]; pending: Signed[]; knownControl: Signed | null; initial: PublicState; public: PublicState; fork: boolean }
interface Filter { kinds: number[]; ids?: string[]; limit: number; "#h": string[]; "#i": string[]; "#d": string[]; noseq_tip?: string }
export interface Reader { socket: WebSocket; auth: Session; subscriptions: Map<string, Filter[]>; blocked: Set<string>; queue: { subscription: string; message: unknown[] }[]; queuedBytes: number; draining: boolean; operator: boolean }
export class Gateway {
  data: Stored; buffer = new Map<number, Signed>(); restoredFence: boolean; controlGap = false; paused = false; journalBytes = 0;
  released: { id: string | null; authority: string; subscription: string }[] = []; private readers = new Set<Reader>(); private tail = Promise.resolve();
  private backend?: Peer; private backendRequest = 0; private listeners: { server: ReturnType<typeof createServer>; ws: WebSocketServer }[] = [];
  url = ""; operatorUrl = ""; reconcileChallenge = hex(random());
  constructor(readonly ctx: Context, readonly root: Signed, readonly statePath: string, initial: PublicState, founder: Signed, readonly replicas: string[], readonly trace: Frame[], restored = false, validateRoot = readGenesis) {
    equal(validateRoot(root, ctx.owner, ctx.genesis), ctx, "gateway enrollment root");
    fields(initial,["version","epoch","members"]); assert.equal(initial.version,0); assert.equal(initial.epoch,0); checkMembers(initial.members); assert.equal(initial.members.length,1);
    const proof=read(eventBytes(founder),"proof",ctx); assert.equal(proof.pubkey,ctx.owner); const binding=parse(proof.content); fields(binding,["type","device","suite","leaf"]); assert.equal(binding.type,"account-leaf"); assert.equal(binding.suite,1);
    equal(initial.members[0],{account:ctx.owner,device:binding.device,leaf:binding.leaf},"owner-signed founder binding");
    this.data = { events: [], objects: {}, closures: {}, reservations: {}, retained: {}, pending: [], knownControl: null, initial: clone(initial), public: clone(initial), fork: false }; this.restoredFence = restored;
  }
  get tip(): string { return this.data.events.at(-1)?.id ?? this.ctx.genesis; }
  get readable(): boolean { return !this.restoredFence && !this.controlGap && !this.data.fork; }
  protected mayRead(r: Reader): boolean { return this.readable && r.auth.authenticated.some(k => this.data.public.members.some(m => m.device === k)); }
  protected mayWrite(r: Reader): boolean { return r.operator && r.auth.authenticated.some(k => k === this.ctx.sequencer || this.replicas.includes(k)); }
  protected persist(): void {
    this.data.pending = [...this.buffer.values()].map(clone);
    // Store each signed reservation once; confirmed retention and public indexes refer to exact IDs.
    const saved: Saved = {...this.data,events:this.data.events.map(e=>e.id),objects:Object.keys(this.data.objects),closures:Object.fromEntries(Object.entries(this.data.closures).map(([tip,e])=>[tip,e.id])),reservations:Object.values(this.data.reservations),retained:Object.keys(this.data.retained)};
    const extension=this.saveExtension();if(extension!==undefined)saved.extension=extension;
    writeFileSync(this.statePath + ".next", canonical(saved)); renameSync(this.statePath + ".next", this.statePath);
  }
  loadIntact(): void {
    // One signed reservation plus ID indexes, a bounded pending buffer and one separate highest-control fence.
    const stateLimit = 2 * limits.journal + (limits.pageEvents + 1) * limits.event + 1_048_576;
    assert(statSync(this.statePath).size <= stateLimit, "gateway state envelope");
    const saved = parse(readFileSync(this.statePath, "utf8"), stateLimit) as unknown as Saved;
    fields(saved,["events","objects","closures","reservations","retained","pending","knownControl","initial","public","fork",...(saved.extension===undefined?[]:["extension"])]);
    for(const values of [saved.events,saved.objects,saved.reservations,saved.retained,saved.pending]) assert(Array.isArray(values)); assert.equal(typeof saved.fork,"boolean");
    const reservations: Record<string,Signed> = {}, retained: Record<string,Signed> = {};
    let total = 0;
    for (const signed of saved.reservations) {
      assert(!reservations[signed.id],"duplicate reservation"); const kind = signed.kind === 8792 ? "order" : signed.kind === 8795 ? "chunk" : "proof";
      this.validateReservation(signed,kind); total += Buffer.byteLength(eventBytes(signed)); assert(total <= limits.journal,"restored retention quota");
      reservations[signed.id]=signed;
    }
    for(const id of saved.retained){hex32(id);assert(reservations[id]&&!retained[id],"invalid retained reservation");retained[id]=reservations[id]!;}
    const confirmed=(id:string)=>{hex32(id);assert(retained[id],"unconfirmed public inventory");return retained[id]!;};
    assert.equal(new Set(saved.objects).size,saved.objects.length);
    const data: Stored={...saved,reservations,retained,events:saved.events.map(confirmed),objects:Object.fromEntries(saved.objects.map(id=>[id,confirmed(id)])),closures:Object.fromEntries(Object.entries(saved.closures).map(([tip,id])=>[tip,confirmed(id)]))};
    let state = clone(data.initial), previous = this.ctx.genesis; equal(state,this.data.initial,"restored root roster");
    for(const[i,signed]of data.events.entries()){const e=entry(signed,this.ctx);assert.equal(e.position,i+1);assert.equal(e.previous,previous);state=publicTransition(this.ctx,state,e);previous=signed.id;}
    equal(state,data.public,"restored authority mismatch");
    assert(data.pending.length <= limits.pageEvents); const pending = new Map<number,Signed>();
    for (const signed of data.pending) { const e=entry(signed,this.ctx); assert(e.position > data.events.length && !pending.has(e.position),"invalid pending position"); pending.set(e.position,clone(signed)); }
    if(data.knownControl){const e=entry(data.knownControl,this.ctx);assert(e.admission&&e.position>data.events.length,"invalid known-control fence");}
    for(const signed of pending.values()){const e=entry(signed,this.ctx);if(e.admission)assert(data.knownControl&&entry(data.knownControl,this.ctx).position>=e.position,"lost pending-control fence");}
    this.data = data; this.buffer = pending; this.controlGap = data.knownControl !== null;
    this.journalBytes = total;this.loadExtension(saved.extension); // Intact-file reconstruction; no fsync/crash guarantee.
  }
  protected saveExtension():unknown{return undefined;}
  protected loadExtension(value:unknown):void{assert(value===undefined,"unexpected extension");}
  protected validateReservation(signed:Signed,kind:"order"|"chunk"|"proof"):void{read(eventBytes(signed),kind,this.ctx);}
  protected async extra(_reader:Reader,_message:unknown[]):Promise<boolean>{return false;}
  metadata() { return { name: "Noseq isolated prefix gateway", supported_nips: [1, 11, 42], limitation: { max_message_length: limits.frame, max_subscriptions: limits.subscriptions, max_limit: limits.pageEvents, max_event_tags: limits.tags, max_content_length: limits.event, auth_required: true, restricted_writes: true }, noseq: { policy: "highest-verified-retained-prefix", status: "development-fixture", normal_history: true, public_count: false, public_negentropy: false } }; }
  async start(backendUrl: string): Promise<void> {
    this.backend = await Peer.connect(backendUrl, "gateway-private-backend", this.trace);
    for (const operator of [false, true]) {
      const server = createServer((request, response) => { if (request.url === "/" && request.headers.accept === "application/nostr+json") { response.setHeader("Content-Type", "application/nostr+json"); response.end(JSON.stringify(this.metadata())); } else { response.statusCode = 404; response.end("unavailable"); } });
      const ws = new WebSocketServer({ noServer: true, maxPayload: limits.frame, perMessageDeflate: false });
      server.on("upgrade", (request, socket, head) => { if (request.url !== `/instance/${this.ctx.genesis}` || this.readers.size >= limits.connections) { socket.destroy(); return; } ws.handleUpgrade(request, socket, head, socket => ws.emit("connection", socket)); });
      ws.on("connection", socket => {
        const url = operator ? this.operatorUrl : this.url; const r: Reader = { socket, auth: { url, challenge: hex(random()), authenticated: [], generation: 1, subscriptions: 0 }, subscriptions: new Map(), blocked: new Set(), queue: [], queuedBytes: 0, draining: false, operator };
        this.readers.add(r); socket.on("error", () => {}); socket.on("close", () => { this.readers.delete(r); r.queue = []; }); socket.send(canonical(["AUTH", r.auth.challenge]));
        socket.on("message", bytes => { const raw = bytes.toString(); this.trace.push({ connection: operator ? "operator-input" : "reader-input", direction: "receive", message: raw });
          this.tail = this.tail.then(async () => { try { await this.handle(r, raw); } catch (error) { if (socket.readyState === WebSocket.OPEN) socket.send(canonical(["NOTICE", "rejected: " + String(error).slice(0, 160)])); } });
        });
      });
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve)); const port = (server.address() as { port: number }).port;
      const url = `ws://127.0.0.1:${port}/instance/${this.ctx.genesis}`; if (operator) this.operatorUrl = url; else this.url = url; this.listeners.push({ server, ws });
    }
  }
  private async backendPut(e: Signed): Promise<void> { assert(this.backend); this.backend.send(["EVENT", e]); const ok = await this.backend.take(m => m[0] === "OK" && m[1] === e.id); assert.equal(ok[2], true, "backend refused retention"); }
  protected async retain(e: Signed): Promise<void> {
    const previous = this.data.reservations[e.id]; if (previous) equal(previous,e,"reserved identity changed");
    const added = previous ? 0 : Buffer.byteLength(eventBytes(e));
    assert(this.journalBytes + added <= limits.journal,"retention full; no eviction");
    // Conservative reservation survives ordinary ACK/readback failure; no automatic refund claims non-retention.
    if(!previous){this.data.reservations[e.id]=clone(e);this.journalBytes+=added;this.persist();}
    await this.backendPut(e); equal(await this.backendGet(e.id),e,"backend retention/readback changed");
    this.data.retained[e.id]=this.data.reservations[e.id]!;this.persist();
  }
  private learnControl(signed:Signed):void{
    const e=entry(signed,this.ctx);if(!e.admission)return;
    const known=this.data.knownControl?entry(this.data.knownControl,this.ctx):null;
    if(known&&known.position===e.position&&this.data.knownControl!.id!==signed.id){this.data.fork=true;this.persist();this.cancelUnauthorized();throw new Error("observed known-control fork");}
    if(!known||e.position>known.position)this.data.knownControl=clone(signed);
    this.controlGap=true;this.persist();this.cancelUnauthorized(); // Before any await or capacity refusal, without advancing retained authority.
  }
  protected async backendGet(id: string): Promise<Signed> {
    assert(this.backend); const sub = "private-" + ++this.backendRequest; this.backend.send(["REQ", sub, { ids: [id], limit: 1 }]);
    await this.backend.take(m => m[0] === "EOSE" && m[1] === sub); const found = this.backend.messages.find(m => m[0] === "EVENT" && m[1] === sub); this.backend.messages = this.backend.messages.filter(m => m[1] !== sub); this.backend.send(["CLOSE", sub]);
    assert(found, "retained identity missing: partial/unavailable"); return found[2] as Signed;
  }
  private async ingest(signed: Signed): Promise<void> {
    const e = entry(signed, this.ctx); const previous = this.data.events[e.position - 1];
    if (previous) { if (previous.id !== signed.id) { this.data.fork = true; this.persist(); this.cancelUnauthorized(); throw new Error("observed fork"); } await this.retain(signed); this.persist(); return; }
    if (this.buffer.has(e.position) && this.buffer.get(e.position)!.id !== signed.id) { this.data.fork = true; this.persist(); this.cancelUnauthorized(); throw new Error("observed buffered fork"); }
    if (e.position > this.data.events.length + 1) { this.learnControl(signed);assert(this.buffer.has(e.position) || this.buffer.size < limits.pageEvents, "gap buffer full"); this.buffer.set(e.position, clone(signed)); this.persist(); this.cancelUnauthorized(); return; }
    assert.equal(e.previous, this.tip, "predecessor mismatch"); const next = publicTransition(this.ctx, this.data.public, e);
    this.learnControl(signed);await this.retain(signed); this.buffer.delete(e.position); this.data.events.push(clone(signed)); this.data.public = clone(next);
    if(this.data.knownControl?.id===signed.id)this.data.knownControl=null;this.controlGap=this.data.knownControl!==null;this.persist();
    this.cancelUnauthorized(); // This is the authorization cutoff, before any corresponding live queue item.
    for (const r of this.readers) for (const [sub, f] of r.subscriptions) if (f.some(filter => this.matches(signed, filter) && !filter.noseq_tip)) this.enqueue(r, sub, ["EVENT", sub, signed]);
    const buffered = this.buffer.get(this.data.events.length + 1) ?? (this.data.knownControl&&entry(this.data.knownControl,this.ctx).position===this.data.events.length+1?this.data.knownControl:null); if (buffered) await this.ingest(buffered);
    this.cancelUnauthorized();
  }
  private filter(x: unknown): Filter {
    assert(x && typeof x === "object" && !Array.isArray(x)); const f = x as Record<string, unknown>;
    const permitted = ["kinds", "ids", "limit", "#h", "#i", "#d", "noseq_tip"]; assert(Object.keys(f).every(k => permitted.includes(k)), "unsupported filter");
    equal(f["#h"], [this.ctx.genesis], "genesis filter"); equal(f["#i"], [this.ctx.instance], "instance filter"); equal(f["#d"], [this.ctx.definition], "definition filter"); equal(f.kinds, [8792], "history kind filter");
    integer(f.limit, limits.pageEvents); assert((f.limit as number) > 0);
    if (f.ids !== undefined) { assert(Array.isArray(f.ids) && f.ids.length > 0 && f.ids.length <= limits.pageEvents); for (const id of f.ids) hex32(id); }
    if (f.noseq_tip !== undefined) hex32(f.noseq_tip); return f as unknown as Filter;
  }
  private matches(e: Signed, f: Filter): boolean { return f.kinds.includes(e.kind) && (!f.ids || f.ids.includes(e.id)); }
  protected enqueue(r: Reader, subscription: string, message: unknown[]): void {
    if (r.blocked.has(subscription)) return;
    if (!this.mayRead(r)) { if (r.socket.readyState === WebSocket.OPEN) r.socket.send(canonical(["CLOSED", subscription, "restricted or unavailable"])); return; }
    const bytes = Buffer.byteLength(canonical(message)); assert(bytes <= limits.frame, "outbound frame cap");
    if (r.queue.filter(q => q.message[0] === "EVENT").length + (message[0] === "EVENT" ? 1 : 0) > limits.liveEvents || r.queuedBytes + bytes + r.socket.bufferedAmount > limits.liveBytes) { r.queue = []; r.queuedBytes = 0; r.subscriptions.delete(subscription); r.blocked.add(subscription); r.socket.send(canonical(["CLOSED", subscription, "slow reader: resync"])); return; }
    r.queue.push({ subscription, message }); r.queuedBytes += bytes; this.drain(r);
  }
  private drain(r: Reader): void {
    if (r.draining || this.paused) return; r.draining = true;
    setImmediate(() => {
      r.draining = false; if (this.paused || r.socket.readyState !== WebSocket.OPEN) return;
      const item = r.queue.shift(); if (!item) return; r.queuedBytes -= Buffer.byteLength(canonical(item.message));
      if (!this.mayRead(r)) { r.queue = []; r.queuedBytes = 0; r.subscriptions.clear(); r.socket.send(canonical(["CLOSED", item.subscription, "restricted or unavailable"])); return; }
      // No await between this check and handing bytes to ws.send. Already handed bytes are in flight, not revocable.
      r.socket.send(canonical(item.message)); this.released.push({ id: item.message[0] === "EVENT" ? (item.message[2] as Signed).id : null, authority: this.tip, subscription: item.subscription }); this.drain(r);
    });
  }
  resume(): void { this.paused = false; for (const r of this.readers) this.drain(r); }
  private cancelUnauthorized(): void { for (const r of this.readers) if (!this.mayRead(r) && (r.queue.length || r.subscriptions.size)) { const ids = new Set([...r.subscriptions.keys(), ...r.queue.map(x => x.subscription)]); r.queue = []; r.queuedBytes = 0; r.subscriptions.clear(); for (const id of ids) r.socket.send(canonical(["CLOSED", id, "restricted or unavailable"])); } }
  private async handle(r: Reader, raw: string): Promise<void> {
    // WebSocket maxPayload bounds allocation; canonical parsing also rejects duplicates/unknown encodings.
    const m = parse(raw, limits.frame); assert(Array.isArray(m) && typeof m[0] === "string");
    if (m[0] === "AUTH") {
      assert.equal(m.length, 2); const e = m[1] as Signed;
      try { authenticate(r.auth, e, Math.floor(Date.now() / 1000)); r.socket.send(canonical(["OK", e.id, true, ""])); }
      catch { r.socket.send(canonical(["OK", typeof e.id === "string" ? e.id : "", false, "auth-required: invalid proof"])); } return;
    }
    if(await this.extra(r,m))return;
    if (r.operator) {
      assert(this.mayWrite(r), "operator authorization");
      if (m[0] === "EVENT") { assert.equal(m.length, 2); const e = m[1] as Signed; try { await this.ingest(e); r.socket.send(canonical(["OK", e.id, !this.buffer.has(entry(e, this.ctx).position), this.buffer.has(entry(e, this.ctx).position) ? "blocked: buffered dependency; not retained" : "retained"])); } catch (error) { r.socket.send(canonical(["OK", e.id, false, String(error)])); } return; }
      if (m[0] === "OBJECT") { assert.equal(m.length, 2); const e = read(eventBytes(m[1] as Signed), "chunk", this.ctx); assert(this.data.public.members.some(v => v.device === e.pubkey && v.account === this.ctx.owner), "object owner device");
        const wrapper=parse(e.content); fields(wrapper,["format","context","generation","nonce","keyId","checkpoint","bytes"]);assert.equal(wrapper.format,"noseq/recovery-aes256gcm@1");equal(wrapper.context,this.ctx,"object context");integer(wrapper.generation);assert((wrapper.generation as number)>0);hex32(wrapper.checkpoint);hex32(wrapper.keyId);assert.equal(unb64(wrapper.nonce,12).length,12);assert(unb64(wrapper.bytes).length>=16);
        await this.retain(e); this.data.objects[e.id] = e; this.persist(); r.socket.send(canonical(["OK", e.id, true, "retained object"])); return; }
      if (m[0] === "CLOSURE") { assert.equal(m.length, 2); const e = read(eventBytes(m[1] as Signed), "proof", this.ctx); assert.equal(e.pubkey, this.ctx.owner); const c = parse(e.content); fields(c, ["type", "tip", "checkpoint", "ids"]); assert.equal(c.type, "retention-closure"); hex32(c.tip); assert(Array.isArray(c.ids) && c.ids.length > 0 && c.ids.length <= limits.pageEvents); for (const id of c.ids) hex32(id); assert(this.data.events.some(v => v.id === c.tip), "unknown closure tip");assert.equal(new Set(c.ids).size,c.ids.length,"duplicate closure IDs");
        const checkpoint=read(eventBytes(c.checkpoint as Signed),"archive",this.ctx);assert.equal(checkpoint.pubkey,this.ctx.owner);const coverage=parse(checkpoint.content);fields(coverage,["type","bodyHash","vaultHash","count","tip"]);assert.equal(coverage.type,"owner-attested-full-prefix@1");hex32(coverage.bodyHash);hex32(coverage.vaultHash);assert.equal(coverage.tip,c.tip);assert.equal(coverage.count,this.data.events.findIndex(v=>v.id===c.tip)+1);
         await this.retain(e); this.data.closures[c.tip] = e; this.persist(); r.socket.send(canonical(["OK", e.id, true, "closure declaration retained; completeness checked on read"])); return; }
      if (m[0] === "RECONCILE") { const e = read(eventBytes(m[1] as Signed), "proof", this.ctx); assert.equal(e.pubkey, this.ctx.owner); const c = parse(e.content); fields(c, ["type", "challenge", "position", "tip"]); assert.equal(c.type, "trusted-high-water"); assert.equal(c.challenge, this.reconcileChallenge); integer(c.position); hex32(c.tip); assert.equal(this.data.events[(c.position as number) - 1]?.id ?? this.ctx.genesis, c.tip, "restore missing trusted high-water prefix"); this.restoredFence = false; this.reconcileChallenge = hex(random()); r.socket.send(canonical(["OK", e.id, true, "reconciled external authority"])); return; }
      throw new Error("unsupported private command");
    }
    if (m[0] === "CLOSE") { assert.equal(m.length, 2); r.subscriptions.delete(m[1] as string); r.queue = r.queue.filter(x => x.subscription !== m[1]); r.queuedBytes = r.queue.reduce((n, x) => n + Buffer.byteLength(canonical(x.message)), 0); return; }
    if (m[0] === "REQ") {
      assert(m.length >= 3 && m.length <= 2 + limits.filters); const sub = m[1]; assert(typeof sub === "string" && /^[a-zA-Z0-9-]{1,32}$/.test(sub));
      if (!this.mayRead(r)) { r.socket.send(canonical(["CLOSED", sub, "restricted or unavailable"])); return; }
      const filters = m.slice(2).map(f => this.filter(f)); // Validate EVERY OR branch before querying storage.
      assert(r.subscriptions.has(sub) || r.subscriptions.size < limits.subscriptions, "subscription cap");
      const tip = filters[0]!.noseq_tip ?? this.tip; assert(filters.every(f => (f.noseq_tip ?? this.tip) === tip), "mixed data tips"); const end = this.data.events.findIndex(e => e.id === tip); assert(end >= 0, "unknown tip");
      const all = this.data.events.slice(0, end + 1); const ids = new Set(filters.flatMap(f => all.filter(e => this.matches(e, f)).slice(0, f.limit).map(e => e.id))); const chosen = all.filter(e => ids.has(e.id)); const found: Signed[] = []; let bytes = 0;
      for (const e of chosen) { if (found.length >= limits.pageEvents || bytes + Buffer.byteLength(eventBytes(e)) > limits.pageBytes) break; const actual = await this.backendGet(e.id); equal(actual, e, "retained bytes differ"); found.push(actual); bytes += Buffer.byteLength(eventBytes(e)); }
      r.blocked.delete(sub); r.subscriptions.set(sub, filters); for (const e of found) this.enqueue(r, sub, ["EVENT", sub, e]); this.enqueue(r, sub, ["EOSE", sub]); return;
    }
    if (m[0] === "NOSEQ-CLOSURE") {
      assert.equal(m.length, 3); const sub = m[1]; assert(typeof sub === "string" && /^[a-zA-Z0-9-]{1,32}$/.test(sub)); hex32(m[2]);
      if (!this.mayRead(r)) { r.socket.send(canonical(["CLOSED", sub, "restricted or unavailable"])); return; }
      const declaration = this.data.closures[m[2]]; assert(declaration, "closure partial/unavailable"); equal(await this.backendGet(declaration.id), declaration, "closure declaration missing/changed"); const c = parse(declaration.content) as { ids: string[]; checkpoint: Signed }; const values: Signed[] = []; let totalBytes = 0;
      for (const id of c.ids) { assert(this.data.objects[id], "closure hole: partial/unavailable"); const actual = await this.backendGet(id); equal(actual, this.data.objects[id], "closure bytes changed"); assert.equal((parse(actual.content) as {checkpoint:string}).checkpoint,c.checkpoint.id,"object/checkpoint coverage binding"); totalBytes += Buffer.byteLength(eventBytes(actual)); assert(totalBytes <= limits.pageBytes, "closure exceeds bounded slice: partial/unavailable"); values.push(actual); }
      for (const e of values) this.enqueue(r, sub, ["EVENT", sub, e]); this.enqueue(r, sub, ["NOSEQ-COMPLETE", sub, m[2], declaration]); return;
    }
    throw new Error("unsupported public command"); // EVENT/COUNT/HLL/NEG/exports/admin are never forwarded.
  }
  async close(): Promise<void> { await this.tail; for (const r of this.readers) r.socket.terminate(); for (const { server, ws } of this.listeners) { ws.close(); await new Promise<void>(resolve => server.close(() => resolve())); } await this.backend?.close(); }
}
