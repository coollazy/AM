import index from "../web/index.html";
import { createApp, type AppOptions } from "./app";

export const HOSTNAME = "127.0.0.1";

export class PortInUseError extends Error {
  constructor(port: number) {
    super(`埠號 ${port} 已被使用，AM 管理網站可能已在執行中`);
  }
}

export function startServer(options: AppOptions) {
  const app = createApp(options);
  try {
    return Bun.serve({
      hostname: HOSTNAME,
      port: options.port,
      // 打包後的執行檔預設允許重複綁定同一埠號，必須明確關閉才能偵測已在執行
      reusePort: false,
      development: process.env.NODE_ENV !== "production",
      routes: {
        "/": index,
        "/api/*": (req) => app.fetch(req),
      },
      fetch: () => new Response("Not Found", { status: 404 }),
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "EADDRINUSE") throw new PortInUseError(options.port);
    throw err;
  }
}
