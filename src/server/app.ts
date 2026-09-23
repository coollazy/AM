import { Hono } from "hono";
import { VERSION } from "../version";

export function createApp() {
  const app = new Hono();
  app.get("/api/health", (c) => c.json({ ok: true, version: VERSION }));
  return app;
}
