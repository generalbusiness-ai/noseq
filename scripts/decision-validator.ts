import { strict as assert } from "node:assert";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { cap, closureProfile, digest, exact, externalPolicy, file, inspectBundle, inventory, Offline, safePath, strictJSON, trustedSource } from "./decision-io.ts";
import { copyEvidence, verifyDetachedEvidence } from "./decision-evidence.ts";
import type { DecisionExport, DecisionManifest, DecisionPolicy, DecisionReview } from "./decision-types.ts";
const hash=(v:unknown,n=40)=>assert(typeof v==="string"&&new RegExp("^[0-9a-f]{"+n+"}$").test(v),"canonical hash");
const sorted=(a:string[])=>[...a].sort();
function unique(a:unknown):asserts a is string[]{assert(Array.isArray(a)&&a.length>0&&a.every(x=>typeof x==="string"));assert.equal(new Set(a).size,a.length,"duplicate identifiers");}
function source(v:any){exact(v,["commit","tree","base"]);for(const x of Object.values(v))hash(x);}
function selection(v:any){exact(v,["ordering","recovery","profilePath","profileSha256","inputProfiles","identities"]);safePath(v.profilePath);hash(v.profileSha256,64);
  assert.equal(v.ordering,closureProfile.ordering);assert.equal(v.recovery,closureProfile.recovery);exact(v.inputProfiles,Object.keys(closureProfile.inputProfiles));for(const h of Object.values(v.inputProfiles))hash(h,64);}
