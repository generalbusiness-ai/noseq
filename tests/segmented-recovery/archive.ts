import { v2 as nip44 } from "nostr-tools/nip44";
import { definitionId, type Definition } from "../protocol-feasibility/archive.ts";
import {
  binding,
  checkMembers,
  decodeState,
  entry,
  environment,
  initialData,
  members,
  mls,
  privateMessage,
  publicTransition,
  submission,
  type Outcome,
  type PublicState,
} from "../protocol-feasibility/crypto.ts";
import { verifyOpening } from "../protocol-feasibility/opening.ts";
import { read, readAction } from "../protocol-feasibility/wire.ts";
import { StreamClient } from "./client.ts";
import { Records, RecoveryBudget } from "./storage.ts";
import {
  blankRange,
  bounds,
  bytes,
  canonical,
  check,
  clone,
  equal,
  eventBytes,
  fields,
  hash,
  hex,
  hex32,
  integer,
  keyId,
  manifest,
  metrics,
  open,
  parse,
  profile,
  publicKey,
  random,
  read2,
  readRoot2,
  seal,
  sign2,
  unhex,
  utf8,
  type Context,
  type Metrics,
  type ObjectStore,
  type Sealed,
  type Signed,
} from "./wire.ts";
import type {
  BodyCore,
  CheckpointCore,
  DeliveryCore,
  Descriptor,
  GrantCore,
  LocatorCore,
  RecordCore,
  VaultCore,
} from "./types.ts";
export interface Package {
  checkpoint: Signed;
  locator: Signed;
  grantKey: string;
  vaultKey: string;
}
export interface Trusted {
  owner: string;
  genesis: string;
  checkpoint?: string;
  tip?: string;
}
export function grantKeyIndex(value: unknown): asserts value is [string, string][] {
  check(
    Array.isArray(value) && value.length > 0 && value.length <= bounds.segments,
    "grant key count capacity",
  );
  const seen = new Set<string>();
  for (const pair of value) {
    check(Array.isArray(pair) && pair.length === 2, "grant key tuple");
    hex32(pair[0]);
    hex32(pair[1]);
    check(!seen.has(pair[0]), "duplicate grant key identity");
    seen.add(pair[0]);
  }
}
export const coreHash = (value: unknown) => hash([profile, "core", value]);
export function checkpoint(event: Signed, ctx: Context, trust: Trusted): CheckpointCore {
  const e = read2(event, "checkpoint", ctx);
  check(
    e.pubkey === trust.owner && trust.owner === ctx.owner && trust.genesis === ctx.genesis,
    "checkpoint owner/root",
  );
  if (trust.checkpoint) check(e.id === trust.checkpoint, "expected checkpoint differs");
  const c = parse(e.content) as unknown as CheckpointCore;
  fields(c, [
    "profile",
    "type",
    "counter",
    "previous",
    "head",
    "segments",
    "first",
    "last",
    "tip",
    "applications",
    "plainBytes",
    "definition",
    "finalStateHash",
    "grantHash",
    "vaultHash",
  ]);
  check(
    c.profile === profile && c.type === "owner-attested-sealed-full-prefix@2" && c.first === 1,
    "checkpoint profile/coverage",
  );
  integer(c.counter);
  check(c.counter > 0, "checkpoint counter");
  if (c.previous !== null) hex32(c.previous);
  integer(c.segments, bounds.segments);
  integer(c.last, bounds.entries);
  integer(c.applications, c.last);
  integer(c.plainBytes, 268435456);
  check(c.segments > 0 && c.last >= c.segments, "checkpoint counts");
  for (const id of [c.head, c.tip, c.definition, c.finalStateHash, c.grantHash, c.vaultHash])
    hex32(id);
  if (trust.tip) check(c.tip === trust.tip, "expected tip differs");
  return c;
}
export async function descriptorIndex(
  store: ObjectStore,
  c: CheckpointCore,
  ctx: Context,
  trace: Metrics,
): Promise<Descriptor[]> {
  let cursor: string | null = c.head;
  const reverse: Descriptor[] = [],
    seen = new Set<string>();
  let size = 2;
  for (let ordinal = c.segments; ordinal > 0; ordinal--) {
    check(cursor !== null && !seen.has(cursor), "manifest cycle/missing range");
    seen.add(cursor);
    const id = cursor,
      e = await store.get(id),
      m = await manifest(e, ctx);
    check(e.id === id, "manifest substitution");
    trace.manifestVisits++;
    const x = m.meta;
    check(x.purpose === "segment" && x.ordinal === ordinal, "manifest purpose/ordinal");
    const d: Descriptor = [
      id,
      x.ordinal,
      x.first,
      x.last,
      x.previous,
      x.predecessor,
      x.tip,
      x.before!,
      x.after!,
      x.applications,
      x.plainBytes,
    ];
    size += bytes(d) + 1;
    check(size <= bounds.descriptorIndexBytes, "descriptor index allocation");
    reverse.push(d);
    cursor = x.previous;
  }
  check(cursor === null, "extra leading interval");
  const result = reverse.reverse();
  let end = 0,
    tip = ctx.genesis,
    previous: string | null = null,
    state: string | null = null,
    applications = 0,
    plain = 0;
  for (const d of result) {
    check(d[2] === end + 1 && d[4] === previous && d[5] === tip, "interval gap/overlap/link");
    if (state !== null) check(d[7] === state, "interval public boundary");
    end = d[3];
    tip = d[6];
    previous = d[0];
    state = d[8];
    applications += d[9];
    plain += d[10];
  }
  check(
    end === c.last &&
      tip === c.tip &&
      applications === c.applications &&
      plain === c.plainBytes &&
      state === c.finalStateHash,
    "whole checkpoint totals/boundary",
  );
  return result;
}
export class Sealer {
  readonly trace = metrics();
  readonly descriptors: Descriptor[] = [];
  readonly keys = new Map<string, string>();
  private pending: RecordCore[] = [];
  private before: PublicState;
  private current: PublicState;
  private accepted = 0;
  private acceptedTip: string;
  private head: string | null = null;
  private counter = 0;
  private previousCheckpoint: string | null = null;
  private definition?: Sealed;
  private indexBytes = 2;
  constructor(
    readonly store: ObjectStore,
    readonly ctx: Context,
    readonly ownerKey: string,
    readonly founder: Signed,
    initial: PublicState,
    readonly segmentByteLimit: number = bounds.segmentBytes,
  ) {
    this.before = clone(initial);
    this.current = clone(initial);
    this.acceptedTip = ctx.genesis;
    integer(segmentByteLimit, bounds.segmentBytes);
    check(segmentByteLimit > 0, "segment byte limit");
  }
  static async fromVerified(
    store: ObjectStore,
    owner: StreamClient,
    verified: VerifiedHistory,
  ): Promise<Sealer> {
    const ctx = verified.context,
      c = checkpoint(verified.certificate, ctx, { owner: ctx.owner, genesis: ctx.genesis });
    check(
      owner.keys.binding.account === ctx.owner &&
        owner.log.length === c.last &&
        owner.tip === c.tip &&
        owner.data.pending === null,
      "settled verified continuation",
    );
    equal(owner.data.public, verified.publicState, "continuation public state");
    const result = new Sealer(
      store,
      ctx,
      owner.keys.accountKey,
      verified.founder,
      verified.publicState,
    );
    for (const descriptor of verified.descriptors) result.descriptors.push(descriptor);
    result.indexBytes = bytes(verified.descriptors);
    check(result.indexBytes <= bounds.descriptorIndexBytes, "continuation descriptor capacity");
    for (const [id, key] of verified.grant.keys) result.keys.set(id, key);
    result.head = c.head;
    result.accepted = c.last;
    result.acceptedTip = c.tip;
    result.counter = c.counter;
    result.previousCheckpoint = verified.certificate.id;
    const event = await store.get(c.definition),
      definitionManifest = await manifest(event, ctx);
    check(
      event.id === c.definition &&
        definitionManifest.meta.purpose === "definition" &&
        definitionManifest.meta.keyId === (await keyId(verified.grant.definitionKey)),
      "continued immutable definition binding",
    );
    result.definition = {
      event,
      manifest: definitionManifest,
      key: verified.grant.definitionKey,
      transportBytes: 0,
    };
    return result;
  }
  async initialize(definition: Definition): Promise<void> {
    check(!this.definition, "definition already initialized");
    check((await definitionId(definition)) === this.ctx.definition, "definition commitment");
    this.definition = await seal(
      this.store,
      this.ownerKey,
      this.ctx,
      "definition",
      { profile, definition },
      blankRange(this.ctx),
      this.trace,
    );
  }
  private body(records = this.pending, after = this.current): BodyCore {
    return {
      profile,
      records,
      before: this.before,
      after,
      founder: this.descriptors.length === 0 ? this.founder : null,
    };
  }
  async append(record: RecordCore, after: PublicState): Promise<void> {
    const e = entry(record.event, this.ctx);
    check(
      e.position === this.accepted + 1 && e.previous === this.acceptedTip,
      "sealer original prefix",
    );
    integer(e.position, bounds.entries);
    if (
      this.pending.length &&
      bytes(this.body([...this.pending, record], after)) > this.segmentByteLimit
    )
      await this.flush();
    const singleton: BodyCore = {
      profile,
      records: [record],
      before: this.current,
      after,
      founder: this.descriptors.length === 0 ? this.founder : null,
    };
    check(
      bytes(singleton) <= this.segmentByteLimit,
      "single entry and proof exceeds segment capacity",
    );
    this.pending.push(clone(record));
    this.current = clone(after);
    this.accepted = e.position;
    this.acceptedTip = record.event.id;
    this.trace.records++;
    this.trace.recordBytes += bytes(record);
    if (this.pending.length === bounds.segmentEntries) await this.flush();
  }
  async flush(): Promise<void> {
    if (!this.pending.length) return;
    check(this.definition, "definition not retained");
    check(this.descriptors.length < bounds.segments, "segment count capacity");
    const body = this.body(),
      first = entry(this.pending[0]!.event, this.ctx),
      last = this.pending.at(-1)!.event,
      apps = this.pending.filter((r) => r.opening !== null).length;
    const range = {
      ordinal: this.descriptors.length + 1,
      first: first.position,
      last: entry(last, this.ctx).position,
      predecessor: first.previous,
      tip: last.id,
      previous: this.head,
      entries: this.pending.length,
      applications: apps,
      before: await hash(this.before),
      after: await hash(this.current),
      checkpoint: null,
    };
    const s = await seal(this.store, this.ownerKey, this.ctx, "segment", body, range, this.trace);
    const d: Descriptor = [
      s.event.id,
      range.ordinal,
      range.first,
      range.last,
      range.previous,
      range.predecessor,
      range.tip,
      range.before,
      range.after,
      apps,
      s.manifest.meta.plainBytes,
    ];
    const added = bytes(d) + (this.descriptors.length ? 1 : 0);
    check(this.indexBytes + added <= bounds.descriptorIndexBytes, "descriptor index allocation");
    this.indexBytes += added;
    this.descriptors.push(d);
    this.keys.set(s.event.id, s.key);
    this.head = s.event.id;
    this.pending = [];
    this.before = clone(this.current);
  }
  async export(owner: StreamClient, vaultKey = hex(random())): Promise<Package> {
    check(owner.ctx === this.ctx || canonical(owner.ctx) === canonical(this.ctx), "export context");
    check(
      owner.keys.binding.account === this.ctx.owner &&
        owner.data.pending === null &&
        !owner.data.fork,
      "settled owner export",
    );
    check(
      owner.log.length === this.accepted && owner.tip === this.acceptedTip,
      "export exact accepted prefix",
    );
    equal(owner.data.public, this.current, "export public state");
    await this.flush();
    check(this.head && this.definition, "nonempty export");
    const keys: [string, string][] = [];
    for (const d of this.descriptors) {
      keys.push([d[0], this.keys.get(d[0])!]);
      this.trace.grantVisits++;
    }
    const grant: GrantCore = {
      profile,
      context: this.ctx,
      head: this.head,
      definition: this.definition.event.id,
      keys,
      definitionKey: this.definition.key,
    };
    grantKeyIndex(grant.keys);
    check(bytes(grant) <= bounds.grantBytes, "full grant capacity");
    const grantKey = hex(random()),
      grantHash = await coreHash(grant);
    const vault: VaultCore = {
      profile,
      context: this.ctx,
      head: this.head,
      grantHash,
      grantKey,
      state: owner.data.state,
      public: clone(owner.data.public),
      binding: clone(owner.keys.binding),
      accountKey: owner.keys.accountKey,
      deviceKey: owner.keys.deviceKey,
      pending: null,
    };
    check(bytes(vault) <= bounds.vaultBytes, "compact vault capacity");
    const c: CheckpointCore = {
      profile,
      type: "owner-attested-sealed-full-prefix@2",
      counter: this.counter + 1,
      previous: this.previousCheckpoint,
      head: this.head,
      segments: this.descriptors.length,
      first: 1,
      last: this.accepted,
      tip: this.acceptedTip,
      applications: this.descriptors.reduce((n, d) => n + d[9], 0),
      plainBytes: this.descriptors.reduce((n, d) => n + d[10], 0),
      definition: this.definition.event.id,
      finalStateHash: await hash(this.current),
      grantHash,
      vaultHash: await coreHash(vault),
    };
    const certificate = sign2(this.ownerKey, "checkpoint", this.ctx, c);
    checkpoint(certificate, this.ctx, { owner: this.ctx.owner, genesis: this.ctx.genesis });
    const range = {
      ...blankRange(this.ctx),
      first: 1,
      last: c.last,
      tip: c.tip,
      previous: c.head,
      entries: c.last,
      applications: c.applications,
      after: c.finalStateHash,
      checkpoint: certificate.id,
    };
    const sealedGrant = await seal(
        this.store,
        this.ownerKey,
        this.ctx,
        "grant",
        grant,
        range,
        this.trace,
        grantKey,
      ),
      sealedVault = await seal(
        this.store,
        this.ownerKey,
        this.ctx,
        "vault",
        vault,
        range,
        this.trace,
        vaultKey,
      );
    const locator = sign2(this.ownerKey, "locator", this.ctx, {
      profile,
      checkpoint: certificate.id,
      grant: sealedGrant.event.id,
      vault: sealedVault.event.id,
    });
    await this.store.put(certificate);
    await this.store.put(locator);
    this.counter = c.counter;
    this.previousCheckpoint = certificate.id;
    return { checkpoint: certificate, locator, grantKey, vaultKey };
  }
}
export function locator(event: Signed, ctx: Context, certificate: Signed): LocatorCore {
  const e = read2(event, "locator", ctx);
  check(e.pubkey === ctx.owner, "locator owner");
  const l = parse(e.content) as unknown as LocatorCore;
  fields(l, ["profile", "checkpoint", "grant", "vault"]);
  check(l.profile === profile && l.checkpoint === certificate.id, "locator checkpoint");
  hex32(l.grant);
  hex32(l.vault);
  return l;
}
async function snapshotObject(
  store: ObjectStore,
  id: string,
  ctx: Context,
  c: CheckpointCore,
  certificate: Signed,
  purpose: "grant" | "vault",
  key: string,
): Promise<unknown> {
  const e = await store.get(id);
  check(e.id === id, "snapshot locator identity");
  const m = await manifest(e, ctx),
    x = m.meta;
  check(
    x.checkpoint === certificate.id &&
      x.last === c.last &&
      x.tip === c.tip &&
      x.previous === c.head &&
      x.entries === c.last &&
      x.applications === c.applications &&
      x.after === c.finalStateHash,
    "snapshot coverage binding",
  );
  return open(store, e, key, ctx, purpose);
}
export class VerifiedHistory {
  private constructor(
    readonly context: Context,
    readonly certificate: Signed,
    readonly publicState: PublicState,
    readonly definition: Definition,
    readonly log: Records,
    readonly descriptors: Descriptor[],
    readonly trace: Metrics,
    readonly founder: Signed,
    readonly grant: GrantCore,
  ) {}
  static async recover(
    store: ObjectStore,
    root: Signed,
    certificate: Signed,
    location: Signed,
    grantKey: string,
    trust: Trusted,
    log: Records,
  ): Promise<VerifiedHistory> {
    check(log.length === 0 && log.logical.size === 0, "fresh verification destination required");
    const budget = store instanceof RecoveryBudget ? store : new RecoveryBudget(store);
    store = budget;
    budget.account(root);
    budget.account(certificate);
    budget.account(location);
    const ctx = readRoot2(root, trust.owner, trust.genesis),
      c = checkpoint(certificate, ctx, trust),
      l = locator(location, ctx, certificate),
      trace = metrics();
    const index = await descriptorIndex(store, c, ctx, trace),
      g = (await snapshotObject(
        store,
        l.grant,
        ctx,
        c,
        certificate,
        "grant",
        grantKey,
      )) as GrantCore;
    fields(g, ["profile", "context", "head", "definition", "keys", "definitionKey"]);
    check(
      g.profile === profile &&
        g.head === c.head &&
        g.definition === c.definition &&
        (await coreHash(g)) === c.grantHash,
      "grant checkpoint binding",
    );
    equal(g.context, ctx, "grant context");
    hex32(g.definitionKey);
    check(Array.isArray(g.keys) && g.keys.length === index.length, "exact grant key count");
    grantKeyIndex(g.keys);
    for (let i = 0; i < index.length; i++) {
      const pair = g.keys[i]!;
      check(
        Array.isArray(pair) && pair.length === 2 && pair[0] === index[i]![0],
        "grant key order/extra/missing",
      );
      hex32(pair[1]);
    }
    const de = await store.get(c.definition);
    check(de.id === c.definition, "definition descriptor identity");
    const definitionCore = await open(store, de, g.definitionKey, ctx, "definition", trace);
    fields(definitionCore, ["profile", "definition"]);
    check(definitionCore.profile === profile, "definition profile");
    const definition = definitionCore.definition as Definition;
    check((await definitionId(definition)) === ctx.definition, "retained definition commitment");
    const env = await environment(ctx);
    let state: PublicState | undefined, founder: Signed | undefined;
    let applications = 0;
    let logicalBytes = 2;
    for (let s = 0; s < index.length; s++) {
      const d = index[s]!,
        event = await store.get(d[0]),
        m = await manifest(event, ctx);
      trace.manifestVisits++;
      trace.decodedSegments++;
      trace.maximumDecodedSegments = Math.max(trace.maximumDecodedSegments, trace.decodedSegments);
      const body = (await open(store, event, g.keys[s]![1], ctx, "segment", trace)) as BodyCore;
      fields(body, ["profile", "records", "before", "after", "founder"]);
      check(
        body.profile === profile &&
          Array.isArray(body.records) &&
          body.records.length === m.meta.entries,
        "segment body count/profile",
      );
      for (const publicState of [body.before, body.after]) {
        fields(publicState, ["version", "epoch", "members"]);
        integer(publicState.version);
        integer(publicState.epoch);
        checkMembers(publicState.members);
      }
      if (!state) {
        state = clone(body.before);
        check(
          state.version === 0 &&
            state.epoch === 0 &&
            state.members.length === 1 &&
            state.members[0]!.account === ctx.owner &&
            body.founder !== null,
          "initial owner state",
        );
        const proof = read(eventBytes(body.founder), "proof", ctx);
        founder = proof;
        check(proof.pubkey === ctx.owner, "founder owner signature");
        const b = parse(proof.content);
        fields(b, ["type", "device", "suite", "leaf"]);
        check(b.type === "account-leaf" && b.suite === 1, "founder binding type");
        equal(
          state.members[0],
          { account: ctx.owner, device: b.device, leaf: b.leaf },
          "founder initial leaf",
        );
      } else check(body.founder === null, "extra founder");
      equal(body.before, state, "segment before state");
      check((await hash(state)) === m.meta.before, "before state hash");
      let segmentApps = 0;
      for (const record of body.records) {
        fields(record, ["event", "opening"]);
        budget.account(record.event);
        const e = entry(record.event, ctx);
        check(
          e.position === log.length + 1 && e.previous === (log.ids.at(-1) ?? ctx.genesis),
          "original order gap/fork",
        );
        const sub = submission(e.submission, ctx),
          next = publicTransition(ctx, state, e);
        let outcome: Outcome;
        if (sub.epoch < state.epoch || sub.version < state.version) {
          check(record.opening === null, "extra stale opening");
          outcome = {
            position: e.position,
            logical: e.submission.id,
            disposition: "stale",
            value: null,
          };
        } else if (sub.type === "commit") {
          check(record.opening === null, "extra control opening");
          outcome = {
            position: e.position,
            logical: e.submission.id,
            disposition: "control",
            value: null,
          };
        } else {
          const opening = record.opening;
          check(
            opening && opening.position === e.position && opening.submission === e.submission.id,
            "exact opening coverage",
          );
          const result = await verifyOpening(opening, privateMessage(sub.bytes), env, ctx);
          const roster = result.publicTree
            .filter((n) => n?.nodeType === mls.nodeTypes.leaf)
            .map((n) => {
              check(n?.nodeType === mls.nodeTypes.leaf, "leaf");
              return binding(n.leaf.credential, n.leaf.signaturePublicKey, ctx);
            })
            .sort((a, b) => a.device.localeCompare(b.device));
          equal(roster, state.members, "opening public membership");
          const member = state.members.find((m) => m.device === e.submission.pubkey);
          check(member && result.leaf === member.leaf, "opening sender closure");
          const a = readAction(result.action, ctx, member.account, member.device);
          check(a.outcome !== "runtime-failure", "unfinalized runtime failure");
          const previous = log.logical.get(a.logical);
          if (previous) check(previous === result.action.id, "cross-segment logical conflict");
          else {
            logicalBytes += bytes([a.logical, result.action.id]) + 1;
            check(
              log.logical.size < bounds.entries && logicalBytes <= bounds.logicalIndexBytes,
              "logical index capacity",
            );
          }
          outcome = {
            position: e.position,
            logical: a.logical,
            disposition: previous ? "duplicate" : a.outcome,
            value: !previous && a.outcome === "apply" ? a.value : null,
          };
          log.logical.set(a.logical, result.action.id);
          segmentApps++;
          applications++;
        }
        await log.append({ record, outcome });
        state = next;
        trace.records++;
        trace.recordBytes += bytes(record);
      }
      equal(body.after, state, "segment after state");
      check(
        (await hash(state)) === m.meta.after &&
          log.length === m.meta.last &&
          log.ids.at(-1) === m.meta.tip &&
          segmentApps === m.meta.applications,
        "segment final counts/state",
      );
      trace.decodedSegments--;
    }
    check(
      state &&
        log.length === c.last &&
        log.ids.at(-1) === c.tip &&
        applications === c.applications &&
        (await hash(state)) === c.finalStateHash,
      "verified full-prefix boundary",
    );
    check(founder, "verified founder missing");
    return new VerifiedHistory(ctx, certificate, state, definition, log, index, trace, founder, g);
  }
}
export async function recoverOwner2(
  store: ObjectStore,
  root: Signed,
  p: Pick<Package, "checkpoint" | "locator" | "vaultKey">,
  trust: Trusted,
  log: Records,
): Promise<{ client: StreamClient; verified: VerifiedHistory; sealer: Sealer }> {
  const persistence = store;
  store = store instanceof RecoveryBudget ? store : new RecoveryBudget(store);
  const ctx = readRoot2(root, trust.owner, trust.genesis),
    c = checkpoint(p.checkpoint, ctx, trust),
    l = locator(p.locator, ctx, p.checkpoint);
  const v = (await snapshotObject(
    store,
    l.vault,
    ctx,
    c,
    p.checkpoint,
    "vault",
    p.vaultKey,
  )) as VaultCore;
  fields(v, [
    "profile",
    "context",
    "head",
    "grantHash",
    "grantKey",
    "state",
    "public",
    "binding",
    "accountKey",
    "deviceKey",
    "pending",
  ]);
  check(
    v.profile === profile &&
      v.pending === null &&
      v.head === c.head &&
      v.grantHash === c.grantHash &&
      (await coreHash(v)) === c.vaultHash,
    "compact vault checkpoint",
  );
  equal(v.context, ctx, "vault context");
  hex32(v.accountKey);
  hex32(v.deviceKey);
  hex32(v.grantKey);
  const verified = await VerifiedHistory.recover(
    store,
    root,
    p.checkpoint,
    p.locator,
    v.grantKey,
    trust,
    log,
  );
  equal(v.public, verified.publicState, "vault public state");
  check(
    publicKey(v.accountKey) === ctx.owner &&
      v.binding.account === ctx.owner &&
      publicKey(v.deviceKey) === v.binding.device,
    "vault signer binding",
  );
  const env = await environment(ctx),
    state = decodeState(v.state);
  check(
    state.groupActiveState.kind !== "removedFromGroup" &&
      hex(state.groupContext.groupId) === ctx.genesis &&
      Number(state.groupContext.epoch) === v.public.epoch,
    "vault group/epoch/active",
  );
  equal(members(state, ctx), v.public.members, "vault roster");
  const leaf = state.ratchetTree[state.privatePath.leafIndex * 2];
  check(leaf?.nodeType === mls.nodeTypes.leaf, "vault own leaf");
  equal(
    binding(leaf.leaf.credential, leaf.leaf.signaturePublicKey, ctx),
    v.binding,
    "vault own leaf binding",
  );
  const message = utf8.encode(canonical([profile, "vault-private-key-check", p.checkpoint.id]));
  check(
    await env.cipherSuite.signature.verify(
      leaf.leaf.signaturePublicKey,
      message,
      await env.cipherSuite.signature.sign(state.signaturePrivateKey, message),
    ),
    "vault signing key correspondence",
  );
  const data = initialData(state, ctx);
  data.public = clone(v.public);
  const client = new StreamClient(
    ctx,
    env,
    { accountKey: v.accountKey, deviceKey: v.deviceKey, binding: v.binding },
    data,
    log,
  );
  return { client, verified, sealer: await Sealer.fromVerified(persistence, client, verified) };
}
export function deliverGrant(
  senderDeviceKey: string,
  recipient: string,
  ctx: Context,
  p: Package,
): Signed {
  const payload = canonical({
    profile,
    context: ctx,
    recipient,
    checkpoint: p.checkpoint.id,
    locator: p.locator.id,
    key: p.grantKey,
  });
  check(utf8.encode(payload).length <= 1024, "small grant delivery bound");
  return sign2(senderDeviceKey, "delivery", ctx, {
    profile,
    recipient,
    checkpoint: p.checkpoint.id,
    locator: p.locator.id,
    bytes: nip44.encrypt(
      payload,
      nip44.utils.getConversationKey(unhex(senderDeviceKey), recipient),
    ),
  });
}
export function receiveGrant(
  event: Signed,
  recipientKey: string,
  expectedSender: string,
  ctx: Context,
  certificate: string,
  location: string,
): string {
  const e = read2(event, "delivery", ctx);
  check(e.pubkey === expectedSender, "authorized grant sender");
  const c = parse(e.content) as unknown as DeliveryCore;
  fields(c, ["profile", "recipient", "checkpoint", "locator", "bytes"]);
  check(
    c.profile === profile &&
      c.recipient === publicKey(recipientKey) &&
      c.checkpoint === certificate &&
      c.locator === location,
    "outer delivery context",
  );
  check(typeof c.bytes === "string" && c.bytes.length <= 2048, "small delivery ciphertext");
  // No decryption occurs before full outer signature, tags, sender and intended checkpoint are checked.
  const p = parse(
    nip44.decrypt(c.bytes, nip44.utils.getConversationKey(unhex(recipientKey), expectedSender)),
  );
  fields(p, ["profile", "context", "recipient", "checkpoint", "locator", "key"]);
  check(
    p.profile === profile &&
      p.recipient === c.recipient &&
      p.checkpoint === c.checkpoint &&
      p.locator === c.locator,
    "inner delivery binding",
  );
  equal(p.context, ctx, "inner delivery context");
  hex32(p.key);
  return p.key;
}
