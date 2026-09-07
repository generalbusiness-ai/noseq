import { add, check, decodeState, digest, envelope, envelopeId, environment, equal, group, hex, initial,
  instance, join, mls, mustFail, order, resignEnvelope, trace, unhex, type Client } from "./fixture.ts";

async function unchanged(client: Client, operation: () => Promise<unknown>, failure?: string) {
  const before = client.lastGoodSnapshot(); await mustFail(operation, failure); equal(client.lastGoodSnapshot(), before, "failed input changed last-good snapshot");
}
export const scenarios = {
  async "authenticated-leaves"() {
    const env = await environment(); const leaf = env.devices.bob!.publicPackage.leafNode;
    const verify = env.context.authService.validateCredential;
    check(await verify(leaf.credential, leaf.signaturePublicKey), "valid binding rejected");
    check(!await verify(leaf.credential, env.devices.alice!.publicPackage.leafNode.signaturePublicKey), "substituted MLS key accepted");
    check("identity" in leaf.credential, "basic credential expected");
    const proof = JSON.parse(new TextDecoder().decode(leaf.credential.identity));
    const badSignature = { ...proof, signature: "00".repeat(64) };
    check(!await verify({ credentialType: 1, identity: new TextEncoder().encode(JSON.stringify(badSignature)) }, leaf.signaturePublicKey), "invalid account signature accepted");
    proof.body[1] = "other-instance";
    check(!await verify({ credentialType: 1, identity: new TextEncoder().encode(JSON.stringify(proof)) }, leaf.signaturePublicKey), "wrong domain accepted");
    const g = await group();
    check(g.env.validation.accepted > 8, "MLS did not invoke real credential verification for add/join");
    const bad = structuredClone(g.env.devices.carol!);
    check("identity" in bad.publicPackage.leafNode.credential, "basic credential expected");
    bad.publicPackage.leafNode.credential.identity[0] = bad.publicPackage.leafNode.credential.identity[0]! ^ 1;
    await unchanged(g.alice, () => g.alice.stageCommit([add(bad)]));
  },
  async "provisional-state"() {
    const env = await environment(); let alice = await initial(env);
    const accepted = alice.data.state; const frontier = structuredClone(alice.frontier);
    const beforeGeneration = alice.snapshot();
    const commit = await alice.stageCommit([add(env.devices.bob!)]);
    const pending = structuredClone(alice.data.pending!);
    equal(alice.data.state, accepted, "generation changed accepted state");
    equal(alice.frontier, frontier, "local send finalized an outcome");
    check(pending.state !== accepted && pending.welcome !== null, "no real staged Commit/Welcome");
    equal(Object.keys(alice.data.released), [], "Welcome exposed before echo");
    await mustFail(() => join(alice, "bob", commit, pending.welcome!), "not released");
    alice = alice.restart();
    equal(alice.data.pending, pending, "pending serialization lost data");
    equal(alice.frontier, frontier, "staging restart advanced frontier");
    check(beforeGeneration !== alice.snapshot(), "pending state not recorded");
    await alice.receive(await order(null, commit));
    const bob = await join(alice, "bob", commit, alice.data.released[await envelopeId(commit)]!);
    const app = await alice.stageApplication("after accepted Welcome");
    const entry = await order(alice.last, app);
    await alice.receive(entry); await bob.receive(entry);
    equal(alice.data.outcomes, bob.data.outcomes, "accepted branch cannot decrypt");
  },
  async "competing-self-echo-welcome"() {
    const { alice, bob, dave, env } = await group();
    // Finalize a prefix before either candidate exists. Every extension must preserve it.
    const first = await order(alice.last, await dave.stageApplication("stable prefix"));
    await alice.receive(first); await bob.receive(first); await dave.receive(first);
    const prefix = structuredClone(alice.data.outcomes);
    const winner = await alice.stageCommit([add(env.devices.carol!)]);
    const loser = await bob.stageCommit([add(env.devices.carol!)]);
    const losingWelcome = bob.data.pending!.welcome!;
    const winning = await order(first, winner); const losing = await order(winning, loser);
    const beforeGap = bob.lastGoodSnapshot(); equal(await bob.receive(losing), "wait", "gap not held");
    equal(bob.lastGoodSnapshot(), beforeGap, "gap moved last-good state");
    await alice.receive(winning); await alice.receive(losing);
    await bob.receive(winning); check(!bob.data.pending && bob.data.discarded === 1, "losing provisional state retained");
    await bob.receive(losing);
    await dave.receive(winning); await dave.receive(losing);
    check(!alice.data.pending && alice.data.discarded === 0, "winner discarded its accepted provisional state");
    equal(bob.data.applied.at(-1)!.disposition, "stale", "loser own echo was not stale");
    await mustFail(() => join(bob, "carol", loser, losingWelcome), "not released");
    await mustFail(() => join(alice, "carol", winner, losingWelcome), "not released");
    const carol = await join(alice, "carol", winner, alice.data.released[await envelopeId(winner)]!);
    const application = await order(losing, await dave.stageApplication("winning branch"));
    for (const c of [alice, bob, dave, carol]) await c.receive(application);
    equal(alice.data.outcomes, bob.data.outcomes, "clients disagree after different batches");
    equal(alice.data.outcomes, dave.data.outcomes, "sender self-echo disagrees with decryption");
    equal(alice.data.outcomes.slice(0, prefix.length), prefix, "finalized prefix withdrawn");
    equal(carol.data.outcomes, alice.data.outcomes.slice(prefix.length), "joiner cannot decrypt accepted future");
    equal(await bob.receive(losing), "duplicate", "ordered replay not idempotent");
    equal(alice.data.outcomes, bob.data.outcomes, "replay changed outcome history");
  },
  async "signed-order-boundaries"() {
    const { alice, bob } = await group();
    const next = await order(alice.last, await alice.stageCommit());
    const tampered = structuredClone(next); tampered.signature = "00".repeat(64);
    await unchanged(bob, () => bob.receive(tampered), "order signature");
    const wrong = await order(bob.last, next.envelope, { instance: instance + "/other" });
    await unchanged(bob, () => bob.receive(wrong), "instance/genesis");
    const wrongGenesis = await order(bob.last, next.envelope, { genesis: "00".repeat(32) });
    await unchanged(bob, () => bob.receive(wrongGenesis), "instance/genesis");
    const broken = await order(bob.last, next.envelope, { previous: "00".repeat(32) });
    const brokenReceiver = bob.restart(); await unchanged(brokenReceiver, () => brokenReceiver.receive(broken), "continuity fork");
    await unchanged(brokenReceiver.restart(), () => brokenReceiver.restart().receive(next), "signed fork");
    const gap = await order(next, next.envelope); const gapReceiver = bob.restart(); const before = gapReceiver.lastGoodSnapshot();
    equal(await gapReceiver.receive(gap), "wait", "gap not held"); equal(gapReceiver.lastGoodSnapshot(), before, "gap changed frontier");
    const substituted = await resignEnvelope({ ...next.envelope, sender: "bob" });
    const substitutedReceiver = bob.restart();
    await unchanged(substitutedReceiver, async () => substitutedReceiver.receive(await order(bob.last, substituted)), "commit was not accepted");
    await alice.receive(next); await bob.receive(next);
    const accepted = bob.snapshot(); equal(await bob.receive(next), "duplicate", "exact duplicate not recognized");
    equal(bob.snapshot(), accepted, "duplicate changed accepted state");
    const fork = await order(null, next.envelope);
    const forkReceiver = bob.restart(); await unchanged(forkReceiver, () => forkReceiver.receive(fork), "signed fork");
    const afterFork = forkReceiver.restart(); await unchanged(afterFork, () => afterFork.receive(next), "halted after observed signed fork");
    const author = structuredClone(next.envelope); author.signature = "00".repeat(64);
    const badAuthorReceiver = bob.restart(); await unchanged(badAuthorReceiver, async () => badAuthorReceiver.receive(await order(bob.last, author)), "author proof");
    const ahead = await alice.stageCommit(); await alice.receive(await order(alice.last, ahead));
    const future = await alice.stageApplication("requires missing epoch");
    const unavailable = await order(bob.last, future);
    const prior = bob.lastGoodSnapshot(); equal(await bob.receive(unavailable), "wait", "future epoch skipped");
    equal(bob.lastGoodSnapshot(), prior, "unavailable epoch changed frontier");
  },
  async "pending-interleaving"() {
    const { alice, bob, dave, env } = await group();
    const winner = await alice.stageCommit([add(env.devices.carol!)]);
    const loser = await bob.stageCommit([add(env.devices.carol!)]);
    await unchanged(alice, () => alice.stageApplication("second local operation"), "one local pending operation");
    const app = await order(alice.last, await dave.stageApplication("application before Commit echo"));
    await alice.receive(app); await bob.receive(app); await dave.receive(app);
    const winning = await order(app, winner); const losing = await order(winning, loser);
    const restarted = alice.restart();
    for (const c of [alice, bob, dave, restarted]) { await c.receive(winning); await c.receive(losing); }
    equal(alice.data.outcomes, bob.data.outcomes, "interleaving lost accepted application");
    equal(alice.snapshot(), restarted.snapshot(), "interleaving pending restart differs");
    const next = await alice.stageApplication("pending local application");
    const peer = await order(losing, await bob.stageApplication("peer application before local echo"));
    for (const c of [alice, bob, dave]) await c.receive(peer);
    const echo = await order(peer, next);
    for (const c of [alice, bob, dave]) await c.receive(echo);
    equal(alice.data.outcomes, bob.data.outcomes, "pending application ratchet diverged");
    equal(alice.data.outcomes, dave.data.outcomes, "pending application self-echo diverged");
  },
  async "restart-boundaries"() {
    const { alice, bob, env } = await group();
    const beforeGeneration = alice.restart();
    equal(beforeGeneration.snapshot(), alice.snapshot(), "accepted restart differs");
    const commit = await alice.stageCommit([add(env.devices.carol!)]);
    const staged = alice.restart();
    const entry = await order(alice.last, commit);
    await alice.receive(entry); await staged.receive(entry); await bob.receive(entry);
    equal(staged.snapshot(), alice.snapshot(), "restart before self-echo differs");
    const acceptedRestart = staged.restart();
    equal(await acceptedRestart.receive(entry), "duplicate", "restart after acceptance re-applied Commit");
    const app = await bob.stageApplication("retained outcome"); const sendRestart = bob.restart();
    const application = await order(entry, app);
    await bob.receive(application); await sendRestart.receive(application);
    equal(bob.snapshot(), sendRestart.snapshot(), "staged application restart differs");
    const beforeDecrypt = acceptedRestart.restart();
    await acceptedRestart.receive(application); await beforeDecrypt.receive(application);
    equal(beforeDecrypt.snapshot(), acceptedRestart.snapshot(), "replay before decryption differs");
    const beforePublish = acceptedRestart.restart();
    equal(beforePublish.publish(), acceptedRestart.publish(), "restart before outcome publication differs");
    const afterPublish = beforePublish.restart(); equal(afterPublish.publish(), [], "recorded publication duplicated");
    // Exposes the limit: without persisting the publication marker, external delivery can duplicate.
    check(beforeDecrypt.publish().length === 1, "unpersisted publication boundary was falsely exactly-once");
  },
  async "future-exclusion"() {
    const { alice, bob, dave } = await group();
    // P1B-01: isolate removal from lag using a separate no-removal continuation of the same starting state.
    const controlAlice = alice.restart(); const controlDave = dave.restart();
    const controlCommit = await order(controlAlice.last, await controlAlice.stageCommit());
    await controlAlice.receive(controlCommit);
    const controlPayload = await controlAlice.stageApplication("retained Dave after normal epoch change");
    const controlEntry = await order(controlCommit, controlPayload);
    const controlMessage = mls.decode(mls.mlsMessageDecoder, unhex(controlPayload.bytes));
    check(controlMessage && controlMessage.wireformat === mls.wireformats.mls_private_message, "private control message required");
    const lagFailure = await mustFail(() => mls.processMessage({ context: controlDave.env.context, state: decodeState(controlDave.data.state), message: controlMessage }), "OperationError");
    await controlDave.receive(controlCommit); await controlDave.receive(controlEntry); await controlAlice.receive(controlEntry);
    check(decodeState(controlDave.data.state).groupActiveState.kind === "active", "retained control member not active");
    equal(controlDave.data.outcomes, controlAlice.data.outcomes, "ordinary lag did not recover after consuming the Commit");
    const removed = decodeState(dave.data.state).privatePath.leafIndex;
    const oldState = dave.data.state; const oldEpoch = dave.epoch;
    const remove = await alice.stageCommit([{ proposalType: mls.defaultProposalTypes.remove, remove: { removed } }]);
    const entry = await order(alice.last, remove);
    await alice.receive(entry); await bob.receive(entry); await dave.receive(entry);
    check(alice.epoch === oldEpoch + 1n && bob.epoch === alice.epoch, "removal did not rotate real epoch");
    const terminal = decodeState(dave.data.state);
    check(terminal.groupActiveState.kind === "removedFromGroup", "removed recipient did not observe actual MLS terminal result");
    check(dave.epoch === oldEpoch && dave.last!.id === entry.id, "removed recipient must accept removal without acquiring next epoch");
    check(hex(terminal.keySchedule.senderDataSecret) === hex(decodeState(oldState).keySchedule.senderDataSecret), "unexpected new key material for removed recipient");
    check(hex(terminal.keySchedule.senderDataSecret) !== hex(decodeState(alice.data.state).keySchedule.senderDataSecret), "removal did not change future sender-data secret");
    const future = await alice.stageApplication("after Dave removal");
    const application = await order(entry, future);
    await alice.receive(application); await bob.receive(application);
    equal(alice.data.outcomes, bob.data.outcomes, "remaining member cannot decrypt future payload");
    const message = mls.decode(mls.mlsMessageDecoder, unhex(future.bytes));
    check(message && message.wireformat === mls.wireformats.mls_private_message, "private future message required");
    const removedState = dave.data.state;
    // Exercise AEAD using the resulting MLS state directly; a wrapper's policy denial is insufficient.
    const exclusionFailure = await mustFail(() => mls.processMessage({ context: dave.env.context, state: decodeState(removedState), message }), "OperationError");
    const restored = dave.restart();
    await unchanged(restored, () => restored.receive(application), "removed-member terminal state");
    equal(dave.data.state, removedState, "failed future decrypt changed removed state");
    trace.push({ kind: "removal-versus-lag", lagFailure, retainedAfterCommit: "active/decrypted", exclusionFailure,
      removedAfterCommit: terminal.groupActiveState.kind, removedEpoch: String(dave.epoch), remainingEpoch: String(alice.epoch), removalEntry: entry.id });
  },
  async "opaque-failure-halts"() {
    const { alice, bob, dave } = await group();
    const payload = await alice.stageApplication("authentic encrypted action");
    const decoded = mls.decode(mls.mlsMessageDecoder, unhex(payload.bytes));
    check(decoded && decoded.wireformat === mls.wireformats.mls_private_message, "private message required");
    decoded.privateMessage.ciphertext[0] = decoded.privateMessage.ciphertext[0]! ^ 1;
    const corrupt = await envelope("alice", "application", decoded);
    const entry = await order(alice.last, corrupt);
    const corruptReceiver = bob.restart(); await unchanged(corruptReceiver, () => corruptReceiver.receive(entry)); await unchanged(dave, () => dave.receive(entry));
    const good = await order(alice.last, payload);
    await unchanged(corruptReceiver, () => corruptReceiver.receive(good), "signed fork");
    // Damaged local secret is a local failure, not a reason to advance past the signed position.
    const missing = bob.restart(); const damaged = decodeState(missing.data.state);
    damaged.keySchedule.senderDataSecret.fill(0); missing.data.state = hex(mls.encode(mls.clientStateEncoder, damaged));
    await unchanged(missing, () => missing.receive(good));
    await bob.receive(good); check(bob.data.outcomes.length === 1, "healthy client did not decrypt");
    check(missing.data.outcomes.length === 0 && missing.last!.index < bob.last!.index, "local failure skipped opaque position");
  },
};
export type Scenario = keyof typeof scenarios;
export async function runScenario(name: Scenario) {
  trace.length = 0;
  let error: string | null = null;
  try { await scenarios[name](); } catch (failure) { error = String(failure); }
  return { name, crypto: "real ts-mls / WebCrypto + Noble + HPKE", status: error ? "failed" : "passed", error,
    gateStatus: "G1-G5 unpassed", fixtureDigest: await digest([instance, name]), trace };
}
