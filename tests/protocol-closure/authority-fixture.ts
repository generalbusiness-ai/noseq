import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cap, closureProfile, digest, file, Offline, strictJSON, trustedSource } from "../../scripts/decision-io.ts";
import { copyEvidence, evidenceClosure } from "../../scripts/decision-evidence.ts";
import type { DecisionExport, DecisionManifest, DecisionPolicy, DecisionReview } from "../../scripts/decision-types.ts";
export const archived={source:{commit:"756bf4f9b28b5b42f85b4cd32814e7c83041050f",tree:"ee106c2037f3132d576b5463e1605ea81ac26833",base:"1d4d775b342a34a32ca1690c461071b7010a9282"},
  path:"artifacts/segmented-recovery/runs/6cf47684-b1be-413d-abb5-4402394af597/evidence.json",
  sha256:"7778b3f165cc5681191cdb3591888ed30b17a3030870976ed682e14bfc6a3ba4"};
// The exact archived SHA below is checked from retained bytes, never replaced with
// current-source results. Fixture policy is generated outside the exported bundle.
export async function authorityFixture(directory:string,binary:string,archiveRoot:string) {
  mkdirSync(directory);const io=new Offline(join(directory,"generation")),repo=join(directory,"room"),suffix=randomUUID();
  const names={root:"synthetic-root-"+suffix,reviewer:"synthetic-reviewer-"+suffix,implementer:"synthetic-builder-"+suffix};
  io.run("git",["init","-b","main",repo]);io.git(repo,"fetch","--no-tags",trustedSource,archived.source.commit);io.git(repo,"reset","--hard",archived.source.commit);
  const init=strictJSON(io.run(binary,["init","--repo",repo,"--operator",names.root]).stdout.toString());
  const root=init.operator.fingerprint,genesis=init.genesis,seed=init.seed;
  const implementer=strictJSON(io.gs(binary,repo,"actor-add","--as",names.root,"--name",names.implementer,"--kind","agent")).actor.fingerprint;
  const reviewer=strictJSON(io.gs(binary,repo,"actor-add","--as",names.root,"--name",names.reviewer,"--kind","agent")).actor.fingerprint;
  const state=(actor:keyof typeof names,kind:string,text:string,body:Record<string,string>,rests:string[],attachments:Record<string,string>={})=>
    io.gs(binary,repo,"state","--as",names[actor],"--kind",kind,"--text",text,...Object.entries(body).flatMap(([k,v])=>["--body",k+"="+v]),
      ...rests.flatMap(id=>["--rests-on",id]),...Object.entries(attachments).flatMap(([k,v])=>["--evidence",k+"="+v]));
  const ratify=(actor:keyof typeof names,target:string)=>io.gs(binary,repo,"ratify","--as",names[actor],target);
  const request=state("root","request","Synthetic fixture only: attest the exact archived P1d source and evidence; no Noseq adoption.",
    {to:implementer,conditions:"Record all exact archived changed paths for isolated validator fixtures.",target_ref:"refs/heads/main"},[seed]);
  const promise=state("implementer","promise","Synthetic implementation fixture promise.",{},[request]);
  const paths=io.git(repo,"diff","--name-only",archived.source.base,archived.source.commit).split("\n");
  const artifacts=paths.map(path=>({path,blob:io.git(repo,"rev-parse",archived.source.commit+":"+path),
    sha256:digest(io.run("git",["-C",repo,"show",archived.source.commit+":"+path]).stdout),
    event:state("implementer","artifact","Synthetic exact archived artifact, not real adoption.",{path,commit:archived.source.commit},[promise])}));
  const prior=strictJSON(file(archiveRoot,archived.path).toString()),closure=evidenceClosure(archiveRoot,archived.path);
  assert.equal(digest(file(archiveRoot,archived.path)),"7778b3f165cc5681191cdb3591888ed30b17a3030870976ed682e14bfc6a3ba4","immutable original P1d evidence");
  const manifest:DecisionManifest={schema:"noseq/p1-decision@1",scope:"conditional-selection-requiring-independent-review",source:archived.source,artifacts,
    selection:{ordering:closureProfile.ordering,recovery:closureProfile.recovery,profilePath:"fixtures/crypto/segmented/profile.json",
      profileSha256:closureProfile.inputProfiles["fixtures/crypto/segmented/profile.json"],inputProfiles:closureProfile.inputProfiles,identities:prior.context},
    evidence:{path:archived.path,sha256:digest(file(archiveRoot,archived.path)),filesSha256:digest(JSON.stringify(closure.files)),context:prior.context,kind:"archived-p1d-test-only"},
    requiredCases:closure.cases,decisions:closureProfile.decisions};
  const manifestPath=join(directory,"decision.json");writeFileSync(manifestPath,JSON.stringify(manifest),{flag:"wx"});
  const D=state("implementer","propose","Synthetic conditional selection fixture; only this isolated room and test policy.",
    {noseq_protocol_selection:manifest.schema,manifest_sha256:digest(JSON.stringify(manifest))},artifacts.map(a=>a.event),{"decision.json":manifestPath});
  const AD=ratify("root",D);
  const Q=state("implementer","request","Synthetic independent decision review with corrected acyclic order.",
    {to:reviewer,no_git_artifact:"true",conditions:"Review exact signed decision, prior adoption, source/evidence/cases and D1-D9 under synthetic policy only.",protocol_decision:D,protocol_adoption:AD,
      manifest_sha256:digest(JSON.stringify(manifest)),evidence_sha256:manifest.evidence.sha256},[D,AD,...artifacts.map(a=>a.event)]);
  const P=state("reviewer","promise","Synthetic independent review promise; no real-room identity or adoption.",{},[Q]);
  const review:DecisionReview={schema:"noseq/p1-decision-review@1",scope:"decision-approval",D,AD,manifestSha256:digest(JSON.stringify(manifest)),
    source:manifest.source,artifacts,selection:manifest.selection,evidence:manifest.evidence,requiredCases:manifest.requiredCases,decisions:manifest.decisions,findings:[],
    summary:"Synthetic fixture approval attests archived P1d evidence solely to exercise verifier predicates. It cannot activate real Noseq gates."};
  const reviewArtifacts=[artifacts.at(-1)!,...artifacts.slice(0,-1)]; // The final exact-path artifact is this promise's projected report.
  const R=io.gs(binary,repo,"review","--as",names.reviewer,"--checkout",repo,...reviewArtifacts.flatMap(a=>["--artifact",a.event]),
    "--promise",P,"--implementation",promise,"--verdict","approved","--text",JSON.stringify(review));
  const AR=ratify("implementer",R);
  const fold=strictJSON(io.gs(binary,repo,"status","--json"),cap.unpackedGitBytes);
  const policy:DecisionPolicy={schema:"noseq/p1-decision-policy@1",mode:"synthetic-only",genesis,principals:{root,reviewer,implementer},minimum:{head:fold.head,depth:fold.depth},
    expected:{source:manifest.source,paths,selection:manifest.selection,evidence:manifest.evidence,requiredCases:manifest.requiredCases,decisions:manifest.decisions}};
  const policyPath=join(directory,"trusted-policy.json");writeFileSync(policyPath,JSON.stringify(policy),{flag:"wx"});
  const chain={D,AD,Q,P,R,AR};
  return {directory,io,repo,binary,archiveRoot,names,genesis,seed,request,promise,manifest,review,policy,policyPath,chain,state,ratify,closure};
}
export type AuthorityFixture=Awaited<ReturnType<typeof authorityFixture>>;
export function exportFixture(f:AuthorityFixture,directory:string,frontier?:{head:string;depth:number}) {
  mkdirSync(directory);mkdirSync(join(directory,"evidence"));const fold=frontier??strictJSON(f.io.gs(f.binary,f.repo,"status","--json"),cap.unpackedGitBytes);
  f.io.git(f.repo,"update-ref","refs/heads/source",f.manifest.source.commit);
  f.io.git(f.repo,"bundle","create",join(directory,"source-and-sequence.bundle"),"refs/heads/source","refs/seq/"+f.genesis);
  copyEvidence(f.archiveRoot,join(directory,"evidence"),f.closure.files);
  const x:DecisionExport={schema:"noseq/p1-decision-export@1",bundle:{path:"source-and-sequence.bundle",sha256:digest(file(directory,"source-and-sequence.bundle",cap.bundleBytes))},
    genesis:f.genesis,frontier:{head:fold.head,depth:fold.depth},source:f.manifest.source.commit,chain:f.chain,evidenceFiles:f.closure.files};
  writeFileSync(join(directory,"export.json"),JSON.stringify(x),{flag:"wx"});return x;
}
