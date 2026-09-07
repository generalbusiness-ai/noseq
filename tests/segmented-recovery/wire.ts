// Development-only v2 recovery framing; original ordering and v1 archive validators stay distinct.
import { b64, canonical, check, clone, decoder, equal, eventBytes, fields, hash, hashBytes, hex, hex32, integer, limits, parse, publicKey, random, readEvent, signRaw, unb64, unhex, utf8, type Context, type Signed } from "../protocol-feasibility/wire.ts";
export const profile = "noseq/segmented-recovery@2";
export const kinds = {root:8800,manifest:8801,chunk:8802,checkpoint:8803,locator:8804,delivery:8805,reservation:8806} as const;
export const bounds = {entries:65536,segments:65536,segmentEntries:128,segmentBytes:16777216,grantBytes:16777216,vaultBytes:16777216,descriptorIndexBytes:33554432,logicalIndexBytes:16777216,reservationIndexBytes:33554432,reservationEntries:262144} as const;
export type Kind = keyof typeof kinds;
export type Purpose = "segment" | "definition" | "grant" | "vault";
export interface ObjectStore { put(event:Signed):Promise<void>; get(id:string):Promise<Signed> }
export interface Root {event:Signed;context:Context}
export interface Range {ordinal:number;first:number;last:number;predecessor:string;tip:string;previous:string|null;entries:number;applications:number;before:string|null;after:string|null;checkpoint:string|null}
export interface Meta extends Range {profile:string;purpose:Purpose;context:Context;bodyHash:string;plainBytes:number;cipherBytes:number;keyId:string;nonce:string}
export interface Manifest {profile:string;meta:Meta;metaId:string;chunks:string[];cipherHash:string}
export interface Chunk {profile:string;metaId:string;index:number;count:number;bytes:string}
export interface Sealed {event:Signed;manifest:Manifest;key:string;transportBytes:number}
export interface Metrics {records:number;recordBytes:number;segmentEncryptions:number;segmentPlainBytes:number;grantVisits:number;decodedSegments:number;maximumDecodedSegments:number;maximumCanonicalBytes:number;manifestVisits:number}
export const metrics=():Metrics=>({records:0,recordBytes:0,segmentEncryptions:0,segmentPlainBytes:0,grantVisits:0,decodedSegments:0,maximumDecodedSegments:0,maximumCanonicalBytes:0,manifestVisits:0});
export const bytes=(value:unknown):number=>utf8.encode(canonical(value)).length;
export const keyId=(key:string)=>{hex32(key);return hash([profile,"key",key]);};
export const context=(ctx:Context)=>{fields(ctx,["instance","genesis","definition","owner","sequencer"]);for(const id of Object.values(ctx))hex32(id);};
export function sign2(key:string,type:Kind,ctx:Context,value:unknown):Signed {
  const event=signRaw(key,kinds[type],[["noseq",profile],["h",ctx.genesis],["i",ctx.instance],["d",ctx.definition]],canonical(value));
  return read2(event,type,ctx);
}
export function read2(event:Signed,type:Kind,ctx:Context):Signed {
  context(ctx);const e=readEvent(eventBytes(event),kinds[type]);
  equal(e.tags,[["noseq",profile],["h",ctx.genesis],["i",ctx.instance],["d",ctx.definition]],"v2 exact profile tags");return e;
}
export async function root2(owner:string,sequencer:string,definition:string,instance=hex(random())):Promise<Root> {
  hex32(definition);hex32(instance);const e=signRaw(owner,kinds.root,[["noseq",profile]],canonical({profile,ordering:"noseq/protocol-candidate@1",instance,definition,owner:publicKey(owner),sequencer:publicKey(sequencer),history:profile}));
  return {event:e,context:readRoot2(e,publicKey(owner),e.id)};
}
export function readRoot2(event:Signed,owner:string,genesis:string):Context {
  const e=readEvent(eventBytes(event),kinds.root);check(e.pubkey===owner&&e.id===genesis,"v2 trusted root");equal(e.tags,[["noseq",profile]],"v2 root tags");
  const c=parse(e.content);fields(c,["profile","ordering","instance","definition","owner","sequencer","history"]);
  check(c.profile===profile&&c.history===profile&&c.ordering==="noseq/protocol-candidate@1"&&c.owner===owner,"v2 root policy");hex32(c.instance);hex32(c.definition);hex32(c.sequencer);
  return {instance:c.instance,definition:c.definition,owner,sequencer:c.sequencer,genesis};
}
export function objectLimit(purpose:Purpose):number {return purpose==="definition"? 2*limits.closure:purpose==="grant"?bounds.grantBytes:purpose==="vault"?bounds.vaultBytes:bounds.segmentBytes;}
export function validateMeta(m:Meta,ctx:Context):void {
  fields(m,["profile","purpose","context","ordinal","first","last","predecessor","tip","previous","entries","applications","before","after","checkpoint","bodyHash","plainBytes","cipherBytes","keyId","nonce"]);
  check(m.profile===profile&&["segment","definition","grant","vault"].includes(m.purpose),"v2 purpose/profile");equal(m.context,ctx,"v2 object context");
  for(const x of [m.ordinal,m.first,m.last,m.entries,m.applications])integer(x,bounds.entries);
  for(const id of [m.predecessor,m.tip,m.bodyHash,m.keyId])hex32(id);
  for(const id of [m.previous,m.before,m.after,m.checkpoint])if(id!==null)hex32(id);
  integer(m.plainBytes,objectLimit(m.purpose));check(m.plainBytes>0,"empty object");integer(m.cipherBytes,objectLimit(m.purpose)+16);check(m.cipherBytes===m.plainBytes+16,"GCM encoded length");check(unb64(m.nonce,12).length===12,"GCM nonce");
  if(m.purpose==="segment")check(m.ordinal>0&&m.first>0&&m.last>=m.first&&m.entries===m.last-m.first+1&&m.entries<=bounds.segmentEntries&&m.applications<=m.entries&&m.before!==null&&m.after!==null&&m.checkpoint===null,"segment range/count/state");
  else if(m.purpose==="definition")check(m.ordinal===0&&m.first===0&&m.last===0&&m.entries===0&&m.applications===0&&m.previous===null&&m.before===null&&m.after===null&&m.checkpoint===null&&m.predecessor===ctx.genesis&&m.tip===ctx.genesis,"definition metadata");
  else check(m.ordinal===0&&m.first===1&&m.last>0&&m.entries===m.last&&m.applications<=m.entries&&m.previous!==null&&m.before===null&&m.after!==null&&m.checkpoint!==null&&m.predecessor===ctx.genesis,"snapshot metadata");
}
export async function manifest(event:Signed,ctx:Context):Promise<Manifest> {
  const e=read2(event,"manifest",ctx);check(e.pubkey===ctx.owner,"manifest owner");const m=parse(e.content) as unknown as Manifest;fields(m,["profile","meta","metaId","chunks","cipherHash"]);check(m.profile===profile,"manifest profile");validateMeta(m.meta,ctx);
  hex32(m.metaId);hex32(m.cipherHash);check(m.metaId===await hash([profile,"meta",m.meta]),"metadata identity");
  check(Array.isArray(m.chunks)&&m.chunks.length===Math.ceil(m.meta.cipherBytes/limits.chunk)&&m.chunks.length<=1025,"chunk count/length");for(const id of m.chunks)hex32(id);check(new Set(m.chunks).size===m.chunks.length,"duplicate chunks");return m;
}
export async function chunk(event:Signed,ctx:Context,m:Manifest,index:number):Promise<Uint8Array> {
  integer(index,m.chunks.length-1);const e=read2(event,"chunk",ctx);check(e.pubkey===ctx.owner&&e.id===m.chunks[index],"chunk owner/identity");const c=parse(e.content) as unknown as Chunk;fields(c,["profile","metaId","index","count","bytes"]);
  check(c.profile===profile&&c.metaId===m.metaId&&c.index===index&&c.count===m.chunks.length,"chunk binding/order");
  const b=unb64(c.bytes,limits.chunk);check(b.length===(index===m.chunks.length-1?m.meta.cipherBytes-index*limits.chunk:limits.chunk),"chunk length");return b;
}
export const blankRange=(ctx:Context):Range=>({ordinal:0,first:0,last:0,predecessor:ctx.genesis,tip:ctx.genesis,previous:null,entries:0,applications:0,before:null,after:null,checkpoint:null});
export async function seal(store:ObjectStore,ownerKey:string,ctx:Context,purpose:Purpose,core:unknown,range:Range,trace?:Metrics,key=hex(random())):Promise<Sealed> {
  const plaintext=utf8.encode(canonical(core));check(plaintext.length<=objectLimit(purpose),"object plaintext capacity");if(trace)trace.maximumCanonicalBytes=Math.max(trace.maximumCanonicalBytes,plaintext.length);
  const meta:Meta={profile,purpose,context:ctx,...range,bodyHash:await hash([profile,"core",core]),plainBytes:plaintext.length,cipherBytes:plaintext.length+16,keyId:await keyId(key),nonce:b64(random(12))};validateMeta(meta,ctx);
  const metaId=await hash([profile,"meta",meta]),aad=utf8.encode(canonical([profile,"aead",meta]));
  const k=await crypto.subtle.importKey("raw",unhex(key) as Uint8Array<ArrayBuffer>,"AES-GCM",false,["encrypt"]);
  const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv:unb64(meta.nonce) as Uint8Array<ArrayBuffer>,additionalData:aad as Uint8Array<ArrayBuffer>,tagLength:128},k,plaintext));
  const ids:string[]=[];let transportBytes=0;
  for(let offset=0;offset<ciphertext.length;offset+=limits.chunk){const e=sign2(ownerKey,"chunk",ctx,{profile,metaId,index:ids.length,count:Math.ceil(ciphertext.length/limits.chunk),bytes:b64(ciphertext.subarray(offset,offset+limits.chunk))});ids.push(e.id);transportBytes+=bytes(e);await store.put(e);}
  const value:Manifest={profile,meta,metaId,chunks:ids,cipherHash:await hashBytes(ciphertext)};const e=sign2(ownerKey,"manifest",ctx,value);await manifest(e,ctx);await store.put(e);transportBytes+=bytes(e);
  if(trace&&purpose==="segment"){trace.segmentEncryptions++;trace.segmentPlainBytes+=plaintext.length;}return {event:e,manifest:value,key,transportBytes};
}
export async function open(store:ObjectStore,event:Signed,key:string,ctx:Context,purpose:Purpose,trace?:Metrics):Promise<unknown> {
  const m=await manifest(event,ctx);check(m.meta.purpose===purpose&&await keyId(key)===m.meta.keyId,"object purpose/key");
  const ciphertext=new Uint8Array(m.meta.cipherBytes);for(let i=0;i<m.chunks.length;i++)ciphertext.set(await chunk(await store.get(m.chunks[i]!),ctx,m,i),i*limits.chunk);
  check(await hashBytes(ciphertext)===m.cipherHash,"ciphertext identity");const k=await crypto.subtle.importKey("raw",unhex(key) as Uint8Array<ArrayBuffer>,"AES-GCM",false,["decrypt"]);
  const plaintext=await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(m.meta.nonce) as Uint8Array<ArrayBuffer>,additionalData:utf8.encode(canonical([profile,"aead",m.meta])) as Uint8Array<ArrayBuffer>,tagLength:128},k,ciphertext);
  check(plaintext.byteLength===m.meta.plainBytes,"plaintext length");const core=parse(decoder.decode(plaintext),objectLimit(purpose));check(await hash([profile,"core",core])===m.meta.bodyHash,"plaintext identity");
  if(trace)trace.maximumCanonicalBytes=Math.max(trace.maximumCanonicalBytes,plaintext.byteLength);return core;
}
export {b64,canonical,check,clone,decoder,equal,eventBytes,fields,hash,hashBytes,hex,hex32,integer,limits,parse,publicKey,random,unb64,unhex,utf8,type Context,type Signed};
