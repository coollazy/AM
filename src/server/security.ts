import type { MiddlewareHandler } from "hono";

// 防止瀏覽器中其他網站對本機網站發送請求：
// 1. Host 必須是本機位址（防止 DNS rebinding）
// 2. 會修改資料的請求，Origin 必須是本網站，且必須是 JSON（擋掉表單直接送出）
export function localOnly(port: number): MiddlewareHandler {
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const allowedOrigins = new Set([...allowedHosts].map((h) => `http://${h}`));
  return async (c, next) => {
    const host = c.req.header("host");
    if (!host || !allowedHosts.has(host)) return c.json({ error: "不允許的 Host" }, 403);
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      const origin = c.req.header("origin");
      if (!origin || !allowedOrigins.has(origin)) return c.json({ error: "不允許的來源" }, 403);
      const type = c.req.header("content-type") ?? "";
      if (c.req.method !== "DELETE" && !type.startsWith("application/json")) {
        return c.json({ error: "只接受 JSON" }, 415);
      }
    }
    await next();
  };
}
