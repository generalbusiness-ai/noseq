import { strict as assert } from "node:assert";
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { cap, closureProfile, digest, file, inventory, Offline, strictJSON, trustedSource } from "../../scripts/decision-io.ts";
import { archived, exportFixture, type AuthorityFixture } from "./authority-fixture.ts";
import type { DecisionExport, DecisionPolicy, DecisionReview } from "../../scripts/decision-types.ts";

type Actor="root"|"reviewer"|"implementer";
export function state(f:AuthorityFixture,actor:Actor,kind:string,text:string,body:Record<string,string>,rests:string[],attachments:Record<string,string>={}) {
  return f.io.gs(f.binary,f.repo,"state","--as",f.names[actor],"--kind",kind,"--text",text,
    ...Object.entries(body).flatMap(([k,v])=>["--body",k+"="+v]),...rests.flatMap(id=>["--rests-on",id]),
    ...Object.entries(attachments).flatMap(([k,v])=>["--evidence",k+"="+v]));
}
export function ratify(f:AuthorityFixture,actor:Actor,id:string){return f.io.gs(f.binary,f.repo,"ratify","--as",f.names[actor],id);}
export function retire(f:AuthorityFixture,id:string){return f.io.gs(f.binary,f.repo,"supersede","--as",f.names.root,"--text","Synthetic fixture retirement only",id);}
export function fork(f:AuthorityFixture,directory:string):AuthorityFixture {
  mkdirSync(directory);const repo=join(directory,"room");cpSync(f.repo,repo,{recursive:true});
  const path=join(repo,".git/gitseq/config.json"),config=JSON.parse(readFileSync(path,"utf8"));
  const rebase=(p:string)=>{assert(p.startsWith(f.repo+"/"));return repo+p.slice(f.repo.length);};
  config.sequencer_key=rebase(config.sequencer_key);for(const a of Object.values(config.actors)as any[])a.key_file=rebase(a.key_file);
  writeFileSync(path,JSON.stringify(config));
  const policy=structuredClone(f.policy),policyPath=join(directory,"trusted-policy.json");writeFileSync(policyPath,JSON.stringify(policy),{flag:"wx"});
  return {...f,directory,repo,io:new Offline(join(directory,"generation")),policy,policyPath,chain:{...f.chain},manifest:structuredClone(f.manifest),review:structuredClone(f.review)};
}
export function reviewAgain(f:AuthorityFixture,mutate:(r:DecisionReview)=>void=()=>{},verdict="approved",omitAdBasis=false) {
  const {D,AD}=f.chain,m=f.manifest;
  const Q=state(f,"implementer","request","Synthetic repeat exact decision review.",{
    to:f.policy.principals.reviewer,no_git_artifact:"true",conditions:"Synthetic decision-only exact source/evidence review.",
    protocol_decision:D,protocol_adoption:AD,manifest_sha256:digest(JSON.stringify(m)),evidence_sha256:m.evidence.sha256},
    [D,...omitAdBasis?[]:[AD],...m.artifacts.map(a=>a.event)]);
  const P=state(f,"reviewer","promise","Synthetic fresh independent review promise.",{},[Q]);
  const r:DecisionReview={...structuredClone(f.review),D,AD,manifestSha256:digest(JSON.stringify(m)),source:m.source,artifacts:m.artifacts,selection:m.selection,evidence:m.evidence,requiredCases:m.requiredCases,decisions:m.decisions};mutate(r);
  const fold=strictJSON(f.io.gs(f.binary,f.repo,"status","--json"),cap.unpackedGitBytes),primary=fold.projection.commitments.find((c:any)=>c.promise===f.promise)?.report;
  assert(m.artifacts.some(a=>a.event===primary));const artifacts=[m.artifacts.find(a=>a.event===primary)!,...m.artifacts.filter(a=>a.event!==primary)];
  const R=f.io.gs(f.binary,f.repo,"review","--as",f.names.reviewer,"--checkout",f.repo,...artifacts.flatMap(a=>["--artifact",a.event]),"--promise",P,"--implementation",f.promise,"--verdict",verdict,"--text",JSON.stringify(r));
  const AR=ratify(f,"implementer",R);f.chain={D,AD,Q,P,R,AR};f.review=r;
}
export function selectAgain(f:AuthorityFixture,mutate:(m:any)=>void=()=>{},withdrawOld=true,extraBases:string[]=[]) {
  if(withdrawOld)retire(f,f.chain.D);mutate(f.manifest);const path=join(f.directory,"replacement-decision.json");writeFileSync(path,JSON.stringify(f.manifest),{flag:"wx"});
  const D=state(f,"implementer","propose","Synthetic changed conditional protocol selection.",{
    noseq_protocol_selection:"noseq/p1-decision@1",manifest_sha256:digest(JSON.stringify(f.manifest))},[...f.manifest.artifacts.map(a=>a.event),...extraBases],{"decision.json":path});
  const AD=ratify(f,"root",D);f.chain={...f.chain,D,AD};reviewAgain(f);
}
export function writePolicy(f:AuthorityFixture){writeFileSync(f.policyPath,JSON.stringify(f.policy));}
export function alterExport(directory:string,mutate:(x:any)=>void) {const path=join(directory,"export.json"),x=JSON.parse(readFileSync(path,"utf8"));mutate(x);writeFileSync(path,JSON.stringify(x));return x as DecisionExport;}

