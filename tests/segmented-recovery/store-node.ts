import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { check } from "./wire.ts";
import type { TextStore } from "./types.ts";
export async function diskStore(directory: string): Promise<TextStore> {
  await mkdir(directory, { recursive: true });
  const path = (key: string) => {
    check(/^[a-zA-Z0-9-]+$/.test(key), "fixture store key");
    return join(directory, key + ".json");
  };
  return {
    async put(key, value) {
      try {
        await writeFile(path(key), value, { flag: "wx" });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        check((await readFile(path(key), "utf8")) === value, "immutable fixture object changed");
      }
    },
    async get(key) {
      return readFile(path(key), "utf8");
    },
  };
}
