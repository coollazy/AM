import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type SubscriptionProvider = {
  id: string;
  type: "subscription";
  name: string;
};

export type ApiProvider = {
  id: string;
  type: "api";
  name: string;
  baseUrl: string;
  apiKey: string;
  helperModel: string | null;
};

export type Provider = SubscriptionProvider | ApiProvider;

export type ModelLimit = {
  maxOutputTokens?: number;
  maxContextTokens?: number;
};

export type ModelSelection = {
  model: string;
  oneMillion: boolean;
};

export type Config = {
  version: 1;
  server: { port: number };
  providers: Provider[];
  models: {
    excludeKeywords: string[];
    oneMillionPatterns: string[];
    defaultMaxOutputTokens: number;
    limits: Record<string, ModelLimit>;
  };
  lastSelection: {
    providerId: string | null;
    byProvider: Record<string, ModelSelection>;
  };
};

export const DEFAULT_PORT = 4747;

export function defaultConfig(): Config {
  return {
    version: 1,
    server: { port: DEFAULT_PORT },
    providers: [{ id: "subscription", type: "subscription", name: "Claude 訂閱制" }],
    models: {
      excludeKeywords: [
        "image",
        "tts",
        "transcribe",
        "embedding",
        "audio",
        "whisper",
        "dall-e",
        "realtime",
        "moderation",
        "sora",
        "veo",
      ],
      oneMillionPatterns: ["claude-opus-*", "claude-sonnet-*"],
      defaultMaxOutputTokens: 8192,
      limits: {},
    },
    lastSelection: { providerId: null, byProvider: {} },
  };
}

export class ConfigError extends Error {}

// 將讀進來的 JSON 補齊預設值並檢查格式；格式錯誤時丟出 ConfigError
export function normalizeConfig(raw: unknown): Config {
  const base = defaultConfig();
  if (!isObject(raw)) throw new ConfigError("設定檔格式錯誤：最外層必須是物件");

  const server = isObject(raw.server) ? raw.server : {};
  const port = server.port ?? base.server.port;
  if (!isPort(port)) throw new ConfigError("設定檔格式錯誤：server.port 必須是 1–65535 的整數");

  const providers = raw.providers === undefined ? base.providers : raw.providers;
  if (!Array.isArray(providers)) throw new ConfigError("設定檔格式錯誤：providers 必須是陣列");
  const normalizedProviders = providers.map((p, i) => normalizeProvider(p, `providers[${i}]`));
  const ids = new Set<string>();
  for (const p of normalizedProviders) {
    if (ids.has(p.id)) throw new ConfigError(`設定檔格式錯誤：服務商 id「${p.id}」重複`);
    ids.add(p.id);
  }

  const models = isObject(raw.models) ? raw.models : {};
  const excludeKeywords = models.excludeKeywords ?? base.models.excludeKeywords;
  const oneMillionPatterns = models.oneMillionPatterns ?? base.models.oneMillionPatterns;
  const defaultMaxOutputTokens = models.defaultMaxOutputTokens ?? base.models.defaultMaxOutputTokens;
  const limits = models.limits ?? {};
  if (!isStringArray(excludeKeywords)) throw new ConfigError("設定檔格式錯誤：models.excludeKeywords 必須是字串陣列");
  if (!isStringArray(oneMillionPatterns)) throw new ConfigError("設定檔格式錯誤：models.oneMillionPatterns 必須是字串陣列");
  if (!isPositiveInt(defaultMaxOutputTokens)) throw new ConfigError("設定檔格式錯誤：models.defaultMaxOutputTokens 必須是正整數");
  if (!isObject(limits)) throw new ConfigError("設定檔格式錯誤：models.limits 必須是物件");
  const normalizedLimits: Record<string, ModelLimit> = {};
  for (const [model, limit] of Object.entries(limits)) {
    normalizedLimits[model] = normalizeLimit(limit, `models.limits.${model}`);
  }

  const last = isObject(raw.lastSelection) ? raw.lastSelection : {};
  const providerId = typeof last.providerId === "string" ? last.providerId : null;
  const byProvider: Record<string, ModelSelection> = {};
  if (isObject(last.byProvider)) {
    for (const [id, sel] of Object.entries(last.byProvider)) {
      // 上次選擇只是便利資訊，格式不對就略過，不讓整份設定檔失效
      if (isObject(sel) && typeof sel.model === "string") {
        byProvider[id] = { model: sel.model, oneMillion: sel.oneMillion === true };
      }
    }
  }

  return {
    version: 1,
    server: { port: port as number },
    providers: normalizedProviders,
    models: {
      excludeKeywords,
      oneMillionPatterns,
      defaultMaxOutputTokens: defaultMaxOutputTokens as number,
      limits: normalizedLimits,
    },
    lastSelection: { providerId, byProvider },
  };
}