function evidence(v:any){exact(v,["path","sha256","filesSha256","context","kind"]);safePath(v.path);hash(v.sha256,64);hash(v.filesSha256,64);assert(["archived-p1d-test-only","p1e-closure"].includes(v.kind));}
function decisions(v:any){exact(v,Object.keys(closureProfile.decisions));assert.deepEqual(v,closureProfile.decisions,"exact D1-D9 acknowledgements required");}
function expected(v:any){exact(v,["source","paths","selection","evidence","requiredCases","decisions"]);source(v.source);unique(v.paths);v.paths.forEach(safePath);selection(v.selection);evidence(v.evidence);unique(v.requiredCases);decisions(v.decisions);}
export function validatePolicy(value:unknown):asserts value is DecisionPolicy {
  const p=value as DecisionPolicy;exact(p,["schema","mode","genesis","principals","minimum","expected"]);assert.equal(p.schema,"noseq/p1-decision-policy@1");hash(p.genesis);
  exact(p.principals,["root","reviewer","implementer"]);for(const h of Object.values(p.principals))hash(h,64);assert.equal(new Set(Object.values(p.principals)).size,3,"independent root, reviewer and implementation principals");
  exact(p.minimum,["head","depth"]);hash(p.minimum.head);assert(Number.isInteger(p.minimum.depth)&&p.minimum.depth>0&&p.minimum.depth<=cap.sequenceDepth);
  expected(p.expected);
  if(p.mode==="synthetic-only") {
    assert.notEqual(p.genesis,closureProfile.authority.realGenesis,"synthetic policy cannot address real room");
    for(const h of Object.values(p.principals))assert(![closureProfile.authority.realRoot,closureProfile.authority.realReviewer,closureProfile.authority.realImplementer].includes(h),"synthetic fixture cannot borrow real principals");
    assert.equal(p.expected.evidence.kind,"archived-p1d-test-only");assert.equal(p.expected.requiredCases.length,115);
  }else{
    assert.equal(p.mode,"real-diagnostic");assert.equal(p.genesis,closureProfile.authority.realGenesis);
    assert.deepEqual(p.principals,{root:closureProfile.authority.realRoot,reviewer:closureProfile.authority.realReviewer,implementer:closureProfile.authority.realImplementer});
    assert.equal(p.expected.evidence.kind,"p1e-closure");assert.equal(p.expected.selection.profilePath,"fixtures/crypto/closure/profile.json");
    const required=[...closureProfile.suites.flatMap((s:any)=>s.cases),...closureProfile.authorityCases];
    assert.equal(p.expected.requiredCases.length,119+closureProfile.authorityCases.length);for(const id of required)assert(p.expected.requiredCases.includes(id));
  }
}
function manifest(value:unknown):asserts value is DecisionManifest {
  const m=value as DecisionManifest;exact(m,["schema","scope","source","artifacts","selection","evidence","requiredCases","decisions"]);
  assert.equal(m.schema,"noseq/p1-decision@1");assert.equal(m.scope,"conditional-selection-requiring-independent-review");source(m.source);selection(m.selection);evidence(m.evidence);unique(m.requiredCases);decisions(m.decisions);
  assert(Array.isArray(m.artifacts)&&m.artifacts.length>0);unique(m.artifacts.map(a=>a.path));unique(m.artifacts.map(a=>a.event));
  for(const a of m.artifacts){exact(a,["path","blob","sha256","event"]);safePath(a.path);hash(a.blob);hash(a.sha256,64);}
}
export function verifyDecision(exportRoot:string,policyPath:string,output:string,binary:string) {
  mkdirSync(output);const io=new Offline(join(output,"commands"));
  const p=externalPolicy(policyPath,exportRoot);validatePolicy(p);
  assert.equal(digest(readFileSync(binary)),closureProfile.authority.binarySha256,"pinned verifier executable mismatch");
  const x=strictJSON(file(exportRoot,"export.json",cap.manifestBytes).toString()) as DecisionExport;
  exact(x,["schema","bundle","genesis","frontier","source","chain","evidenceFiles"]);assert.equal(x.schema,"noseq/p1-decision-export@1");
  exact(x.bundle,["path","sha256"]);safePath(x.bundle.path);assert.equal(x.bundle.path,"source-and-sequence.bundle");hash(x.bundle.sha256,64);assert.equal(x.genesis,p.genesis);hash(x.source);assert.equal(x.source,p.expected.source.commit);
  assert.deepEqual(readdirSync(exportRoot).sort(),["evidence","export.json","source-and-sequence.bundle"],"exact export root inventory");
  exact(x.frontier,["head","depth"]);hash(x.frontier.head);assert(Number.isInteger(x.frontier.depth)&&x.frontier.depth>=p.minimum.depth&&x.frontier.depth<=cap.sequenceDepth,"frontier depth bound/minimum");
  assert.deepEqual(inventory(join(exportRoot,"evidence")),x.evidenceFiles,"exhaustive exported file inventory");
  const bundled=file(exportRoot,x.bundle.path,cap.bundleBytes);assert.equal(digest(bundled),x.bundle.sha256,"bundle digest");const packed=inspectBundle(bundled);
  assert.deepEqual(packed.refs,{"refs/heads/source":x.source,["refs/seq/"+p.genesis]:x.frontier.head},"exact bundle ref binding");
  const repo=join(output,"audit"),bundlePath=join(output,"input.bundle");writeFileSync(bundlePath,bundled,{flag:"wx"});
  io.run("git",["clone","--no-checkout",bundlePath,repo]);
  io.run("git",["-C",repo,"fsck","--strict","--full"]);
  const catalog=io.git(repo,"cat-file","--batch-all-objects","--batch-check=%(objectname) %(objecttype) %(objectsize)").split("\n");
  assert(catalog.length<=cap.gitObjects,"imported object count");let unpacked=0;
  for(const row of catalog){const m=/^([0-9a-f]{40}) (commit|tree|blob|tag) ([0-9]+)$/.exec(row);assert(m,"canonical object inventory");const n=Number(m[3]);assert(n<=cap.gitObjectBytes);unpacked+=n;assert(unpacked<=cap.unpackedGitBytes);}
  assert.equal(catalog.length,packed.objects);assert.equal(unpacked,packed.unpackedBytes);
  io.run(binary,["attach","--repo",repo,"--remote","origin","--genesis",p.genesis]);
  const verified=strictJSON(io.run(binary,["verify","--repo",repo]).stdout.toString());
  const fold=strictJSON(io.gs(binary,repo,"status","--json"),cap.unpackedGitBytes);
  for(const [key,expected]of Object.entries({genesis:p.genesis,head:x.frontier.head,depth:x.frontier.depth}))assert.equal(fold[key],expected,"local fold frontier");
  assert.equal(verified.Genesis,p.genesis);assert.equal(verified.Head,x.frontier.head);assert.equal(verified.Depth,x.frontier.depth);
  assert.equal(verified.Events,fold.projection.decisions.length,"all signed events folded");
  io.git(repo,"merge-base","--is-ancestor",p.minimum.head,x.frontier.head);
  const chain=io.git(repo,"rev-list","--first-parent",x.frontier.head).split("\n");
  assert.equal(chain.at(-1),p.genesis,"complete genesis ancestry");assert.equal(chain.length-1,x.frontier.depth,"complete depth including rotations");
  assert.equal(chain[chain.length-1-p.minimum.depth],p.minimum.head,"external minimum is on exact signed prefix");
  assert.equal(io.git(repo,"rev-parse",x.source+"^{tree}"),p.expected.source.tree,"exact source tree");
  const structural={genesis:p.genesis,frontier:x.frontier,minimum:p.minimum,packed,unpacked,signatureAudit:"pinned gs verify",authorityFold:"pinned local status",network:"sandbox deny network*"};
  writeFileSync(join(output,"structure.json"),JSON.stringify(structural,null,2),{flag:"wx"});
  assert(x.chain,"MISSING_GENUINE_ADOPTION: structurally valid signed export has no selected D/AD/Q/P/R/AR");
  exact(x.chain,["D","AD","Q","P","R","AR"]);const ids=x.chain;
  const canonicalId=(id:string)=>assert(new RegExp("^git:sha1:"+p.genesis+"#git:sha1:[0-9a-f]{40}$").test(id),"canonical room event");
  Object.values(ids).forEach(canonicalId);
  const projection=fold.projection,decision=new Map(projection.decisions.map((s:any)=>[s.event,s]));
  const statements=new Map<string,any>(projection.statements.map((s:any)=>[s.event,s])),acts=new Map<string,any>(projection.acts.map((s:any)=>[s.event,s]));
  const effective=(id:string)=>{canonicalId(id);const d=decision.get(id) as any;assert(d?.verdict==="effective","ineffective/missing signed act");return d.sequence as number;};
  const standing=(id:string)=>{effective(id);const s=statements.get(id);assert(s&&!s.retired&&!s.describes_superseded_world&&!s.world_superseded_at&&!s.ineffective_bases?.length,"retired/missing/superseded-world statement");return s;};
  const bases=(id:string):string[]=>projection.provenance[id]??[];
  const has=(id:string,required:string[])=>required.forEach(r=>assert(bases(id).includes(r),"missing causal basis"));
  const liveActor=(id:string,role:string)=>{const a=projection.actors[id];assert(a&&!a.retired&&a.roles.includes(role),"current principal/role policy");return a;};
  liveActor(p.principals.root,"ratifier");liveActor(p.principals.reviewer,"participant");liveActor(p.principals.implementer,"participant");
  const ratification=(id:string,target:string,actor:string)=>{effective(id);const a=acts.get(id);assert(a?.type==="ratify"&&a.target===target&&a.actor===actor&&a.verdict==="effective"&&!a.retired,"ineffective/retired/wrong ratification");
    const s=standing(target);assert(s.ratified===true&&s.ratified_by===id,"named ratification does not survive at F");};
  const D=standing(ids.D),Q=standing(ids.Q),P=standing(ids.P),R=standing(ids.R);
  assert.equal(D.kind,"propose");assert([p.principals.root,p.principals.implementer].includes(D.actor));assert.equal(D.satisfier,"role:ratifier");
  ratification(ids.AD,ids.D,p.principals.root);ratification(ids.AR,ids.R,Q.actor);
  const positions=Object.values(ids).map(effective);for(let i=1;i<positions.length;i++)assert(positions[i]!>positions[i-1]!,"strict D AD Q P R AR order");assert(positions.at(-1)!<=x.frontier.depth);
  const m=strictJSON(io.git(repo,"show",ids.D.split(":").at(-1)+":attachments/decision.json"));manifest(m);
  assert.equal(D.body?.noseq_protocol_selection,"noseq/p1-decision@1");assert.equal(D.body?.manifest_sha256,digest(JSON.stringify(m)),"D manifest digest");
  assert.deepEqual(m.source,p.expected.source);assert.deepEqual(sorted(m.artifacts.map(a=>a.path)),sorted(p.expected.paths));
  for(const key of ["selection","evidence","requiredCases","decisions"]as const)assert.deepEqual(m[key],p.expected[key],"trusted exact decision expectation: "+key);
  const artifactIds=m.artifacts.map(a=>a.event);for(const a of m.artifacts){const s=standing(a.event);assert.equal(s.kind,"artifact");assert.equal(s.actor,p.principals.implementer);assert.equal(s.body.path,a.path);assert.equal(s.body.commit,m.source.commit);assert(effective(a.event)<positions[0]!);
    assert.equal(io.git(repo,"rev-parse",m.source.commit+":"+a.path),a.blob);const b=io.run("git",["-C",repo,"cat-file","blob",a.blob]).stdout;assert.equal(digest(b),a.sha256);}
  const changed=io.git(repo,"diff","--name-only",m.source.base,m.source.commit).split("\n").filter(Boolean);assert.deepEqual(sorted(changed),sorted(p.expected.paths),"exhaustive changed-path artifacts");
  has(ids.D,artifactIds);has(ids.Q,[ids.D,ids.AD,...artifactIds]);has(ids.P,[ids.Q]);has(ids.R,[ids.P,ids.Q,...artifactIds]);
  assert.equal(Q.kind,"request");assert.equal(Q.actor,p.principals.implementer);assert.equal(Q.body.to,p.principals.reviewer);assert.equal(Q.body.no_git_artifact,"true");
  assert.equal(Q.body.protocol_decision,ids.D);assert.equal(Q.body.protocol_adoption,ids.AD);assert.equal(Q.body.manifest_sha256,D.body.manifest_sha256);assert.equal(Q.body.evidence_sha256,m.evidence.sha256);
  assert.equal(P.kind,"promise");assert.equal(P.actor,p.principals.reviewer);assert.equal(R.kind,"report");assert.equal(R.actor,p.principals.reviewer);assert.equal(R.satisfier,"originating-requester");
  assert.equal(Q.lifecycle,"request");assert.equal(P.lifecycle,"promise");assert.equal(R.lifecycle,"report");
  assert.equal(R.body.review_path,"reviewguard@1");assert.equal(R.body.verdict,"approved");assert.equal(R.body.head,m.source.commit);assert(artifactIds.includes(R.body.artifact));
  const review=projection.reviews.find((r:any)=>r.report===ids.R);assert(review?.verdict==="approved"&&review.independence==="independent"&&review.implementer===p.principals.implementer&&review.reviewer===p.principals.reviewer&&review.head===m.source.commit&&review.ratified&&!review.retired,"actual guarded independent review binding");
  const commitment=projection.commitments.find((c:any)=>c.request===ids.Q&&c.promise===ids.P);assert(commitment&&commitment.requester===Q.actor&&commitment.performer===p.principals.reviewer&&commitment.report===ids.R&&commitment.status==="satisfied","review promise/report/request settlement");
  if(R.body.binding==="self-initiated")assert.equal(R.body.decision,ids.D);
  else{assert.equal(R.body.binding,"assigned","guarded implementation binding required");const witnesses=strictJSON(R.body.implementations);unique(witnesses);
    for(const witness of witnesses){const c=projection.commitments.find((c:any)=>(c.promise??c.report)===witness&&artifactIds.includes(c.report));assert(c&&c.performer===p.principals.implementer,"assigned exact artifact/report binding");standing(c.request);standing(witness);}}
  const r=strictJSON(R.text) as DecisionReview;exact(r,["schema","scope","D","AD","manifestSha256","source","artifacts","selection","evidence","requiredCases","decisions","findings","summary"]);
  assert.equal(r.schema,"noseq/p1-decision-review@1");assert.equal(r.scope,"decision-approval","publication-only review is insufficient");assert.equal(r.D,ids.D);assert.equal(r.AD,ids.AD);assert.equal(r.manifestSha256,D.body.manifest_sha256);
  for(const key of ["source","artifacts","selection","evidence","requiredCases","decisions"]as const)assert.deepEqual(r[key],m[key],"independent exact review binding: "+key);
  assert(Array.isArray(r.findings)&&r.findings.length===0&&typeof r.summary==="string"&&r.summary.length>0,"independent approval findings");
  const selections=projection.statements.filter((s:any)=>s.kind==="propose"&&s.body?.noseq_protocol_selection==="noseq/p1-decision@1"&&s.ratified&&!s.retired);
  assert.equal(selections.length,1,"conflicting active protocol selections");assert.equal(selections[0].event,ids.D);
  const extracted=join(output,"source");mkdirSync(extracted);
  for(const row of io.git(repo,"ls-tree","-r",m.source.commit).split("\n")){const match=/^(100644|100755) blob ([0-9a-f]{40})\t(.+)$/.exec(row);assert(match,"source symlink/submodule/special object refused");const path=match[3]!;safePath(path);mkdirSync(dirname(join(extracted,path)),{recursive:true});writeFileSync(join(extracted,path),io.run("git",["-C",repo,"cat-file","blob",match[2]!]).stdout,{flag:"wx"});}
  assert.equal(digest(file(extracted,m.selection.profilePath)),m.selection.profileSha256,"selected source profile bytes");
  for(const [path,sha]of Object.entries(m.selection.inputProfiles))assert.equal(digest(file(extracted,path)),sha);
  copyEvidence(join(exportRoot,"evidence"),extracted,x.evidenceFiles);
  const closure=verifyDetachedEvidence(extracted,m);assert.deepEqual(closure.files,x.evidenceFiles,"no omitted or extra evidence bytes");
  const result={schema:"noseq/p1-decision-result@1",mode:p.mode,validAt:x.frontier,genesis:p.genesis,source:m.source,chain:ids,
    manifestSha256:D.body.manifest_sha256,evidenceSha256:m.evidence.sha256,cases:closure.cases.length,
    ordinaryStaleness:[D,Q,P,R,...m.artifacts.map(a=>standing(a.event))].filter(s=>s.stale).map(s=>s.event),
    conclusion:"valid detached authority at named F only; diagnostic, no production adoption or gate activation"};
  writeFileSync(join(output,"result.json"),JSON.stringify(result,null,2),{flag:"wx"});return result;
}
