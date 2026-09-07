import { strict as assert } from "node:assert";
import { spawn, execFileSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import WebSocket, { WebSocketServer } from "ws";
import { sha256File } from "../../scripts/evidence.ts";
import { canonical, signRaw, type Signed } from "./wire.ts";

export const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export async function freePort(): Promise<number> {
  const s = createServer(); await new Promise<void>(resolve => s.listen(0, "127.0.0.1", resolve)); const p = (s.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => s.close(e => e ? reject(e) : resolve())); return p;
}
export interface Frame { connection: string; direction: "send" | "receive"; message: unknown }
// Actual sockets and unmodified native storage; selectively withhold one class of reply, never fabricate a success.
export async function readbackProxy(backendUrl:string,trace:Frame[]) {
  const server=new WebSocketServer({port:0,host:"127.0.0.1"});await new Promise<void>(resolve=>server.once("listening",resolve));
  const sockets:WebSocket[]=[];const dropAck=new Set<string>(),dropEose=new Set<string>();
  server.on("connection",front=>{
    const back=new WebSocket(backendUrl);sockets.push(front,back);const pending:string[]=[],omit=new Set<string>();
    front.on("error",()=>{});back.on("error",()=>front.terminate());back.on("open",()=>pending.splice(0).forEach(raw=>back.send(raw)));
    front.on("message",bytes=>{const raw=bytes.toString(),m=JSON.parse(raw);if(m[0]==="REQ"&&m[2]?.ids?.some((id:string)=>dropEose.has(id)))omit.add(m[1]);trace.push({connection:"native-fault-proxy",direction:"send",message:m});if(back.readyState===WebSocket.OPEN)back.send(raw);else pending.push(raw);});
    back.on("message",bytes=>{const raw=bytes.toString(),m=JSON.parse(raw);if((m[0]==="EOSE"&&omit.has(m[1]))||(m[0]==="OK"&&dropAck.has(m[1]))){trace.push({connection:"native-fault-proxy",direction:"receive",message:["suppressed",m]});return;}if(front.readyState===WebSocket.OPEN)front.send(raw);});
    front.on("close",()=>back.close());back.on("close",()=>front.close());
  });
  return {url:`ws://127.0.0.1:${(server.address() as {port:number}).port}`,dropAck,dropEose,async stop(){for(const socket of sockets)socket.terminate();await new Promise<void>(resolve=>server.close(()=>resolve()));}};
}
export class Peer {
  messages: unknown[][] = []; closed = false;
  readonly socket: WebSocket; readonly name: string; readonly trace: Frame[];
  private constructor(socket: WebSocket, name: string, trace: Frame[]) {
    this.socket = socket; this.name = name; this.trace = trace;
    socket.on("message", bytes => { const message = JSON.parse(bytes.toString()) as unknown[]; this.messages.push(message); trace.push({ connection: name, direction: "receive", message }); });
    socket.on("close", (code, reason) => { this.closed = true; trace.push({ connection: name, direction: "receive", message: ["socket-closed", code, reason.toString()] }); });
  }
  static async connect(url: string, name: string, trace: Frame[]): Promise<Peer> {
    const socket = new WebSocket(url, { handshakeTimeout: 2000 }); const p = new Peer(socket, name, trace);
    await new Promise<void>((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); }); return p;
  }
  send(message: unknown[]): void { this.trace.push({ connection: this.name, direction: "send", message }); this.socket.send(canonical(message)); }
  async take(predicate: (m: unknown[]) => boolean, timeout = 4000): Promise<unknown[]> {
    const until = Date.now() + timeout;
    while (Date.now() < until) { const i = this.messages.findIndex(predicate); if (i >= 0) return this.messages.splice(i, 1)[0]!; if (this.closed) throw new Error("socket closed"); await pause(5); }
    throw new Error(`Reply timeout for ${this.name}: ${JSON.stringify(this.messages)}`);
  }
  async auth(key: string, url: string, time = Math.floor(Date.now() / 1000), override?: Signed): Promise<unknown[]> {
    const challenge = await this.take(m => m[0] === "AUTH"); const event = override ?? signRaw(key, 22242, [["relay", url], ["challenge", challenge[1] as string]], "", time);
    this.send(["AUTH", event]); return this.take(m => m[0] === "OK" && m[1] === event.id);
  }
  async close(): Promise<void> { if (this.closed) return; this.socket.close(); await Promise.race([new Promise<void>(r => this.socket.once("close", () => r())), pause(300)]); if (!this.closed) this.socket.terminate(); }
}
export async function startNative(directory: string, options: { restricted?: boolean; tree?: string } = {}) {
  const root = process.env.NOSEQ_STRFRY_ROOT; assert(root, "NOSEQ_STRFRY_ROOT required"); const source = join(root, "source"), binary = join(source, "strfry");
  const native = JSON.parse(readFileSync("fixtures/crypto/protocol/profile.json", "utf8")).native;
  assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { cwd: source, encoding: "utf8" }).trim(), native.source);
  assert.equal(execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: source, encoding: "utf8" }).trim(), ""); assert.equal(sha256File(binary), native.binarySha256);
  mkdirSync(directory); mkdirSync(join(directory, "db")); const port = await freePort(); const url = `ws://127.0.0.1:${port}`;
  const config = readFileSync(join(source, "strfry.conf"), "utf8")
    .replace('db = "./strfry-db/"', `db = ${JSON.stringify(join(directory, "db"))}`).replace("mapsize = 10995116277760", "mapsize = 67108864")
    .replace("maxEventSize = 65536", "maxEventSize = 131072").replace("port = 7777", `port = ${port}`).replace("nofiles = 524288", "nofiles = 0")
    .replace("maxWebsocketPayloadSize = 131072", "maxWebsocketPayloadSize = 131200").replace('serviceUrl = ""', `serviceUrl = "${url}"`)
    .replace('restrictedReadKinds = "4, 1059"', `restrictedReadKinds = "${options.restricted ? "1" : "4,1059"}"`)
    .replace("ingester = 3", "ingester = 1").replace("reqWorker = 3", "reqWorker = 1").replace("reqMonitor = 3", "reqMonitor = 1").replace("negentropy = 2", "negentropy = 1");
  const configPath = join(directory, "strfry.conf"); writeFileSync(configPath, config, { flag: "wx" });
  if (options.tree) writeFileSync(join(directory, "negentropy-add.log"), execFileSync(binary, [`--config=${configPath}`, "negentropy", "add", options.tree], { cwd: source, encoding: "utf8" }));
  const fd = openSync(join(directory, "relay.log"), "wx"); const child = spawn(binary, [`--config=${configPath}`, "--verbosity=WARNING", "relay"], { cwd: source, stdio: ["ignore", fd, fd] });
  const done = new Promise(resolve => child.once("exit", (code, signal) => resolve({ code, signal })));
  const stop = async () => { child.kill("SIGTERM"); const timer = setTimeout(() => child.kill("SIGKILL"), 2000); const exit = await done; clearTimeout(timer); closeSync(fd); writeFileSync(join(directory, "exit.json"), JSON.stringify(exit), { flag: "wx" }); };
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) { if (child.exitCode !== null) throw new Error("Native relay exited"); try { await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(150) }); ready = true; break; } catch {} await pause(25); }
    assert(ready); return { url, port, stop, configPath, binary, source, identity: { source: native.source, binarySha256: sha256File(binary), configSha256: sha256File(configPath) } };
  } catch (e) { await stop(); throw e; }
}
