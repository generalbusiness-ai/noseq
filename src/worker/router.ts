export default {
  fetch(request: Request): Response {
    if (new URL(request.url).pathname !== "/health") {
      return new Response("Not found", { status: 404 });
    }
    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET" } });
    }
    return Response.json({ status: "ok", stage: "P0" }, {
      headers: { "Cache-Control": "no-store" },
    });
  },
} satisfies ExportedHandler<WorkerEnv>;
