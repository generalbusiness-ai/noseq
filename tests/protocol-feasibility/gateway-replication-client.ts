// Actual separate-process private replication client for partition fixtures; all inputs are synthetic.
import { Peer, type Frame } from "./gateway-native.ts";
import type { Signed } from "./wire.ts";
let raw = ""; for await (const part of process.stdin) raw += part;
const input = JSON.parse(raw) as { url: string; key: string; events: Signed[] }; const trace: Frame[] = [];
const peer = await Peer.connect(input.url, "separate-replication-process", trace);
try {
  const auth = await peer.auth(input.key, input.url); if (!auth[2]) throw new Error("replication AUTH failed");
  for (const event of input.events) { peer.send(["EVENT", event]); const ok = await peer.take(m => m[0] === "OK" && m[1] === event.id); if (!ok[2]) throw new Error("replication retention failed"); }
  console.log(JSON.stringify({ status: "passed", trace, process: process.pid }));
} finally { await peer.close(); }
