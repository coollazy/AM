import type { Config, Provider } from "./config";
import { isClaudeModel, limitFor, pickHelperModel } from "./models";

// AM 只管理這些變數：啟動前一律清除，再放入所選方案的值；其他環境變數不動
export const MANAGED_ENV_VARS = [
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_MODEL",
  "ANTHROPIC_DEFAULT_HAIKU_MODEL",
  "CLAUDE_CODE_MAX_OUTPUT_TOKENS",
  "CLAUDE_CODE_MAX_CONTEXT_TOKENS",
] as const;

export type LaunchSelection =
  | { provider: Provider & { type: "subscription" } }
  | {
      provider: Provider & { type: "api" };
      model: string;
      oneMillion: boolean;
      // 服務商目前可用的模型，用於自動挑選輔助模型
      availableModels: string[];
    };

export function buildLaunchEnv(
  baseEnv: Record<string, string | undefined>,
  config: Config,
  selection: LaunchSelection,
  platform: NodeJS.Platform = process.platform,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(baseEnv)) {
    if (value !== undefined && !isManaged(key, platform)) env[key] = value;
  }
  if (selection.provider.type === "subscription") return env;

  const { provider, model, oneMillion, availableModels } = selection as Extract<LaunchSelection, { model: string }>;
  env.ANTHROPIC_BASE_URL = provider.baseUrl;
  env.ANTHROPIC_AUTH_TOKEN = provider.apiKey;
  env.ANTHROPIC_MODEL = oneMillion ? `${model}[1m]` : model;
  env.ANTHROPIC_DEFAULT_HAIKU_MODEL = provider.helperModel ?? pickHelperModel(availableModels, model);

  const limit = limitFor(config, model);
  const maxOutput = limit.maxOutputTokens ?? (isClaudeModel(model) ? undefined : config.models.defaultMaxOutputTokens);
  if (maxOutput !== undefined) env.CLAUDE_CODE_MAX_OUTPUT_TOKENS = String(maxOutput);
  if (limit.maxContextTokens !== undefined) env.CLAUDE_CODE_MAX_CONTEXT_TOKENS = String(limit.maxContextTokens);
  return env;
}

// Windows 的環境變數名稱不分大小寫
function isManaged(key: string, platform: NodeJS.Platform): boolean {
  const name = platform === "win32" ? key.toUpperCase() : key;
  return (MANAGED_ENV_VARS as readonly string[]).includes(name);
}
