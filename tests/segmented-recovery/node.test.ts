import { test } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { diskStore } from "./store-node.ts";
import { caseNames, runCase } from "./scenarios.ts";
for (const name of caseNames)
  test("segmented.node." + name, async () => {
    const root = process.env.NOSEQ_SEGMENTED_RUN;
    if (!root) throw Error("NOSEQ_SEGMENTED_RUN required");
    const directory = join(root, "node-" + name);
    await mkdir(directory);
    const result = await runCase(name, await diskStore(join(directory, "objects")));
    await writeFile(
      join(root, "node-" + name + ".json"),
      JSON.stringify({ ...result, node: process.versions.node }, null, 2),
      { flag: "wx" },
    );
  });
