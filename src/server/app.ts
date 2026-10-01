import { Hono } from "hono";
import { dirname, join } from "node:path";
import { accountStatePath, linkSharedItems, readLogin, removeAccount, syncAccountState, type LoginInfo } from "../core/accounts";
import {
  ConfigError,
  loadConfig,
  normalizeProvider,
  updateConfig,
  type Config,
  type ModelLimit,
  type Provider,
  type SubscriptionProvider,
} from "../core/config";
import { filterLlmModels } from "../core/models";
import { fetchModels, type FetchLike } from "../core/providers";
import { claudeDir, claudeStatePath } from "../core/paths";
import { loginCommand } from "../platform/login";
import { VERSION } from "../version";
import { localOnly } from "./security";

export type AppOptions = {
  configPath: string;
  port: number;
  fetch?: FetchLike;
  // 收到關閉請求時呼叫（am autostart off 會用來停止執行中的網站）
  onShutdown?: () => void;
  // 使用者家目錄：主帳號在 ~/.claude 與 ~/.claude.json
  home: string;
  platform: NodeJS.Platform;
  // 以附加帳號的資料夾執行 claude auth logout，成功回傳 true
  logoutAccount: (accountDir: string) => Promise<boolean>;
  // 在新的終端機視窗執行指令（登入按鈕）
  openTerminal: (command: string) => Promise<void>;
};

export type PublicProvider =
  | {
      id: string;
      type: "subscription";
      name: string;
      primary: boolean;
      email: string | null;
      // 目前登入的帳號；未登入為 null
      login: LoginInfo | null;
      warnings: string[];
    }
  | { id: string; type: "api"; name: string; baseUrl: string; apiKeyMasked: string; helperModel: string | null };

