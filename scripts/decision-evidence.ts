import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { validateSegmented, verifySegmentedFiles } from "./segmented-recovery-evidence.ts";
import { cap, digest, exact, file, safePath, strictJSON } from "./decision-io.ts";
import type { DecisionManifest } from "./decision-types.ts";
import { validateClosure, verifyClosureFiles } from "./protocol-closure-evidence.ts";

export function evidenceClosure(root:string,path:string) {
  const files:Record<string,{sha256:string;bytes:number}>={},records:any[]=[],seen=new Set<string>();let total=0,count=0;
  const add=(p:string,sha?:string)=>{safePath(p);const b=file(root,p);if(sha)assert.equal(digest(b),sha,"referenced raw bytes changed");
    if(p.endsWith(".json"))strictJSON(b.toString(),cap.evidenceFileBytes);
    if(!files[p]){total+=b.length;assert(total<=cap.evidenceBytes&&++count<=cap.evidenceFiles,"evidence closure capacity");files[p]={sha256:digest(b),bytes:b.length};}return b;};
  const walk=(p:string)=>{
    assert(!seen.has(p),"cyclic/duplicate prerequisite evidence");seen.add(p);const e=strictJSON(add(p).toString());records.push(e);const dir=dirname(p);
    assert(["noseq/evidence@1","noseq/crypto-preflight@1","noseq/ordered-mls-probe@1","noseq/protocol-feasibility@1","noseq/segmented-feasibility@1","noseq/protocol-closure@1"].includes(e.schema),"unknown evidence schema");
    assert(Array.isArray(e.suites)&&e.suites.length>0,"actual evidence suites");
    for(const s of e.suites){assert(/^[a-z]+$/.test(s.id),"safe raw suite ID");add(dir+"/"+s.id+".json",s.reportSha256);}
    for(const key of ["observations","commands","gatewayArtifacts"])
      for(const [name,sha]of Object.entries(e[key]??{})){safePath(name);assert(typeof sha==="string");add(dir+"/"+name,sha);}
    for(const [key,prefix]of [["browserBundle","browser-bundle"],["native",e.schema==="noseq/protocol-feasibility@1"?"native-relay":"native"],["authorityArtifacts","authority-public"]])
      for(const [name,sha]of Object.entries(e[key!]??{})){safePath(name);assert(typeof sha==="string");add(dir+"/"+prefix+"/"+name,sha);}
    for(const r of e.prerequisite?[e.prerequisite]:Object.values(e.prerequisites??{})){
      assert(r&&typeof r==="object"&&typeof(r as any).path==="string"&&typeof(r as any).sha256==="string","prerequisite reference");
      add((r as any).path,(r as any).sha256);walk((r as any).path);
    }
  };walk(path);
  const cases=records.flatMap(e=>e.suites.flatMap((s:any)=>s.cases.map((c:any)=>{assert.equal(c.status,"passed");return c.id as string;}))).sort();
  assert.equal(new Set(cases).size,cases.length,"duplicate cross-stage cases");
  return {files:Object.fromEntries(Object.entries(files).sort(([a],[b])=>a.localeCompare(b))),records,cases,total};
}
export function copyEvidence(root:string,destination:string,files:Record<string,{sha256:string;bytes:number}>) {
  for(const [path,expected]of Object.entries(files)){exact(expected,["sha256","bytes"]);const b=file(root,path);assert.equal(b.length,expected.bytes);assert.equal(digest(b),expected.sha256);
    mkdirSync(dirname(join(destination,path)),{recursive:true});writeFileSync(join(destination,path),b,{flag:"wx"});}
}

