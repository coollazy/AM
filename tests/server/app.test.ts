import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, updateConfig } from "../../src/core/config";
import { configPath } from "../../src/core/paths";
import type { FetchLike } from "../../src/core/providers";
import { createApp, maskKey, slugify } from "../../src/server/app";

const PORT = 4747;
const ORIGIN = `http://127.0.0.1:${PORT}`;

let home: string;
let path: string;
let providerResponses: Response[];
let providerCalls: Array<{ url: string; auth?: string }>;

const fakeFetch: FetchLike = async (url, init) => {
  providerCalls.push({ url, auth: (init?.headers as Record<string, string>)?.Authorization });
  return providerResponses.shift() ?? new Response("{}", { status: 500 });
};

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "am-web-"));
  path = configPath(home);
  providerResponses = [];
  providerCalls = [];
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

function app() {
  return createApp({ configPath: path, port: PORT, fetch: fakeFetch });
}

function call(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
  return app().request(url, {
    method,
    headers: {
      host: `127.0.0.1:${PORT}`,
      ...(method === "GET" ? {} : { origin: ORIGIN }),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const mixroute = { type: "api", name: "MixRoute", baseUrl: "https://api.mixroute.ai", apiKey: "sk-mixroute-secret" };

describe("安全檢查", () => {
  test("Host 不是本機時拒絕（防止 DNS rebinding）", async () => {
    const res = await call("GET", "/api/config", undefined, { host: "evil.example.com" });
    expect(res.status).toBe(403);
  });

  test("來自其他網站的修改請求被拒絕", async () => {
    const res = await call("POST", "/api/providers", mixroute, { origin: "https://evil.example.com" });
    expect(res.status).toBe(403);
    expect((await loadConfig(path)).providers).toHaveLength(1);
  });

  test("沒有 Origin 的修改請求被拒絕", async () => {
    const res = await app().request("/api/providers", {
      method: "POST",
      headers: { host: `127.0.0.1:${PORT}`, "content-type": "application/json" },
      body: JSON.stringify(mixroute),
    });
    expect(res.status).toBe(403);
  });

  test("非 JSON 的修改請求被拒絕（擋掉表單直接送出）", async () => {
    const res = await call("POST", "/api/providers", undefined, { "content-type": "text/plain" });
    expect(res.status).toBe(415);
  });

  test("localhost 也可以使用", async () => {
    const res = await call("GET", "/api/health", undefined, { host: `localhost:${PORT}` });
    expect(res.status).toBe(200);
  });
});

describe("服務商管理", () => {
  test("預設只有訂閱制", async () => {
    const res = await call("GET", "/api/config");
    const body = await res.json();
    expect(body.providers).toEqual([{ id: "subscription", type: "subscription", name: "Claude 訂閱制" }]);
  });

  test("新增後回傳的 API key 已遮蔽，設定檔存的是完整 key", async () => {
    const res = await call("POST", "/api/providers", mixroute);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.providers[1]).toEqual({
      id: "mixroute",
      type: "api",
      name: "MixRoute",
      baseUrl: "https://api.mixroute.ai",
      apiKeyMasked: "sk-****cret",
      helperModel: null,
    });
    expect(JSON.stringify(body)).not.toContain("sk-mixroute-secret");
    expect((await loadConfig(path)).providers[1]).toMatchObject({ apiKey: "sk-mixroute-secret" });
  });

  test("名稱相同時 id 自動加上編號", async () => {
    await call("POST", "/api/providers", mixroute);
    const body = await (await call("POST", "/api/providers", mixroute)).json();
    expect(body.providers.map((p: { id: string }) => p.id)).toEqual(["subscription", "mixroute", "mixroute-2"]);
  });

  test("格式錯誤時回傳 400 與原因", async () => {
    const res = await call("POST", "/api/providers", { ...mixroute, baseUrl: "mixroute" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("baseUrl");
  });

  test("編輯時 API key 留空代表不變更，輔助模型留空代表自動", async () => {
    await call("POST", "/api/providers", { ...mixroute, helperModel: "claude-sonnet-5" });
    const res = await call("PUT", "/api/providers/mixroute", { name: "MR", baseUrl: "https://console.mixroute.io", apiKey: "", helperModel: "" });
    expect(res.status).toBe(200);
    expect((await loadConfig(path)).providers[1]).toEqual({
      id: "mixroute",
      type: "api",
      name: "MR",
      baseUrl: "https://console.mixroute.io",
      apiKey: "sk-mixroute-secret",
      helperModel: null,
    });
  });

  test("可以改訂閱制的名稱", async () => {
    await call("PUT", "/api/providers/subscription", { name: "我的訂閱" });
    expect((await loadConfig(path)).providers[0]).toEqual({ id: "subscription", type: "subscription", name: "我的訂閱" });
  });

  test("刪除時一併清除該服務商的上次選擇", async () => {
    await call("POST", "/api/providers", mixroute);
    await updateConfig(path, (c) => {
      c.lastSelection = { providerId: "mixroute", byProvider: { mixroute: { model: "claude-opus-5-5", oneMillion: true } } };
    });
    const res = await call("DELETE", "/api/providers/mixroute");
    expect(res.status).toBe(200);
    const config = await loadConfig(path);
    expect(config.providers.map((p) => p.id)).toEqual(["subscription"]);
    expect(config.lastSelection).toEqual({ providerId: null, byProvider: {} });
  });

  test("找不到服務商時回傳 404", async () => {
    expect((await call("DELETE", "/api/providers/nope")).status).toBe(404);
  });

  test("調整順序", async () => {
    await call("POST", "/api/providers", mixroute);
    await call("PUT", "/api/providers-order", { ids: ["mixroute", "subscription"] });
    expect((await loadConfig(path)).providers.map((p) => p.id)).toEqual(["mixroute", "subscription"]);
    expect((await call("PUT", "/api/providers-order", { ids: ["mixroute"] })).status).toBe(400);
  });
});

describe("測試連線", () => {
  test("回傳過濾後的模型清單與原始數量", async () => {
    providerResponses.push(new Response(JSON.stringify({ data: [{ id: "claude-sonnet-5" }, { id: "gpt-image-1" }, { id: "gpt-4o-mini" }] })));
    const res = await call("POST", "/api/models", { baseUrl: "https://api.mixroute.ai", apiKey: "sk-new" });
    expect(await res.json()).toEqual({ ok: true, models: ["claude-sonnet-5", "gpt-4o-mini"], total: 3 });
    expect(providerCalls[0]).toEqual({ url: "https://api.mixroute.ai/v1/models", auth: "Bearer sk-new" });
  });

  test("已儲存的服務商可以不填 API key", async () => {
    await call("POST", "/api/providers", mixroute);
    providerResponses.push(new Response(JSON.stringify({ data: [] })));
    await call("POST", "/api/models", { providerId: "mixroute", baseUrl: "https://api.mixroute.ai", apiKey: "" });
    expect(providerCalls[0]!.auth).toBe("Bearer sk-mixroute-secret");
  });

  test("服務商失敗時回傳失敗原因", async () => {
    providerResponses.push(new Response("{}", { status: 401 }), new Response("{}", { status: 401 }));
    const body = await (await call("POST", "/api/models", { baseUrl: "https://x.example", apiKey: "k" })).json();
    expect(body).toEqual({ ok: false, error: "HTTP 401" });
  });

  test("缺少網址或 key 時回傳 400", async () => {
    expect((await call("POST", "/api/models", { baseUrl: "https://x.example" })).status).toBe(400);
  });
});

describe("模型設定", () => {
  test("儲存時去除空白與重複項目，略過沒填數值的上限", async () => {
    const res = await call("PUT", "/api/settings/models", {
      excludeKeywords: [" image ", "image", ""],
      oneMillionPatterns: ["claude-opus-*"],
      defaultMaxOutputTokens: 4096,
      limits: { "gpt-4o-mini": { maxOutputTokens: 16384 }, " ": { maxOutputTokens: 1 }, empty: {} },
    });
    expect(res.status).toBe(200);
    expect((await loadConfig(path)).models).toEqual({
      excludeKeywords: ["image"],
      oneMillionPatterns: ["claude-opus-*"],
      defaultMaxOutputTokens: 4096,
      limits: { "gpt-4o-mini": { maxOutputTokens: 16384 } },
    });
  });

  test("數值不合法時回傳 400", async () => {
    const res = await call("PUT", "/api/settings/models", { excludeKeywords: [], oneMillionPatterns: [], defaultMaxOutputTokens: 0, limits: {} });
    expect(res.status).toBe(400);
  });
});

test("maskKey 與 slugify", () => {
  expect(maskKey("short")).toBe("****");
  expect(maskKey("sk-1234567890")).toBe("sk-****7890");
  expect(slugify("Claude MixRoute [Opus]")).toBe("claude-mixroute-opus");
  expect(slugify("中文名稱")).toBe("provider");
});
