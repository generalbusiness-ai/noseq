const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Host mount is missing");

const title = document.createElement("h1");
title.textContent = "Noseq";
const status = document.createElement("p");
status.textContent = "No application loaded.";
root.replaceChildren(title, status);

const worker = new Worker(new URL("./host-worker.ts", import.meta.url), { type: "module" });
worker.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (event.data === "ready") root.dataset.workerReady = "true";
});
worker.addEventListener("error", () => {
  status.textContent = "Unable to start. Reload to try again.";
});
worker.postMessage("initialize");
addEventListener("pagehide", () => worker.terminate(), { once: true });
