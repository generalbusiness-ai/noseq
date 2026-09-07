import { binding, checkMembers, control, decodeMessage, decodeState, entry, environment,
  members, mls, privateMessage, publicTransition, submission, type Outcome,
  type PublicState } from "../protocol-feasibility/crypto.ts";
import { createOpening, verifyOpening } from "../protocol-feasibility/opening.ts";
import { read, readAction } from "../protocol-feasibility/wire.ts";
import { StreamClient } from "../segmented-recovery/client.ts";
import { Records } from "../segmented-recovery/storage.ts";
import { bounds, bytes, canonical, check, clone, equal, fields, hash, hex, hex32,
  integer, parse, publicKey, readRoot2, utf8, type Signed } from "../segmented-recovery/wire.ts";
import type { LogRecord, TextStore } from "../segmented-recovery/types.ts";
import type { CompactCheckpoint } from "./types.ts";

export function checkpoint(client: StreamClient, root: Signed, founder: Signed, initial: PublicState): string {
  const c: CompactCheckpoint = {schema:"noseq/compact-client@1",root,context:client.ctx,founder,initial,
    keys:{accountKey:client.keys.accountKey,deviceKey:client.keys.deviceKey,binding:client.keys.binding},
    records:{count:client.log.length,tip:client.tip},data:client.data,
    pendingAdmission:client.pendingAdmission,observed:[...client.observed].sort((a,b)=>a[0]-b[0])};
  check(bytes(c)<=bounds.vaultBytes,"compact checkpoint capacity");
  return canonical(c);
}

