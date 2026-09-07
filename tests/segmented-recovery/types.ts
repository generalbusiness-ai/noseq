import type { Opening } from "../protocol-feasibility/opening.ts";
import type { Binding, Outcome, PublicState } from "../protocol-feasibility/crypto.ts";
import type { Context, Signed } from "./wire.ts";
export interface RecordCore {
  event: Signed;
  opening: Opening | null;
}
export interface BodyCore {
  profile: string;
  records: RecordCore[];
  before: PublicState;
  after: PublicState;
  founder: Signed | null;
}
export interface GrantCore {
  profile: string;
  context: Context;
  head: string;
  definition: string;
  keys: [string, string][];
  definitionKey: string;
}
export interface VaultCore {
  profile: string;
  context: Context;
  head: string;
  grantHash: string;
  grantKey: string;
  state: string;
  public: PublicState;
  binding: Binding;
  accountKey: string;
  deviceKey: string;
  pending: null;
}
export interface CheckpointCore {
  profile: string;
  type: string;
  counter: number;
  previous: string | null;
  head: string;
  segments: number;
  first: number;
  last: number;
  tip: string;
  applications: number;
  plainBytes: number;
  definition: string;
  finalStateHash: string;
  grantHash: string;
  vaultHash: string;
}
export interface LocatorCore {
  profile: string;
  checkpoint: string;
  grant: string;
  vault: string;
}
export interface DeliveryCore {
  profile: string;
  recipient: string;
  checkpoint: string;
  locator: string;
  bytes: string;
}
export interface ReservationCore {
  profile: string;
  checkpoint: string;
  locator: string;
  count: number;
  encodedBytes: number;
  planHash: string;
}
// ID, ordinal, first, last, previous manifest, predecessor, tip, before, after, application count, plaintext bytes.
export type Descriptor = [
  string,
  number,
  number,
  number,
  string | null,
  string,
  string,
  string,
  string,
  number,
  number,
];
export interface TextStore {
  put(key: string, value: string): Promise<void>;
  get(key: string): Promise<string>;
}
export interface LogRecord {
  record: RecordCore;
  outcome: Outcome;
}
