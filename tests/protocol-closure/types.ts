import type { Device, PublicState, Snapshot } from "../protocol-feasibility/crypto.ts";
import type { Context, Signed } from "../segmented-recovery/wire.ts";

// Trusted local fixture state. This is not a shared grant or a production backup format.
export interface CompactCheckpoint {
  schema: "noseq/compact-client@1";
  root: Signed;
  context: Context;
  founder: Signed;
  initial: PublicState;
  keys: Pick<Device, "accountKey" | "deviceKey" | "binding">;
  records: { count: number; tip: string };
  data: Snapshot;
  pendingAdmission: Signed | null;
  observed: [number, string][];
}
