// V2-only isolated extension. Base V1 socket routes and known-control cutoffs remain active.
import { Gateway, type Reader } from "../protocol-feasibility/gateway.ts";
import { entry, type PublicState } from "../protocol-feasibility/crypto.ts";
import type { Frame } from "../protocol-feasibility/gateway-native.ts";
import { closurePlan, costIndex, declaration, planHash, type Cost } from "./eligibility.ts";
import { checkpoint, locator } from "./archive.ts";
import {
  bounds,
  bytes,
  canonical,
  check,
  clone,
  equal,
  fields,
  hex32,
  integer,
  kinds,
  limits,
  parse,
  profile,
  read2,
  readRoot2,
  type Context,
  type ObjectStore,
  type Signed,
} from "./wire.ts";
interface Extension {
  profile: string;
  anticipated: Cost[];
  preparing: { declaration: Signed; pairs: Cost[]; reserved: boolean } | null;
  completed: [string, string, number][];
}
const empty = (): Extension => ({ profile, anticipated: [], preparing: null, completed: [] });
export class SegmentedGateway extends Gateway {
  extension: Extension = empty();
  capacity: number = limits.journal;
  private cache: { checkpoint: string; ids: Set<string> } | undefined;
  constructor(
    ctx: Context,
    root: Signed,
    statePath: string,
    initial: PublicState,
    founder: Signed,
    replicas: string[],
    trace: Frame[],
    restored = false,
  ) {
    super(ctx, root, statePath, initial, founder, replicas, trace, restored, readRoot2);
  }
  private install(value: Extension): void {
    check(bytes(value) <= bounds.reservationIndexBytes, "combined retention metadata capacity");
    this.extension = value;
  }
  protected override saveExtension(): unknown {
    return this.extension;
  }
  protected override loadExtension(value: unknown): void {
    const x = value as Extension;
    fields(x, ["profile", "anticipated", "preparing", "completed"]);
    check(
      x.profile === profile && Array.isArray(x.anticipated) && Array.isArray(x.completed),
      "retention extension profile",
    );
    const costs = x.anticipated.length ? costIndex(x.anticipated) : { total: 0 };
    for (const [id] of x.anticipated)
      check(!this.data.reservations[id], "anticipated and actual double charge");
    check(
      this.journalBytes + costs.total <= limits.journal,
      "reconstructed complete reservation quota",
    );
    if (x.preparing) {
      fields(x.preparing, ["declaration", "pairs", "reserved"]);
      const d = declaration(x.preparing.declaration, this.ctx);
      check(
        typeof x.preparing.reserved === "boolean" &&
          Array.isArray(x.preparing.pairs) &&
          x.preparing.pairs.length <= d.count,
        "preparing plan shape",
      );
      if (x.preparing.pairs.length) costIndex(x.preparing.pairs);
      if (x.preparing.reserved) {
        check(x.preparing.pairs.length === d.count, "reserved plan count");
        for (const [id, cost] of x.preparing.pairs)
          check(
            this.data.reservations[id]
              ? bytes(this.data.reservations[id]) === cost
              : x.anticipated.some((p) => p[0] === id && p[1] === cost),
            "reserved plan lost charge",
          );
      }
    }
    const seen = new Set<string>();
    for (const tuple of x.completed) {
      check(
        Array.isArray(tuple) && tuple.length === 3 && !seen.has(tuple[0]),
        "completed checkpoint index",
      );
      seen.add(tuple[0]);
      hex32(tuple[0]);
      hex32(tuple[1]);
      integer(tuple[2], bounds.entries);
      check(
        tuple[2] > 0 && this.data.retained[tuple[0]] && this.data.retained[tuple[1]],
        "completed checkpoint retention",
      );
      const c = checkpoint(this.data.retained[tuple[0]]!, this.ctx, {
        owner: this.ctx.owner,
        genesis: this.ctx.genesis,
      });
      locator(this.data.retained[tuple[1]]!, this.ctx, this.data.retained[tuple[0]]!);
      check(
        c.last === tuple[2] && this.data.events[c.last - 1]?.id === c.tip,
        "completed index original boundary",
      );
    }
    check(x.completed.length <= bounds.entries, "completed index count");
    this.install(clone(x));
    this.journalBytes += costs.total;
    this.cache = undefined;
  }
  protected override validateReservation(signed: Signed, kind: "order" | "chunk" | "proof"): void {
    if (signed.kind === kinds.root) {
      equal(readRoot2(signed, this.ctx.owner, this.ctx.genesis), this.ctx, "reserved root");
      return;
    }
    const type = (Object.entries(kinds) as [keyof typeof kinds, number][]).find(
      ([name, value]) => name !== "root" && value === signed.kind,
    )?.[0];
    if (type) {
      check(type !== "delivery", "private delivery is not shared archive");
      const e = read2(signed, type, this.ctx);
      check(e.pubkey === this.ctx.owner, "reserved v2 owner");
      return;
    }
    check(signed.kind === 8792, "v2 retention admits only original orders and explicit v2 objects");
    super.validateReservation(signed, kind);
  }
  protected override async retain(e: Signed): Promise<void> {
    integer(this.capacity, limits.journal);
    const already =
      this.data.reservations[e.id] || this.extension.anticipated.some((p) => p[0] === e.id);
    check(
      this.journalBytes + (already ? 0 : bytes(e)) <= this.capacity,
      "configured retention capacity",
    );
    const anticipated = this.extension.anticipated.find((p) => p[0] === e.id);
    if (anticipated && !this.data.reservations[e.id]) {
      check(bytes(e) === anticipated[1], "prepared exact wire cost");
      this.install({
        ...this.extension,
        anticipated: this.extension.anticipated.filter((p) => p[0] !== e.id),
      });
      this.journalBytes -= anticipated[1];
    }
    // No await separates conversion from base's conservative actual reservation and persistence.
    await super.retain(e);
  }
  private backendStore(): ObjectStore {
    return {
      put: async () => {
        throw new Error("read-only backend closure");
      },
      get: async (id) => {
        check(this.data.retained[id], "unconfirmed closure identity");
        const e = await this.backendGet(id);
        equal(e, this.data.retained[id], "confirmed closure bytes changed");
        return e;
      },
    };
  }
  protected override async extra(r: Reader, m: unknown[]): Promise<boolean> {
    if (["OBJECT", "CLOSURE", "NOSEQ-CLOSURE"].includes(m[0] as string))
      throw new Error("v1 recovery route disabled for v2 root");
    if (typeof m[0] !== "string" || !m[0].startsWith("SEG-")) return false;
    if (r.operator) {
      check(this.mayWrite(r), "segmented operator authorization");
      if (m[0] === "SEG-BEGIN") {
        check(m.length === 2, "begin frame");
        const e = m[1] as Signed,
          d = declaration(e, this.ctx);
        check(
          !this.extension.preparing || !this.extension.preparing.reserved,
          "finish reserved preparation before replacement",
        );
        this.install({
          ...this.extension,
          preparing: { declaration: e, pairs: [], reserved: false },
        });
        this.persist();
        r.socket.send(
          canonical(["OK", e.id, true, "plan metadata only; no recoverability promise"]),
        );
        return true;
      }
      if (m[0] === "SEG-PLAN") {
        check(
          m.length === 3 &&
            Array.isArray(m[2]) &&
            m[2].length > 0 &&
            m[2].length <= limits.pageEvents,
          "bounded plan page",
        );
        const pending = this.extension.preparing;
        check(
          pending && !pending.reserved && m[1] === pending.declaration.id,
          "active plan identity",
        );
        const pairs = [...pending.pairs, ...(m[2] as Cost[])],
          d = declaration(pending.declaration, this.ctx);
        check(pairs.length <= d.count, "plan declared count");
        costIndex(pairs);
        this.install({ ...this.extension, preparing: { ...pending, pairs } });
        this.persist();
        r.socket.send(canonical(["OK", m[1], true, "plan page recorded; unreserved"]));
        return true;
      }
      if (m[0] === "SEG-RESERVE") {
        check(m.length === 2, "reserve frame");
        const p = this.extension.preparing;
        check(p && m[1] === p.declaration.id, "active reservation");
        const d = declaration(p.declaration, this.ctx),
          costs = costIndex(p.pairs);
        check(
          p.pairs.length === d.count &&
            costs.total === d.encodedBytes &&
            (await planHash(p.pairs)) === d.planHash,
          "complete exact plan commitment",
        );
        const anticipated = new Map(this.extension.anticipated),
          actual = this.data.reservations;
        let added = 0;
        for (const [id, cost] of p.pairs) {
          if (actual[id]) check(bytes(actual[id]) === cost, "existing retained exact cost");
          else if (anticipated.has(id))
            check(anticipated.get(id) === cost, "existing anticipated exact cost");
          else {
            anticipated.set(id, cost);
            added += cost;
          }
        }
        const declarationCost = actual[p.declaration.id] ? 0 : bytes(p.declaration);
        integer(this.capacity, limits.journal);
        check(
          this.journalBytes + added + declarationCost <= this.capacity,
          "prepared complete closure capacity; previous checkpoint unchanged",
        );
        this.install({
          ...this.extension,
          anticipated: [...anticipated],
          preparing: { ...p, reserved: true },
        });
        this.journalBytes += added;
        this.persist();
        await this.retain(p.declaration);
        r.socket.send(
          canonical(["OK", m[1], true, "complete cost reserved; uploads still unconfirmed"]),
        );
        return true;
      }
      if (m[0] === "SEG-OBJECT") {
        check(m.length === 2, "object frame");
        const e = m[1] as Signed;
        this.validateReservation(e, "proof");
        check(e.kind !== 8792, "orders use fenced original EVENT route");
        const p = this.extension.preparing;
        check(
          p?.reserved && p.pairs.some((pair) => pair[0] === e.id && pair[1] === bytes(e)),
          "object outside reserved closure",
        );
        await this.retain(e);
        r.socket.send(
          canonical(["OK", e.id, true, "exact object confirmed; no complete checkpoint yet"]),
        );
        return true;
      }
      if (m[0] === "SEG-COMPLETE") {
        check(m.length === 2, "complete frame");
        const p = this.extension.preparing;
        check(p?.reserved && m[1] === p.declaration.id, "reserved complete identity");
        const d = declaration(p.declaration, this.ctx),
          store = this.backendStore(),
          certificate = await store.get(d.checkpoint),
          location = await store.get(d.locator),
          actual = await closurePlan(
            store,
            this.root,
            certificate,
            location,
            this.ctx,
            this.data.events,
          );
        check(
          actual.hash === d.planHash && actual.total === d.encodedBytes,
          "actual full retention differs from reserved plan",
        );
        const c = checkpoint(certificate, this.ctx, {
          owner: this.ctx.owner,
          genesis: this.ctx.genesis,
        });
        const previous = this.extension.completed.find((x) => x[0] === certificate.id);
        if (previous)
          equal(previous, [certificate.id, location.id, c.last], "completed identity changed");
        const completed = previous
          ? this.extension.completed
          : [
              ...this.extension.completed,
              [certificate.id, location.id, c.last] as [string, string, number],
            ];
        check(completed.length <= bounds.entries, "completed checkpoint count");
        this.install({ ...this.extension, completed, preparing: null });
        this.persist();
        this.cache = { checkpoint: certificate.id, ids: new Set(actual.pairs.map((p) => p[0])) };
        r.socket.send(
          canonical([
            "OK",
            m[1],
            true,
            "retained recoverable-prefix candidate",
            certificate.id,
            c.last,
            this.data.events.length,
          ]),
        );
        return true;
      }
      throw new Error("unsupported segmented operator command");
    }
    check(
      m.length >= 3 && typeof m[1] === "string" && /^[a-zA-Z0-9-]{1,32}$/.test(m[1]),
      "segmented subscription",
    );
    const sub = m[1];
    if (!this.mayRead(r)) {
      r.socket.send(canonical(["CLOSED", sub, "restricted or unavailable"]));
      return true;
    }
    if (m[0] === "SEG-OPEN") {
      check(m.length === 4, "snapshot open frame");
      integer(m[3], bounds.entries);
      if (m[2] !== null) hex32(m[2]);
      const maximum = Math.min(m[3] as number, this.data.events.length),
        selected = this.extension.completed
          .filter((c) => c[2] <= maximum && (m[2] === null || m[2] === c[0]))
          .sort((a, b) => b[2] - a[2])[0];
      check(selected, "no eligible named sealed checkpoint; incomplete suffix");
      const store = this.backendStore(),
        certificate = await store.get(selected[0]),
        location = await store.get(selected[1]);
      this.enqueue(r, sub, [
        "SEG-OFFER",
        sub,
        {
          checkpoint: certificate,
          locator: location,
          retainedPrefix: this.data.events.length,
          retainedTip: this.tip,
          sealedPrefix: selected[2],
          requestedPrefix: m[3],
          suffixAvailable: selected[2] === maximum,
          meaning: "opaque retained closure; client must verify complete decrypted history",
        },
      ]);
      return true;
    }
    if (m[0] === "SEG-GET") {
      check(
        m.length === 4 &&
          Array.isArray(m[3]) &&
          m[3].length > 0 &&
          m[3].length <= limits.pageEvents,
        "bounded exact object page",
      );
      hex32(m[2]);
      for (const id of m[3]) hex32(id);
      check(new Set(m[3]).size === m[3].length, "duplicate page IDs");
      const selected = this.extension.completed.find((c) => c[0] === m[2]);
      check(
        selected && selected[2] <= this.data.events.length,
        "unknown/beyond-frontier checkpoint",
      );
      const store = this.backendStore();
      if (this.cache?.checkpoint !== m[2]) {
        const plan = await closurePlan(
          store,
          this.root,
          await store.get(selected[0]),
          await store.get(selected[1]),
          this.ctx,
          this.data.events,
        );
        this.cache = { checkpoint: selected[0], ids: new Set(plan.pairs.map((p) => p[0])) };
      }
      const values: Signed[] = [];
      let total = 0;
      for (const id of m[3] as string[]) {
        check(this.cache.ids.has(id), "object outside named checkpoint closure");
        const e = await store.get(id);
        total += bytes(e);
        check(total <= limits.pageBytes, "bounded object page bytes");
        values.push(e);
      }
      // Every queued item uses base's current authority/dequeue cutoff; old cursors never select authorization.
      for (const e of values) this.enqueue(r, sub, ["EVENT", sub, e]);
      this.enqueue(r, sub, ["EOSE", sub]);
      return true;
    }
    throw new Error("unsupported segmented public command");
  }
}
