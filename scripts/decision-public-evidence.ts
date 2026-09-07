import { strict as assert } from "node:assert";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { cap, closureProfile, digest, exact, file, safePath, strictJSON } from "./decision-io.ts";
type Entry={sha256:string;bytes:number;blob:string}|{symlink:string};
// These are provenance labels, never extraction destinations. They include the
// deliberately overlong input tested by the stricter 240-byte export parser.
const transcriptPath=(name:string)=>assert(Buffer.byteLength(name)<=1024&&name.split("/").every(p=>/^[a-zA-Z0-9_.-]+$/.test(p)&&p!=="."&&p!==".."&&p!==".git"),"bounded public provenance label");
// Only explicitly public exports, external policies and execution records enter
// this archive. No generated fixture .git, key custody or extracted audit repo.
export function collectAuthorityPublic(run:string,verifier:Record<string,unknown>){
  const root=join(run,"authority"),out=join(run,"authority-public");mkdirSync(out);mkdirSync(join(out,"blobs"));mkdirSync(join(out,"results"));
  const entries:Record<string,Entry>={},blobs=new Set<string>();
  const capture=(path:string)=>{
    const name=relative(root,path);transcriptPath(name);if(entries[name])return;
    const stat=lstatSync(path);if(stat.isSymbolicLink()){entries[name]={symlink:readlinkSync(path)};return;}
    if(stat.isDirectory()){for(const n of readdirSync(path).sort())capture(join(path,n));return;}
    assert(stat.isFile()&&stat.size<=cap.evidenceFileBytes+1,"public fixture input exceeds bounded max/+1 contract");const data=readFileSync(path),sha256=digest(data),blob="blobs/"+sha256+".gz";
    if(!blobs.has(sha256)){writeFileSync(join(out,blob),gzipSync(data),{flag:"wx"});blobs.add(sha256);}
    entries[name]={sha256,bytes:data.length,blob};
  };
  capture(join(root,"base/generation"));capture(join(root,"base/trusted-policy.json"));capture(join(root,"base/decision.json"));
  for(const name of closureProfile.authorityCases as string[]){
    const result=readFileSync(join(root,"challenges/result-"+name.replace("authority.","")+".json"));
    writeFileSync(join(out,"results/"+name+".json"),result,{flag:"wx"});
    for(const r of strictJSON(result.toString(),cap.evidenceFileBytes).records){
      if(!r.export)continue;capture(r.export);capture(r.policy);
      const audit=r.output;for(const item of ["commands","structure.json","result.json","failure.json"])if(existsSync(join(audit,item)))capture(join(audit,item));
    }
  }
  // Includes unsuccessful guarded CLI calls and source-world/rotation generation.
  for(const v of readdirSync(join(root,"challenges"),{withFileTypes:true}))if(v.isDirectory()&&existsSync(join(root,"challenges",v.name,"generation")))capture(join(root,"challenges",v.name,"generation"));
  writeFileSync(join(out,"inputs.json"),JSON.stringify({schema:"noseq/authority-public-inputs@1",originalRoot:root,entries},null,2),{flag:"wx"});
  writeFileSync(join(out,"verifier.json"),JSON.stringify(verifier,null,2),{flag:"wx"});
}
export function verifyAuthorityPublic(directory:string){
  const m=strictJSON(file(directory,"inputs.json").toString(),cap.evidenceFileBytes);exact(m,["schema","originalRoot","entries"]);assert.equal(m.schema,"noseq/authority-public-inputs@1");assert(typeof m.originalRoot==="string");
  assert(Object.keys(m.entries).length>0&&Object.keys(m.entries).length<=100000,"bounded public transcript entries");const decoded=new Map<string,{sha256:string;bytes:number}>();
  for(const [name,entry] of Object.entries(m.entries)as [string,Entry][]){transcriptPath(name);if("symlink"in entry){exact(entry,["symlink"]);assert(typeof entry.symlink==="string");continue;}
    exact(entry,["sha256","bytes","blob"]);assert.match(entry.sha256,/^[0-9a-f]{64}$/);assert.equal(entry.blob,"blobs/"+entry.sha256+".gz");assert(Number.isInteger(entry.bytes)&&entry.bytes>=0&&entry.bytes<=cap.evidenceFileBytes+1);
    if(!decoded.has(entry.blob)){const raw=gunzipSync(file(directory,entry.blob),{maxOutputLength:cap.evidenceFileBytes+1});decoded.set(entry.blob,{bytes:raw.length,sha256:digest(raw)});}
    assert.deepEqual(decoded.get(entry.blob),{bytes:entry.bytes,sha256:entry.sha256},"exact retained compressed public bytes");
  }
  assert.deepEqual(readdirSync(join(directory,"blobs")).sort(),[...decoded.keys()].map(p=>p.slice(6)).sort(),"no unreferenced public blobs");
  const read=(original:string)=>{assert(original.startsWith(m.originalRoot+"/"),"public record root binding");const entry=m.entries[original.slice(m.originalRoot.length+1)];assert(entry&&!("symlink"in entry),"missing regular public input");return gunzipSync(file(directory,entry.blob),{maxOutputLength:cap.evidenceFileBytes+1});};
  const commands=Object.keys(m.entries).filter(p=>p.endsWith(".command.json")&&p.includes("/generation/")).map(p=>({path:m.originalRoot+"/"+p,value:strictJSON(read(m.originalRoot+"/"+p).toString(),cap.evidenceFileBytes)}));
  for(const name of closureProfile.authorityCases as string[]){const result=strictJSON(file(directory,"results/"+name+".json").toString(),cap.evidenceFileBytes);
    assert.deepEqual(result.records.map((r:any)=>({label:r.label,expected:r.expected})),closureProfile.authorityChecks[name],"exact authority subcase contract");
    for(const r of result.records){if(!r.output)continue;
      const raw=read(r.output+(r.exit===0?"/result.json":"/failure.json"));assert.deepEqual(strictJSON(raw.toString(),cap.evidenceFileBytes),r.result,"raw authority outcome binding");
      const command=commands.find(c=>c.value.args?.includes(r.output)&&c.value.args?.includes("--output")&&c.value.args?.includes("--export"));assert(command,"actual detached CLI command required");
      assert.equal(command.value.exit,r.exit);assert.equal(command.value.stdout,r.stdout);assert.equal(command.value.stderr,r.stderr);
      assert.equal(digest(read(command.path.replace(/command.json$/,"stdout"))),r.stdout);assert.equal(digest(read(command.path.replace(/command.json$/,"stderr"))),r.stderr);
    }
  }
  return m;
}
