import type { ApiProvider } from "./config";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type ModelListResult = { ok: true; models: string[] } | { ok: false; error: string };

export type FetchModelsOptions = {
  fetch?: FetchLike;
  timeoutMs?: number;
  retries?: number;
};

export const DEFAULT_TIMEOUT_MS = 10_000;

// 查詢服務商的模型清單；失敗時自動重試（預設一次），仍失敗則回傳失敗原因
export async function fetchModels(
  provider: Pick<ApiProvider, "baseUrl" | "apiKey">,
  options: FetchModelsOptions = {},
): Promise<ModelListResult> {
  const { fetch: doFetch = fetch, timeoutMs = DEFAULT_TIMEOUT_MS, retries = 1 } = options;
  let last: ModelListResult = { ok: false, error: "未知錯誤" };
  for (let attempt = 0; attempt <= retries; attempt++) {
    last = await fetchModelsOnce(provider, doFetch, timeoutMs);
    if (last.ok) return last;
  }
  return last;
}

async function fetchModelsOnce(
  provider: Pick<ApiProvider, "baseUrl" | "apiKey">,
  doFetch: FetchLike,
  timeoutMs: number,
): Promise<ModelListResult> {
  const url = `${provider.baseUrl.replace(/\/+$/, "")}/v1/models`;
  let res: Response;
  try {
    res = await doFetch(url, {
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "anthropic-version": "2023-06-01",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const name = (err as Error)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      return { ok: false, error: `連線逾時（超過 ${Math.round(timeoutMs / 1000)} 秒）` };
    }
    return { ok: false, error: `無法連線：${(err as Error)?.message ?? String(err)}` };
  }
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status}${describeError(text, provider.apiKey)}` };
  }
  return parseModelsResponse(text);
}

export function parseModelsResponse(text: string): ModelListResult {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, error: "服務商回應不是 JSON，請確認網址是否為 API 網址" };
  }
  const data = (body as { data?: unknown })?.data;
  if (!Array.isArray(data)) return { ok: false, error: "服務商回應格式不符（缺少 data 模型清單）" };
  const models = data
    .map((m) => (m as { id?: unknown })?.id)
    .filter((id): id is string => typeof id === "string" && id !== "");
  return { ok: true, models };
}

// 從錯誤回應中取出訊息；一律遮蔽 API key，避免顯示在畫面上
function describeError(text: string, apiKey: string): string {
  let message = "";
  try {
    const body = JSON.parse(text);
    message = body?.error?.message ?? body?.message ?? "";
  } catch {
    message = "";
  }
  if (typeof message !== "string" || message === "") return "";
  return `：${maskSecret(message, apiKey).slice(0, 300)}`;
}

export function maskSecret(text: string, secret: string): string {
  if (secret === "") return text;
  return text.split(secret).join("****");
}