export class Challenges {
  readonly root:string;readonly f:AuthorityFixture;readonly records:any[]=[];serial=0;
  constructor(root:string,f:AuthorityFixture){this.root=root;this.f=f;mkdirSync(root);}
  variant(label:string){assert(/^[a-z0-9-]+$/.test(label));return fork(this.f,join(this.root,label));}
  audit(f:AuthorityFixture,label:string,want:string|null,exported?:string,policyPath=f.policyPath){
    const directory=exported??join(f.directory,"export-"+label);if(!exported)exportFixture(f,directory);
    const output=join(f.directory,"audit-"+label),run=f.io.run(process.execPath,[join(trustedSource,"scripts/decision-verify.ts"),"--export",directory,"--policy",policyPath,"--output",output,"--verifier",f.binary],{allowFailure:true});
    const text=run.stdout.toString()+run.stderr.toString();assert.equal(run.status,want===null?0:1,label+": wrong CLI exit\n"+text);
    if(want)assert(text.includes(want),label+": wrong refusal\n"+text);
    const record={label,expected:want===null?"accepted":want,exit:run.status,stdout:digest(run.stdout),stderr:digest(run.stderr),export:directory,policy:policyPath,output,
      result:JSON.parse(readFileSync(join(output,want===null?"result.json":"failure.json"),"utf8"))};
    this.records.push(record);return record;
  }
  attempt(f:AuthorityFixture,label:string,run:()=>unknown,want:string){let error="";try{run();}catch(e){error=String(e);}assert(error.includes(want),label+": wrong guarded refusal "+error);this.records.push({label,expected:want,guardedRefusal:error});}
  write(name:string){const records=this.records.splice(0);assert(records.length>0);writeFileSync(join(this.root,"result-"+name+".json"),JSON.stringify({case:"authority."+name,records},null,2),{flag:"wx"});return records;}
}

export function rewriteTip(f:AuthorityFixture,change:(text:string)=>string) {
  const tip=f.io.git(f.repo,"rev-parse","refs/seq/"+f.genesis),raw=f.io.git(f.repo,"cat-file","commit",tip)+"\n";
  const rewritten=f.io.run("git",["-C",f.repo,"hash-object","-t","commit","-w","--stdin"],{input:change(raw)}).stdout.toString().trim();
  f.io.git(f.repo,"update-ref","refs/seq/"+f.genesis,rewritten,tip);
  return {head:rewritten,depth:Number(f.io.git(f.repo,"rev-list","--count",rewritten))-1};
}

export function rotate(f:AuthorityFixture) {
  const directory=join(f.repo,".git/gitseq"),configPath=join(directory,"config.json"),config=JSON.parse(readFileSync(configPath,"utf8")),next=join(directory,"next-sequencer");
  f.io.run("ssh-keygen",["-q","-t","ed25519","-N","","-C","","-f",next]);
  const publicKey=readFileSync(next+".pub","utf8").trim();assert(publicKey.startsWith("ssh-ed25519 ")&&Buffer.byteLength(publicKey)<256);
  // Exact deterministic CBOR [version=0, canonical successor SSH key], matching
  // pinned kernel.rotationDescriptor. This helper creates test input; gs verifies it.
  const descriptor=Buffer.concat([Buffer.from([0x82,0x00,0x78,Buffer.byteLength(publicKey)]),Buffer.from(publicKey)]);
  const message="gitseq-rotation-v0\nDescriptor: "+descriptor.toString("base64url")+"\n";
  const tree=f.io.run("git",["-C",f.repo,"mktree"],{input:""}).stdout.toString().trim(),tip=f.io.git(f.repo,"rev-parse","refs/seq/"+f.genesis);
  const oid=f.io.run("git",["-C",f.repo,"-c","gpg.format=ssh","-c","user.signingKey="+config.sequencer_key,"commit-tree","-S",tree,"-p",tip],{
    input:message,env:{GIT_AUTHOR_NAME:"synthetic rotation",GIT_AUTHOR_EMAIL:"rotation@example.invalid",GIT_COMMITTER_NAME:"gitseq sequencer",GIT_COMMITTER_EMAIL:"sequencer@gitseq.invalid"}}).stdout.toString().trim();
  f.io.git(f.repo,"update-ref","refs/seq/"+f.genesis,oid,tip);config.sequencer_key=next;writeFileSync(configPath,JSON.stringify(config));
  f.io.run(f.binary,["verify","--repo",f.repo]);return oid;
}
