import { exports } from "cloudflare:workers";
import { expect, test } from "vitest";

test("workers.health", async () => {
  // cloudflare:workers cannot execute in Vitest's ordinary Node pool.
  expect(navigator.userAgent).toBe("Cloudflare-Workers");
  expect(typeof WebSocketPair).toBe("function");
  const response = await exports.default.fetch("https://noseq.invalid/health");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "ok", stage: "P0" });
  expect(response.headers.get("cache-control")).toBe("no-store");
});

test("workers.boundaries", async () => {
  expect((await exports.default.fetch("https://noseq.invalid/unknown")).status).toBe(404);
  const response = await exports.default.fetch("https://noseq.invalid/health", { method: "POST" });
  expect(response.status).toBe(405);
  expect(response.headers.get("allow")).toBe("GET");
});
