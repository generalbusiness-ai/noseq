// Version-pinned internal API probe. Export only message-specific AEAD openings, never an epoch/ratchet/vault secret.
import * as mls from "../../artifacts/crypto-preflight/sources/marmot-ts/ts-mls/dist/src/index.js";
import { decryptSenderData, privateContentAADEncoder, privateMessageContentDecoder, toAuthenticatedContent } from "../../artifacts/crypto-preflight/sources/marmot-ts/ts-mls/dist/src/privateMessage.js";
import { expandSenderDataKey, expandSenderDataNonce, senderDataAADEncoder, senderDataDecoder } from "../../artifacts/crypto-preflight/sources/marmot-ts/ts-mls/dist/src/sender.js";
import { ratchetToGeneration } from "../../artifacts/crypto-preflight/sources/marmot-ts/ts-mls/dist/src/secretTree.js";
import { groupContextEncoder, groupContextDecoder } from "../../artifacts/crypto-preflight/sources/marmot-ts/ts-mls/dist/src/groupContext.js";
import { ratchetTreeEncoder, ratchetTreeDecoder } from "../../artifacts/crypto-preflight/sources/marmot-ts/ts-mls/dist/src/ratchetTree.js";
import { verifyFramedContentSignature } from "../../artifacts/crypto-preflight/sources/marmot-ts/ts-mls/dist/src/framedContent.js";
import { b64, check, decoder, equal, fields, hex, read, unb64, type Context, type Signed } from "./wire.ts";
export interface Opening { position: number; submission: string; key: string; nonce: string; senderKey: string; senderNonce: string; groupContext: string; publicTree: string; action: Signed }
export async function createOpening(state: mls.ClientState, message: mls.MlsFramedMessage, env: mls.MlsContext, position: number, submission: string, action: Signed): Promise<Opening> {
  check(message.wireformat === mls.wireformats.mls_private_message, "opening private message"); const m = message.privateMessage;
  const sender = await decryptSenderData(m, state.keySchedule.senderDataSecret, env.cipherSuite); check(sender, "opening sender decode");
  const result = await ratchetToGeneration(state.secretTree, sender, m.contentType, mls.defaultKeyRetentionConfig, env.cipherSuite);
  const opening = { position, submission, key: b64(result.key), nonce: b64(result.nonce),
    senderKey: b64(await expandSenderDataKey(env.cipherSuite, state.keySchedule.senderDataSecret, m.ciphertext)),
    senderNonce: b64(await expandSenderDataNonce(env.cipherSuite, state.keySchedule.senderDataSecret, m.ciphertext)),
    groupContext: b64(mls.encode(groupContextEncoder, state.groupContext)), publicTree: b64(mls.encode(ratchetTreeEncoder, state.ratchetTree)), action };
  for (const b of result.consumed) b.fill(0); result.key.fill(0); result.nonce.fill(0); return opening;
}
export async function verifyOpening(opening: Opening, message: mls.MlsFramedMessage, env: mls.MlsContext, ctx: Context): Promise<{ action: Signed; leaf: string; credential: mls.Credential; publicTree: mls.RatchetTree }> {
  fields(opening, ["position", "submission", "key", "nonce", "senderKey", "senderNonce", "groupContext", "publicTree", "action"]);
  check(message.wireformat === mls.wireformats.mls_private_message, "opening private message"); const m = message.privateMessage;
  const decode = <T>(bytes: string, f: (b: Uint8Array, offset: number) => [T, number] | undefined): T => { const b = unb64(bytes); const r = f(b, 0); check(r && r[1] === b.length, "opening codec/trailing bytes"); return r[0]; };
  const gc = decode(opening.groupContext, groupContextDecoder); const tree = decode(opening.publicTree, ratchetTreeDecoder);
  check(hex(gc.groupId) === ctx.genesis && gc.epoch === m.epoch && gc.cipherSuite === 1, "opening group/epoch/suite");
  const exact = (s: string, n: number) => { const b = unb64(s, n); check(b.length === n, "opening key/nonce size"); return b; };
  const senderBytes = await env.cipherSuite.hpke.decryptAead(exact(opening.senderKey, 16), exact(opening.senderNonce, 12), mls.encode(senderDataAADEncoder, m), m.encryptedSenderData);
  const senderResult = senderDataDecoder(senderBytes, 0); check(senderResult && senderResult[1] === senderBytes.length, "opening sender bytes"); const sender = senderResult[0];
  const leaf = tree[sender.leafIndex * 2]; check(leaf?.nodeType === mls.nodeTypes.leaf, "opening sender leaf");
  check(await env.authService.validateCredential(leaf.leaf.credential, leaf.leaf.signaturePublicKey), "opening account-leaf proof");
  const contentBytes = await env.cipherSuite.hpke.decryptAead(exact(opening.key, 16), exact(opening.nonce, 12), mls.encode(privateContentAADEncoder, m), m.ciphertext);
  const decoded = privateMessageContentDecoder(m.contentType)(contentBytes, 0); check(decoded && decoded[1] === contentBytes.length && decoded[0].contentType === mls.contentTypes.application, "opening content/padding");
  const auth = toAuthenticatedContent(decoded[0], m, sender.leafIndex);
  check(await verifyFramedContentSignature(leaf.leaf.signaturePublicKey, mls.wireformats.mls_private_message, auth.content, auth.auth, gc, env.cipherSuite.signature), "opening MLS signature");
  const action = read(decoder.decode(decoded[0].applicationData), "proof", ctx); equal(action, opening.action, "original ciphertext/action correspondence");
  return { action, leaf: hex(leaf.leaf.signaturePublicKey), credential: leaf.leaf.credential, publicTree: tree };
}
