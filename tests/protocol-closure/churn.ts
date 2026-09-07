import { add, decodeState, device, entry, mls, privateMessage, remove, submission } from "../protocol-feasibility/crypto.ts";
import { key } from "../segmented-recovery/fixture.ts";
import { check, clone, equal, hash } from "../segmented-recovery/wire.ts";
import type { TextStore } from "../segmented-recovery/types.ts";
import { fixture, refused } from "./fixture.ts";

export async function churn(backing:TextStore,fresh:()=>Promise<TextStore>,name:string) {
  const f=await fixture(backing,fresh,name),{w}=f;
  const daveDevice=await device(w.env,w.ctx,key(106),key(206));
  let dave=await f.join(daveDevice,"dave");
  await f.apply("immutable prior value",[f.bob,dave]);
  const priorIds=clone(f.bob.log.ids),priorOutcomes=await f.bob.log.outcomes(),offlineEpoch=f.bob.epoch;
  const old=await f.bob.stageAction("late offline submission",key(61000));
  f.bob=await f.save(f.bob,"retained-member-disconnect-staged");
  dave=await f.save(dave,"removed-member-disconnect");
  const firstMissing=f.bob.log.length+1;
  const temp2=await device(w.env,w.ctx,key(104),key(204)),temp3=await device(w.env,w.ctx,key(105),key(205));
  const operations=[()=>[add(w.carolDevice)],()=>[remove(f.owner,w.carolDevice)],()=>[add(temp2)],
    ()=>[remove(f.owner,daveDevice)],()=>[remove(f.owner,temp2)],()=>[add(temp3)],()=>[remove(f.owner,temp3)]];
  const changes=[];let removal=0;
  for(let i=0;i<operations.length;i++) {
    const c=await f.control(operations[i]!(),[]);changes.push({position:entry(c.event,w.ctx).position,id:c.event.id,epoch:f.owner.epoch});
    if(i===3)removal=entry(c.event,w.ctx).position;
    await f.apply("encrypted application after actual change "+i,[]);
  }
  check(f.owner.epoch-offlineEpoch===7,"seven actual membership epochs");
  const future=w.journal.events.at(-1)!;
  check(await f.bob.receive(future)==="wait"&&f.bob.log.length===priorIds.length,"retained future waits without frontier");
  check(await dave.receive(future)==="wait"&&dave.log.length===priorIds.length,"removed future waits before removal");
  f.bob=await f.save(f.bob,"retained-member-future-gap");dave=await f.save(dave,"removed-member-future-gap");
  const batches=[1,3,2,5,1,7];let batch=0,p=firstMissing;const deliveries:number[][]=[];
  while(p<=w.journal.events.length) {
    const end=Math.min(w.journal.events.length,p+batches[batch++%batches.length]!-1),delivered=[];
    if(end>p)check(await f.bob.receive(w.journal.events[end-1]!)==="wait","batch future waits");
    for(;p<=end;p++) {
      check(await f.bob.receive(w.journal.events[p-1]!)==="accepted","ordered missing prefix catchup");
      check(await f.bob.receive(w.journal.events[p-1]!)==="duplicate","exact catchup duplicate");delivered.push(p);
    }
    deliveries.push(delivered);f.bob=await f.save(f.bob,"retained-catchup-batch-"+batch);
  }
  equal(f.bob.data.public,f.owner.data.public,"final canonical roster");
  equal(await f.bob.log.outcomes(),await f.owner.log.outcomes(),"final canonical outcomes");
  equal(f.bob.log.ids.slice(0,priorIds.length),priorIds,"prior immutable IDs unchanged");
  equal((await f.bob.log.outcomes()).slice(0,priorIds.length),priorOutcomes,"prior immutable outcomes unchanged");
  check(f.bob.data.pending===null&&f.bob.observed.size===0,"offline provisional operation discarded and gap drained");
  let beforeRemoval="";
  for(let pos=firstMissing;pos<=removal;pos++) {
    if(pos===removal)beforeRemoval=dave.data.state;
    check(await dave.receive(w.journal.events[pos-1]!)==="accepted","removed member receives missing prefix including removal");
  }
  check(decodeState(dave.data.state).groupActiveState.kind==="removedFromGroup","actual removed terminal result");
  dave=await f.save(dave,"removed-terminal-after-real-removal");
  const afterRemoval=w.journal.events[removal]!,message=privateMessage(submission(entry(afterRemoval,w.ctx).submission,w.ctx).bytes);
  const refusals=[];
  refusals.push(await refused("removed wrapper future",()=>dave.receive(afterRemoval),"removed terminal"));
  refusals.push(await refused("removed actual future crypto",()=>mls.processMessage({context:dave.env,state:decodeState(dave.data.state),message}),"OperationError"));
  refusals.push(await refused("old pre-removal state actual future crypto",()=>mls.processMessage({context:dave.env,state:decodeState(beforeRemoval),message}),"OperationError"));
  const late=await w.journal.append(old);await f.accept(late);
  check((await f.bob.log.get(f.bob.log.length)).outcome.disposition==="stale","late offline operation common stale outcome");
  await f.apply("retained member decrypts after catchup");
  equal(await f.bob.projection(),await f.owner.projection(),"real retained positive future control");
  return f.result({offlineEpoch,finalEpoch:f.owner.epoch,changes,deliveries,removalPosition:removal,
    actualRemovedState:decodeState(dave.data.state).groupActiveState.kind,priorIds,priorOutcomeHash:await hash(priorOutcomes),
    lateSubmission:old.id,lateReceipt:late.id,projectionHash:await hash(await f.bob.projection()),refusals});
}
