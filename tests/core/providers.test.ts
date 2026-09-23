import { describe, expect, test } from "bun:test";
import { fetchModels, parseModelsResponse, type FetchLike } from "../../src/core/providers";

const provider = { baseUrl: "https://api.example.com/", apiKey: "sk-secret" };

// 依序回傳預先準備的回應，並記錄收到的請求
function scripted(...responses: Array<Response | Error>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error("沒有更多回應");
    if (next instanceof Error) throw next;
    return next;
  };
  return { fetch, calls };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("fetchModels", () => {
  test("成功時回傳模型 id，並帶上驗證標頭", async () => {
    const { fetch, calls } = scripted(json({ data: [{ id: "claude-sonnet-5" }, { id: "gpt-4o-mini" }], has_more: false }));
    expect(await fetchModels(provider, { fetch })).toEqual({ ok: true, models: ["claude-sonnet-5", "gpt-4o-mini"] });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.example.com/v1/models");
    const headers = calls[0]!.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-secret");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
  });

  test("第一次失敗時自動重試一次", async () => {
    // 2026-09-23 實測 LinkAI 曾暫時回傳此錯誤，重試後正常
    const { fetch, calls } = scripted(
      json({ error: { message: "无权访问 AWSB-VIP稳 分组", type: "new_api_error" } }, 403),
      json({ data: [{ id: "claude-sonnet-5" }] }),
    );
    expect(await fetchModels(provider, { fetch })).toEqual({ ok: true, models: ["claude-sonnet-5"] });
    expect(calls).toHaveLength(2);
  });

  test("重試後仍失敗時回傳失敗原因，且只重試一次", async () => {
    const { fetch, calls } = scripted(
      json({ error: { message: "invalid key sk-secret" } }, 401),
      json({ error: { message: "invalid key sk-secret" } }, 401),
    );
    const result = await fetchModels(provider, { fetch });
    expect(calls).toHaveLength(2);
    expect(result).toEqual({ ok: false, error: "HTTP 401：invalid key ****" });
  });

  test("連線錯誤與逾時轉成易懂的訊息", async () => {
    const timeout = new DOMException("timed out", "TimeoutError");
    const { fetch } = scripted(new Error("getaddrinfo ENOTFOUND"), timeout);
    const result = await fetchModels(provider, { fetch, timeoutMs: 10_000 });
    expect(result).toEqual({ ok: false, error: "連線逾時（超過 10 秒）" });
    const once = await fetchModels(provider, { fetch: scripted(new Error("getaddrinfo ENOTFOUND")).fetch, retries: 0 });
    expect(once).toEqual({ ok: false, error: "無法連線：getaddrinfo ENOTFOUND" });
  });
});

describe("parseModelsResponse", () => {
  test("網址填成網頁時提示確認網址", () => {
    expect(parseModelsResponse("<!doctype html><html></html>")).toEqual({ ok: false, error: "服務商回應不是 JSON，請確認網址是否為 API 網址" });
  });

  test("缺少 data 時回報格式不符", () => {
    expect(parseModelsResponse(JSON.stringify({ models: [] })).ok).toBe(false);
  });

  test("略過沒有 id 的項目", () => {
    expect(parseModelsResponse(JSON.stringify({ data: [{ id: "a" }, {}, { id: 3 }, null] }))).toEqual({ ok: true, models: ["a"] });
  });
});
