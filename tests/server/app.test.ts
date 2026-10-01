import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { lstat, mkdir, mkdtemp, readFile, readlink, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, updateConfig } from "../../src/core/config";
import { configPath } from "../../src/core/paths";
import type { FetchLike } from "../../src/core/providers";
import { createApp, maskKey, slugify, type AppOptions } from "../../src/server/app";

const PORT = 4141;
const ORIGIN = `http://127.0.0.1:${PORT}`;

let home: string;
let path: string;
let providerResponses: Response[];
let providerCalls: Array<{ url: string; auth?: string }>;
let platform: NodeJS.Platform;
let logouts: string[];
let logoutResult: boolean;
let terminals: string[];

const fakeFetch: FetchLike = async (url, init) => {
  providerCalls.push({ url, auth: (init?.headers as Record<string, string>)?.Authorization });
  return providerResponses.shift() ?? new Response("{}", { status: 500 });
};

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "am-web-"));
  path = configPath(home, {});
  providerResponses = [];
  providerCalls = [];
  platform = "darwin";
  logouts = [];
  logoutResult = true;
  terminals = [];
});

function services(): Pick<AppOptions, "home" | "platform" | "logoutAccount" | "openTerminal"> {
  return {
    home,
    platform,
    logoutAccount: async (dir) => (logouts.push(dir), logoutResult),
    openTerminal: async (command) => {
      terminals.push(command);
    },
  };
}

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