export function createApp(options: AppOptions) {
  const { configPath, port, fetch, onShutdown } = options;
  // 附加帳號的資料夾放在設定目錄底下（~/.am/accounts/<id>）
  const accountsRoot = join(dirname(configPath), "accounts");
  const accountDirOf = (id: string) => join(accountsRoot, id);
  const env: PublicEnv = {
    platform: options.platform,
    primaryStatePath: claudeStatePath(options.home),
    accountStatePath: (id) => accountStatePath(accountDirOf(id)),
  };

  const app = new Hono();
  app.use("/api/*", localOnly(port));

  app.onError((err, c) => {
    if (err instanceof ConfigError || err instanceof BadRequest) return c.json({ error: err.message }, 400);
    if (err instanceof NotFound) return c.json({ error: err.message }, 404);
    console.error(err);
    return c.json({ error: "伺服器錯誤" }, 500);
  });

  app.get("/api/health", (c) => c.json({ ok: true, app: "am", version: VERSION }));

  app.post("/api/shutdown", (c) => {
    // 先回應再關閉，讓呼叫端知道已收到
    setTimeout(() => onShutdown?.(), 50);
    return c.json({ ok: true });
  });

  app.get("/api/config", async (c) => c.json(await toPublic(await loadConfig(configPath), env, configPath)));

  // 新增服務商；id 由名稱自動產生
  app.post("/api/providers", async (c) => {
    const body = await readJson(c.req.raw);
    let added: Provider | undefined;
    const config = await updateConfig(configPath, (config) => {
      if (body.type === "subscription" && !canAddSubscription(config, options.platform)) {
        throw new BadRequest("Windows 目前只支援一個 Claude 訂閱制");
      }
      const id = uniqueId(slugify(String(body.name ?? "")), config.providers);
      // 沒有主帳號時，新增的訂閱制成為主帳號；否則是附加帳號
      const primary = !config.providers.some((p) => p.type === "subscription" && p.primary);
      added = normalizeProvider({ ...body, id, primary, helperModel: emptyToNull(body.helperModel) });
      config.providers.push(added);
    });
    // 附加帳號先建好資料夾，讓登入按鈕與選單都能直接使用
    if (added?.type === "subscription" && !added.primary) {
      const dir = accountDirOf(added.id);
      await linkSharedItems(claudeDir(options.home), dir);
      await syncAccountState(claudeStatePath(options.home), dir);
    }
    return c.json(await toPublic(config, env, configPath), 201);
  });

  // 編輯服務商；API key 留空代表不變更
  app.put("/api/providers/:id", async (c) => {
    const id = c.req.param("id");
    const body = await readJson(c.req.raw);
    const config = await updateConfig(configPath, (config) => {
      const index = findIndex(config, id);
      const current = config.providers[index]!;
      const apiKey = typeof body.apiKey === "string" && body.apiKey.trim() !== "" ? body.apiKey : current.type === "api" ? current.apiKey : undefined;
      const primary = current.type === "subscription" && current.primary;
      config.providers[index] = normalizeProvider({ ...body, id, type: current.type, primary, apiKey, helperModel: emptyToNull(body.helperModel) });
    });
    return c.json(await toPublic(config, env, configPath));
  });

  // 刪除主帳號只從選單移除；刪除附加帳號會先登出再刪除它的資料夾
  app.delete("/api/providers/:id", async (c) => {
    const id = c.req.param("id");
    const target = (await loadConfig(configPath)).providers.find((p) => p.id === id);
    let notice: string | undefined;
    if (target?.type === "subscription" && !target.primary) {
      const dir = accountDirOf(id);
      const { loggedOut } = await removeAccount(accountsRoot, dir, () => options.logoutAccount(dir));
      if (!loggedOut) notice = `「${target.name}」已刪除，但登出失敗，macOS 鑰匙圈可能殘留它的登入資料（項目名稱以「Claude Code-credentials」開頭）。`;
    }
    const config = await updateConfig(configPath, (config) => {
      config.providers.splice(findIndex(config, id), 1);
      delete config.lastSelection.byProvider[id];
      if (config.lastSelection.providerId === id) config.lastSelection.providerId = null;
    });
    return c.json({ ...(await toPublic(config, env, configPath)), notice });
  });

  // 開啟終端機視窗登入訂閱帳號（只支援 macOS）
  app.post("/api/providers/:id/login", async (c) => {
    const id = c.req.param("id");
    const config = await loadConfig(configPath);
    const provider = config.providers[findIndex(config, id)]!;
    if (provider.type !== "subscription") throw new BadRequest("只有訂閱帳號需要登入");
    if (options.platform !== "darwin") throw new BadRequest("登入按鈕目前只支援 macOS，請在終端機執行 am 選擇此帳號後輸入 /login");
    await options.openTerminal(loginCommand(provider.primary ? null : accountDirOf(id), provider.email));
    return c.json({ ok: true });
  });

  // 調整服務商在選單中的順序
  app.put("/api/providers-order", async (c) => {
    const body = await readJson(c.req.raw);
    const ids = body.ids;
    const config = await updateConfig(configPath, (config) => {
      const current = config.providers.map((p) => p.id);
      if (!Array.isArray(ids) || ids.length !== current.length || !current.every((id) => ids.includes(id))) {
        throw new BadRequest("順序必須包含所有服務商且不可重複");
      }
      config.providers = ids.map((id: string) => config.providers.find((p) => p.id === id)!);
    });
    return c.json(await toPublic(config, env, configPath));
  });

  // 測試連線並取得模型清單。已存在的服務商可省略 apiKey，改用已儲存的 key
  app.post("/api/models", async (c) => {
    const body = await readJson(c.req.raw);
    const config = await loadConfig(configPath);
    let apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    if (apiKey === "" && typeof body.providerId === "string") {
      const saved = config.providers.find((p) => p.id === body.providerId);
      if (saved?.type === "api") apiKey = saved.apiKey;
    }
    const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim() : "";
    if (baseUrl === "" || apiKey === "") throw new BadRequest("請填寫網址與 API key");
    const result = await fetchModels({ baseUrl, apiKey }, { fetch });
    if (!result.ok) return c.json({ ok: false, error: result.error });
    const models = filterLlmModels(result.models, config.models.excludeKeywords);
    return c.json({ ok: true, models, total: result.models.length });
  });

  app.put("/api/settings/models", async (c) => {
    const body = await readJson(c.req.raw);
    const config = await updateConfig(configPath, (config) => {
      config.models = {
        excludeKeywords: cleanList(body.excludeKeywords, "排除關鍵字"),
        oneMillionPatterns: cleanList(body.oneMillionPatterns, "支援 1M 的模型"),
        defaultMaxOutputTokens: body.defaultMaxOutputTokens,
        limits: cleanLimits(body.limits),
      };
    });
    return c.json(await toPublic(config, env, configPath));
  });

  return app;
}

export type PublicConfig = Awaited<ReturnType<typeof toPublic>> & { notice?: string };

type PublicEnv = {
  platform: NodeJS.Platform;
  primaryStatePath: string;
  accountStatePath: (id: string) => string;
};

