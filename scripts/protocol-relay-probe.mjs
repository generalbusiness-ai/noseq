import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { schnorr } from '@noble/curves/secp256k1.js';

// Adapted from the coordinator's retained ff272bd4 size/COUNT probe.
// This exercises the exact private native build; it does not implement an ACL gateway.
assert(process.env.NOSEQ_STRFRY_ROOT, 'Set NOSEQ_STRFRY_ROOT to the retained pinned native build');
assert(process.env.NOSEQ_PROTOCOL_RUN, 'Set NOSEQ_PROTOCOL_RUN to a unique retained directory');
const root = process.env.NOSEQ_STRFRY_ROOT;
const source = join(root, 'source');
const binary = join(source, 'strfry');
const run = join(process.env.NOSEQ_PROTOCOL_RUN, 'native-relay');
mkdirSync(run);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hex = bytes => Buffer.from(bytes).toString('hex');
const secret = randomBytes(32);
const pubkey = hex(schnorr.getPublicKey(secret));
const buildRecord = join(root, 'runs/a738aa02-a674-4649-b0c7-9b7971fe103c/record.json');
const result = {
  schema: 'noseq/strfry-p1c-observations@1', run, started: new Date().toISOString(),
  source: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim(),
  binarySha256: sha(readFileSync(binary)), scriptSha256: sha(readFileSync(fileURLToPath(import.meta.url))),
  buildRecord, buildRecordSha256: sha(readFileSync(buildRecord)), runtime: process.version,
  purpose: 'Real local event/frame-size and restricted-COUNT observations, not G5/P5 conformance',
  publicSyntheticAuthor: pubkey, profiles: [], outcome: 'running'
};
function save() { writeFileSync(join(run, 'result.json'), JSON.stringify(result, null, 2) + '\n'); }
save();
writeFileSync(join(run, 'build-record.json'), readFileSync(buildRecord), { flag: 'wx' });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
function sign(content, kind = 1) {
  const event = { pubkey, created_at: Math.floor(Date.now() / 1000), kind, tags: [], content };
  event.id = sha(JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content]));
  event.sig = hex(schnorr.sign(Buffer.from(event.id, 'hex'), secret));
  return event;
}
function sized(bytes) {
  const base = Buffer.byteLength(JSON.stringify(sign('')));
  const event = sign('a'.repeat(bytes - base));
  assert.equal(Buffer.byteLength(JSON.stringify(event)), bytes);
  return event;
}
async function client(url, profile) {
  const socket = new WebSocket(url);
  const messages = [];
  let closed;
  socket.addEventListener('message', e => {
    try { messages.push(JSON.parse(e.data)); } catch { messages.push(['non-json', String(e.data)]); }
  });
  socket.addEventListener('close', e => { closed = { code: e.code, reason: e.reason }; });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WebSocket open timeout')), 3000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('WebSocket open error')); }, { once: true });
  });
  return {
    socket, messages,
    send(value) { socket.send(JSON.stringify(value)); },
    async take(predicate) {
      const until = Date.now() + 5000;
      while (Date.now() < until) {
        const found = messages.findIndex(predicate);
        if (found >= 0) return messages.splice(found, 1)[0];
        if (closed) return ['socket-closed', closed];
        await pause(10);
      }
      throw new Error('Timed out waiting for reply: ' + JSON.stringify(messages));
    },
    async close() { socket.close(); await pause(20); }
  };
}
async function profile(name, maxEventSize, maxFrameSize, restricted, execute) {
  const dir = join(run, name);
  mkdirSync(dir);
  mkdirSync(join(dir, 'db'));
  const port = await freePort();
  let config = readFileSync(join(source, 'strfry.conf'), 'utf8')
    .replace('db = "./strfry-db/"', 'db = ' + JSON.stringify(join(dir, 'db')))
    .replace('mapsize = 10995116277760', 'mapsize = 67108864')
    .replace('maxEventSize = 65536', 'maxEventSize = ' + maxEventSize)
    .replace('port = 7777', 'port = ' + port)
    .replace('nofiles = 524288', 'nofiles = 0')
    .replace('maxWebsocketPayloadSize = 131072', 'maxWebsocketPayloadSize = ' + maxFrameSize)
    .replace('serviceUrl = ""', 'serviceUrl = "ws://127.0.0.1:' + port + '"')
    .replace('restrictedReadKinds = "4, 1059"', 'restrictedReadKinds = "' + (restricted ? '1' : '4,1059') + '"')
    .replace('ingester = 3', 'ingester = 1').replace('reqWorker = 3', 'reqWorker = 1')
    .replace('reqMonitor = 3', 'reqMonitor = 1').replace('negentropy = 2', 'negentropy = 1');
  const configPath = join(dir, 'strfry.conf');
  writeFileSync(configPath, config);
  const entry = { name, port, configSha256: sha(config), maxEventSize, maxFrameSize, restricted, cases: [], outcome: 'running' };
  result.profiles.push(entry); save();
  const log = openSync(join(dir, 'relay.log'), 'wx');
  const child = spawn(binary, ['--config=' + configPath, '--verbosity=WARNING', 'relay'], { cwd: source, stdio: ['ignore', log, log] });
  const done = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  try {
    let ready = false;
    for (let n = 0; n < 60; n++) {
      if (child.exitCode !== null || child.signalCode !== null) throw new Error('Relay exited during startup: ' + readFileSync(join(dir, 'relay.log'), 'utf8'));
      try { const r = await fetch('http://127.0.0.1:' + port, { signal: AbortSignal.timeout(200) }); if (r.status < 500) { ready = true; break; } } catch {}
      await pause(50);
    }
    assert(ready, 'relay startup timed out');
    await execute('ws://127.0.0.1:' + port, entry, dir);
    entry.outcome = 'observed';
  } catch (error) { entry.outcome = 'failed'; entry.error = String(error); throw error; }
  finally {
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
    entry.processExit = await done; clearTimeout(timer); closeSync(log);
    entry.logSha256 = sha(readFileSync(join(dir, 'relay.log'))); save();
  }
}
async function sizeCases(url, entry, dir, cases) {
  for (const [bytes, expected] of cases) {
    const c = await client(url, entry);
    try {
      const event = sized(bytes);
      writeFileSync(join(dir, event.id + '.json'), JSON.stringify(event));
      c.send(['EVENT', event]);
      const reply = await c.take(x => x[0] === 'OK' && x[1] === event.id);
      const actual = reply[0] === 'socket-closed' ? 'closed' : reply[2] ? 'accepted' : 'rejected';
      const observation = { bytes, wireBytes: Buffer.byteLength(JSON.stringify(['EVENT', event])), id: event.id, expected, actual, reply };
      entry.cases.push(observation); save();
      assert.equal(actual, expected);
      if (actual === 'accepted') {
        c.send(['REQ', 'readback', { ids: [event.id], limit: 1 }]);
        const read = await c.take(x => x[0] === 'EVENT' && x[1] === 'readback');
        assert.equal(read[2].id, event.id);
        assert.deepEqual(read[2], event);
        observation.readbackMatched = true;
        c.send(['CLOSE', 'readback']);
      }
    } finally { await c.close(); }
  }
}
try {
  assert.equal(execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: source, encoding: 'utf8' }).trim(), '', 'Dirty native source');
  assert.equal(result.source, '4cd3cf64850caf47dda46c2a2abbbf3525a64d10');
  assert.equal(result.binarySha256, '028f26b98b0b895ed4d32f83642e3fa25173f3498330e9bfc2567a3fc06ffab4');
  await profile('default-sizes', 65536, 131072, false, (url, e, d) => sizeCases(url, e, d, [[65535, 'accepted'], [65536, 'accepted'], [65537, 'rejected']]));
  await profile('event-only-raised', 131072, 131072, false, (url, e, d) => sizeCases(url, e, d, [[131000, 'accepted'], [131072, 'closed']]));
  await profile('coherent-sizes', 131072, 131200, false, (url, e, d) => sizeCases(url, e, d, [[131071, 'accepted'], [131072, 'accepted'], [131073, 'rejected']]));
  await profile('restricted-count', 65536, 131072, true, async (url, entry, dir) => {
    const c = await client(url, entry);
    try {
      const event = sign('Synthetic restricted-kind count observation');
      writeFileSync(join(dir, event.id + '.json'), JSON.stringify(event));
      c.send(['EVENT', event]);
      const accepted = await c.take(x => x[0] === 'OK' && x[1] === event.id);
      assert.equal(accepted[2], true);
      c.send(['REQ', 'private-read', { kinds: [1], authors: [pubkey] }]);
      const denied = await c.take(x => x[0] === 'CLOSED' && x[1] === 'private-read');
      assert.equal(denied[0], 'CLOSED');
      entry.cases.push({ name: 'unauthenticated restricted REQ', reply: denied });
      for (const [id, filter] of [['count-all', {}], ['count-exact', { ids: [event.id] }]]) {
        c.send(['COUNT', id, filter]);
        const count = await c.take(x => x[0] === 'COUNT' && x[1] === id);
        entry.cases.push({ name: id, filter, reply: count }); save();
        assert.equal(count[2].count, 1);
      }
    } finally { await c.close(); }
  });
  result.outcome = 'observations-reproduced-not-G5-pass';
} catch (error) { result.outcome = 'failed'; result.error = error.stack; process.exitCode = 1; }
finally { secret.fill(0); result.finished = new Date().toISOString(); save(); console.log(JSON.stringify({ run, outcome: result.outcome, error: result.error })); }
