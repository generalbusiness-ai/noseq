import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { cap, closureProfile, digest, strictJSON, trustedSource } from "./decision-io.ts";
export function pinnedVerifier() {
  const root=resolve(process.env.NOSEQ_GITSEQ_BUILD??join(trustedSource,"artifacts/protocol-closure/gitseq")),source=join(root,"source"),binary=join(root,"bin/gs");
  const recorded=strictJSON(readFileSync(join(trustedSource,"fixtures/crypto/closure/gitseq-build.json"),"utf8"));
  assert.equal(digest(readFileSync(join(trustedSource,"fixtures/crypto/closure/gitseq-build.json"))),closureProfile.authority.buildRecordSha256);
  assert.equal(recorded.source,closureProfile.authority.gitseqSource);assert.equal(recorded.binarySha256,closureProfile.authority.binarySha256);
  assert(recorded.commands.length===3&&recorded.commands.every((c:any)=>c.exit===0));
  const env={PATH:process.env.PATH??"/usr/bin:/bin",LANG:"C.UTF-8",TMPDIR:process.env.TMPDIR??"/tmp",GIT_CONFIG_NOSYSTEM:"1",GIT_CONFIG_GLOBAL:"/dev/null",GIT_TERMINAL_PROMPT:"0",
    GOTOOLCHAIN:"local",GOWORK:"off",CGO_ENABLED:"0",GOCACHE:join(root,"build-cache"),GOMODCACHE:join(root,"module-cache")};
  const simple=(command:string,args:string[],cwd=trustedSource)=>{const r=spawnSync(command,args,{cwd,env,encoding:"utf8",timeout:cap.subprocessMilliseconds,maxBuffer:8_388_608});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
  if(existsSync(binary)&&existsSync(source)){
    assert.equal(simple("git",["status","--porcelain","--untracked-files=all"],source),"","pinned verifier source dirty");
    assert.equal(simple("git",["rev-parse","HEAD"],source),recorded.source);assert.equal(simple("git",["rev-parse","HEAD^{tree}"],source),recorded.tree);
    assert.equal(digest(readFileSync(binary)),recorded.binarySha256,"cached verifier executable changed");
    const info=simple("go",["version","-m",binary]);assert(info.includes("vcs.revision="+recorded.source)&&info.includes("vcs.modified=false")&&info.includes("CGO_ENABLED=0")&&info.includes("-trimpath=true")&&info.includes("go1.27.0"));
    return {binary,source,sourceCommit:recorded.source,binarySha256:recorded.binarySha256,originalBuildRecordSha256:closureProfile.authority.buildRecordSha256,cache:"verified exact clean source/binary; no rebuild"};
  }
  const runId=randomUUID(),directory=join(root,"runs",runId);mkdirSync(directory,{recursive:true});let step=0;
  const commands:any[]=[];
  const run=(command:string,args:string[],cwd=trustedSource)=>{const r=spawnSync(command,args,{cwd,env,encoding:"utf8",timeout:cap.subprocessMilliseconds,maxBuffer:8_388_608});
    const log=(r.stdout??"")+(r.stderr??"");writeFileSync(join(directory,(++step)+".log"),log,{flag:"wx"});commands.push({command,args,cwd,exit:r.status,signal:r.signal,error:r.error?.message??null,logSha256:digest(log)});
    assert(r.status===0&&!r.error,log);return r.stdout.trim();};
  writeFileSync(join(directory,"started.json"),JSON.stringify({runId,started:new Date().toISOString(),source:recorded.source}),{flag:"wx"});
  try{
    assert(!existsSync(source)&&!existsSync(binary),"partial verifier cache requires a new NOSEQ_GITSEQ_BUILD directory; failure retained");
    assert.equal(run("go",["version"]),"go version go1.27.0 darwin/arm64","exact build toolchain/target");
    mkdirSync(dirname(source),{recursive:true});mkdirSync(dirname(binary),{recursive:true});
    run("git",["clone","--no-checkout","--no-hardlinks",process.env.NOSEQ_GITSEQ_SOURCE??"https://github.com/generalbusiness-ai/gitseq.git",source]);
    run("git",["checkout","--detach",recorded.source],source);assert.equal(run("git",["status","--porcelain","--untracked-files=all"],source),"");
    assert.equal(digest(readFileSync(join(source,"go.mod"))),recorded.moduleSha256);assert.equal(digest(readFileSync(join(source,"go.sum"))),recorded.sumSha256);
    run("go",["mod","download"],source);run("go",["mod","verify"],source);run("go",["build","-trimpath","-o",binary,"./cmd/gs"],source);
    assert.equal(digest(readFileSync(binary)),recorded.binarySha256,"reproducible pinned executable");
    const info=run("go",["version","-m",binary]);assert(info.includes("vcs.modified=false")&&info.includes("vcs.revision="+recorded.source));
    writeFileSync(join(directory,"record.json"),JSON.stringify({runId,commands,source:recorded.source,tree:recorded.tree,binarySha256:recorded.binarySha256,
      originalBuildRecordSha256:closureProfile.authority.buildRecordSha256,buildInfo:info,ended:new Date().toISOString()},null,2),{flag:"wx"});
    return {binary,source,sourceCommit:recorded.source,binarySha256:recorded.binarySha256,originalBuildRecordSha256:closureProfile.authority.buildRecordSha256,cache:"fresh reproducible build",runId};
  }catch(error){writeFileSync(join(directory,"failure.json"),JSON.stringify({runId,commands,error:String(error)},null,2),{flag:"wx"});throw error;}
}
if(process.argv[1]===new URL(import.meta.url).pathname){assert.equal(process.argv.length,2,"unknown build arguments");console.log(JSON.stringify(pinnedVerifier(),null,2));}