// This checker is the trusted installed implementation. Source extracted from an
// export is data only: none of its scripts, config loaders, packages or hooks run.
export function verifyDetachedEvidence(sourceRoot:string,manifest:DecisionManifest) {
  const expected=manifest.evidence,closure=evidenceClosure(sourceRoot,expected.path);
  assert.equal(digest(file(sourceRoot,expected.path)),expected.sha256,"exact signed evidence digest");
  assert.equal(digest(JSON.stringify(closure.files)),expected.filesSha256,"exhaustive evidence closure digest");
  assert.deepEqual(closure.cases,manifest.requiredCases,"exhaustive required-case contract");
  const e=closure.records[0];assert.deepEqual(e.context,expected.context,"externally expected evidence context");
  assert.deepEqual(manifest.selection.identities,e.context,"selected provider/runtime identities bind actual evidence");
  const segmented=e.schema==="noseq/segmented-feasibility@1"?e:closure.records.find(r=>r.schema==="noseq/segmented-feasibility@1");assert(segmented,"complete segmented prerequisites required");
  const baseline=segmented.context.protocol.ordered.preflight.baseline;
  assert.deepEqual(baseline.source,{commit:manifest.source.commit,tree:manifest.source.tree},"evidence source binding");
  const checkFiles=(files:Record<string,string>)=>{for(const [path,sha]of Object.entries(files)){safePath(path);assert.equal(digest(file(sourceRoot,path)),sha,"source fixture identity");}};
  assert.equal(digest(file(sourceRoot,"package-lock.json")),baseline.lockfileSha256);checkFiles(baseline.fixtures);
  const ordered=segmented.context.protocol.ordered,preflight=ordered.preflight,protocol=segmented.context.protocol;
  const profiles=["fixtures/harness/profile.json","fixtures/crypto/preflight-profile.json","fixtures/crypto/ordered-profile.json","fixtures/crypto/protocol/profile.json","fixtures/crypto/segmented/profile.json"];
  const contexts=[baseline.profile.sha256,preflight.profile.sha256,ordered.profile.sha256,protocol.profile.sha256,segmented.context.profile];
  for(let i=0;i<profiles.length;i++)assert.equal(digest(file(sourceRoot,profiles[i]!)),contexts[i],"source profile identity");
  checkFiles(ordered.fixtures);checkFiles(protocol.fixtures);checkFiles(protocol.documents);checkFiles(segmented.context.files);
  assert.equal(digest(file(sourceRoot,"fixtures/crypto/marmot-v2-vector.json")),preflight.fixtureSha256);
  const ps=profiles.map(p=>strictJSON(file(sourceRoot,p).toString()));
  assert.deepEqual(preflight.upstream.revisions,Object.fromEntries(Object.entries(ps[1].sources).map(([n,s]:[string,any])=>[n,s.commit])));
  assert.deepEqual(preflight.upstream.files,ps[1].sourceFiles);assert.equal(preflight.upstream.upstreamLockSha256,ps[1].upstreamLockSha256);
  assert.deepEqual(preflight.packages,ps[1].upstreamPackages);assert.equal(preflight.pnpm,ps[1].pnpm);
  assert.deepEqual(ordered.files,ps[2].sourceFiles);assert.equal(ordered.api,ps[2].api);assert.equal(ordered.ciphersuite,ps[2].ciphersuite);
  assert.deepEqual(protocol.sourceFiles,ps[3].sourceFiles);assert.equal(protocol.api,ps[3].api);
  assert.equal(protocol.nipRevision,ps[3].nips.commit);assert.deepEqual(protocol.nipFiles,ps[3].nips.files);
  assert.deepEqual(protocol.nostrFiles,ps[3].nostrTools.files);assert.deepEqual(protocol.gatewayFiles,ps[3].gatewayRuntime.files);
  for(const [name,value]of Object.entries(ps[0].runtime))assert.equal(baseline.runtime[name],value,"pinned runtime");
  const before=process.cwd();process.chdir(sourceRoot);
  try{
    validateSegmented(segmented,segmented.context);verifySegmentedFiles(segmented,dirname(expected.kind==="archived-p1d-test-only"?expected.path:e.prerequisite.path));
    if(expected.kind==="archived-p1d-test-only")assert.equal(closure.cases.length,115,"archived P1d exact count");
    else {assert.equal(e.schema,"noseq/protocol-closure@1");assert.equal(digest(file(sourceRoot,"fixtures/crypto/closure/profile.json")),e.context.profile);checkFiles(e.context.files);validateClosure(e,e.context);verifyClosureFiles(e,dirname(expected.path));assert.equal(closure.cases.length,129,"P1e 119 plus separate authority 10 contract");}
  }finally{process.chdir(before);}
  return closure;
}
