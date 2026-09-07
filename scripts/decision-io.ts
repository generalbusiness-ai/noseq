import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { inflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
export const trustedSource=resolve(dirname(fileURLToPath(import.meta.url)),"..");
export const closureProfile=JSON.parse(readFileSync(join(trustedSource,"fixtures/crypto/closure/profile.json"),"utf8"));
export const cap=closureProfile.authority.bounds as {bundleBytes:number;gitObjects:number;unpackedGitBytes:number;gitObjectBytes:number;
  sequenceDepth:number;manifestBytes:number;evidenceFiles:number;evidenceFileBytes:number;evidenceBytes:number;pathBytes:number;subprocessMilliseconds:number};
export const digest=(data:Uint8Array|string)=>createHash("sha256").update(data).digest("hex");
export const exact=(value:unknown,names:string[])=>{
  assert(value&&typeof value==="object"&&!Array.isArray(value),"object required");
  assert.deepEqual(Object.keys(value).sort(),[...names].sort(),"unknown or missing fields");
};
export function safePath(value:unknown):asserts value is string {
  assert(typeof value==="string"&&Buffer.byteLength(value)<=cap.pathBytes&&value.length>0,"path length/type");
  assert(!isAbsolute(value)&&value.split("/").every(p=>/^[a-zA-Z0-9_.-]+$/.test(p)&&p!=="."&&p!==".."&&p.toLowerCase()!==".git"),"unsafe relative path");
}
export function file(root:string,path:string,max=cap.evidenceFileBytes):Buffer {
  safePath(path);let current=resolve(root);assert(lstatSync(current).isDirectory()&&!lstatSync(current).isSymbolicLink(),"real root directory");
  for(const component of path.split("/")){current=join(current,component);assert(!lstatSync(current).isSymbolicLink(),"symlink refused");}
  const stat=lstatSync(current);assert(stat.isFile()&&stat.size<=max,"file type/byte capacity");return readFileSync(current);
}
// Detect duplicate keys before JSON.parse, including escaped spellings. Depth is finite.
export function strictJSON(text:string,max=cap.manifestBytes):any {
  assert(Buffer.byteLength(text)<=max,"JSON byte capacity");let i=0;
  const whitespace=()=>{while(/\s/.test(text[i]??"")&&i<text.length)i++;};
  const string=()=>{const start=i;assert(text[i++]==='"',"JSON string");while(i<text.length){const c=text[i++];if(c==='"')return JSON.parse(text.slice(start,i));if(c==='\\')i++;}throw Error("unterminated JSON string");};
  const value=(depth:number):void=>{
    assert(depth<=64,"JSON nesting capacity");whitespace();const c=text[i];
    if(c==='"'){string();return;}
    if(c==='{'||c==='['){i++;whitespace();const keys=new Set(),end=c==='{'?'}':']';if(text[i]===end){i++;return;}
      while(true){if(c==='{'){whitespace();const key=string();assert(!keys.has(key),"duplicate JSON field");keys.add(key);whitespace();assert(text[i++]===':',"JSON colon");}
        value(depth+1);whitespace();const next=text[i++];if(next===end)return;assert(next===',',"JSON separator");}
    }
    const match=/^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(text.slice(i));assert(match,"JSON value");i+=match[0].length;
  };
  value(0);whitespace();assert(i===text.length,"JSON trailing bytes");return JSON.parse(text);
}
export function inventory(root:string):Record<string,{sha256:string;bytes:number}> {
  assert(lstatSync(root).isDirectory()&&!lstatSync(root).isSymbolicLink(),"real inventory root directory");
  const files:Record<string,{sha256:string;bytes:number}>={};let total=0,count=0;
  const visit=(path:string)=>{for(const item of readdirSync(join(root,path),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
    const p=path?path+"/"+item.name:item.name;safePath(p);
    assert(!item.isSymbolicLink(),"symlink refused");if(item.isDirectory())visit(p);else{
      assert(++count<=cap.evidenceFiles,"file count capacity");const data=file(root,p);total+=data.length;assert(total<=cap.evidenceBytes,"aggregate file capacity");files[p]={sha256:digest(data),bytes:data.length};
    }
  }};visit("");return files;
}
export function externalPolicy(policy:string,exportRoot:string) {
  assert(!lstatSync(policy).isSymbolicLink()&&lstatSync(policy).isFile(),"policy must be an external regular file");
  const p=realpathSync(policy),e=realpathSync(exportRoot);assert(p!==e&&!p.startsWith(e+sep),"bundle-supplied policy refused");
  assert(lstatSync(p).size<=cap.manifestBytes,"policy capacity");return strictJSON(readFileSync(p,"utf8"));
}

// Bound inflated object and delta target sizes before Git imports the pack. Complete
// bundles only: no prerequisite/thin objects or unbounded external-base expansion.
export function inspectBundle(data:Buffer) {
  assert(data.length<=cap.bundleBytes,"bundle byte capacity");const split=data.indexOf("\n\n");assert(split>0&&split<65536,"bounded bundle header");
  const header=data.subarray(0,split).toString("utf8").split("\n");assert.equal(header.shift(),"# v2 git bundle");
  assert(header.length===2,"exact source and sequence refs required");const refs:Record<string,string>={};
  for(const line of header){const m=/^([0-9a-f]{40}) (refs\/heads\/source|refs\/seq\/[0-9a-f]{40})$/.exec(line);assert(m&&!refs[m[2]!],"unsupported/incomplete/duplicate bundle ref");refs[m[2]!]=m[1]!;}
  const pack=data.subarray(split+2);assert(pack.length>=32&&pack.subarray(0,4).toString()==="PACK","Git pack header");assert.equal(pack.readUInt32BE(4),2);
  const count=pack.readUInt32BE(8);assert(count>0&&count<=cap.gitObjects,"Git object count capacity");
  assert.equal(createHash("sha1").update(pack.subarray(0,-20)).digest("hex"),pack.subarray(-20).toString("hex"),"pack checksum");
  let offset=12,total=0;
  for(let object=0;object<count;object++) {
    let b=pack[offset++]!,size=b&15,shift=4;const type=(b>>4)&7;
    while(b&128){assert(shift<49,"object size overflow");b=pack[offset++]!;size+=(b&127)*2**shift;shift+=7;}
    assert([1,2,3,4,6,7].includes(type)&&Number.isSafeInteger(size)&&size<=cap.gitObjectBytes,"object type/byte capacity");
    if(type===6){let distance=0;do{b=pack[offset++]!;distance=(distance+1)*128+(b&127);assert(offset<pack.length-20&&Number.isSafeInteger(distance),"delta offset");}while(b&128);}
    if(type===7)offset+=20;
    const decoded=inflateSync(pack.subarray(offset,-20),{maxOutputLength:Math.max(size,1),info:true}) as unknown as {buffer:Buffer;engine:{bytesWritten:number}};
    assert.equal(decoded.buffer.length,size,"inflated object size");assert(decoded.engine.bytesWritten>0,"compressed object consumed");offset+=decoded.engine.bytesWritten;
    let output=size;
    if(type===6||type===7){let pos=0;
      const variable=()=>{let v=0,n=0,x;do{assert(pos<decoded.buffer.length&&n<49,"delta header");x=decoded.buffer[pos++]!;v+=(x&127)*2**n;n+=7;}while(x&128);assert(v<=cap.gitObjectBytes,"delta target/base capacity");return v;};
      variable();output=variable();
    }
    total+=output;assert(total<=cap.unpackedGitBytes,"unpacked Git capacity");assert(offset<=pack.length-20,"pack object boundary");
  }
  assert.equal(offset,pack.length-20,"extra/missing pack bytes");return {refs,objects:count,unpackedBytes:total,bundleBytes:data.length};
}

export class Offline {
  step=0;
  readonly logs:string;
  constructor(logs:string){this.logs=logs;mkdirSync(logs,{recursive:true});assert.equal(process.platform,"darwin","actual sandbox-exec network isolation currently requires macOS");}
  run(command:string,args:string[],options:{cwd?:string;input?:string|Buffer;allowFailure?:boolean;env?:Record<string,string>}={}) {
    const base={PATH:process.env.PATH??"/usr/bin:/bin",LANG:"C.UTF-8",TMPDIR:process.env.TMPDIR??"/tmp",GIT_CONFIG_NOSYSTEM:"1",GIT_CONFIG_GLOBAL:"/dev/null",GIT_TERMINAL_PROMPT:"0",
      GIT_NO_REPLACE_OBJECTS:"1",GITSEQ_CHECKPOINT:"off",GIT_CONFIG_COUNT:"3",GIT_CONFIG_KEY_0:"core.hooksPath",GIT_CONFIG_VALUE_0:"/dev/null",GIT_CONFIG_KEY_1:"protocol.allow",GIT_CONFIG_VALUE_1:"never",GIT_CONFIG_KEY_2:"protocol.file.allow",GIT_CONFIG_VALUE_2:"always",...options.env};
    const n=++this.step,r=spawnSync("/usr/bin/sandbox-exec",["-p","(version 1) (allow default) (deny network*)",command,...args],{
      env:base,cwd:options.cwd??trustedSource,input:options.input,timeout:cap.subprocessMilliseconds,maxBuffer:cap.unpackedGitBytes});
    writeFileSync(join(this.logs,n+".stdout"),r.stdout??Buffer.alloc(0),{flag:"wx"});writeFileSync(join(this.logs,n+".stderr"),r.stderr??Buffer.alloc(0),{flag:"wx"});
    writeFileSync(join(this.logs,n+".command.json"),JSON.stringify({command,args,cwd:options.cwd??trustedSource,network:"sandbox deny network*",exit:r.status,signal:r.signal,error:r.error?.message??null,
      stdout:digest(r.stdout??Buffer.alloc(0)),stderr:digest(r.stderr??Buffer.alloc(0))},null,2),{flag:"wx"});
    if(!options.allowFailure)assert(r.status===0&&!r.error,`${command} failed: ${r.stderr?.toString().slice(-3000)??r.error}`);
    return {status:r.status,stdout:r.stdout??Buffer.alloc(0),stderr:r.stderr??Buffer.alloc(0)};
  }
  git(repo:string,...args:string[]){return this.run("git",["-C",repo,...args]).stdout.toString().trim();}
  gs(binary:string,repo:string,command:string,...args:string[]){return this.run(binary,[command,"--repo",repo,"--server","-",...args]).stdout.toString().trim();}
}
