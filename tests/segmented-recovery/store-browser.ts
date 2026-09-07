import { check } from "./wire.ts";
import type { TextStore } from "./types.ts";
export async function browserStore(name: string): Promise<TextStore> {
  const request = indexedDB.open(name, 1);
  request.onupgradeneeded = () => request.result.createObjectStore("objects");
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return {
    async put(key, value) {
      await new Promise<void>((resolve, reject) => {
        const t = db.transaction("objects", "readwrite"),
          s = t.objectStore("objects"),
          r = s.get(key);
        r.onsuccess = () => {
          if (r.result !== undefined && r.result !== value) {
            t.abort();
            return;
          }
          s.put(value, key);
        };
        t.oncomplete = () => resolve();
        t.onabort = () => reject(t.error ?? new Error("immutable fixture object changed"));
        t.onerror = () => reject(t.error);
      });
    },
    async get(key) {
      return new Promise<string>((resolve, reject) => {
        const r = db.transaction("objects", "readonly").objectStore("objects").get(key);
        r.onsuccess = () => {
          try {
            check(typeof r.result === "string", "missing fixture object");
            resolve(r.result);
          } catch (e) {
            reject(e);
          }
        };
        r.onerror = () => reject(r.error);
      });
    },
  };
}
