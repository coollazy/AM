import type { ApiProvider, Config, Provider, SubscriptionProvider } from "../core/config";
import { buildLaunchEnv } from "../core/env";
import { filterLlmModels, supportsOneMillion } from "../core/models";
import type { ModelListResult } from "../core/providers";
import { createPrompt, type PromptResult, type PromptState } from "./prompt";

export type MenuDeps = {
  loadConfig: () => Promise<Config>;
  saveSelection: (providerId: string, selection?: { model: string; oneMillion: boolean }) => Promise<void>;
  fetchModels: (provider: ApiProvider) => Promise<ModelListResult>;
  prompt: <T>(state: PromptState<T>) => Promise<PromptResult<T>>;
  launch: (env: Record<string, string>, args: string[]) => Promise<number>;
  log: (message: string) => void;
  env: Record<string, string | undefined>;
  platform?: NodeJS.Platform;
};

// 兩層選單：選服務商 → （API 服務商）選模型 → 啟動 Claude Code。回傳結束代碼
export async function runMenu(deps: MenuDeps, claudeArgs: string[]): Promise<number> {
  let notice: string | undefined;
  while (true) {
    const config = await deps.loadConfig();
    if (config.providers.length === 0) {
      deps.log("尚未設定任何服務商，請執行 am web 開啟管理網站新增。");
      return 1;
    }

    const providerChoice = await deps.prompt(
      createPrompt<Provider>({
        title: "選擇服務商",
        notice,
        items: config.providers.map((p) => ({ label: p.name, value: p, hint: p.type === "subscription" ? "訂閱制" : undefined })),
        initial: config.providers.find((p) => p.id === config.lastSelection.providerId),
        escape: "cancel",
      }),
    );
    notice = undefined;
    if (providerChoice.type !== "select") return 0;
    const provider = providerChoice.value;

    if (provider.type === "subscription") return launchSubscription(deps, config, provider, claudeArgs);

    deps.log(`正在查詢「${provider.name}」的模型清單…`);
    const result = await deps.fetchModels(provider);
    if (!result.ok) {
      notice = `「${provider.name}」查詢模型失敗：${result.error}。請選擇其他服務商。`;
      continue;
    }
    const models = filterLlmModels(result.models, config.models.excludeKeywords);
    if (models.length === 0) {
      notice = `「${provider.name}」沒有可用的文字對話模型。`;
      continue;
    }

    const last = config.lastSelection.byProvider[provider.id];
    const patterns = config.models.oneMillionPatterns;
    const modelChoice = await deps.prompt(
      createPrompt<string>({
        title: `選擇模型 · ${provider.name}`,
        items: models.map((m) => ({ label: m, value: m })),
        initial: last && models.includes(last.model) ? last.model : undefined,
        toggle: { label: "1M 上下文", on: last?.oneMillion ?? false, available: (m) => supportsOneMillion(m, patterns) },
        escape: "back",
      }),
    );
    if (modelChoice.type === "back") continue;
    if (modelChoice.type === "cancel") return 0;

    const selection = { model: modelChoice.value, oneMillion: modelChoice.toggleOn };
    await deps.saveSelection(provider.id, selection);
    const env = buildLaunchEnv(deps.env, config, { provider, ...selection, availableModels: models }, deps.platform);
    deps.log(`啟動 Claude Code：${provider.name} · ${selection.model}${selection.oneMillion ? "（1M）" : ""}`);
    return deps.launch(env, claudeArgs);
  }
}

async function launchSubscription(deps: MenuDeps, config: Config, provider: SubscriptionProvider, claudeArgs: string[]): Promise<number> {
  await deps.saveSelection(provider.id);
  const env = buildLaunchEnv(deps.env, config, { provider }, deps.platform);
  deps.log(`啟動 Claude Code：${provider.name}`);
  return deps.launch(env, claudeArgs);
}
