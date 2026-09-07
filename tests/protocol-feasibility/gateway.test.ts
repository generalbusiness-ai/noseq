import { strict as assert } from "node:assert";
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "vitest";
import { Gateway } from "./gateway.ts";
import { startNative, Peer, pause, type Frame } from "./gateway-native.ts";
import { setup, apply } from "./scenarios.ts";
import { createArchive, encrypt, decrypt, deliverKey, receiveKey, VerifiedArchive, type Archive, type Encrypted } from "./archive.ts";
import { add, remove, entry } from "./crypto.ts";
import { canonical, clone, eventBytes, hash, hex, limits, parse, read, publicKey, random, sign, signRaw, type Signed } from "./wire.ts";

const key = (n: number) => n.toString(16).padStart(64, "0");
const run = process.env.NOSEQ_PROTOCOL_RUN!; assert(run, "unique NOSEQ_PROTOCOL_RUN required");
type Native = Awaited<ReturnType<typeof startNative>>;
function founder(w: Awaited<ReturnType<typeof setup>>): Signed { const c=w.ownerDevice.keys.publicPackage.leafNode.credential; assert("identity" in c); return JSON.parse(new TextDecoder().decode(c.identity)) as Signed; }
async function child(args: string[], input: string): Promise<{ code: number | null; output: string; error: string }> {
  const p = spawn(process.execPath, args, { stdio: ["pipe", "pipe", "pipe"] }); let output = "", error = "";
  p.stdout.on("data", b => output += b); p.stderr.on("data", b => error += b); p.stdin.on("error", e => { error += String(e); }); p.stdin.end(input);
  const timeout = setTimeout(() => p.kill("SIGKILL"), 15000); const code = await new Promise<number | null>(r => p.once("exit", r)); clearTimeout(timeout); return { code, output, error };
}
async function caseRun(id: string, execute: (directory: string, trace: Frame[], resources: { natives: Native[]; gateways: Gateway[]; peers: Peer[] }, notes: unknown[]) => Promise<void>) {
  const directory = join(run, id); mkdirSync(directory); const trace: Frame[] = []; const resources = { natives: [] as Native[], gateways: [] as Gateway[], peers: [] as Peer[] }; const notes: unknown[] = []; let status = "failed", error: string | null = null;
  try { await execute(directory, trace, resources, notes); status = "passed"; }
  catch (e) { error = String(e); throw e; }
  finally {
    for (const p of resources.peers) await p.close(); for (const g of resources.gateways) await g.close(); for (const n of resources.natives) await n.stop();
    writeFileSync(join(run, `gateway-${id}.json`), JSON.stringify({ name: id, status, error, node: process.versions.node, trace, notes, native: resources.natives.map(n => n.identity), scope: "isolated local socket feasibility; no G5 gate or production persistence pass" }), { flag: "wx" });
  }
}
async function world(directory: string, trace: Frame[], r: { natives: Native[]; gateways: Gateway[]; peers: Peer[] }) {
  const w = await setup(); const n = await startNative(join(directory, "native")); r.natives.push(n);
  const g = new Gateway(w.g.context, w.g.event, join(directory, "gateway-state.json"), w.starting, founder(w), [publicKey(key(50))], trace); await g.start(n.url); r.gateways.push(g);
  const op = await Peer.connect(g.operatorUrl, "operator", trace); r.peers.push(op); assert.equal((await op.auth(key(50), g.operatorUrl))[2], true);
  const ingest = async (e: Signed, expected = true) => { op.send(["EVENT", e]); const ok = await op.take(m => m[0] === "OK" && m[1] === e.id); assert.equal(ok[2], expected, JSON.stringify(ok)); return ok; };
  await ingest(w.journal.events[0]!);
  const reader = async (secret: string, name: string) => { const p = await Peer.connect(g.url, name, trace); r.peers.push(p); assert.equal((await p.auth(secret, g.url))[2], true); return p; };
  const filter = (extra: Record<string, unknown> = {}) => ({ "#h": [w.g.context.genesis], "#i": [w.g.context.instance], "#d": [w.g.context.definition], kinds: [8792], limit: limits.pageEvents, ...extra });
  const history = async (p: Peer, id: string, extra: Record<string, unknown> = {}) => { p.send(["REQ", id, filter(extra)]); await p.take(m => (m[0] === "EOSE" || m[0] === "CLOSED") && m[1] === id); return p.messages.filter(m => m[0] === "EVENT" && m[1] === id).map(m => m[2] as Signed); };
  return { w, n, g, op, ingest, reader, filter, history };
}
test("feasibility.gateway.G5-F01", () => caseRun("G5-F01", async (d, trace, r, notes) => {
  for (const tree of [false, true]) {
    const n = await startNative(join(d, tree ? "tree" : "query"), { restricted: true, ...(tree ? {tree: canonical({authors:[publicKey(key(31))]})} : {}) }); r.natives.push(n);
    const writer = await Peer.connect(n.url, "bare-writer", trace); const bob = await Peer.connect(n.url, "bare-bob", trace); const carol = await Peer.connect(n.url, "bare-carol", trace); r.peers.push(writer, bob, carol);
    bob.send(["REQ", "auth-bob", { kinds: [1], "#p": [publicKey(key(32))] }]); carol.send(["REQ", "auth-carol", { kinds: [1], "#p": [publicKey(key(34))] }]);
    assert.equal((await bob.auth(key(32), n.url))[2], true); assert.equal((await carol.auth(key(34), n.url))[2], true);
    const e = signRaw(key(31), 1, [["p", publicKey(key(32))]], "restricted synthetic old history"); writer.send(["EVENT", e]); assert.equal((await writer.take(m => m[0] === "OK" && m[1] === e.id))[2], true);
    bob.send(["REQ", "old", { kinds: [1], "#p": [publicKey(key(32))] }]); assert.equal(((await bob.take(m => m[0] === "EVENT" && m[1] === "old"))[2] as Signed).id, e.id); await bob.take(m => m[0] === "EOSE" && m[1] === "old");
    carol.send(["REQ", "newcomer", { kinds: [1], "#p": [publicKey(key(34))] }]); await carol.take(m => m[0] === "EOSE" && m[1] === "newcomer"); assert(!carol.messages.some(m => m[0] === "EVENT"));
    const later = signRaw(key(31), 1, [["p", publicKey(key(32))]], "Bob immutable recipient still sees this after application-level removal"); writer.send(["EVENT", later]); await writer.take(m => m[0] === "OK" && m[1] === later.id); assert.equal(((await bob.take(m => m[0] === "EVENT" && m[1] === "old"))[2] as Signed).id, later.id);
    writer.send(["COUNT", "count", {}]); assert.equal(((await writer.take(m => m[0] === "COUNT"))[2] as { count: number }).count, 2);
    writer.send(["COUNT", "exact", { ids: [e.id] }]); assert.equal(((await writer.take(m => m[0] === "COUNT" && m[1] === "exact"))[2] as { count: number }).count, 1);
    // NIP-77 v1: infinity bound, mode IdList, zero IDs. Actual query versus persistent-tree paths.
    writer.send(["NEG-OPEN", "inventory", tree ? {authors:[publicKey(key(31))]} : {ids:[e.id]}, "6100000200"]); const neg = await writer.take(m => m[0] === "NEG-MSG" || m[0] === "NEG-ERR");
    assert.equal(neg[0], "NEG-MSG"); const leaks = (neg[2] as string).includes(e.id); assert.equal(leaks, tree);
    const protectedEvent=signRaw(key(31),1,[["-"],["p",publicKey(key(32))]],"NIP-70 exact-author control");
    bob.send(["EVENT",protectedEvent]);assert.equal((await bob.take(m=>m[0]==="OK"&&m[1]===protectedEvent.id))[2],false);
    writer.send(["EVENT",protectedEvent]);assert.equal((await writer.take(m=>m[0]==="OK"&&m[1]===protectedEvent.id))[2],false);
    assert.equal((await writer.auth(key(31),n.url))[2],true);writer.send(["EVENT",protectedEvent]);assert.equal((await writer.take(m=>m[0]==="OK"&&m[1]===protectedEvent.id))[2],true);
    notes.push({ tree, neg, restrictedIdDisclosed: leaks, newcomerOldEvents: 0, oldRecipientStillServed: true, removalMeaning: "bare relay has no application roster transition input" });
  }
}));
test("feasibility.gateway.G5-F02", () => caseRun("G5-F02", async (d, trace, r, notes) => {
  const x = await world(d, trace, r); const unknown = await x.reader(key(49), "nonmember"); assert.deepEqual(await x.history(unknown, "denied"), []);
  const challengeMulti=(trace.find(f=>f.connection==="nonmember"&&Array.isArray(f.message)&&f.message[0]==="AUTH")!.message as unknown[])[1] as string;
  const secondKey=signRaw(key(32),22242,[["relay",x.g.url],["challenge",challengeMulti]],"",Math.floor(Date.now()/1000));unknown.send(["AUTH",secondKey]);assert.equal((await unknown.take(m=>m[0]==="OK"&&m[1]===secondKey.id))[2],true);assert.equal((await x.history(unknown,"multi-key")).length,1);
  const bob = await x.reader(key(32), "bob");
  for (const command of [["COUNT", "a", {}], ["HLL", "a", {}], ["NEG-OPEN", "a", {}, "6100000200"], ["NEG-MSG", "a", "61"], ["EVENT", x.w.journal.events[0]], ["EXPORT"], ["DELETE"], ["RECONCILE", {}]]) { bob.send(command); await bob.take(m => m[0] === "NOTICE"); }
  for (const f of [{}, x.filter({ "#h": ["f".repeat(64)] }), x.filter({ authors: [publicKey(key(32))] })]) { bob.send(["REQ", "bad", f]); await bob.take(m => m[0] === "NOTICE"); }
  bob.send(["REQ", "or-bypass", x.filter(), {}]); await bob.take(m => m[0] === "NOTICE"); assert(!bob.messages.some(m => m[0] === "EVENT"));
  await assert.rejects(Peer.connect(x.g.url + "/wrong", "wrong-path", trace));
  const badAuth = await Peer.connect(x.g.url, "bad-auth", trace); r.peers.push(badAuth); const challenge = await badAuth.take(m => m[0] === "AUTH");
  for (const [url, nonce, time] of [[x.g.url + "/other", challenge[1], Math.floor(Date.now()/1000)], [x.g.url, "replayed-other-connection", Math.floor(Date.now()/1000)], [x.g.url, challenge[1], Math.floor(Date.now()/1000)-61]] as [string,string,number][]) {
    const e = signRaw(key(32), 22242, [["relay",url],["challenge",nonce]], "",time); badAuth.send(["AUTH",e]); assert.equal((await badAuth.take(m=>m[0]==="OK"&&m[1]===e.id))[2],false);
  }
  const http = x.g.url.replace("ws:","http:").split("/instance/")[0]!;
  assert.deepEqual((await (await fetch(http,{headers:{Accept:"application/nostr+json"}})).json() as {supported_nips:number[]}).supported_nips,[1,11,42]);
  for(const path of ["/export","/admin","/instances","/source","/db"]) assert.equal((await fetch(http+path)).status,404);
  await assert.rejects(Peer.connect(`ws://[::1]:${x.n.port}`,"ipv6-backend",trace));
  const sandbox = '(version 1)(allow default)(deny network*)(allow network-outbound (remote ip "localhost:'+new URL(x.g.url).port+'"))';
  const script = 'for(const url of '+JSON.stringify([http,`http://127.0.0.1:${x.n.port}`])+'){try{let r=await fetch(url,{headers:{Accept:"application/nostr+json"},signal:AbortSignal.timeout(1000)});console.log(JSON.stringify({url,status:r.status}))}catch{console.log(JSON.stringify({url,denied:true}))}}';
  const p = spawn("/usr/bin/sandbox-exec",["-p",sandbox,process.execPath,"--input-type=module","-e",script],{stdio:["ignore","pipe","pipe"]}); let out="",err="";p.stdout.on("data",b=>out+=b);p.stderr.on("data",b=>err+=b);const code=await new Promise<number|null>(resolve=>p.once("exit",resolve));
  assert.equal(code,0,err); const results=out.trim().split("\n").map(line=>JSON.parse(line));assert.equal(results[0].status,200);assert.equal(results[1].denied,true);
  notes.push({sandbox,results,scope:"actual OS-restricted client process: gateway allowed, backend denied; deployment firewall/container isolation remains P5"});
}));
test("feasibility.gateway.G5-F03", () => caseRun("G5-F03", async (d, trace, r, notes) => {
  const x=await world(d,trace,r); const carol=await x.reader(key(34),"carol");assert.deepEqual(await x.history(carol,"before"),[]);
  const application=await apply(x.w,x.w.owner,"old history recovered through real gateway",[x.w.owner]);await x.ingest(application);
  const c=await x.w.owner.stageCommit([add(x.w.carolDevice)]);const e=await x.w.journal.append(c.event,c.admission);await x.w.owner.receive(e);await x.ingest(e);
  const archive=await createArchive(x.w.owner,x.w.g.event,x.w.definition,x.w.starting);const sharedKey=hex(random());const encrypted=await encrypt(archive,sharedKey,x.w.g.context,1,archive.checkpoint.id);
  const object=sign(x.w.owner.keys.deviceKey,"chunk",x.w.g.context,encrypted);x.op.send(["OBJECT",object]);assert.equal((await x.op.take(m=>m[0]==="OK"&&m[1]===object.id))[2],true);
  const closure=sign(x.w.owner.keys.accountKey,"proof",x.w.g.context,{type:"retention-closure",tip:e.id,checkpoint:archive.checkpoint,ids:[object.id]});x.op.send(["CLOSURE",closure]);await x.op.take(m=>m[0]==="OK"&&m[1]===closure.id);
  const old=await x.history(carol,"full",{noseq_tip:e.id});assert.deepEqual(old.map(e=>e.id),x.w.journal.events.map(e=>e.id));assert(old.every(e=>!e.tags.some(t=>t[0]==="p")));
  carol.send(["NOSEQ-CLOSURE","closure",e.id]);await carol.take(m=>m[0]==="NOSEQ-COMPLETE");assert.equal((carol.messages.find(m=>m[0]==="EVENT"&&m[1]==="closure")![2] as Signed).id,object.id);
  const received=carol.messages.find(m=>m[0]==="EVENT"&&m[1]==="closure")![2] as Signed;
  const packet=deliverKey(x.w.owner.keys.deviceKey,x.w.carolDevice.binding.device,x.w.g.context,sharedKey,archive.checkpoint.id);const material=receiveKey(x.w.carolDevice.deviceKey,x.w.owner.keys.binding.device,packet,x.w.g.context);
  const verified=await VerifiedArchive.verify(await decrypt(parse(read(eventBytes(received),"chunk",x.w.g.context).content) as Encrypted,material.key,x.w.g.context) as Archive,{owner:x.w.g.context.owner,genesis:x.w.g.context.genesis,tip:e.id,checkpoint:material.checkpoint});assert.deepEqual(verified.snapshot.outcomes,x.w.owner.data.outcomes);
  const wrongObject=sign(x.w.owner.keys.deviceKey,"chunk",x.w.g.context,{...encrypted,checkpoint:"f".repeat(64)});x.op.send(["OBJECT",wrongObject]);await x.op.take(m=>m[0]==="OK"&&m[1]===wrongObject.id);
  const wrongClosure=sign(x.w.owner.keys.accountKey,"proof",x.w.g.context,{type:"retention-closure",tip:e.id,checkpoint:archive.checkpoint,ids:[wrongObject.id]});x.op.send(["CLOSURE",wrongClosure]);await x.op.take(m=>m[0]==="OK"&&m[1]===wrongClosure.id);
  carol.send(["NOSEQ-CLOSURE","wrong-checkpoint",e.id]);await carol.take(m=>m[0]==="NOTICE");assert(!carol.messages.some(m=>m[0]==="EVENT"&&m[1]==="wrong-checkpoint"));
  notes.push({namedPrefix:e.id,newcomerOldHistory:old.length,closure:[object.id],archiveCheckpoint:archive.checkpoint.id,decryption:"actual NIP-44 key delivery, AES-GCM archive decryption and G2 signature/opening verification; gateway receives no recovery keys"});
}));
test("feasibility.gateway.G5-F04", () => caseRun("G5-F04", async (d,trace,r,notes)=>{
  const x=await world(d,trace,r);const bob=await x.reader(key(32),"bob");await x.history(bob,"live",{limit:1});const releasedBefore=x.g.released.length;
  x.g.paused=true;bob.send(["REQ","old-cursor",x.filter({noseq_tip:x.g.tip})]);await pause(20);
  const c=await x.w.owner.stageCommit([remove(x.w.owner,x.w.bobDevice)]);const e=await x.w.journal.append(c.event,c.admission);await x.w.owner.receive(e);await x.ingest(e);
  await bob.take(m=>m[0]==="CLOSED"&&m[1]==="old-cursor");x.g.resume();await pause(20);assert.equal(x.g.released.length,releasedBefore);
  assert.deepEqual(await x.history(bob,"retry-old",{noseq_tip:x.w.journal.events[0]!.id}),[]);bob.send(["NOSEQ-CLOSURE","old-closure",x.w.journal.events[0]!.id]);await bob.take(m=>m[0]==="CLOSED"&&m[1]==="old-closure");const reconnect=await x.reader(key(32),"reconnect");assert.deepEqual(await x.history(reconnect,"again"),[]);
  notes.push({cutoff:e.id,releasedBefore,after:x.g.released.slice(releasedBefore),rule:"membership rechecked immediately before ws.send; earlier handed bytes are in flight"});
}));
test("feasibility.gateway.G5-F05",()=>caseRun("G5-F05",async(d,trace,r,notes)=>{
  const x=await world(d,trace,r);
  for(let i=1;i<40;i++) await apply(x.w,x.w.owner,"old-prefix-"+i,[x.w.owner]);
  const first=await child(["tests/protocol-feasibility/gateway-replication-client.ts"],JSON.stringify({url:x.g.operatorUrl,key:key(50),events:x.w.journal.events.slice(1)}));assert.equal(first.code,0,first.error);writeFileSync(join(d,"replication40.json"),first.output);const tip40=x.g.tip;assert.equal(x.g.data.events.length,40);
  // The separate producer has exited: no authority/replication connection delivers the next control.
  const c=await x.w.owner.stageCommit([remove(x.w.owner,x.w.bobDevice),add(x.w.carolDevice)]);const removal=await x.w.journal.append(c.event,c.admission);await x.w.owner.receive(removal);
  const bob=await x.reader(key(32),"partition-bob");const carol=await x.reader(key(34),"partition-carol");assert.equal((await x.history(bob,"as40",{noseq_tip:tip40})).length,40);assert.deepEqual(await x.history(carol,"not41"),[]);assert.equal(x.g.tip,tip40);
  const next=await child(["tests/protocol-feasibility/gateway-replication-client.ts"],JSON.stringify({url:x.g.operatorUrl,key:key(50),events:[removal]}));assert.equal(next.code,0,next.error);writeFileSync(join(d,"replication41.json"),next.output);
  assert.deepEqual(await x.history(bob,"old40",{noseq_tip:tip40}),[]);assert.equal((await x.history(carol,"now41",{noseq_tip:removal.id})).length,41);
  notes.push({tip40,removal41:removal.id,explicitExposure:"Bob can retrieve previously unfetched old ciphertext/metadata at 40 despite unseen primary removal 41",globallyCurrent:false});
}));
test("feasibility.gateway.G5-F06",()=>caseRun("G5-F06",async(d,trace,r,notes)=>{
  const x=await world(d,trace,r);const old=readFileSync(x.g.statePath);const oldTip=x.g.tip;
  const middle=await apply(x.w,x.w.owner,"withheld dependency",[x.w.owner]);
  const c=await x.w.owner.stageCommit([remove(x.w.owner,x.w.bobDevice)]);const removal=await x.w.journal.append(c.event,c.admission);await x.w.owner.receive(removal);
  await x.ingest(removal,false);assert.equal(x.g.readable,false);assert.equal(x.g.tip,oldTip);
  const learnedPath=join(d,"learned-control-state.json");writeFileSync(learnedPath,readFileSync(x.g.statePath));
  const learned=new Gateway(x.w.g.context,x.w.g.event,learnedPath,x.w.starting,founder(x.w),[publicKey(key(50))],trace);learned.loadIntact();await learned.start(x.n.url);r.gateways.push(learned);
  assert.equal(learned.readable,false);assert.equal(learned.tip,oldTip);assert.equal(learned.buffer.get(3)?.id,removal.id);
  for(const name of ["learned-bob","learned-reconnect"]){const p=await Peer.connect(learned.url,name,trace);r.peers.push(p);await p.auth(key(32),learned.url);p.send(["REQ","old-cursor",x.filter({noseq_tip:oldTip})]);await p.take(m=>m[0]==="CLOSED"&&m[1]==="old-cursor");p.send(["NOSEQ-CLOSURE","old-closure",oldTip]);await p.take(m=>m[0]==="CLOSED"&&m[1]==="old-closure");assert(!p.messages.some(m=>m[0]==="EVENT"));}
  const lo=await Peer.connect(learned.operatorUrl,"learned-operator",trace);r.peers.push(lo);await lo.auth(key(50),learned.operatorUrl);lo.send(["EVENT",middle]);assert.equal((await lo.take(m=>m[0]==="OK"&&m[1]===middle.id))[2],true);assert.equal(learned.tip,removal.id);assert.equal(learned.controlGap,false);assert(!learned.data.public.members.some(m=>m.device===publicKey(key(32))));
  const after=await Peer.connect(learned.url,"learned-after-fill",trace);r.peers.push(after);await after.auth(key(32),learned.url);after.send(["REQ","still-denied",x.filter({noseq_tip:oldTip})]);await after.take(m=>m[0]==="CLOSED");
  await x.ingest(middle);assert.equal(x.g.tip,removal.id);
  const intact=new Gateway(x.w.g.context,x.w.g.event,x.g.statePath,x.w.starting,founder(x.w),[publicKey(key(50))],trace);intact.loadIntact();await intact.start(x.n.url);r.gateways.push(intact);const p=await Peer.connect(intact.url,"intact-bob",trace);r.peers.push(p);await p.auth(key(32),intact.url);p.send(["REQ","denied",x.filter()]);await p.take(m=>m[0]==="CLOSED");assert.equal(intact.tip,removal.id);
  const stalePath=join(d,"stale-state.json");writeFileSync(stalePath,old);const restored=new Gateway(x.w.g.context,x.w.g.event,stalePath,x.w.starting,founder(x.w),[publicKey(key(50))],trace,true);restored.loadIntact();await restored.start(x.n.url);r.gateways.push(restored);const b=await Peer.connect(restored.url,"restored-bob",trace);r.peers.push(b);await b.auth(key(32),restored.url);b.send(["REQ","fenced",x.filter()]);await b.take(m=>m[0]==="CLOSED");
  const op=await Peer.connect(restored.operatorUrl,"restore-operator",trace);r.peers.push(op);await op.auth(key(50),restored.operatorUrl);
  const fence=sign(key(31),"proof",x.w.g.context,{type:"trusted-high-water",challenge:restored.reconcileChallenge,position:3,tip:removal.id});op.send(["RECONCILE",fence]);await op.take(m=>m[0]==="NOTICE");assert.equal(restored.readable,false);
  op.send(["EVENT",removal]);await op.take(m=>m[0]==="OK");op.send(["EVENT",middle]);await op.take(m=>m[0]==="OK"&&m[1]===middle.id);op.send(["RECONCILE",fence]);assert.equal((await op.take(m=>m[0]==="OK"&&m[1]===fence.id))[2],true);b.send(["REQ","still-revoked",x.filter()]);await b.take(m=>m[0]==="CLOSED");
  const gapPath=join(d,"gap-state.json");const gap=new Gateway(x.w.g.context,x.w.g.event,gapPath,x.w.starting,founder(x.w),[publicKey(key(50))],trace);await gap.start(x.n.url);r.gateways.push(gap);const go=await Peer.connect(gap.operatorUrl,"gap-operator",trace);r.peers.push(go);await go.auth(key(50),gap.operatorUrl);go.send(["EVENT",removal]);assert.equal((await go.take(m=>m[0]==="OK"))[2],false);assert.equal(gap.readable,false);assert.equal(gap.data.events.length,0);
  const half=sign(key(39),"order",x.w.g.context,{...entry(x.w.journal.events[0]!,x.w.g.context),admission:null});go.send(["EVENT",half]);assert.equal((await go.take(m=>m[0]==="OK"))[2],false);assert.equal(gap.data.events.length,0);
  go.send(["EVENT",x.w.journal.events[0]]);assert.equal((await go.take(m=>m[0]==="OK"))[2],true);go.send(["EVENT",middle]);assert.equal((await go.take(m=>m[0]==="OK"&&m[1]===middle.id))[2],true);assert.equal(gap.tip,removal.id);
  const fork=sign(key(39),"order",x.w.g.context,{...entry(removal,x.w.g.context),previous:"f".repeat(64)});go.send(["EVENT",fork]);assert.equal((await go.take(m=>m[0]==="OK"))[2],false);assert.equal(gap.readable,false);
  notes.push({intactTip:intact.tip,learnedOutOfOrderControl:{oldTip,withheld:middle.id,removal:removal.id,reconstructionDeniedOldCursorClosureReconnect:true,dependencyFillPreservedRemoval:true},staleRestoreRequiresExternalHighWater:true,externalAuthority:"owner-signed fresh challenge proof supplied by trusted external fixture; not a local backup freshness proof",gapAndHalfBlocked:true,forkHalted:true,persistence:"actual JSON file reconstruction, not crash/fsync/P5 durability"});
}));
test("feasibility.gateway.G5-F07",()=>caseRun("G5-F07",async(d,trace,r,notes)=>{
  const x=await world(d,trace,r);const firstCheckpoint=(await createArchive(x.w.owner,x.w.g.event,x.w.definition,x.w.starting)).checkpoint;for(let i=0;i<129;i++){const e=await apply(x.w,x.w.owner,"same-second-"+i,[x.w.owner]);await x.ingest(e);}const fixed=x.g.tip;const bob=await x.reader(key(32),"paging-bob");
  const first=await x.history(bob,"page1",{noseq_tip:fixed,limit:128});assert.equal(first.length,128);bob.send(["CLOSE","page1"]);
  const later=await apply(x.w,x.w.owner,"during-fixed-tip",[x.w.owner]);await x.ingest(later);
  const remaining=x.g.data.events.slice(128,130).map(e=>e.id);const second=await x.history(bob,"page2",{noseq_tip:fixed,ids:remaining});assert.deepEqual([...first,...second].map(e=>e.id),x.g.data.events.slice(0,130).map(e=>e.id));assert.equal(new Set(first.map(e=>e.created_at)).size,1);
  await x.ingest(later);assert.equal(x.g.data.events.length,131);
  const missing=hex(random());const closureTip=x.w.journal.events[0]!.id;const c=sign(key(31),"proof",x.w.g.context,{type:"retention-closure",tip:closureTip,checkpoint:firstCheckpoint,ids:[missing]});x.op.send(["CLOSURE",c]);await x.op.take(m=>m[0]==="OK");bob.send(["NOSEQ-CLOSURE","hole",closureTip]);await bob.take(m=>m[0]==="NOTICE");assert(!bob.messages.some(m=>m[0]==="NOSEQ-COMPLETE"));
  const deletedId = first[1]!.id;
  const deletion = execFileSync(x.n.binary,[`--config=${x.n.configPath}`,"delete","--filter",JSON.stringify({ids:[deletedId]})],{cwd:x.n.source,encoding:"utf8"});writeFileSync(join(d,"operator-delete.log"),deletion);
  bob.send(["REQ","missing-middle",x.filter({noseq_tip:fixed,ids:[deletedId]})]);await bob.take(m=>m[0]==="NOTICE");assert(!bob.messages.some(m=>m[0]==="EOSE"&&m[1]==="missing-middle"));
  // Authenticated private re-ingestion must repair the backend, not merely report the existing logical receipt.
  x.op.send(["EVENT",first[1]]);assert.equal((await x.op.take(m=>m[0]==="OK"&&m[1]===deletedId))[2],true);const repaired=await x.history(bob,"repaired",{noseq_tip:fixed,ids:[deletedId]});assert.deepEqual(repaired.map(e=>e.id),[deletedId]);
  notes.push({fixed,positions:130,equalTimestamp:true,lateEntryExcluded:later.id,closureHoleUnavailable:true,missingMiddle:deletedId,missingMiddleNoEose:true});
}));
test("feasibility.gateway.G5-F08",()=>caseRun("G5-F08",async(d,trace,r,notes)=>{
  const x=await world(d,trace,r);const bob=await x.reader(key(32),"resource-bob");const foreign=sign(key(48),"order",x.w.g.context,entry(x.w.journal.events[0]!,x.w.g.context));await x.ingest(foreign,false);
  for(let i=0;i<4;i++)await x.history(bob,"s"+i);bob.send(["REQ","fifth",x.filter()]);await bob.take(m=>m[0]==="NOTICE");bob.send(["REQ","too-many",...Array.from({length:5},()=>x.filter())]);await bob.take(m=>m[0]==="NOTICE");
  const stranger=await Peer.connect(x.g.operatorUrl,"unauthorized-writer",trace);r.peers.push(stranger);await stranger.auth(key(32),x.g.operatorUrl);stranger.send(["EVENT",x.w.journal.events[0]]);await stranger.take(m=>m[0]==="NOTICE");
  // Exact unsupported NIP-70 protected publication is refused by this profile's exact tag parser; no tag stripping.
  const original=x.w.journal.events[0]!;const protectedEvent=signRaw(key(39),original.kind,[...original.tags,["-"]],original.content);await x.ingest(protectedEvent,false);
  const archive=await createArchive(x.w.owner,x.w.g.event,x.w.definition,x.w.starting);
  const object=async()=>sign(x.w.owner.keys.deviceKey,"chunk",x.w.g.context,await encrypt(archive,hex(random()),x.w.g.context,1,archive.checkpoint.id));
  const firstObject=await object(),secondObject=await object();
  const declaration=(ids:string[])=>sign(key(31),"proof",x.w.g.context,{type:"retention-closure",tip:x.g.tip,checkpoint:archive.checkpoint,ids});
  const firstClosure=declaration([firstObject.id]),secondClosure=declaration([secondObject.id]);
  const send=async(p:Peer,route:string,e:Signed,success=true)=>{p.send([route,e]);const reply=await p.take(m=>success?m[0]==="OK"&&m[1]===e.id:m[0]==="NOTICE");if(success)assert.equal(reply[2],true);else assert(String(reply[1]).includes("retention full"));};
  for(const [route,e] of [["OBJECT",firstObject],["CLOSURE",firstClosure],["OBJECT",secondObject],["CLOSURE",secondClosure]] as [string,Signed][]){const before=x.g.journalBytes;await send(x.op,route,e);assert.equal(x.g.journalBytes,before+Buffer.byteLength(eventBytes(e)));await send(x.op,route,e);assert.equal(x.g.journalBytes,before+Buffer.byteLength(eventBytes(e)));}
  assert.equal(x.g.data.closures[x.g.tip]!.id,secondClosure.id);assert(x.g.data.retained[firstClosure.id]);
  const accounted=Object.values(x.g.data.retained).reduce((n,e)=>n+Buffer.byteLength(eventBytes(e)),0);assert.equal(x.g.journalBytes,accounted);
  const quotaPath=join(d,"quota-state.json");writeFileSync(quotaPath,readFileSync(x.g.statePath));
  const quota=new Gateway(x.w.g.context,x.w.g.event,quotaPath,x.w.starting,founder(x.w),[publicKey(key(50))],trace);quota.loadIntact();assert.equal(quota.journalBytes,accounted);await quota.start(x.n.url);r.gateways.push(quota);
  const qo=await Peer.connect(quota.operatorUrl,"quota-operator",trace);r.peers.push(qo);await qo.auth(key(50),quota.operatorUrl);
  for(const [route,e] of [["EVENT",original],["OBJECT",firstObject],["CLOSURE",firstClosure]] as [string,Signed][])await send(qo,route,e);
  assert.equal(quota.journalBytes,accounted);assert.equal(Object.keys(quota.data.retained).length,5);
  const before=x.g.data.events.length;x.g.journalBytes=limits.journal;const extra=await apply(x.w,x.w.owner,"capacity",[x.w.owner]);await x.ingest(extra,false);assert.equal(x.g.data.events.length,before);
  const excessObject=await object(),excessClosure=declaration([firstObject.id,secondObject.id]);
  await send(x.op,"OBJECT",excessObject,false);await send(x.op,"CLOSURE",excessClosure,false);assert.equal(x.g.journalBytes,limits.journal);assert.equal(Object.keys(x.g.data.retained).length,5);
  // At the same boundary, exact retries still succeed without charging or evicting any retained identity.
  for(const [route,e] of [["EVENT",original],["OBJECT",firstObject],["CLOSURE",firstClosure]] as [string,Signed][])await send(x.op,route,e);
  assert.equal(x.g.journalBytes,limits.journal);
  const storage=await Peer.connect(x.n.url,"quota-native-readback",trace);r.peers.push(storage);
  storage.send(["REQ","retained",{ids:Object.keys(x.g.data.retained),limit:10}]);await storage.take(m=>m[0]==="EOSE"&&m[1]==="retained");assert.equal(storage.messages.filter(m=>m[0]==="EVENT"&&m[1]==="retained").length,5);
  storage.send(["REQ","refused",{ids:[extra.id,excessObject.id,excessClosure.id],limit:10}]);await storage.take(m=>m[0]==="EOSE"&&m[1]==="refused");assert(!storage.messages.some(m=>m[0]==="EVENT"&&m[1]==="refused"));
  const fresh=await x.reader(key(32),"queue-reader");x.g.paused=true;for(let i=0;i<129;i++)fresh.send(["REQ","q",x.filter()]);await fresh.take(m=>m[0]==="CLOSED"&&m[1]==="q");x.g.resume();
  const oversize=await x.reader(key(32),"oversized-frame");oversize.send(["REQ","over",{blob:"x".repeat(limits.frame)}]);await Promise.race([new Promise<void>(resolve=>oversize.socket.once("close",()=>resolve())),pause(2000)]);assert.equal(oversize.closed,true);
  notes.push({replicatorKeySeparateFromSequencer:true,protectedEvent:"unsupported/refused without stripping; bare author-authenticated path measured separately",retentionRefusal:true,originalRetained:before,aggregateAccounting:{accounted,retainedIdentities:5,supersededDeclarationStillRetained:firstClosure.id,allThreeRoutesRefusedAtBoundary:true,duplicateRetriesUncharged:true,reconstructedCounterMatches:true,nativeRefusedIdsAbsent:true},limits: x.g.metadata(),remaining:"production retry scheduling, physical capacity and independent failure domains remain P5"});
}));
