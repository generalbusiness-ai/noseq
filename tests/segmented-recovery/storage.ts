import {
  bounds,
  bytes,
  canonical,
  check,
  eventBytes,
  integer,
  limits,
  parse,
  read2,
  type Context,
  type ObjectStore,
  type Signed,
} from "./wire.ts";
import type { LogRecord, TextStore } from "./types.ts";
import type { Outcome } from "../protocol-feasibility/crypto.ts";
export class Objects implements ObjectStore {
  constructor(
    readonly backing: TextStore,
    readonly namespace: string,
  ) {}
  async put(event: Signed): Promise<void> {
    check(bytes(event) <= limits.event, "object event capacity");
    await this.backing.put(`${this.namespace}-${event.id}`, eventBytes(event));
  }
  async get(id: string): Promise<Signed> {
    return parse(await this.backing.get(`${this.namespace}-${id}`)) as unknown as Signed;
  }
}
export class Records {
  ids: string[] = [];
  logical = new Map<string, string>();
  recordWrites = 0;
  recordReads = 0;
  constructor(
    readonly backing: TextStore,
    readonly namespace: string,
  ) {}
  get length() {
    return this.ids.length;
  }
  async append(value: LogRecord): Promise<void> {
    integer(value.outcome.position, bounds.entries);
    check(value.outcome.position === this.length + 1, "record position");
    check(bytes(value) <= bounds.segmentBytes, "single record capacity");
    await this.backing.put(`${this.namespace}-${value.outcome.position}`, canonical(value));
    this.ids.push(value.record.event.id);
    this.recordWrites++;
  }
  async get(position: number): Promise<LogRecord> {
    integer(position, this.length);
    check(position > 0, "record position");
    this.recordReads++;
    return parse(
      await this.backing.get(`${this.namespace}-${position}`),
      bounds.segmentBytes,
    ) as unknown as LogRecord;
  }
  async outcomes(): Promise<Outcome[]> {
    const result: Outcome[] = [];
    for (let p = 1; p <= this.length; p++) result.push((await this.get(p)).outcome);
    return result;
  }
}
// Counts distinct retained wire identities, never credits repeated reads or uncertain writes.
export class RecoveryBudget implements ObjectStore {
  readonly charged = new Map<string, number>();
  total = 0;
  constructor(
    readonly store: ObjectStore,
    readonly maximum: number = limits.journal,
  ) {
    integer(maximum, limits.journal);
  }
  account(event: Signed): void {
    const cost = bytes(event);
    hexIdentity(event.id);
    check(cost <= limits.event, "recovery event capacity");
    const previous = this.charged.get(event.id);
    if (previous !== undefined) {
      check(previous === cost, "identity cost changed");
      return;
    }
    check(
      this.charged.size < bounds.reservationEntries && this.total + cost <= this.maximum,
      "full closure recovery capacity",
    );
    this.charged.set(event.id, cost);
    this.total += cost;
  }
  async get(id: string): Promise<Signed> {
    hexIdentity(id);
    const event = await this.store.get(id);
    check(event.id === id, "requested recovery identity");
    this.account(event);
    return event;
  }
  async put(): Promise<void> {
    throw new Error("read-only recovery store");
  }
}
function hexIdentity(id: unknown): asserts id is string {
  check(typeof id === "string" && /^[0-9a-f]{64}$/.test(id), "exact identity");
}