// Explicit local reconstruction. No lost Client/Records/environment object is an input.
export async function reopen(serialized:string, backing:TextStore, namespace:string,
  trust:{owner:string;genesis:string;device:string}):Promise<StreamClient> {
  const c=parse(serialized,bounds.vaultBytes) as unknown as CompactCheckpoint;
  fields(c,["schema","root","context","founder","initial","keys","records","data","pendingAdmission","observed"]);
  check(c.schema==="noseq/compact-client@1","compact checkpoint schema");
  const ctx=readRoot2(c.root,trust.owner,trust.genesis),env=await environment(ctx);
  equal(c.context,ctx,"checkpoint root context");
  fields(c.keys,["accountKey","deviceKey","binding"]);fields(c.keys.binding,["account","device","leaf"]);
  hex32(c.keys.accountKey);hex32(c.keys.deviceKey);
  check(publicKey(c.keys.accountKey)===c.keys.binding.account && publicKey(c.keys.deviceKey)===trust.device &&
    c.keys.binding.device===trust.device,"checkpoint signer binding");
  fields(c.records,["count","tip"]);integer(c.records.count,bounds.entries);hex32(c.records.tip);
  fields(c.initial,["version","epoch","members"]);checkMembers(c.initial.members);
  check(c.initial.version===0&&c.initial.epoch===0&&c.initial.members.length===1,"founder public state");
  const founder=read(canonical(c.founder),"proof",ctx),f=parse(founder.content);
  fields(f,["type","device","suite","leaf"]);
  check(founder.pubkey===ctx.owner&&f.type==="account-leaf"&&f.suite===1,"founder signature");
  equal(c.initial.members[0],{account:founder.pubkey,device:f.device,leaf:f.leaf},"founder leaf binding");
  fields(c.data,["state","pending","public","events","outcomes","logical","published","observed","fork","openings","released"]);
  for(const key of ["events","outcomes","published","openings"] as const)equal(c.data[key],[],"no accumulated Snapshot");
  equal(c.data.logical,{},"no saved logical projection");equal(c.data.observed,{},"no legacy observed map");
  check(typeof c.data.fork==="boolean"&&typeof c.data.released==="object"&&c.data.released!==null&&
    !Array.isArray(c.data.released)&&Object.keys(c.data.released).length<=1,"bounded release/fork state");
  const releases=new Set(Object.keys(c.data.released)),log=new Records(backing,namespace);
  let state:PublicState=clone(c.initial),logicalBytes=2,ownSeen=false;
  for(let position=1;position<=c.records.count;position++) {
    ownSeen ||= state.members.some(m=>canonical(m)===canonical(c.keys.binding));
    const saved=parse(await backing.get(`${namespace}-${position}`),bounds.segmentBytes) as unknown as LogRecord;
    fields(saved,["record","outcome"]);fields(saved.record,["event","opening"]);
    const e=entry(saved.record.event,ctx),sub=submission(e.submission,ctx);
    check(e.position===position&&e.previous===(log.ids.at(-1)??ctx.genesis),"reopened original prefix");
    const next=publicTransition(ctx,state,e);let outcome:Outcome;
    if(sub.epoch<state.epoch||sub.version<state.version) {
      check(saved.record.opening===null,"no stale opening");outcome={position,logical:e.submission.id,disposition:"stale",value:null};
    } else if(sub.type==="commit") {
      check(saved.record.opening===null,"no control opening");outcome={position,logical:e.submission.id,disposition:"control",value:null};
      if(releases.has(e.submission.id)) {
        check(e.submission.pubkey===trust.device&&await hash(c.data.released[e.submission.id])===sub.welcome,
          "reopened released Welcome identity");
        check(decodeMessage(c.data.released[e.submission.id]!).wireformat===mls.wireformats.mls_welcome,"released Welcome type");
        releases.delete(e.submission.id);
      }
    } else {
      const o=saved.record.opening;check(o&&o.position===position&&o.submission===e.submission.id,"reopened opening coverage");
      const verified=await verifyOpening(o,privateMessage(sub.bytes),env,ctx);
      const roster=verified.publicTree.filter(n=>n?.nodeType===mls.nodeTypes.leaf).map(n=>{
        check(n?.nodeType===mls.nodeTypes.leaf,"leaf");return binding(n.leaf.credential,n.leaf.signaturePublicKey,ctx);
      }).sort((a,b)=>a.device.localeCompare(b.device));equal(roster,state.members,"reopened opening roster");
      const member=state.members.find(m=>m.device===e.submission.pubkey);
      check(member&&verified.leaf===member.leaf,"reopened sender binding");
      const a=readAction(verified.action,ctx,member.account,member.device),prior=log.logical.get(a.logical);
      check(a.outcome!=="runtime-failure","unfinalized record");if(prior)check(prior===verified.action.id,"reopened logical conflict");
      else {logicalBytes+=bytes([a.logical,verified.action.id])+1;check(logicalBytes<=bounds.logicalIndexBytes,"reopened logical capacity");}
      outcome={position,logical:a.logical,disposition:prior?"duplicate":a.outcome,value:!prior&&a.outcome==="apply"?a.value:null};
      log.logical.set(a.logical,verified.action.id);
    }
    equal(saved.outcome,outcome,"recomputed local outcome");log.ids.push(saved.record.event.id);state=next;
  }
  ownSeen ||= state.members.some(m=>canonical(m)===canonical(c.keys.binding));
  check(ownSeen&&releases.size===0,"checkpoint device/release history");
  equal(c.records.tip,log.ids.at(-1)??ctx.genesis,"checkpoint exact tip");equal(c.data.public,state,"reopened final public state");
  const accepted=decodeState(c.data.state),removed=accepted.groupActiveState.kind==="removedFromGroup";
  check(hex(accepted.groupContext.groupId)===ctx.genesis&&Number(accepted.groupContext.epoch)+(removed?1:0)===state.epoch,
    "checkpoint accepted group/epoch");
  if(removed)check(!state.members.some(m=>m.device===trust.device),"terminal removal public state");
  else {
    equal(members(accepted,ctx),state.members,"checkpoint accepted roster");
    const leaf=accepted.ratchetTree[accepted.privatePath.leafIndex*2];check(leaf?.nodeType===mls.nodeTypes.leaf,"checkpoint own leaf");
    equal(binding(leaf.leaf.credential,leaf.leaf.signaturePublicKey,ctx),c.keys.binding,"checkpoint own private leaf");
    const message=utf8.encode(canonical([c.schema,ctx.genesis,c.records.tip]));
    check(await env.cipherSuite.signature.verify(leaf.leaf.signaturePublicKey,message,
      await env.cipherSuite.signature.sign(accepted.signaturePrivateKey,message)),"checkpoint private signing key");
  }
  if(c.data.pending) {
    check(!removed,"removed client pending operation");const p=c.data.pending;
    fields(p,["event","state","base","plaintext","welcome"]);equal(p.base,c.data.state,"reopened pending base");
    const sub=submission(p.event,ctx),pending=decodeState(p.state);
    check(p.event.pubkey===trust.device&&sub.epoch===state.epoch&&sub.version===state.version,
      "reopened pending sender/epoch/version");
    check(hex(pending.groupContext.groupId)===ctx.genesis&&Number(pending.groupContext.epoch)===state.epoch+(sub.type==="commit"?1:0),
      "reopened provisional group/epoch");
    if(sub.type==="commit") {
      check(c.pendingAdmission&&p.plaintext===null&&c.keys.binding.account===ctx.owner,"pending owner admission");
      const a=control(c.pendingAdmission,ctx);
      check(a.submission===p.event.id&&a.epoch===state.epoch+1&&a.version===state.version+1,"pending admission binding");
      equal(a.members,members(pending,ctx),"pending admission/decrypted roster");
      check(p.welcome===null?sub.welcome===null:await hash(p.welcome)===sub.welcome,"pending Welcome hash");
      if(p.welcome!==null)check(decodeMessage(p.welcome).wireformat===mls.wireformats.mls_welcome,"pending Welcome type");
    } else {
      check(c.pendingAdmission===null&&p.plaintext&&p.welcome===null&&sub.welcome===null,"pending application shape");
      const a=readAction(p.plaintext,ctx,c.keys.binding.account,trust.device);
      equal(members(pending,ctx),state.members,"pending application roster");
      const opening=await createOpening(decodeState(c.data.state),privateMessage(sub.bytes),env,log.length+1,p.event.id,p.plaintext);
      equal((await verifyOpening(opening,privateMessage(sub.bytes),env,ctx)).action,p.plaintext,"pending real application correspondence");
      check(a.device===trust.device,"pending action device");
    }
  } else check(c.pendingAdmission===null,"orphan pending admission");
  check(Array.isArray(c.observed)&&c.observed.length<=64,"bounded observed positions");
  const observed=new Map<number,string>();let last=0;
  for(const p of c.observed) {
    check(Array.isArray(p)&&p.length===2,"observed tuple");integer(p[0],bounds.entries);hex32(p[1]);
    check(p[0]>log.length&&p[0]>last,"observed ordering/range");observed.set(p[0],p[1]);last=p[0];
  }
  const result=new StreamClient(ctx,env,c.keys,clone(c.data),log);result.pendingAdmission=clone(c.pendingAdmission);result.observed=observed;
  return result;
}
