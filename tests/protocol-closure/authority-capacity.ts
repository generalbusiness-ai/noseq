import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { readFileSync, writeFileSync, mkdirSync, truncateSync } from "node:fs";
import { join } from "node:path";
import { cap, digest } from "../../scripts/decision-io.ts";
import { alterExport, type Challenges } from "./authority-challenges.ts";
import { exportFixture } from "./authority-fixture.ts";
// Encoded PACK fixtures exercise refusal before Git import. They are deliberately
// incomplete object graphs, never represented as otherwise valid signed rooms.
function objectHeader(size:number){const out=[(3<<4)|(size&15)];size=Math.floor(size/16);while(size){out[out.length-1]!|=128;out.push(size&127);size=Math.floor(size/128);}return Buffer.from(out);}
function pack(count:number,objects:Buffer[]){const head=Buffer.alloc(12);head.write("PACK");head.writeUInt32BE(2,4);head.writeUInt32BE(count,8);const body=Buffer.concat([head,...objects]);return Buffer.concat([body,createHash("sha1").update(body).digest()]);}
export function capacityChallenges(c:Challenges){
  const encoded=(label:string,data:Buffer,want:string)=>{const f=c.variant(label),dir=join(f.directory,"export");exportFixture(f,dir);const path=join(dir,"source-and-sequence.bundle"),old=readFileSync(path),header=old.subarray(0,old.indexOf("\n\n")+2),next=Buffer.concat([header,data]);writeFileSync(path,next);alterExport(dir,x=>x.bundle.sha256=digest(next));c.audit(f,label,want,dir);};
  encoded("object-count-plus-one",pack(cap.gitObjects+1,[]),"Git object count capacity");
  encoded("object-bytes-plus-one",pack(1,[objectHeader(cap.gitObjectBytes+1)]),"object type/byte capacity");
  const blob=Buffer.concat([objectHeader(cap.gitObjectBytes),deflateSync(Buffer.alloc(cap.gitObjectBytes))]);
  encoded("unpacked-bytes-plus-one",pack(9,[...Array(8).fill(blob),Buffer.concat([objectHeader(1),deflateSync(Buffer.from([1]))])]),"unpacked Git capacity");
  const many=c.variant("evidence-count-plus-one"),manyDir=join(many.directory,"export");exportFixture(many,manyDir);const evidence=join(manyDir,"evidence");
  for(let i=Object.keys(many.closure.files).length;i<=cap.evidenceFiles;i++)writeFileSync(join(evidence,"extra-"+i),"");
  c.audit(many,"count","file count capacity",manyDir);
  const aggregate=c.variant("evidence-total-plus-one"),aggregateDir=join(aggregate.directory,"export");exportFixture(aggregate,aggregateDir);let remaining=cap.evidenceBytes-aggregate.closure.total+1,i=0;
  while(remaining){const n=Math.min(remaining,cap.evidenceFileBytes),path=join(aggregateDir,"evidence","extra-"+(i++));writeFileSync(path,"");truncateSync(path,n);remaining-=n;}
  c.audit(aggregate,"aggregate","aggregate file capacity",aggregateDir);
  const path=c.variant("path-length-plus-one"),pd=join(path.directory,"export");exportFixture(path,pd);writeFileSync(join(pd,"evidence","a".repeat(cap.pathBytes+1)),"");c.audit(path,"length","path length/type",pd);
  const depth=c.variant("json-nesting-plus-one"),dd=join(depth.directory,"export");exportFixture(depth,dd);writeFileSync(join(dd,"export.json"),"[".repeat(65)+"0"+"]".repeat(65));c.audit(depth,"nesting","JSON nesting capacity",dd);
  const escaped=c.variant("escaped-duplicate-json"),ed=join(escaped.directory,"export");exportFixture(escaped,ed);const original=readFileSync(join(ed,"export.json"),"utf8");writeFileSync(join(ed,"export.json"),original.replace(/^\{/,"{\"sch\\u0065ma\":0,"));c.audit(escaped,"escaped","duplicate JSON field",ed);
}
