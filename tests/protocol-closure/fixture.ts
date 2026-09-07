import { add, type Device } from "../protocol-feasibility/crypto.ts";
import { StreamClient, joinedStream } from "../segmented-recovery/client.ts";
import { key, world } from "../segmented-recovery/fixture.ts";
import { Records } from "../segmented-recovery/storage.ts";
import { submission } from "../protocol-feasibility/crypto.ts";
import { bytes, canonical, check, clone, equal, hash, type Signed } from "../segmented-recovery/wire.ts";
import type { TextStore } from "../segmented-recovery/types.ts";
import { checkpoint, reopen } from "./reconstruction.ts";

export async function refused(label:string, run:()=>unknown|Promise<unknown>, contains?:string) {
  try { await run(); } catch(error) {
    const message=String(error);check(!contains||message.includes(contains),label+": unexpected refusal "+message);
    return {label,message};
  }
  throw Error(label+": unexpectedly succeeded");
}

export async function fixture(backing:TextStore,freshBacking:()=>Promise<TextStore>,name:string) {
  const w=await world(backing,name),boundaries:{label:string;sha256:string;bytes:number;records:number;tip:string;pending:string|null;observed:number;fork:boolean}[]=[];
  let owner=w.owner,bob=w.bob,serial=0,checkpointSerial=0;
  const save=async (client:StreamClient,label:string) => {
    const text=checkpoint(client,w.root.event,w.sealer.founder,w.initial),path=name+"-checkpoint-"+(++checkpointSerial);
    await backing.put(path,text);
    const fresh=await freshBacking();
    const reopened=await reopen(await fresh.get(path),fresh,client.log.namespace,
      {owner:w.ctx.owner,genesis:w.ctx.genesis,device:client.keys.binding.device});
    equal(reopened.data,client.data,"exact bounded state after reopen");
    equal(reopened.log.ids,client.log.ids,"rebuilt immutable prefix");
    equal([...reopened.log.logical],[...client.log.logical],"rebuilt logical index");
    check(reopened.log!==client.log&&reopened.env!==client.env,"new client/index/environment objects");
    boundaries.push({label,sha256:await hash(text),bytes:bytes(JSON.parse(text)),records:client.log.length,
      tip:client.tip,pending:client.data.pending?.event.id??null,observed:client.observed.size,fork:client.data.fork});
    return reopened;
  };
  const accept=async(event:Signed,peers:StreamClient[]=[bob])=>{
    check(await owner.receive(event)==="accepted","current owner accepts");
    for(const peer of peers)check(await peer.receive(event)==="accepted","current peer accepts");
    return event;
  };
  const control=async(proposals:Parameters<StreamClient["stageCommit"]>[0],peers:StreamClient[]=[bob])=>{
    const pending=await owner.stageCommit(proposals),event=await w.journal.append(pending.event,pending.admission);
    await accept(event,peers);return {pending,event,welcome:owner.data.released[pending.event.id]};
  };
  const apply=async(value:string,peers:StreamClient[]=[bob])=>{
    const sub=await owner.stageAction(value,key(50000+(++serial))),event=await w.journal.append(sub);
    await accept(event,peers);return event;
  };
  const join=async(d:Device,label:string,peers:StreamClient[]=[bob])=>{
    const r=await control([add(d)],peers);check(r.welcome,"accepted Welcome");
    const log=new Records(backing,name+"-"+label);
    for(let i=1;i<=owner.log.length;i++)await log.append(await owner.log.get(i));
    // Reconstruct logical index from the authenticated records when the client is reopened.
    for(const [logical,id] of owner.log.logical)log.logical.set(logical,id);
    return joinedStream(w.ctx,w.env,d,r.welcome,submission(r.pending.event,w.ctx).welcome!,owner.data.public,log);
  };
  const result=async(value:unknown)=>({result:{profile:"noseq/protocol-closure-profile@1",case:name,...value as object,boundaries,
    status:"observed; no full gate pass"},fixtures:[{root:w.root.event,context:w.ctx,definition:w.definition,
      founder:w.sealer.founder,initial:w.initial,ordered:w.journal.events,acceptedTip:owner.tip,acceptedCount:owner.log.length,
      records:await Promise.all(owner.log.ids.map((_id,i)=>owner.log.get(i+1)))}]});
  return {w,save,accept,control,apply,join,result,boundaries,
    get owner(){return owner},set owner(c:StreamClient){owner=c},get bob(){return bob},set bob(c:StreamClient){bob=c}};
}
