import { strict as assert } from "node:assert";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { closureProfile, digest, exact, file, strictJSON, cap } from "./decision-io.ts";
import { segmentedContext, validateSegmented, verifySegmentedFiles } from "./segmented-recovery-evidence.ts";
import { fileManifest } from "./ordered-mls-evidence.ts";
import { sha256File, assertReportPassed, vitestCases, playwrightCases, type SuiteContract, type SuiteResult } from "./evidence.ts";
import { readRoot2, canonical, eventBytes } from "../tests/segmented-recovery/wire.ts";
import { read, readAction } from "../tests/protocol-feasibility/wire.ts";
import { verifyAuthorityPublic } from "./decision-public-evidence.ts";
export const profilePath="fixtures/crypto/closure/profile.json";
export const gates={G1:"unpassed",G2:"unpassed",G3:"unpassed",G4:"unpassed",G5:"unpassed"};
export const closureCases=["offline-membership-churn","selected-profile-staged-state"];
export function closureContracts():SuiteContract[]{
  return [
    {id:"node",command:"vitest run --config protocol-closure.config.ts --configLoader native",requiredCases:closureCases.map(c=>"closure.node."+c)},
    {id:"browser",command:"playwright test --config protocol-closure.playwright.config.ts",requiredCases:closureCases.map(c=>"closure.browser."+c)},
    {id:"authority",command:"vitest run --config decision-authority.config.ts --configLoader native",requiredCases:closureProfile.authorityCases}];
}
export function closureContext(){
  const p=strictJSON(readFileSync(profilePath,"utf8"));assert.deepEqual(p.gates,gates);assert.deepEqual(p.suites,closureProfile.suites);
  return {segmented:segmentedContext(),profile:sha256File(profilePath),files:Object.fromEntries((p.files as string[]).map(f=>[f,sha256File(f)]))};
}
export interface ClosureEvidence {
  schema:"noseq/protocol-closure@1";runId:string;command:"npm run probe:protocol-closure";
  conclusion:"protocol-closure-observed; decisions-unadopted; no-security-gate-passed";
  context:ReturnType<typeof closureContext>;gates:typeof gates;required:SuiteContract[];suites:SuiteResult[];
  prerequisite:{path:string;sha256:string;cases:115};observations:Record<string,string>;browserBundle:Record<string,string>;
  authorityArtifacts:Record<string,string>;verifier:Record<string,unknown>;commands:Record<string,string>;
}
export function validateClosure(value:unknown,context:ReturnType<typeof closureContext>):asserts value is ClosureEvidence {
  const e=value as ClosureEvidence;exact(e,["schema","runId","command","conclusion","context","gates","required","suites","prerequisite","observations","browserBundle","authorityArtifacts","verifier","commands"]);
  assert.equal(e.schema,"noseq/protocol-closure@1");assert.equal(e.command,"npm run probe:protocol-closure");assert.equal(e.conclusion,"protocol-closure-observed; decisions-unadopted; no-security-gate-passed");
  assert.match(e.runId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.deepEqual(e.context,context,"exact source/profile/provider/runtime context");assert.deepEqual(e.gates,gates);assert.deepEqual(e.required,closureContracts());assert.equal(e.suites.length,3);assert.equal(new Set(e.suites.map(s=>s.id)).size,3);
  for(const contract of closureContracts()){
    const s=e.suites.find(s=>s.id===contract.id)!;assert(s);exact(s,["id","command","exitCode","cases","reportSha256"]);assert.equal(s.command,contract.command);assert.equal(s.exitCode,0);assert.match(s.reportSha256,/^[0-9a-f]{64}$/);
    assert.deepEqual(s.cases.map(c=>c.id).sort(),[...contract.requiredCases].sort());for(const c of s.cases){exact(c,["id","status"]);assert.equal(c.status,"passed");}
  }
  exact(e.prerequisite,["path","sha256","cases"]);assert.equal(e.prerequisite.cases,115);assert.match(e.prerequisite.path,/^artifacts\/segmented-recovery\/runs\/[0-9a-f-]{36}\/evidence\.json$/);assert.match(e.prerequisite.sha256,/^[0-9a-f]{64}$/);
  assert.deepEqual(Object.keys(e.observations).sort(),closureCases.flatMap(c=>["node-"+c+".json","browser-"+c+".json"]).sort());
  assert("index.html"in e.browserBundle);assert("verifier.json"in e.authorityArtifacts);
  assert.equal(e.verifier.sourceCommit,closureProfile.authority.gitseqSource);assert.equal(e.verifier.binarySha256,closureProfile.authority.binarySha256);assert.equal(e.verifier.originalBuildRecordSha256,closureProfile.authority.buildRecordSha256);
  assert.deepEqual(Object.keys(e.commands).sort(),Array.from({length:6},(_,i)=>[`${i+1}.log`,`${i+1}.command.json`]).flat().sort());
}
function verifyFixtures(fixtures:any[]){
  assert(Array.isArray(fixtures)&&fixtures.length===1);const f=fixtures[0];exact(f,["root","context","definition","founder","initial","ordered","acceptedTip","acceptedCount","records"]);
  const ctx=readRoot2(f.root,f.context.owner,f.context.genesis);assert.deepEqual(ctx,f.context);
  assert.equal(digest(canonical(["noseq/definition-closure@1",f.definition.nonce,f.definition.files])),ctx.definition);
  const founder=read(eventBytes(f.founder),"proof",ctx),proof=strictJSON(founder.content);assert.equal(founder.pubkey,ctx.owner);assert.equal(proof.type,"account-leaf");assert.equal(proof.suite,1);
  assert.deepEqual(f.initial,{version:0,epoch:0,members:[{account:founder.pubkey,device:proof.device,leaf:proof.leaf}]});
  assert.equal(f.ordered.length,f.acceptedCount);assert.equal(f.records.length,f.acceptedCount);assert.equal(f.ordered.at(-1).id,f.acceptedTip);
  let previous=ctx.genesis,state=structuredClone(f.initial);const logical=new Map();
  for(const [i,signed]of f.ordered.entries()){
    const e=read(eventBytes(signed),"order",ctx);assert.equal(e.pubkey,ctx.sequencer);const b=strictJSON(e.content);exact(b,["position","previous","submission","admission"]);assert.equal(b.position,i+1);assert.equal(b.previous,previous);
    const sub=read(eventBytes(b.submission),"submission",ctx),s=strictJSON(sub.content),member=state.members.find((m:any)=>m.device===sub.pubkey);assert(member,"admitted submitter");
    const record=f.records[i];exact(record,["record","outcome"]);exact(record.record,["event","opening"]);assert.deepEqual(record.record.event,e);const out=record.outcome;exact(out,["position","logical","disposition","value"]);assert.equal(out.position,i+1);
    if(s.epoch<state.epoch||s.version<state.version){assert.equal(out.disposition,"stale");assert.equal(record.record.opening,null);assert.equal(out.value,null);assert.equal(out.logical,sub.id);}
    else if(s.type==="commit"){
      assert.equal(member.account,ctx.owner);const a=read(eventBytes(b.admission),"admission",ctx);assert.equal(a.pubkey,ctx.owner);const admission=strictJSON(a.content);assert.equal(admission.submission,sub.id);assert.equal(admission.epoch,state.epoch+1);assert.equal(admission.version,state.version+1);
      state={epoch:admission.epoch,version:admission.version,members:admission.members};assert.equal(out.disposition,"control");assert.equal(out.logical,sub.id);assert.equal(out.value,null);assert.equal(record.record.opening,null);
    }else{
      assert.equal(s.type,"application");assert.equal(s.epoch,state.epoch);assert.equal(s.version,state.version);assert.equal(b.admission,null);
      const opening=record.record.opening;assert(opening&&opening.position===i+1&&opening.submission===sub.id);const a=readAction(opening.action,ctx,member.account,member.device),prior=logical.get(a.logical);
      if(prior)assert.equal(prior,opening.action.id);assert.equal(out.logical,a.logical);assert.equal(out.disposition,prior?"duplicate":a.outcome);assert.equal(out.value,!prior&&a.outcome==="apply"?a.value:null);logical.set(a.logical,opening.action.id);
    }
    previous=e.id;
  }
}
export function verifyClosureFiles(e:ClosureEvidence,directory:string){
  assert.equal(sha256File(e.prerequisite.path),e.prerequisite.sha256);const prior=strictJSON(readFileSync(e.prerequisite.path,"utf8"));validateSegmented(prior,e.context.segmented);verifySegmentedFiles(prior,dirname(e.prerequisite.path));
  for(const s of e.suites){const path=join(directory,s.id+".json");assert.equal(sha256File(path),s.reportSha256);const raw=strictJSON(readFileSync(path,"utf8"),8_388_608);assertReportPassed(raw,s.id);assert.deepEqual(s.id==="browser"?playwrightCases(raw):vitestCases(raw),s.cases);}
  assert.deepEqual(fileManifest(join(directory,"browser-bundle")),e.browserBundle);
  const baseline=e.context.segmented.protocol.ordered.preflight.baseline;
  for(const [name,sha]of Object.entries(e.observations)){
    const raw=file(directory,name);assert.equal(digest(raw),sha);const observed=strictJSON(raw.toString(),8_388_608),r=observed.result;
    assert.equal(r.profile,"noseq/protocol-closure-profile@1");assert.equal(r.case,name.replace(/^(node|browser)-/,"").replace(/\.json$/,""));assert.equal(r.status,"observed; no full gate pass");
    assert(Array.isArray(r.boundaries)&&r.boundaries.length>5);for(const b of r.boundaries){exact(b,["label","sha256","bytes","records","tip","pending","observed","fork"]);assert.match(b.sha256,/^[0-9a-f]{64}$/);assert(b.bytes>0&&b.bytes<=closureProfile.reconstruction.bytes&&b.observed<=64&&typeof b.fork==="boolean");}
    if(r.case==="offline-membership-churn"){assert.equal(r.finalEpoch-r.offlineEpoch,7);assert.equal(r.changes.length,7);assert.equal(r.actualRemovedState,"removedFromGroup");assert.equal(r.refusals.length,3);assert(r.deliveries.length>3);}
    else{assert.equal(r.gapMaximum,63);assert.equal(r.refusals.length,7);assert(r.boundaries.some((b:any)=>b.fork));assert(r.boundaries.some((b:any)=>b.observed===63));assert(r.boundaries.some((b:any)=>b.label==="Commit-after-earlier-application"));}
    verifyFixtures(observed.fixtures);
    if(name.startsWith("node-"))assert.equal(observed.node,baseline.runtime.node);else{assert.equal(observed.browserVersion,baseline.runtime.chromium);assert.equal(observed.secure,true);assert(observed.userAgent.includes("HeadlessChrome/"+observed.browserVersion));}
  }
  assert.deepEqual(fileManifest(join(directory,"authority-public")),e.authorityArtifacts);
  verifyAuthorityPublic(join(directory,"authority-public"));
  assert.deepEqual(strictJSON(file(join(directory,"authority-public"),"verifier.json").toString()),e.verifier);
  for(const name of closureProfile.authorityCases as string[]){const raw=strictJSON(file(join(directory,"authority-public"),"results/"+name+".json").toString(),8_388_608);assert.equal(raw.case,name);assert(Array.isArray(raw.records)&&raw.records.length>0);
    for(const record of raw.records){assert(typeof record.label==="string"&&typeof record.expected==="string");if(record.guardedRefusal)assert(record.guardedRefusal.includes(record.expected));else{assert.equal(record.exit,record.expected==="accepted"?0:1);assert(record.result);if(record.exit===0)assert.equal(record.result.schema,"noseq/p1-decision-result@1");else assert.equal(record.result.schema,"noseq/p1-decision-failure@1");}}
  }
  for(const [name,sha]of Object.entries(e.commands)){
    assert.equal(sha256File(join(directory,name)),sha);if(!name.endsWith("command.json"))continue;const c=strictJSON(file(directory,name).toString());exact(c,["command","args","cwd","exitCode","signal","error"]);assert.equal(c.exitCode,0);assert.equal(c.signal,null);assert.equal(c.error,null);
    assert(typeof c.command==="string"&&c.command.endsWith("/node"));const n=Number(name.split(".")[0]);
    const expected:Record<number,string[]>={1:["scripts/segmented-recovery.ts"],2:["node_modules/typescript/bin/tsc","--noEmit","-p","tsconfig.protocol-closure.json"],
      3:["node_modules/vite/bin/vite.js","build","--config","protocol-closure.vite.config.ts","--configLoader","native"],
      4:["node_modules/vitest/vitest.mjs","run","--config","protocol-closure.config.ts","--configLoader","native","--reporter=default","--reporter=json",`--outputFile=${c.cwd}/artifacts/protocol-closure/runs/${e.runId}/node.json`],
      5:["node_modules/@playwright/test/cli.js","test","--config","protocol-closure.playwright.config.ts"],
      6:["node_modules/vitest/vitest.mjs","run","--config","decision-authority.config.ts","--configLoader","native","--reporter=default","--reporter=json",`--outputFile=${c.cwd}/artifacts/protocol-closure/runs/${e.runId}/authority.json`]};
    assert.deepEqual(c.args,expected[n],"actual command contract");
  }
}