export function normalizeProvider(raw: unknown, where = "provider"): Provider {
  if (!isObject(raw)) throw new ConfigError(`${where} 必須是物件`);
  const { id, type, name } = raw;
  if (typeof id !== "string" || !/^[a-z0-9][a-z0-9_-]*$/.test(id)) {
    throw new ConfigError(`${where}.id 只能包含小寫英文、數字、- 與 _，且不能以符號開頭`);
  }
  if (typeof name !== "string" || name.trim() === "") throw new ConfigError(`${where}.name 不可為空`);
  if (type === "subscription") return { id, type, name: name.trim() };
  if (type !== "api") throw new ConfigError(`${where}.type 必須是 subscription 或 api`);

  const { baseUrl, apiKey } = raw;
  const helperModel = raw.helperModel ?? null;
  if (typeof baseUrl !== "string" || !isHttpUrl(baseUrl)) throw new ConfigError(`${where}.baseUrl 必須是 http 或 https 網址`);
  if (typeof apiKey !== "string" || apiKey.trim() === "") throw new ConfigError(`${where}.apiKey 不可為空`);
  if (helperModel !== null && (typeof helperModel !== "string" || helperModel.trim() === "")) {
    throw new ConfigError(`${where}.helperModel 必須是模型名稱或 null`);
  }
  return {
    id,
    type,
    name: name.trim(),
    baseUrl: baseUrl.trim().replace(/\/+$/, ""),
    apiKey: apiKey.trim(),
    helperModel: helperModel === null ? null : (helperModel as string).trim(),
  };
}

function normalizeLimit(raw: unknown, where: string): ModelLimit {
  if (!isObject(raw)) throw new ConfigError(`設定檔格式錯誤：${where} 必須是物件`);
  const limit: ModelLimit = {};
  if (raw.maxOutputTokens !== undefined) {
    if (!isPositiveInt(raw.maxOutputTokens)) throw new ConfigError(`設定檔格式錯誤：${where}.maxOutputTokens 必須是正整數`);
    limit.maxOutputTokens = raw.maxOutputTokens;
  }
  if (raw.maxContextTokens !== undefined) {
    if (!isPositiveInt(raw.maxContextTokens)) throw new ConfigError(`設定檔格式錯誤：${where}.maxContextTokens 必須是正整數`);
    limit.maxContextTokens = raw.maxContextTokens;
  }
  return limit;
}

// 設定檔不存在時回傳預設設定（不寫檔）
export async function loadConfig(path: string): Promise<Config> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return defaultConfig();
    throw err;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ConfigError(`設定檔不是有效的 JSON：${path}`);
  }
  return normalizeConfig(raw);
}

// 寫入前一律重新讀取最新內容再套用修改，避免網站與 am 選單互相覆蓋
export async function updateConfig(path: string, mutate: (config: Config) => void): Promise<Config> {
  const config = await loadConfig(path);
  mutate(config);
  const normalized = normalizeConfig(config);
  await writeConfigAtomic(path, normalized);
  return normalized;
}

async function writeConfigAtomic(path: string, config: Config): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
  await rename(tmp, path);
  if (process.platform !== "win32") {
    await chmod(dir, 0o700);
    await chmod(path, 0o600);
  }
}

function isObject(v: unknown): v is Record<string, any> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((s) => typeof s === "string");
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

function isPort(v: unknown): boolean {
  return isPositiveInt(v) && v <= 65535;
}

function isHttpUrl(v: string): boolean {
  try {
    const url = new URL(v.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
