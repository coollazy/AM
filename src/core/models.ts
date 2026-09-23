import type { Config, ModelLimit } from "./config";

export function isClaudeModel(model: string): boolean {
  return model.toLowerCase().startsWith("claude-");
}

// 依名稱關鍵字排除圖片、語音、嵌入等非文字對話模型（不分大小寫），並依名稱排序
export function filterLlmModels(models: string[], excludeKeywords: string[]): string[] {
  const keywords = excludeKeywords.map((k) => k.trim().toLowerCase()).filter((k) => k !== "");
  const unique = [...new Set(models)];
  return unique
    .filter((m) => {
      const lower = m.toLowerCase();
      return !keywords.some((k) => lower.includes(k));
    })
    .sort(compareModelNames);
}

// 名單支援 * 萬用字元，例如 claude-opus-*
export function supportsOneMillion(model: string, patterns: string[]): boolean {
  return patterns.some((p) => globToRegExp(p).test(model));
}

// 輔助模型：清單中有 Haiku 用最新的 Haiku，否則用最新的 Sonnet，都沒有則用主模型
export function pickHelperModel(available: string[], mainModel: string): string {
  for (const family of ["haiku", "sonnet"]) {
    const candidates = available.filter((m) => isClaudeModel(m) && m.toLowerCase().includes(family));
    const newest = candidates.sort(compareModelNames).at(-1);
    if (newest) return newest;
  }
  return mainModel;
}

export function limitFor(config: Config, model: string): ModelLimit {
  return config.models.limits[model] ?? {};
}

// 自然排序：claude-opus-4-10 排在 claude-opus-4-9 之後
export function compareModelNames(a: string, b: string): number {
  return a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.trim().replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}
