import { beforeAll, test } from "vitest";
import { strict as assert } from "node:assert";
import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { cap, closureProfile, digest, file, inventory, Offline, strictJSON, trustedSource } from "../../scripts/decision-io.ts";
import { evidenceClosure, verifyDetachedEvidence } from "../../scripts/decision-evidence.ts";
import { pinnedVerifier } from "../../scripts/decision-verifier-build.ts";
import { authorityFixture, exportFixture, type AuthorityFixture } from "./authority-fixture.ts";
import { alterExport, Challenges, ratify, retire, reviewAgain, rewriteTip, rotate, selectAgain, state, writePolicy } from "./authority-challenges.ts";
import { capacityChallenges } from "./authority-capacity.ts";
let f:AuthorityFixture,c:Challenges;
beforeAll(async()=>{
  assert(process.env.NOSEQ_CLOSURE_RUN&&process.env.NOSEQ_P1D_ARCHIVE,"NOSEQ_CLOSURE_RUN and NOSEQ_P1D_ARCHIVE required");
  const root=join(process.env.NOSEQ_CLOSURE_RUN,"authority");mkdirSync(root);
  f=await authorityFixture(join(root,"base"),pinnedVerifier().binary,resolve(process.env.NOSEQ_P1D_ARCHIVE));c=new Challenges(join(root,"challenges"),f);
});
test("authority.valid-independent-order",()=>{
  const v=c.variant("valid-independent-order");const r=c.audit(v,"valid",null);assert.equal(r.result.cases,115);
  const rotation=rotate(v);state(v,"root","assert","Synthetic statement after actual sequencer rotation.",{},[v.seed]);
  const result=c.audit(v,"rotation",null);assert(result.result.validAt.depth>r.result.validAt.depth);c.write("valid-independent-order");
});
test("authority.signature-and-git-integrity",()=>{
  const signed=c.variant("invalid-signature"),frontier=rewriteTip(signed,text=>text.replace(/(gpgsig -----BEGIN SSH SIGNATURE-----\n )([A-Za-z0-9])/,(_m,a,b)=>a+(b==="A"?"B":"A")));
  const directory=join(signed.directory,"export");exportFixture(signed,directory,frontier);c.audit(signed,"signature","signature",directory);
  const payload=c.variant("invalid-payload-tree"),pfrontier=rewriteTip(payload,text=>text.replace(/^tree [0-9a-f]{40}/,"tree "+payload.manifest.source.tree));
  const pdir=join(payload.directory,"export");exportFixture(payload,pdir,pfrontier);c.audit(payload,"payload","signature",pdir);
  const packed=c.variant("invalid-pack");const dir=join(packed.directory,"export");exportFixture(packed,dir);
  const path=join(dir,"source-and-sequence.bundle"),data=readFileSync(path);data[data.length-32]=data[data.length-32]!^1;writeFileSync(path,data);alterExport(dir,x=>x.bundle.sha256=digest(data));
  c.audit(packed,"pack","pack checksum",dir);
  const attachment=c.variant("invalid-signed-attachment");selectAgain(attachment,m=>{m.decisions.D3="forged acknowledgement";});
  c.audit(attachment,"attachment","exact D1-D9 acknowledgements",undefined);
  c.write("signature-and-git-integrity");
});
test("authority.actor-and-authority",()=>{
  const wrong=c.variant("foreign-authority");wrong.policy.principals.root="a".repeat(64);writePolicy(wrong);c.audit(wrong,"root","current principal/role policy");
  const role=c.variant("retired-reviewer");role.io.gs(role.binary,role.repo,"actor-retire","--as",role.names.root,"--actor",role.names.reviewer);c.audit(role,"reviewer","current principal/role policy");
  const self=c.variant("self-review");
  const selfQ=state(self,"root","request","Synthetic deliberately non-independent review request.",{to:self.policy.principals.implementer,no_git_artifact:"true",conditions:"Must be refused as self-review."},[self.chain.D,self.chain.AD,...self.manifest.artifacts.map(a=>a.event)]);
  const selfP=state(self,"implementer","promise","Synthetic deliberately non-independent promise.",{},[selfQ]);
  c.attempt(self,"guarded-self-review",()=>self.io.gs(self.binary,self.repo,"review","--as",self.names.implementer,"--checkout",self.repo,
    ...[self.manifest.artifacts.at(-1)!,...self.manifest.artifacts.slice(0,-1)].flatMap(a=>["--artifact",a.event]),"--promise",selfP,"--implementation",self.promise,"--verdict","approved","--text","Synthetic self-review must refuse"),"reviewer");
  const borrowed=c.variant("borrowed-real-principal");borrowed.policy.principals.root=closureProfile.authority.realRoot;writePolicy(borrowed);c.audit(borrowed,"borrowed","synthetic fixture cannot borrow real principals");
  const foreign=c.variant("foreign-genesis");foreign.policy.genesis="b".repeat(40);writePolicy(foreign);c.audit(foreign,"genesis","AssertionError");
  const ineffective=c.variant("ineffective-root-ratification");retire(ineffective,ineffective.chain.AD);ineffective.chain.AD=ratify(ineffective,"reviewer",ineffective.chain.D);c.audit(ineffective,"ineffective","ineffective/missing signed act");
  c.write("actor-and-authority");
});
test("authority.decision-chain-bindings",()=>{
  for(const part of ["D","AD","Q","P","R","AR"]as const){const v=c.variant("missing-"+part.toLowerCase());const dir=join(v.directory,"export");exportFixture(v,dir);alterExport(dir,x=>delete x.chain[part]);c.audit(v,"missing","unknown or missing fields",dir);}
  const noBasis=c.variant("review-missing-ad-basis");reviewAgain(noBasis,()=>{},"approved",true);c.audit(noBasis,"basis","missing causal basis");
  const replacement=c.variant("replacement-ad-old-review");retire(replacement,replacement.chain.AD);replacement.chain.AD=ratify(replacement,"root",replacement.chain.D);c.audit(replacement,"order","strict D AD Q P R AR order");
  const exactReview=c.variant("fresh-reviewed-ad");retire(exactReview,exactReview.chain.AD);exactReview.chain.AD=ratify(exactReview,"root",exactReview.chain.D);reviewAgain(exactReview);c.audit(exactReview,"replacement",null);
  c.write("decision-chain-bindings");
});
test("authority.review-and-ratification",()=>{
  const changed=c.variant("changes-requested");reviewAgain(changed,()=>{},"changes-requested");c.audit(changed,"changed","approved");
  const publication=c.variant("publication-only");reviewAgain(publication,r=>{(r as any).scope="publication-only";});c.audit(publication,"publication","publication-only review is insufficient");
  const binding=c.variant("wrong-review-manifest");reviewAgain(binding,r=>r.manifestSha256="0".repeat(64));c.audit(binding,"manifest","AssertionError");
  const fields=c.variant("extra-review-field");reviewAgain(fields,r=>{(r as any).approved=true;});c.audit(fields,"unknown","unknown or missing fields");
  const acknowledgement=c.variant("missing-review-acknowledgement");reviewAgain(acknowledgement,r=>{delete r.decisions.D7;});c.audit(acknowledgement,"acknowledgement","independent exact review binding: decisions");
  c.write("review-and-ratification");
});
test("authority.source-profile-evidence",()=>{
  const source=c.variant("wrong-source");source.policy.expected.source.tree="0".repeat(40);writePolicy(source);c.audit(source,"source","exact source tree");
  const profile=c.variant("wrong-profile");profile.policy.expected.selection.profileSha256="0".repeat(64);writePolicy(profile);c.audit(profile,"profile","trusted exact decision expectation: selection");
  const cases=c.variant("wrong-required-case");cases.policy.expected.requiredCases[0]="missing.mandatory.case";writePolicy(cases);c.audit(cases,"cases","trusted exact decision expectation: requiredCases");
  const paths=c.variant("missing-artifact");paths.policy.expected.paths.pop();writePolicy(paths);c.audit(paths,"paths","AssertionError");
  const omitted=c.variant("omitted-raw-file"),dir=join(omitted.directory,"export");exportFixture(omitted,dir);const target=Object.keys(omitted.closure.files).find(p=>p.endsWith("/node.json"))!;rmSync(join(dir,"evidence",target));c.audit(omitted,"missing","exhaustive exported file inventory",dir);
  const corrupt=c.variant("corrupt-raw-file"),rawdir=join(corrupt.directory,"export");exportFixture(corrupt,rawdir);writeFileSync(join(rawdir,"evidence",target),"{}");alterExport(rawdir,x=>x.evidenceFiles=inventory(join(rawdir,"evidence")));c.audit(corrupt,"corrupt","referenced raw bytes changed",rawdir);
  // Dishonest but actually signed D/AD/R/AR and a matching external test policy
  // still cannot bless a rehashed failed raw report through the strict E checker.
  const rehash=c.variant("signed-rehashed-failed-report"),altered=join(rehash.directory,"altered-evidence");mkdirSync(altered);for(const path of Object.keys(rehash.closure.files)){mkdirSync(join(altered,path.substring(0,path.lastIndexOf("/"))),{recursive:true});cpSync(join(rehash.archiveRoot,path),join(altered,path));}
  const epath=rehash.manifest.evidence.path,e=JSON.parse(readFileSync(join(altered,epath),"utf8")),report=epath.replace("evidence.json","node.json"),raw=JSON.parse(readFileSync(join(altered,report),"utf8"));
  raw.numFailedTests=1;writeFileSync(join(altered,report),JSON.stringify(raw));e.suites.find((s:any)=>s.id==="node").reportSha256=digest(readFileSync(join(altered,report)));writeFileSync(join(altered,epath),JSON.stringify(e));
  rehash.archiveRoot=altered;rehash.closure=evidenceClosure(altered,epath);rehash.manifest.evidence.sha256=digest(file(altered,epath));rehash.manifest.evidence.filesSha256=digest(JSON.stringify(rehash.closure.files));rehash.policy.expected.evidence=structuredClone(rehash.manifest.evidence);writePolicy(rehash);selectAgain(rehash);c.audit(rehash,"rehashed","Vitest numFailedTests must be zero");
  const old=c.variant("archived-not-p1e");old.policy.mode="real-diagnostic";old.policy.genesis=closureProfile.authority.realGenesis;old.policy.principals={root:closureProfile.authority.realRoot,reviewer:closureProfile.authority.realReviewer,implementer:closureProfile.authority.realImplementer};writePolicy(old);c.audit(old,"old-contract","p1e-closure");
  const oldSource=structuredClone(f.manifest);oldSource.source.commit=f.io.git(trustedSource,"rev-parse","HEAD");oldSource.source.tree=f.io.git(trustedSource,"rev-parse","HEAD^{tree}");
  c.attempt(old,"archived-vs-current-source",()=>verifyDetachedEvidence(f.archiveRoot,oldSource),"evidence source binding");
  const oldCases=structuredClone(f.manifest);oldCases.requiredCases=[...oldCases.requiredCases,...closureProfile.suites.flatMap((s:any)=>s.cases),...closureProfile.authorityCases].sort();
  c.attempt(old,"archived-vs-current-cases",()=>verifyDetachedEvidence(f.archiveRoot,oldCases),"exhaustive required-case contract");
  const oldProfile=structuredClone(f.manifest);(oldProfile.evidence.context as any).profile=digest(file(trustedSource,"fixtures/crypto/closure/profile.json"));
  c.attempt(old,"archived-vs-current-profile",()=>verifyDetachedEvidence(f.archiveRoot,oldProfile),"externally expected evidence context");
  c.write("source-profile-evidence");
});
test("authority.retirement-and-selection",()=>{
  for(const part of ["D","AD","R","AR"]as const){const v=c.variant("retired-"+part.toLowerCase());retire(v,v.chain[part]);c.audit(v,"retired",part==="D"||part==="R"?"retired/missing/superseded-world statement":"named ratification does not survive at F");}
  const conflict=c.variant("conflicting-selections");selectAgain(conflict,()=>{},false);c.audit(conflict,"conflict","conflicting active protocol selections");
  const ordinary=c.variant("ordinary-staleness"),reason=state(ordinary,"root","assert","Synthetic reasoning input, not source-world lineage.",{},[ordinary.seed]);
  selectAgain(ordinary,()=>{},true,[reason]);retire(ordinary,reason);const result=c.audit(ordinary,"ordinary",null);assert(result.result.ordinaryStaleness.length>0);
  const artifact=c.variant("retired-source-artifact");retire(artifact,artifact.manifest.artifacts[0]!.event);c.audit(artifact,"artifact","retired/missing/superseded-world statement");
  const world=c.variant("superseded-source-world"),predecessor=world.manifest.artifacts[0]!;
  const successor=state(world,"implementer","artifact","Synthetic source-world successor with an explicit artifact lineage.",{path:predecessor.path,commit:world.manifest.source.commit},[world.promise,predecessor.event]);
  world.manifest.artifacts[0]={...predecessor,event:successor};selectAgain(world);retire(world,predecessor.event);c.audit(world,"world","retired/missing/superseded-world statement");
  c.write("retirement-and-selection");
});
test("authority.frontier-and-history",()=>{
  const v=c.variant("historical-revocation"),old=join(v.directory,"old-export");exportFixture(v,old);c.audit(v,"before-revocation",null,old);
  const revocation=retire(v,v.chain.D),fold=strictJSON(v.io.gs(v.binary,v.repo,"status","--json"),cap.unpackedGitBytes);
  v.policy.minimum={head:fold.head,depth:fold.depth};writePolicy(v);c.audit(v,"minimum-includes-revocation","frontier depth bound/minimum",old);
  c.audit(v,"revoked-current","retired/missing/superseded-world statement");
  const siblingA=c.variant("sibling-a"),sibling=c.variant("sibling-frontier"),a=state(siblingA,"root","assert","Synthetic sibling A",{},[siblingA.seed]);
  const aHead=a.split(":").at(-1)!;
  state(sibling,"root","assert","Synthetic sibling B",{},[sibling.seed]);sibling.policy.minimum={head:aHead,depth:sibling.policy.minimum.depth+1};writePolicy(sibling);
  c.audit(sibling,"sibling","git failed");
  const missing=c.variant("missing-governance-prefix"),directory=join(missing.directory,"export");exportFixture(missing,directory);
  const packed=join(directory,"source-and-sequence.bundle");rmSync(packed);missing.io.git(missing.repo,"bundle","create",packed,"refs/heads/source","refs/seq/"+missing.genesis,"^"+missing.chain.AD.split(":").at(-1));alterExport(directory,x=>x.bundle.sha256=digest(readFileSync(packed)));c.audit(missing,"incomplete","exact source and sequence refs required",directory);
  const rotation=c.variant("missing-rotation-prefix"),rotationId=rotate(rotation);state(rotation,"root","assert","Synthetic signed continuation after rotation.",{},[rotation.seed]);
  const rotationDir=join(rotation.directory,"export");exportFixture(rotation,rotationDir);const rotationPack=join(rotationDir,"source-and-sequence.bundle");rmSync(rotationPack);
  rotation.io.git(rotation.repo,"bundle","create",rotationPack,"refs/heads/source","refs/seq/"+rotation.genesis,"^"+rotationId);alterExport(rotationDir,x=>x.bundle.sha256=digest(readFileSync(rotationPack)));c.audit(rotation,"missing-rotation","exact source and sequence refs required",rotationDir);
  c.write("frontier-and-history");
});
test("authority.paths-and-resources",()=>{
  const duplicate=c.variant("duplicate-export-field"),dir=join(duplicate.directory,"export");exportFixture(duplicate,dir);const exp=join(dir,"export.json"),text=readFileSync(exp,"utf8");writeFileSync(exp,text.replace(/^\{/,"{\"schema\":\"attacker\","));c.audit(duplicate,"duplicate","duplicate JSON field",dir);
  const unknown=c.variant("unknown-export-field"),ud=join(unknown.directory,"export");exportFixture(unknown,ud);alterExport(ud,x=>x.approved=true);c.audit(unknown,"unknown","unknown or missing fields",ud);
  const path=c.variant("traversal"),pd=join(path.directory,"export");exportFixture(path,pd);alterExport(pd,x=>x.bundle.path="../escape.bundle");c.audit(path,"path","unsafe relative path",pd);
  const symbolic=c.variant("symlink"),sd=join(symbolic.directory,"export");exportFixture(symbolic,sd);const raw=Object.keys(symbolic.closure.files)[0]!,location=join(sd,"evidence",raw);rmSync(location);symlinkSync(join(symbolic.archiveRoot,raw),location);c.audit(symbolic,"symlink","symlink refused",sd);
  const nested=c.variant("bundle-policy"),nd=join(nested.directory,"export");exportFixture(nested,nd);cpSync(nested.policyPath,join(nd,"policy.json"));c.audit(nested,"embedded","bundle-supplied policy refused",nd,join(nd,"policy.json"));
  const size=c.variant("oversized-bundle"),bd=join(size.directory,"export");exportFixture(size,bd);truncateSync(join(bd,"source-and-sequence.bundle"),cap.bundleBytes+1);c.audit(size,"bytes","file type/byte capacity",bd);
  const manifest=c.variant("oversized-manifest"),md=join(manifest.directory,"export");exportFixture(manifest,md);truncateSync(join(md,"export.json"),cap.manifestBytes+1);c.audit(manifest,"manifest","file type/byte capacity",md);
  const rawcap=c.variant("oversized-evidence-file"),rd=join(rawcap.directory,"export");exportFixture(rawcap,rd);truncateSync(join(rd,"evidence",Object.keys(rawcap.closure.files)[0]!),cap.evidenceFileBytes+1);c.audit(rawcap,"raw","file type/byte capacity",rd);
  const depth=c.variant("oversized-frontier"),dd=join(depth.directory,"export");exportFixture(depth,dd);alterExport(dd,x=>x.frontier.depth=cap.sequenceDepth+1);c.audit(depth,"depth","frontier depth bound/minimum",dd);
  capacityChallenges(c);
  c.write("paths-and-resources");
});
test("authority.real-public-missing-adoption",()=>{
  // Complete real public sequence, no local actor custody, no manufactured adoption.
  const v=c.variant("real-public"),repo=join(v.directory,"real-staging.git"),directory=join(v.directory,"export");mkdirSync(directory);mkdirSync(join(directory,"evidence"));
  const realRoot=process.env.NOSEQ_REAL_REPOSITORY;assert(realRoot,"NOSEQ_REAL_REPOSITORY required for real offline public audit");
  const genesis=closureProfile.authority.realGenesis,head=v.io.git(resolve(realRoot),"rev-parse","refs/seq/"+genesis),depth=Number(v.io.git(resolve(realRoot),"rev-list","--count",head))-1;
  const source=v.io.git(trustedSource,"rev-parse","HEAD"),tree=v.io.git(trustedSource,"rev-parse","HEAD^{tree}");
  v.io.run("git",["init","--bare",repo]);v.io.git(repo,"fetch","--no-tags",resolve(realRoot),head+":refs/seq/"+genesis);v.io.git(repo,"fetch","--no-tags",trustedSource,source+":refs/heads/source");
  const bundle=join(directory,"source-and-sequence.bundle");v.io.git(repo,"bundle","create",bundle,"refs/heads/source","refs/seq/"+genesis);
  const policy=structuredClone(v.policy);policy.mode="real-diagnostic";policy.genesis=genesis;policy.principals={root:closureProfile.authority.realRoot,reviewer:closureProfile.authority.realReviewer,implementer:closureProfile.authority.realImplementer};policy.minimum={head,depth};
  policy.expected.source={commit:source,tree,base:closureProfile.base};policy.expected.selection.profilePath="fixtures/crypto/closure/profile.json";policy.expected.selection.profileSha256=digest(file(trustedSource,policy.expected.selection.profilePath));policy.expected.evidence.kind="p1e-closure";
  // No D is selected, so structural audit must finish then refuse before nonexistent final E is considered.
  policy.expected.requiredCases=[...policy.expected.requiredCases,...closureProfile.suites.flatMap((s:any)=>s.cases),...closureProfile.authorityCases].sort();
  writeFileSync(v.policyPath,JSON.stringify(policy));
  writeFileSync(join(directory,"export.json"),JSON.stringify({schema:"noseq/p1-decision-export@1",bundle:{path:"source-and-sequence.bundle",sha256:digest(readFileSync(bundle))},genesis,frontier:{head,depth},source,chain:null,evidenceFiles:{}}));
  const r=c.audit(v,"real","MISSING_GENUINE_ADOPTION",directory);
  const structure=JSON.parse(readFileSync(join(r.output,"structure.json"),"utf8"));assert.equal(structure.genesis,genesis);assert.equal(structure.frontier.head,head);
  c.write("real-public-missing-adoption");
});
