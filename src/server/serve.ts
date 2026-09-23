import index from "../web/index.html";
import { createApp } from "./app";

export const HOSTNAME = "127.0.0.1";

export function startServer(port: number) {
  const app = createApp();
  return Bun.serve({
    hostname: HOSTNAME,
    port,
    development: process.env.NODE_ENV !== "production" && !isCompiled(),
    routes: {
      "/": index,
      "/api/*": (req) => app.fetch(req),
    },
    fetch: () => new Response("Not Found", { status: 404 }),
  });
}

function isCompiled(): boolean {
  return import.meta.path.startsWith("/$bunfs/") || import.meta.path.includes("~BUN");
}
