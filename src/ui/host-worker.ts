// Baseline handshake only. No application evaluation or key state exists yet.
self.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (event.data === "initialize") self.postMessage("ready");
});
