import { Hono } from "hono";
import {
  ConfigError,
  loadConfig,
  normalizeProvider,
  updateConfig,
  type Config,
  type ModelLimit,
  type Provider,
} from "../core/config";
import { filterLlmModels } from "../core/models";
import { fetchModels, type FetchLike } from "../core/providers";
import { VERSION } from "../version";
import { localOnly } from "./security";

export type AppOptions = {
  configPath: string;
  port: number;
  fetch?: FetchLike;
  // 收到關閉請求時呼叫（am autostart off 會用來停止執行中的網站）
  onShutdown?: () => void;
};

export type PublicProvider =
  | { id: string; type: "subscription"; name: string }
  | { id: string; type: "api"; name: string; baseUrl: string; apiKeyMasked: string; helperModel: string | null };

export function createApp({ configPath, port, fetch, onShutdown }: AppOptions) {
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

  app.get("/api/config", async (c) => c.json(toPublic(await loadConfig(configPath))));

  // 新增服務商；id 由名稱自動產生
  app.post("/api/providers", async (c) => {
    const body = await readJson(c.req.raw);
    const config = await updateConfig(configPath, (config) => {
      // Claude Code 只有一份登入資料，多個訂閱制項目效果相同，所以只允許一個
      if (body.type === "subscription" && config.providers.some((p) => p.type === "subscription")) {
        throw new BadRequest("已經有 Claude 訂閱制，不能重複新增");
      }
      const id = uniqueId(slugify(String(body.name ?? "")), config.providers);
      const provider = normalizeProvider({ ...body, id, helperModel: emptyToNull(body.helperModel) });
      config.providers.push(provider);
    });
    return c.json(toPublic(config), 201);
  });

  // 編輯服務商；API key 留空代表不變更
  app.put("/api/providers/:id", async (c) => {
    const id = c.req.param("id");
    const body = await readJson(c.req.raw);
    const config = await updateConfig(configPath, (config) => {
      const index = findIndex(config, id);
      const current = config.providers[index]!;
      const apiKey = typeof body.apiKey === "string" && body.apiKey.trim() !== "" ? body.apiKey : current.type === "api" ? current.apiKey : undefined;
      config.providers[index] = normalizeProvider({ ...body, id, type: current.type, apiKey, helperModel: emptyToNull(body.helperModel) });
    });
    return c.json(toPublic(config));
  });

  app.delete("/api/providers/:id", async (c) => {
    const id = c.req.param("id");
    const config = await updateConfig(configPath, (config) => {
      config.providers.splice(findIndex(config, id), 1);
      delete config.lastSelection.byProvider[id];
      if (config.lastSelection.providerId === id) config.lastSelection.providerId = null;
    });
    return c.json(toPublic(config));
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
    return c.json(toPublic(config));
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
    return c.json(toPublic(config));
  });

  return app;
}

export type PublicConfig = ReturnType<typeof toPublic>;

function toPublic(config: Config) {
  return {
    port: config.server.port,
    providers: config.providers.map(publicProvider),
    models: config.models,
  };
}

function publicProvider(p: Provider): PublicProvider {
  if (p.type === "subscription") return p;
  const { apiKey, ...rest } = p;
  return { ...rest, apiKeyMasked: maskKey(apiKey) };
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
