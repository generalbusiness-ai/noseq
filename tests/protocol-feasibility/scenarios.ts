import { action, b64, canonical, capability, check, clone, equal, eventBytes, fail, genesis, hash, hex, kinds, limits, localSigner, parse, publicKey, random, read, readEvent, sign, signRaw, signerProof, unb64, utf8, type Context, type Signed } from "./wire.ts";
import { add, Client, control, decodeState, device, entry, environment, initial, Journal, join, mls, privateMessage, remove, submission, type Device, type Snapshot } from "./crypto.ts";
import { createArchive, decrypt, definitionId, deliverKey, encrypt, exportOwner, receiveKey, recoverOwner, VerifiedArchive, type Archive, type Definition } from "./archive.ts";
import { verifyOpening } from "./opening.ts";
import { authEvent, authenticate, frame, invite, nip46Capability, readFrame, RelayPolicy, validateInvite } from "./policies.ts";

const testKey = (n: number) => n.toString(16).padStart(64, "0");
export const observations: unknown[] = [];
const note = (value: unknown) => observations.push(value);
const ident = (s: string) => hash(["synthetic-action", s]);
const worlds: { root: Signed; context: Context; definition: Definition; initial: unknown; journal: Journal; owner: Client }[] = [];
export async function setup() {
  const definition: Definition = { nonce: hex(random()), files: [
    { path: "assets/private.txt", bytes: b64(utf8.encode("PRIVATE-DEFINITION-CANARY")) },
    { path: "manifest.json", bytes: b64(utf8.encode('{"fold":"append ordered values","schema":"synthetic-feasibility-only"}')) },
  ] };
  const g = await genesis(testKey(31), testKey(39), await definitionId(definition));
  const env = await environment(g.context); const ownerDevice = await device(env, g.context, testKey(31));
  const owner2Device = await device(env, g.context, testKey(31), testKey(35));
  const bobDevice = await device(env, g.context, testKey(32)); const daveDevice = await device(env, g.context, testKey(33));
  const carolDevice = await device(env, g.context, testKey(34)); const bob2Device = await device(env, g.context, testKey(32), testKey(36));
  const owner = await initial(g.context, env, ownerDevice); const starting = clone(owner.data.public);
  const journal = new Journal(g.context, testKey(39), clone(starting));
  const c = await owner.stageCommit([add(owner2Device), add(bobDevice), add(daveDevice)]); const first = await journal.append(c.event, c.admission); await owner.receive(first);
  const archive = await createArchive(owner, g.event, definition, starting);
  const verified = await VerifiedArchive.verify(archive, { owner: g.context.owner, genesis: g.context.genesis });
  const owner2 = await join(owner, owner2Device, c.event, verified.snapshot); const bob = await join(owner, bobDevice, c.event, verified.snapshot); const dave = await join(owner, daveDevice, c.event, verified.snapshot);
  const world = { g, env, definition, starting, journal, owner, owner2, bob, dave, ownerDevice, owner2Device, bobDevice, daveDevice, carolDevice, bob2Device };
  // A scenario may replace its journal after reconstruction; retain the current signed frontier, not the pre-restart object.
  worlds.push({ root: g.event, context: g.context, definition, initial: starting, get journal() { return world.journal; }, owner });
  return world;
}
type World = Awaited<ReturnType<typeof setup>>;
export async function apply(w: World, from: Client, value: string, recipients: Client[] = [w.owner, w.owner2, w.bob, w.dave], logical?: string, outcome: "apply" | "refuse" | "runtime-failure" = "apply") {
  const sub = await from.stageAction(value, logical ?? await ident(value), outcome); const e = await w.journal.append(sub); for (const c of recipients) await c.receive(e); return e;
}
const archiveOf = (w: World) => createArchive(w.owner, w.g.event, w.definition, w.starting);
const rootOf = (w: World) => ({ owner: w.g.context.owner, genesis: w.g.context.genesis, tip: w.journal.events.at(-1)!.id });
async function sameGood(c: Client, fn: () => Promise<unknown>, reason?: string) { const before = c.lastGood(); const error = await fail(fn, reason); equal(c.lastGood(), before, "failure changed accepted state"); return error; }
async function resignArchive(w: World, a: Archive): Promise<Archive> {
  a.checkpoint = sign(w.owner.keys.accountKey, "archive", w.g.context, { type: "owner-attested-full-prefix@1", bodyHash: await hash(a.body), vaultHash: await hash(w.owner.data), count: a.body.snapshot.events.length, tip: a.body.snapshot.events.at(-1)?.id ?? w.g.context.genesis }); return a;
}
export const scenarios = {
  async "archive-openings-and-closure"() {
    const w = await setup(); await apply(w, w.bob, "PRIVATE-ACTION-ONE"); await apply(w, w.owner, "PRIVATE-ACTION-TWO");
    const archive = await archiveOf(w); const v = await VerifiedArchive.verify(archive, rootOf(w)); equal(v.snapshot.outcomes, w.bob.data.outcomes, "archive outcomes differ");
    const encrypted = await encrypt(archive, hex(random()), w.g.context, 1, archive.checkpoint.id);
    check(!canonical(encrypted).includes("PRIVATE-ACTION") && !canonical(encrypted).includes("PRIVATE-DEFINITION"), "plaintext archive transport leak");
    note({ type: "archive-closure", trust: "owner-attested control history; message-specific AEAD openings with MLS and account signatures", independentlyReopenedApplications: v.snapshot.openings.length, positions: v.snapshot.events.length, definition: v.context.definition, tip: v.snapshot.events.at(-1)!.id });
  },
  async "archive-negative-coverage"() {
    const w = await setup(); await apply(w, w.bob, "archive negative first"); await apply(w, w.owner, "archive negative second"); const original = await archiveOf(w);
    const negative: Record<string, string> = {};
    const probe = async (name: string, mutate: (a: Archive) => void, resign = false) => {
      const a = clone(original); mutate(a); if (resign) await resignArchive(w, a);
      negative[name] = await fail(() => VerifiedArchive.verify(a, rootOf(w)));
    };
    await probe("tampered-body", a => { a.body.snapshot.outcomes[1]!.value = "changed"; });
    await probe("truncated", a => { a.body.snapshot.events.pop(); }, true);
    await probe("coverage-hole", a => { a.body.snapshot.openings.shift(); }, true);
    await probe("duplicate-opening", a => { a.body.snapshot.openings.push(clone(a.body.snapshot.openings[0]!)); }, true);
    await probe("wrong-definition", a => { a.body.definition.files[0]!.bytes = b64(utf8.encode("other")); }, true);
    await probe("valid-action-wrong-ciphertext", a => { a.body.snapshot.openings[0]!.action = a.body.snapshot.openings[1]!.action; }, true);
    await probe("corrupt-opening-key", a => { a.body.snapshot.openings[0]!.key = b64(new Uint8Array(16)); }, true);
    negative["wrong-root"] = await fail(() => VerifiedArchive.verify(original, { ...rootOf(w), owner: publicKey(testKey(45)) }));
    negative["wrong-instance"] = await fail(() => VerifiedArchive.verify(original, { ...rootOf(w), genesis: "f".repeat(64) }));
    note({ type: "archive-rejections", negative, checksBeforeInstallation: true });
  },
  async "archive-capacity-boundaries"() {
    const w = await setup();
    while (w.owner.data.events.length < limits.archiveEntries) await apply(w,w.owner,"archive maximum " + w.owner.data.events.length,[w.owner]);
    const maximum = await archiveOf(w); const verified = await VerifiedArchive.verify(maximum,rootOf(w));
    check(verified.snapshot.events.length === limits.archiveEntries,"maximum archive prefix did not verify");
    await apply(w,w.owner,"one beyond archive maximum",[w.owner]);
    const overEntries = await fail(()=>archiveOf(w),"archive prefix capacity");
    const key = hex(random()); const value = "x".repeat(limits.archive - 2); // Canonical string quotes make exactly 16 MiB.
    const encrypted = await encrypt(value,key,w.g.context,1,maximum.checkpoint.id);
    check(await decrypt(encrypted,key,w.g.context) === value,"maximum export bytes did not roundtrip");
    const overBytes = await fail(()=>encrypt(value+"x",key,w.g.context,1,maximum.checkpoint.id),"archive export capacity");
    note({type:"archive-capacity-boundaries",maximumVerifiedEntries:limits.archiveEntries,refusedEntries:limits.archiveEntries+1,maximumRoundtrippedPlaintextBytes:limits.archive,refusedPlaintextBytes:limits.archive+1,overEntries,overBytes,adoption:"longer admitted histories require a separately reviewed archive composition or instance-lifetime decision; no truncated prefix"});
  },
  async "fresh-device-and-all-device-loss"() {
    let w: World | null = await setup(); await apply(w, w.bob, "full prior history");
    const c = await w.owner.stageCommit([add(w.carolDevice)]); const ordered = await w.journal.append(c.event, c.admission);
    for (const client of [w.owner, w.owner2, w.bob, w.dave]) await client.receive(ordered);
    const archive = await archiveOf(w); const key = hex(random()); const encryptedArchive = await encrypt(archive, key, w.g.context, 1, archive.checkpoint.id);
    const packet = deliverKey(w.owner.keys.deviceKey, w.carolDevice.binding.device, w.g.context, key, archive.checkpoint.id);
    const material = receiveKey(w.carolDevice.deviceKey, w.owner.keys.binding.device, packet, w.g.context);
    const verified = await VerifiedArchive.verify(await decrypt(encryptedArchive, material.key, w.g.context) as Archive, { ...rootOf(w), checkpoint: material.checkpoint });
    const carol = await join(w.owner, w.carolDevice, c.event, verified.snapshot); equal(carol.data.outcomes, w.owner.data.outcomes, "newcomer full-history promise");
    const vaultKey = hex(random()); // Shared archive recipients must never receive the owner-only vault key.
    const ownerExport = await exportOwner(w.owner, archive, vaultKey, 1);
    await fail(() => recoverOwner(ownerExport, material.key, w!.g.context, rootOf(w!)), "wrong recovery key");
    const portable = canonical({ export: ownerExport, key: vaultKey, context: w.g.context, root: rootOf(w) });
    const expected = canonical(w.owner.data.outcomes); w = null; // No existing Client or MLS environment enters recovery.
    const parsed = JSON.parse(portable) as { export: typeof ownerExport; key: string; context: Context; root: ReturnType<typeof rootOf> };
    const restored = await recoverOwner(parsed.export, parsed.key, parsed.context, parsed.root); equal(canonical(restored.client.data.outcomes), expected, "all-device-loss outcomes");
    const journal = new Journal(parsed.context, testKey(39), clone(restored.client.data.public)); journal.events = clone(restored.client.data.events);
    const future = await restored.client.stageAction("after owner restoration", await ident("restored")); const next = await journal.append(future); await restored.client.receive(next); await carol.receive(next);
    equal(restored.client.data.outcomes, carol.data.outcomes, "restored actual crypto continuation");
    await fail(() => recoverOwner(parsed.export, testKey(48), parsed.context, parsed.root), "wrong recovery key");
    const corrupt = clone(parsed.export); corrupt.bytes = corrupt.bytes.slice(0, -4) + "AAAA"; await fail(() => recoverOwner(corrupt, parsed.key, parsed.context, parsed.root));
    note({ type: "fresh-and-loss-recovery", history: "full prefix under owner attestation", futureDecrypted: true, onlyDeclaredExportInputs: true, persistenceScope: "object reconstruction; not process/storage crash" });
  },
  async "recovery-rotation-and-revocation"() {
    const w = await setup(); await apply(w, w.bob, "history before rotation"); const old = await archiveOf(w); const key1 = hex(random()); const key2 = hex(random());
    const oldExport = await exportOwner(w.owner, old, key1, 1);
    await apply(w, w.bob, "future after wrapping key rotation"); const current = await archiveOf(w); const nextExport = await exportOwner(w.owner, current, key2, 2);
    await fail(() => recoverOwner(nextExport, key1, w.g.context, rootOf(w)), "wrong recovery key");
    const oldHolder = await recoverOwner(oldExport, key1, w.g.context, { owner: w.g.context.owner, genesis: w.g.context.genesis });
    for (const e of w.journal.events.slice(oldHolder.client.data.events.length)) await oldHolder.client.receive(e);
    equal(oldHolder.client.data.outcomes, w.owner.data.outcomes, "old MLS state can still catch up: do not claim wrapping-key revocation");
    const rotated = await w.owner2.stageCommit([remove(w.owner2, w.ownerDevice)]); const removal = await w.journal.append(rotated.event, rotated.admission);
    for (const c of [w.owner, w.owner2, w.bob, w.dave, oldHolder.client]) await c.receive(removal);
    const sub = await w.bob.stageAction("after old owner-device removal", await ident("post-owner-device-removal")); const e = await w.journal.append(sub);
    for (const c of [w.owner2, w.bob, w.dave]) await c.receive(e);
    const cryptoError = await fail(() => mls.processMessage({ context: oldHolder.client.env, state: decodeState(oldHolder.client.data.state), message: privateMessage(submission(sub, w.g.context).bytes) }), "OperationError");
    check(decodeState(oldHolder.client.data.state).groupActiveState.kind === "removedFromGroup", "old material removal terminal");
    note({ type: "rotation-limits", oldKeyOpensNewArchive: false, oldMaterialBeforeMlsRevocation: "can catch up and decrypt", afterDeviceRemoval: cryptoError, ownerAccountKeyLeak: "immutable owner/archive attestation identity remains compromised; no owner transfer in v0" });
  },
  async "owner-admission-one-boundary"() {
    const w = await setup(); await apply(w, w.bob, "before join"); const c = await w.owner.stageCommit([add(w.carolDevice)]);
    const before = w.journal.events.length; check(await w.journal.half(c.event.id, "admission", c.admission) === null, "half advanced boundary"); check(w.journal.events.length === before, "half appended");
    const restarted = w.journal.restore(); const e = await restarted.half(c.event.id, "submission", c.event); check(e, "paired control not appended"); w.journal = restarted;
    for (const client of [w.owner, w.owner2, w.bob, w.dave]) await client.receive(e);
    const archive = await archiveOf(w); const verified = await VerifiedArchive.verify(archive, rootOf(w)); const carol = await join(w.owner, w.carolDevice, c.event, verified.snapshot);
    await apply(w, carol, "approved new member", [w.owner, w.owner2, w.bob, w.dave, carol]); equal(w.owner.data.outcomes, carol.data.outcomes, "join boundary differs");
    await fail(() => w.bob.stageCommit(), "owner offline");
    const absentOwner = await device(w.env, w.g.context, testKey(42)); await fail(() => w.journal.append(sign(absentOwner.deviceKey, "submission", w.g.context, submission(c.event, w.g.context))), "not currently admitted");
    const removeDave = await w.owner.stageCommit([remove(w.owner, w.daveDevice)]); const competingJoin = await w.owner2.stageCommit([add(w.bob2Device)]);
    const winner = await w.journal.append(removeDave.event, removeDave.admission); const loser = await w.journal.append(competingJoin.event, competingJoin.admission);
    for (const client of [w.owner, w.owner2, w.bob, w.dave, carol]) await client.receive(winner);
    for (const client of [w.owner, w.owner2, w.bob, carol]) await client.receive(loser);
    check(w.owner2.data.pending === null && w.owner2.data.outcomes.at(-1)!.disposition === "stale", "losing control disposition");
    note({ type: "atomic-admission", publicVersion: w.owner.data.public.version, epoch: w.owner.epoch, oneHalfChangesNothing: true, concurrentLoser: "common stale", ownerOffline: "pending/refused, no delegated bypass" });
  },
  async "mismatched-membership-stalls"() {
    const w = await setup(); const c = await w.owner.stageCommit([add(w.carolDevice)]); const wrong = clone(control(c.admission, w.g.context)); wrong.members = wrong.members.filter(m => m.device !== w.carolDevice.binding.device);
    const declared = sign(w.owner.keys.accountKey, "admission", w.g.context, wrong); const acceptedByOpaque = await w.journal.append(c.event, declared);
    const failures = [];
    for (const client of [w.owner, w.owner2, w.bob]) failures.push(await sameGood(client, () => client.receive(acceptedByOpaque), "membership/owner declaration mismatch"));
    note({ type: "opaque-admission-stall", publicJournalCanRetainInvalidInnerTransition: true, failures, frontierPreserved: true, recovery: "no repair/skip protocol" });
  },
  async "prefix-interleaving-and-restarts"() {
    const w = await setup(); const alternate = w.dave.restart(); const base = clone(w.dave.data.outcomes);
    const first = await w.owner.stageCommit(); const competing = await w.owner2.stageCommit();
    w.owner = w.owner.restart(); w.owner2 = w.owner2.restart();
    await apply(w, w.bob, "earlier accepted application while two Commits pending");
    const fixed = clone(w.owner.data.outcomes); check(w.owner.data.pending && w.owner2.data.pending, "pending Commit lost on interleaving");
    const winner = await w.journal.append(first.event, first.admission); const loser = await w.journal.append(competing.event, competing.admission);
    for (const c of [w.owner, w.owner2, w.bob, w.dave]) { await c.receive(winner); await c.receive(loser); }
    for (const e of w.journal.events.slice(base.length)) { await alternate.receive(e); await alternate.receive(e); }
    equal(alternate.data.outcomes, w.owner.data.outcomes, "different batches/duplicates change outcomes");
    equal(w.owner.data.outcomes.slice(0, fixed.length), fixed, "later prefix withdrew action");
    check(!w.owner.data.pending && !w.owner2.data.pending, "self echo did not settle");
    const pendingAction = await w.owner.stageAction("pending application restart", await ident("pending-app")); w.owner = w.owner.restart();
    const accepted = await w.journal.append(pendingAction); for (const c of [w.owner, w.owner2, w.bob, w.dave]) await c.receive(accepted);
    w.owner = w.owner.restart(); const published = w.owner.publish(); check(published.length > 0, "publication absent"); w.owner = w.owner.restart(); check(w.owner.publish().length === 0, "duplicate publication after marker");
    note({ type: "prefix-stability", position: w.owner.data.events.length, fixedPrefixUnchanged: true, ownerWinnerAndLoser: true, reconstructions: ["staged Commit", "staged application", "accepted", "published"], durability: "serialization only" });
  },
  async "offline-beyond-retained-epochs"() {
    const w = await setup(); const stale = await w.dave.stageAction("late old epoch action", await ident("stale")); const start = w.dave.data.events.length;
    for (let i = 0; i < 7; i++) {
      const c = await w.owner.stageCommit(); const e = await w.journal.append(c.event, c.admission); for (const client of [w.owner, w.owner2, w.bob]) await client.receive(e);
    }
    check(decodeState(w.owner.data.state).historicalReceiverData.size <= 4, "library retained epoch window changed");
    const future = await apply(w, w.bob, "after long offline interval", [w.owner, w.owner2, w.bob]);
    check(await w.dave.receive(future) === "wait", "gap did not pause"); equal(w.dave.data.events.length, start, "gap advanced frontier");
    w.dave = w.dave.restart(); for (const e of w.journal.events.slice(start)) await w.dave.receive(e);
    const late = await w.journal.append(stale); for (const c of [w.owner, w.owner2, w.bob, w.dave]) await c.receive(late);
    equal(w.dave.data.outcomes, w.owner.data.outcomes, "offline catch-up differs"); check(w.dave.data.outcomes.at(-1)!.disposition === "stale", "old epoch was not commonly stale");
    note({ type: "offline-window", missedMembershipEpochs: 7, actualRetainedEpochs: decodeState(w.owner.data.state).historicalReceiverData.size, catchUp: "replay every signed Commit from retained own state", lateAction: "common stale from authenticated epoch/version" });
  },
  async "removed-history-holder-and-exact-retry"() {
    const w = await setup(); const prior = await apply(w, w.dave, "Dave previously committed"); const priorSub = entry(prior, w.g.context).submission;
    const archive = await archiveOf(w); const oldVerified = await VerifiedArchive.verify(archive, rootOf(w));
    check(!Object.hasOwn(archive.body.snapshot, "state"), "shared archive contains a live MLS state");
    const c = await w.owner.stageCommit([remove(w.owner, w.daveDevice)]); const removed = await w.journal.append(c.event, c.admission); for (const client of [w.owner, w.owner2, w.bob, w.dave]) await client.receive(removed);
    const sub = await w.bob.stageAction("future secret after Dave removal", await ident("future-private")); const e = await w.journal.append(sub); for (const client of [w.owner, w.owner2, w.bob]) await client.receive(e);
    const terminal = decodeState(w.dave.data.state); check(terminal.groupActiveState.kind === "removedFromGroup", "removal not consumed");
    const futureBytes = privateMessage(submission(sub, w.g.context).bytes);
    const directFailure = await fail(() => mls.processMessage({ context: w.env, state: terminal, message: futureBytes }), "OperationError");
    const openingFailures = [];
    for (const opening of oldVerified.snapshot.openings) openingFailures.push(await fail(() => verifyOpening(opening, futureBytes, w.env, w.g.context)));
    equal(await w.journal.append(priorSub), prior, "revoked exact retry lost committed receipt");
    const changedRetry = signRaw(w.dave.keys.deviceKey, kinds.submission, priorSub.tags, priorSub.content, priorSub.created_at + 1);
    await fail(() => w.journal.append(changedRetry), "not currently admitted");
    note({ type: "history-holder-exclusion", actualRemovedTerminal: true, directFailure, oldMessageOpeningsCannotOpenFuture: openingFailures.length, retainedHistoricalPrefix: oldVerified.snapshot.events.length, revokedExactReceipt: "original returned", revokedNewEvent: "refused" });
  },
  async "multi-device-membership"() {
    const w = await setup(); const c = await w.owner.stageCommit([add(w.bob2Device)]); const e = await w.journal.append(c.event, c.admission); for (const client of [w.owner, w.owner2, w.bob, w.dave]) await client.receive(e);
    const archive = await archiveOf(w); const verified = await VerifiedArchive.verify(archive, rootOf(w)); const bob2 = await join(w.owner, w.bob2Device, c.event, verified.snapshot);
    const removal = await w.owner.stageCommit([remove(w.owner, w.bobDevice)]); const r = await w.journal.append(removal.event, removal.admission); for (const client of [w.owner, w.owner2, w.bob, w.dave, bob2]) await client.receive(r);
    await apply(w, bob2, "same account, surviving admitted device", [w.owner, w.owner2, w.dave, bob2]);
    check(w.owner.data.public.members.some(m => m.account === w.bob.keys.binding.account && m.device === bob2.keys.binding.device), "second device authority lost");
    check(!w.owner.data.public.members.some(m => m.device === w.bob.keys.binding.device), "removed device authority retained");
    note({ type: "multi-device", distinctDeviceKeys: true, sameAccountProof: true, removedDeviceDenied: true, copiedAccountKeyLimit: "cannot revoke an account-secret copy; new device still needs owner and transport admission" });
  },
  async "explicit-failure-dispositions"() {
    const w = await setup(); await apply(w, w.bob, "business rule refuses", undefined, undefined, "refuse"); equal(w.owner.data.outcomes, w.dave.data.outcomes, "business disposition differs");
    const sub = await w.bob.stageAction("runtime failure", await ident("runtime-failure"), "runtime-failure"); const e = await w.journal.append(sub);
    await sameGood(w.owner, () => w.owner.receive(e), "runtime failure"); await sameGood(w.dave, () => w.dave.receive(e), "runtime failure");
    const w2 = await setup(); const honest = await w2.bob.stageAction("opaque invalid test", await ident("opaque")); const damaged = clone(submission(honest, w2.g.context));
    const bytes = unb64(damaged.bytes); bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1; damaged.bytes = b64(bytes); const badSub = sign(w2.bob.keys.deviceKey, "submission", w2.g.context, damaged); const bad = await w2.journal.append(badSub);
    await sameGood(w2.owner, () => w2.owner.receive(bad)); await sameGood(w2.dave, () => w2.dave.receive(bad));
    const local = w2.owner.restart(); const state = decodeState(local.data.state); state.keySchedule.senderDataSecret.fill(0); local.data.state = b64(mls.encode(mls.clientStateEncoder, state));
    const honestOrder = sign(testKey(39), "order", w2.g.context, { ...entry(bad, w2.g.context), submission: honest });
    await sameGood(local, () => local.receive(honestOrder), "observed fork");
    const noSecrets = w2.dave.restart(); noSecrets.data.state = ""; await sameGood(noSecrets, () => noSecrets.receive(bad), "MLS state");
    const w3 = await setup(); const valid = await w3.bob.stageAction("valid ciphertext, damaged local key", await ident("local-key")); const validOrder = await w3.journal.append(valid);
    const damagedLocal = w3.dave.restart(); const isolated = decodeState(damagedLocal.data.state); isolated.keySchedule.senderDataSecret.fill(0); damagedLocal.data.state = b64(mls.encode(mls.clientStateEncoder, isolated));
    const localKeyError = await sameGood(damagedLocal, () => damagedLocal.receive(validOrder), "OperationError");
    await w3.dave.receive(validOrder); await w3.owner.receive(validOrder); equal(w3.dave.data.outcomes, w3.owner.data.outcomes, "valid peer must progress past local key damage");
    note({ type: "failure-policy", business: "deterministic refusal", runtime: "pause", invalidCiphertext: "instance stall", localMissingKey: "local pause", corruptLocalKey: localKeyError, validPeerProgresses: true, fork: "permanent observed halt", noPrivateFactSkip: true, repairProtocol: "none" });
  },
  async "strict-wire-and-identities"() {
    const w = await setup(); const logical = await ident("stable logical identity"); const sub = await w.bob.stageAction("Nostr proof: café / 雪 / \\ / \"", logical); const e = await w.journal.append(sub);
    for (const c of [w.owner, w.owner2, w.bob, w.dave]) await c.receive(e);
    readEvent(eventBytes(e)); equal(readFrame(frame(["EVENT", e])), ["EVENT", e], "NIP frame bytes");
    const negatives: Record<string, string> = {};
    for (const key of ["id", "pubkey", "created_at", "kind", "tags", "content", "sig"] as const) {
      const altered = clone(e) as unknown as Record<string, unknown>; const value = altered[key]; altered[key] = typeof value === "number" ? value + 1 : Array.isArray(value) ? [...value, ["extra", "x"]] : "0" + value;
      negatives[`signed-${key}`] = await fail(() => readEvent(canonical(altered)));
    }
    const raw = eventBytes(e);
    for (const [name, value] of Object.entries({ duplicate: raw.replace('{"content":', '{"kind":8792,"content":'), whitespace: " " + raw,
      unknown: canonical({ ...e, extra: true }), fractional: raw.replace('"kind":8792', '"kind":8792.0'), exponent: raw.replace('"kind":8792', '"kind":8.792e3') })) negatives[name] = await fail(() => readEvent(value));
    for (const [name, value] of Object.entries({ negativeZero: "-0", unsafe: "9007199254740992", depth: "[".repeat(34) + "0" + "]".repeat(34), surrogate: '"\\ud800"' })) negatives[name] = await fail(() => parse(value));
    for (const s of ["Zg", "Zh==", "Zg==\n", "****", "A===", "=AAA", "AA=A", "===="]) negatives[`base64-${s.length}-${s[0]}`] = await fail(() => unb64(s));
    const cross = { ...w.g.context, definition: "f".repeat(64) }; negatives["foreign-definition"] = await fail(() => read(eventBytes(sub), "submission", cross));
    const duplicateTags = signRaw(w.bob.keys.deviceKey, sub.kind, [...sub.tags, sub.tags[0]!], sub.content); negatives["duplicate-tags"] = await fail(() => read(eventBytes(duplicateTags), "submission", w.g.context));
    const reencrypted = await w.bob.stageAction("Nostr proof: café / 雪 / \\ / \"", logical); check(reencrypted.id !== sub.id, "different ciphertext submission identity");
    const e2 = await w.journal.append(reencrypted); for (const c of [w.owner, w.owner2, w.bob, w.dave]) await c.receive(e2);
    check(w.owner.data.outcomes.at(-1)!.disposition === "duplicate", "reencryption duplicated logical action");
    note({ type: "wire-negative-matrix", negatives, identities: { logical, submission: sub.id, reencrypted: reencrypted.id, order: e.id }, exactRetry: "saved event bytes", logicalDuplicate: "same signed action ID; changed logical content stalls" });
  },
  async "signer-capabilities-and-invitation"() {
    const w = await setup(); const local = localSigner(w.owner.keys.accountKey);
    const template = { kind: 8794, created_at: 1788739200, tags: [["noseq", "signer-capability-vector"]], content: "standard NIP-01 event proof" };
    await signerProof(local, template); await signerProof(capability(local), template);
    await fail(() => capability({ present: true }), "unsupported signer");
    const simulatedRemote = nip46Capability(async (method: string, params: string[]) => {
      if (method === "get_public_key") return local.getPublicKey();
      if (method === "sign_event") return eventBytes(await local.signEvent(parse(params[0]!) as typeof template));
      throw new Error("unsupported method");
    });
    await signerProof(simulatedRemote, template);
    await fail(() => signerProof(nip46Capability(async () => { throw new Error("unsupported sign_event"); }), template), "unsupported");
    await fail(() => signerProof({ getPublicKey: local.getPublicKey, async signEvent(t) { return local.signEvent({ ...t, content: "substituted" }); } }, template), "substitution");
    const now = 1788739200; const invitation = invite(w.owner.keys.accountKey, w.g.context, { recipient: w.carolDevice.binding.device, nonce: hex(random()), expires: now + 300, history: "owner-attested-full-prefix@1", origin: "http://127.0.0.1:4176", version: w.owner.data.public.version });
    validateInvite(invitation, w.g.context, w.carolDevice.binding.device, now, "http://127.0.0.1:4176");
    await fail(() => validateInvite(invitation, w.g.context, w.carolDevice.binding.device, now + 301, "http://127.0.0.1:4176"), "expired");
    await fail(() => validateInvite(invitation, w.g.context, w.bob.keys.binding.device, now, "http://127.0.0.1:4176"), "binding");
    await fail(() => validateInvite(invitation, w.g.context, w.carolDevice.binding.device, now, "https://evil.example"), "binding");
    note({ type: "signer-capability", local: "real Nostr signing", nip07: "simulated getPublicKey/signEvent capability", nip46: "simulated authenticated RPC surface only", liveExternalInterop: "untested", rawDigestSigningRequired: false, invitation: "recipient/origin/expiry/history bound; redemption service remains P8" });
  },
  async "encoded-resource-budget"() {
    const w = await setup(); const logical = await ident("maximum action"); const base = { device: w.bob.keys.binding.device, logical, value: "", outcome: "apply" };
    const length = limits.action - utf8.encode(canonical(base)).length; const e = await apply(w, w.bob, "X".repeat(length), undefined, logical);
    const sub = entry(e, w.g.context).submission; const expansion = { plainActionBytes: limits.action, submissionBytes: utf8.encode(eventBytes(sub)).length, entryBytes: utf8.encode(eventBytes(e)).length, frameBytes: utf8.encode(frame(["EVENT", "history-page", e])).length };
    check(expansion.entryBytes <= limits.event && expansion.frameBytes <= limits.frame, "legitimate action exceeds frozen cap");
    const excessId = await ident("over cap"); await fail(() => w.bob.stageAction("X".repeat(length + 1), excessId), "action bytes");
    const additions: Device[] = [];
    for (let i = 0; i < 12; i++) additions.push(await device(w.env, w.g.context, testKey(32 + i % 3), testKey(60 + i)));
    const excessive = { ...w.bobDevice.keys.publicPackage, signature: new Uint8Array(limits.keyPackage + 1) };
    await fail(() => w.owner.stageCommit([{ proposalType: mls.defaultProposalTypes.add, add: { keyPackage: excessive } }]), "KeyPackage bytes");
    await fail(() => w.owner.stageCommit([...additions.map(add), add(w.carolDevice)]), "device limit before crypto");
    await fail(() => w.owner.stageCommit(Array.from({ length: limits.proposals + 1 }, () => add(w.carolDevice))), "proposal count before crypto");
    const c = await w.owner.stageCommit(additions.map(add)); const controlEntry = await w.journal.append(c.event, c.admission);
    check(utf8.encode(eventBytes(controlEntry)).length <= limits.event, "16-device Commit envelope too large"); await w.owner.receive(controlEntry);
    const welcome = w.owner.data.released[c.event.id]!; const welcomeEvent = sign(w.owner.keys.deviceKey, "welcome", w.g.context, { commit: c.event.id, bytes: welcome }); read(eventBytes(welcomeEvent), "welcome", w.g.context);
    const encryptedChunk = await encrypt({ index: 0, count: 1, bytes: b64(random(limits.chunk)) }, hex(random()), w.g.context, 1, w.g.context.definition);
    const chunkEvent = sign(w.owner.keys.deviceKey, "chunk", w.g.context, encryptedChunk); read(eventBytes(chunkEvent), "chunk", w.g.context);
    await fail(() => frame(["EVENT", "x".repeat(limits.frame)]), "frame bytes");
    await fail(() => readEvent("x".repeat(limits.event + 1)), "string bound");
    note({ type: "encoded-budgets", ...expansion, devices: w.owner.data.public.members.length, commitEntryBytes: utf8.encode(eventBytes(controlEntry)).length, welcomeEventBytes: utf8.encode(eventBytes(welcomeEvent)).length, chunkPlainBytes: limits.chunk, chunkEventBytes: utf8.encode(eventBytes(chunkEvent)).length, archiveBytesCap: limits.archive, archiveEntriesCap: limits.archiveEntries, overCap: "refuse before accepting or encrypting action" });
  },
  async "relay-policy-conformance"() {
    const w = await setup(); const relay = new RelayPolicy(w.g.context, clone(w.owner.data.public), [publicKey(testKey(50))]); const url = "ws://127.0.0.1:4177/instance/" + w.g.context.genesis;
    const reader = relay.session(url, hex(random())); const publisher = relay.session(url, hex(random())); const stranger = relay.session(url, hex(random())); const now = 1788739200;
    authenticate(publisher, authEvent(testKey(39), publisher, now), now); authenticate(reader, authEvent(w.bob.keys.deviceKey, reader, now), now); authenticate(stranger, authEvent(testKey(49), stranger, now), now);
    for (const e of w.journal.events) relay.retain(publisher, e); const fixed = relay.retained.at(-1)!.id;
    await fail(() => relay.history(stranger, fixed, 0), "restricted");
    const wrong = authEvent(w.bob.keys.deviceKey, { ...reader, url: url + "/wrong" }, now); await fail(() => authenticate(reader, wrong, now), "exact URL");
    await fail(() => authenticate(reader, authEvent(w.bob.keys.deviceKey, reader, now - 61), now), "AUTH time");
    const later = await apply(w, w.bob, "published during historical query"); relay.retain(publisher, later); relay.retain(publisher, later);
    check(relay.history(reader, fixed, 0).length === 1 && relay.retained.length === 2, "fixed-tip paging or dedup failure");
    const finalTip = relay.retained.at(-1)!.id; const pages = [relay.history(reader, finalTip, 0, 1), relay.history(reader, finalTip, 1, 1)]; equal(pages.flat(), relay.retained, "exact ID/position backfill incomplete");
    await fail(() => relay.live(reader, later, limits.liveEvents, 0), "slow reader");
    relay.admission.members = relay.admission.members.filter(m => m.device !== w.bob.keys.binding.device);
    await fail(() => relay.history(reader, finalTip, 0), "restricted"); await fail(() => relay.live(reader, later, 0, 0), "restricted");
    const before = clone(relay.retained); relay.bytes = limits.journal; const more = await apply(w, w.owner, "capacity refusal"); await fail(() => relay.retain(publisher, more), "retention full"); equal(relay.retained, before, "acknowledged history evicted");
    check(relay.metadata().limitation.max_message_length === limits.frame, "NIP-11 bytes unit");
    note({ type: "relay-profile", execution: "pure conformance model, not a real relay", injectedRosterHistoryAndLive: true, fixedTipComplete: true, authDoesNotAdmit: true, noEviction: true, actualMirrorAcceptance: "separate native size/COUNT and G5-F01..F08 socket suites; this case is only a model", nip70: "not used: would require event author AUTH for replication" });
  },
};
export type Scenario = keyof typeof scenarios;
export async function runScenario(name: Scenario) {
  observations.length = 0; worlds.length = 0;
  const fixtures = () => worlds.map(w => ({ root: w.root, context: w.context, definition: w.definition, initial: w.initial, ordered: w.journal.events, frontier: w.owner.data.events.at(-1)?.id ?? w.context.genesis, outcomes: w.owner.data.outcomes }));
  try { await scenarios[name](); return { name, status: "passed", observations: clone(observations), fixtures: fixtures() }; }
  catch (error) { return { name, status: "failed", observations: clone(observations), fixtures: fixtures(), error: String(error) }; }
}