function app() {
  return createApp({ ...services(), configPath: path, port: PORT, fetch: fakeFetch });
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
  test("預設只有訂閱制，並回傳設定檔位置", async () => {
    const res = await call("GET", "/api/config");
    const body = await res.json();
    expect(body.configPath).toBe(path);
    expect(body.providers).toEqual([{ id: "subscription", type: "subscription", name: "Claude 訂閱制", primary: true, email: null, login: null, warnings: [] }]);
    expect(body.canAddSubscription).toBe(true);
    expect(body.loginButton).toBe(true);
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

  test("可以改訂閱制的名稱與 email，主帳號身分不變", async () => {
    await call("PUT", "/api/providers/subscription", { name: "我的訂閱", email: "me@example.com", primary: false });
    expect((await loadConfig(path)).providers[0]).toEqual({ id: "subscription", type: "subscription", name: "我的訂閱", primary: true, email: "me@example.com" });
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

describe("訂閱帳號", () => {
  const claudeDir = () => join(home, ".claude");
  const accountDir = (id: string) => join(home, ".am", "accounts", id);
  const writeState = (file: string, email: string) => writeFile(file, JSON.stringify({ oauthAccount: { emailAddress: email, organizationName: "ACME" } }));

  test("新增的訂閱制成為附加帳號，建立資料夾、共用捷徑並同步 MCP", async () => {
    await writeFile(join(home, ".claude.json"), JSON.stringify({ mcpServers: { jira: {} } }));
    const res = await call("POST", "/api/providers", { type: "subscription", name: "Work", email: "work@example.com" });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.providers[1]).toEqual({ id: "work", type: "subscription", name: "Work", primary: false, email: "work@example.com", login: null, warnings: [] });
    expect(await readlink(join(accountDir("work"), "skills"))).toBe(join(claudeDir(), "skills"));
    expect(JSON.parse(await readFile(join(accountDir("work"), ".claude.json"), "utf8")).mcpServers).toEqual({ jira: {} });
  });

  test("沒有主帳號時，新增的訂閱制成為主帳號，不建立附加帳號資料夾", async () => {
    await call("DELETE", "/api/providers/subscription");
    const body = await (await call("POST", "/api/providers", { type: "subscription", name: "Claude" })).json();
    expect(body.providers[0]).toMatchObject({ id: "claude", primary: true });
    await expect(lstat(join(home, ".am", "accounts"))).rejects.toThrow();
  });

  test("刪除主帳號只從選單移除，不登出、不動 ~/.claude", async () => {
    await mkdir(claudeDir());
    await writeFile(join(claudeDir(), "CLAUDE.md"), "keep");
    expect((await call("DELETE", "/api/providers/subscription")).status).toBe(200);
    expect(logouts).toEqual([]);
    expect(await readFile(join(claudeDir(), "CLAUDE.md"), "utf8")).toBe("keep");
    expect((await loadConfig(path)).providers).toEqual([]);
  });

  test("刪除附加帳號：先登出再刪除資料夾", async () => {
    await call("POST", "/api/providers", { type: "subscription", name: "Work" });
    const body = await (await call("DELETE", "/api/providers/work")).json();
    expect(logouts).toEqual([accountDir("work")]);
    expect(body.notice).toBeUndefined();
    await expect(lstat(accountDir("work"))).rejects.toThrow();
    expect(body.providers.map((p: { id: string }) => p.id)).toEqual(["subscription"]);
  });

  test("登出失敗仍刪除，並提示鑰匙圈可能殘留登入資料", async () => {
    await call("POST", "/api/providers", { type: "subscription", name: "Work" });
    logoutResult = false;
    const body = await (await call("DELETE", "/api/providers/work")).json();
    expect(body.notice).toContain("登出失敗");
    await expect(lstat(accountDir("work"))).rejects.toThrow();
  });

  test("顯示各帳號登入的 email，未登入為 null", async () => {
    await call("POST", "/api/providers", { type: "subscription", name: "Work" });
    await writeState(join(home, ".claude.json"), "me@example.com");
    const body = await (await call("GET", "/api/config")).json();
    expect(body.providers[0].login).toEqual({ email: "me@example.com", organization: "ACME" });
    expect(body.providers[1].login).toBeNull();
  });

  test("email 與填寫的不同、或兩個帳號登入同一個帳號時警告", async () => {
    await call("PUT", "/api/providers/subscription", { name: "Claude 訂閱制", email: "me@example.com" });
    await call("POST", "/api/providers", { type: "subscription", name: "Work" });
    await writeState(join(home, ".claude.json"), "ME@example.com");
    await writeState(join(accountDir("work"), ".claude.json"), "me@example.com");
    const body = await (await call("GET", "/api/config")).json();
    expect(body.providers[0].warnings).toEqual(["與「Work」登入的是同一個帳號，切換帳號不會換到不同的額度"]);
    expect(body.providers[1].warnings).toEqual(["與「Claude 訂閱制」登入的是同一個帳號，切換帳號不會換到不同的額度"]);

    await call("PUT", "/api/providers/work", { name: "Work", email: "work@example.com" });
    const again = await (await call("GET", "/api/config")).json();
    expect(again.providers[1].warnings[0]).toBe("預期登入 work@example.com，實際登入的是 me@example.com");
  });

  test("登入按鈕：主帳號不帶帳號資料夾，附加帳號帶自己的資料夾與 email", async () => {
    await call("POST", "/api/providers", { type: "subscription", name: "Work", email: "work@example.com" });
    expect((await call("POST", "/api/providers/subscription/login", {})).status).toBe(200);
    expect((await call("POST", "/api/providers/work/login", {})).status).toBe(200);
    expect(terminals[0]).toStartWith("env -u CLAUDE_CODE_OAUTH_TOKEN -u CLAUDE_CONFIG_DIR claude auth login;");
    expect(terminals[1]).toStartWith(`env -u CLAUDE_CODE_OAUTH_TOKEN CLAUDE_CONFIG_DIR='${accountDir("work")}' claude auth login --email 'work@example.com';`);
  });

  test("登入按鈕只支援訂閱帳號與 macOS", async () => {
    await call("POST", "/api/providers", mixroute);
    expect((await call("POST", "/api/providers/mixroute/login", {})).status).toBe(400);
    platform = "win32";
    expect((await call("POST", "/api/providers/subscription/login", {})).status).toBe(400);
    expect((await (await call("GET", "/api/config")).json()).loginButton).toBe(false);
    expect(terminals).toEqual([]);
  });

  test("Windows 只能有一個訂閱制，刪除後可以重新加回", async () => {
    platform = "win32";
    expect((await (await call("GET", "/api/config")).json()).canAddSubscription).toBe(false);
    const res = await call("POST", "/api/providers", { type: "subscription", name: "另一個" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Windows 目前只支援一個 Claude 訂閱制");
    await call("DELETE", "/api/providers/subscription");
    expect((await call("POST", "/api/providers", { type: "subscription", name: "Claude" })).status).toBe(201);
  });

  test("email 格式錯誤時回傳 400", async () => {
    expect((await call("POST", "/api/providers", { type: "subscription", name: "Work", email: "nope" })).status).toBe(400);
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

test("關閉請求會呼叫 onShutdown，且同樣需要通過來源檢查", async () => {
  let called = 0;
  const shutdownApp = createApp({ ...services(), configPath: path, port: PORT, onShutdown: () => called++ });
  const headers = { host: `127.0.0.1:${PORT}`, "content-type": "application/json" };
  const evil = await shutdownApp.request("/api/shutdown", { method: "POST", headers: { ...headers, origin: "https://evil.com" }, body: "{}" });
  expect(evil.status).toBe(403);
  const ok = await shutdownApp.request("/api/shutdown", { method: "POST", headers: { ...headers, origin: ORIGIN }, body: "{}" });
  expect(ok.status).toBe(200);
  await Bun.sleep(80);
  expect(called).toBe(1);
});

test("maskKey 與 slugify", () => {
  expect(maskKey("short")).toBe("****");
  expect(maskKey("sk-1234567890")).toBe("sk-****7890");
  expect(slugify("Claude MixRoute [Opus]")).toBe("claude-mixroute-opus");
  expect(slugify("中文名稱")).toBe("provider");
});
