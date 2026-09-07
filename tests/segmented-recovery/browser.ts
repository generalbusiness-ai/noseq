import { runCase } from "./scenarios.ts";
import { browserStore } from "./store-browser.ts";
declare global {
  interface Window {
    segmentedProbe: (name: string) => ReturnType<typeof runCase>;
  }
}
window.segmentedProbe = async (name) =>
  runCase(name, await browserStore("noseq-segmented-" + crypto.randomUUID()));
