import type { PublicConfig } from "../server/app";

export type { PublicConfig, PublicProvider } from "../server/app";

export type ModelsResult = { ok: true; models: string[]; total: number } | { ok: false; error: string };

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

export const api = {
  config: () => request<PublicConfig>("GET", "/api/config"),
  createProvider: (body: unknown) => request<PublicConfig>("POST", "/api/providers", body),
  updateProvider: (id: string, body: unknown) => request<PublicConfig>("PUT", `/api/providers/${encodeURIComponent(id)}`, body),
  deleteProvider: (id: string) => request<PublicConfig>("DELETE", `/api/providers/${encodeURIComponent(id)}`),
  reorderProviders: (ids: string[]) => request<PublicConfig>("PUT", "/api/providers-order", { ids }),
  models: (body: { providerId?: string; baseUrl: string; apiKey: string }) => request<ModelsResult>("POST", "/api/models", body),
  saveModelSettings: (body: unknown) => request<PublicConfig>("PUT", "/api/settings/models", body),
};