async function toPublic(config: Config, env: PublicEnv, path?: string) {
  const logins = new Map<string, LoginInfo | null>();
  for (const p of config.providers) {
    if (p.type === "subscription") logins.set(p.id, await readLogin(p.primary ? env.primaryStatePath : env.accountStatePath(p.id)));
  }
  const subscriptions = config.providers.filter((p): p is SubscriptionProvider => p.type === "subscription");
  return {
    // 設定檔位置，顯示在網站的資料安全說明中
    configPath: path,
    port: config.server.port,
    providers: config.providers.map((p) => publicProvider(p, subscriptions, logins)),
    models: config.models,
    canAddSubscription: canAddSubscription(config, env.platform),
    // 登入按鈕只支援 macOS
    loginButton: env.platform === "darwin",
  };
}

function publicProvider(p: Provider, subscriptions: SubscriptionProvider[], logins: Map<string, LoginInfo | null>): PublicProvider {
  if (p.type === "subscription") {
    const login = logins.get(p.id) ?? null;
    return { ...p, login, warnings: loginWarnings(p, login, subscriptions, logins) };
  }
  const { apiKey, ...rest } = p;
  return { ...rest, apiKeyMasked: maskKey(apiKey) };
}

// 登入的帳號與填寫的 email 不同，或與其他訂閱帳號登入同一個帳號時提醒
export function loginWarnings(p: SubscriptionProvider, login: LoginInfo | null, subscriptions: SubscriptionProvider[], logins: Map<string, LoginInfo | null>): string[] {
  if (login === null) return [];
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const warnings: string[] = [];
  if (p.email !== null && !same(p.email, login.email)) warnings.push(`預期登入 ${p.email}，實際登入的是 ${login.email}`);
  for (const other of subscriptions) {
    const otherLogin = logins.get(other.id);
    if (other.id !== p.id && otherLogin && same(otherLogin.email, login.email)) {
      warnings.push(`與「${other.name}」登入的是同一個帳號，切換帳號不會換到不同的額度`);
    }
  }
  return warnings;
}

// Windows 這版只支援一個訂閱制（多帳號共用設定需要檔案捷徑，Windows 要開發人員模式才能建立）
function canAddSubscription(config: Config, platform: NodeJS.Platform): boolean {
  return platform !== "win32" || !config.providers.some((p) => p.type === "subscription");
}

export function maskKey(key: string): string {
  if (key.length <= 8) return "****";
  return `${key.slice(0, 3)}****${key.slice(-4)}`;
}

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "provider" : slug;
}

function uniqueId(base: string, providers: Provider[]): string {
  const ids = new Set(providers.map((p) => p.id));
  if (!ids.has(base)) return base;
  let n = 2;
  while (ids.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

function findIndex(config: Config, id: string): number {
  const index = config.providers.findIndex((p) => p.id === id);
  if (index === -1) throw new NotFound(`找不到服務商「${id}」`);
  return index;
}

function emptyToNull(v: unknown): unknown {
  return typeof v === "string" && v.trim() === "" ? null : (v ?? null);
}

function cleanList(v: unknown, label: string): string[] {
  if (!Array.isArray(v) || !v.every((s) => typeof s === "string")) throw new BadRequest(`${label}必須是文字清單`);
  return [...new Set(v.map((s) => s.trim()).filter((s) => s !== ""))];
}

function cleanLimits(v: unknown): Record<string, ModelLimit> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new BadRequest("模型上限格式錯誤");
  const limits: Record<string, ModelLimit> = {};
  for (const [model, limit] of Object.entries(v)) {
    const name = model.trim();
    if (name === "") continue;
    const clean: ModelLimit = {};
    const l = (limit ?? {}) as Record<string, unknown>;
    if (l.maxOutputTokens !== undefined && l.maxOutputTokens !== null) clean.maxOutputTokens = l.maxOutputTokens as number;
    if (l.maxContextTokens !== undefined && l.maxContextTokens !== null) clean.maxContextTokens = l.maxContextTokens as number;
    if (clean.maxOutputTokens !== undefined || clean.maxContextTokens !== undefined) limits[name] = clean;
  }
  return limits;
}

async function readJson(req: Request): Promise<Record<string, any>> {
  try {
    const body = await req.json();
    if (typeof body === "object" && body !== null && !Array.isArray(body)) return body;
  } catch {}
  throw new BadRequest("請求內容必須是 JSON 物件");
}

class BadRequest extends Error {}
class NotFound extends Error {}
