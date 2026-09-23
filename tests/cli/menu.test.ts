import { describe, expect, test } from "bun:test";
import { CLAUDE_NOT_INSTALLED, runMenu, type MenuDeps } from "../../src/cli/menu";
import { currentItem, type PromptResult, type PromptState } from "../../src/cli/prompt";
import { defaultConfig, type ApiProvider, type Config } from "../../src/core/config";
import type { ModelListResult } from "../../src/core/providers";

const mixroute: ApiProvider = { id: "mixroute", type: "api", name: "MixRoute", baseUrl: "https://api.mixroute.ai", apiKey: "sk-m", helperModel: null };
const linkai: ApiProvider = { id: "linkai", type: "api", name: "LinkAI", baseUrl: "https://linkai.llc", apiKey: "sk-l", helperModel: null };

type Answer = (state: PromptState<any>) => PromptResult<any>;

// 依序回答每個選單畫面，並記錄畫面內容與啟動的環境變數
function harness(config: Config, answers: Answer[], models: Record<string, ModelListResult> = {}) {
  const prompts: PromptState<any>[] = [];
  const launches: Array<{ env: Record<string, string>; args: string[] }> = [];
  const saved: Array<[string, unknown]> = [];
  const logs: string[] = [];
  const deps: MenuDeps = {
    claudeInstalled: () => true,
    loadConfig: async () => structuredClone(config),
    saveSelection: async (id, sel) => {
      saved.push([id, sel]);
    },
    fetchModels: async (p) => models[p.id] ?? { ok: false, error: "未設定" },
    prompt: async (state) => {
      prompts.push(state);
      const answer = answers.shift();
      if (!answer) throw new Error("沒有預期的選單");
      return answer(state);
    },
    launch: async (env, args) => {
      launches.push({ env, args });
      return 0;
    },
    log: (m) => logs.push(m),
    env: { PATH: "/usr/bin", ANTHROPIC_API_KEY: "全域的 key" },
    platform: "darwin",
  };
  return { deps, prompts, launches, saved, logs };
}

const pick =
  (label: string, toggleOn = false): Answer =>
  (state) => {
    const item = state.items.find((i) => i.label === label);
    if (!item) throw new Error(`找不到 ${label}`);
    return { type: "select", value: item.value, toggleOn };
  };
const back: Answer = () => ({ type: "back" });
const cancel: Answer = () => ({ type: "cancel" });
const enterDefault: Answer = (state) => ({ type: "select", value: currentItem(state)!.value, toggleOn: false });

function configWith(...providers: ApiProvider[]): Config {
  const config = defaultConfig();
  config.providers.push(...providers);
  return config;
}

describe("runMenu", () => {
  test("訂閱制：直接啟動，不查模型，清掉 ANTHROPIC_API_KEY", async () => {
    const h = harness(configWith(mixroute), [pick("Claude 訂閱制")]);
    expect(await runMenu(h.deps, ["--resume"])).toBe(0);
    expect(h.prompts).toHaveLength(1);
    expect(h.launches).toEqual([{ env: { PATH: "/usr/bin" }, args: ["--resume"] }]);
    expect(h.saved).toEqual([["subscription", undefined]]);
  });

  test("API 服務商：查模型 → 選模型 → 記住選擇 → 啟動", async () => {
    const h = harness(configWith(mixroute), [pick("MixRoute"), pick("claude-opus-5-5", true)], {
      mixroute: { ok: true, models: ["claude-opus-5-5", "gpt-image-1", "claude-haiku-4-5-20251001"] },
    });
    expect(await runMenu(h.deps, [])).toBe(0);
    // 第二層只列文字對話模型
    expect(h.prompts[1]!.items.map((i) => i.value)).toEqual(["claude-haiku-4-5-20251001", "claude-opus-5-5"]);
    expect(h.saved).toEqual([["mixroute", { model: "claude-opus-5-5", oneMillion: true }]]);
    expect(h.launches[0]!.env).toEqual({
      PATH: "/usr/bin",
      ANTHROPIC_BASE_URL: "https://api.mixroute.ai",
      ANTHROPIC_AUTH_TOKEN: "sk-m",
      ANTHROPIC_MODEL: "claude-opus-5-5[1m]",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "claude-haiku-4-5-20251001",
    });
    expect(h.logs.at(-1)).toBe("啟動 Claude Code：MixRoute · claude-opus-5-5（1M）");
  });

  test("預設停在上次選擇的服務商、模型與 1M 狀態", async () => {
    const config = configWith(mixroute, linkai);
    config.lastSelection = { providerId: "linkai", byProvider: { linkai: { model: "claude-sonnet-5", oneMillion: true } } };
    const h = harness(config, [enterDefault, enterDefault], { linkai: { ok: true, models: ["claude-opus-5", "claude-sonnet-5"] } });
    await runMenu(h.deps, []);
    expect(currentItem(h.prompts[0]!)!.value.id).toBe("linkai");
    expect(currentItem(h.prompts[1]!)!.value).toBe("claude-sonnet-5");
    expect(h.prompts[1]!.toggle!.on).toBe(true);
  });

  test("查詢失敗：顯示原因並回到第一層，可改選其他服務商", async () => {
    const h = harness(configWith(mixroute, linkai), [pick("MixRoute"), pick("LinkAI"), pick("claude-sonnet-5")], {
      mixroute: { ok: false, error: "HTTP 403" },
      linkai: { ok: true, models: ["claude-sonnet-5"] },
    });
    expect(await runMenu(h.deps, [])).toBe(0);
    expect(h.prompts[1]!.title).toBe("選擇服務商");
    expect(h.prompts[1]!.notice).toBe("「MixRoute」查詢模型失敗：HTTP 403。請選擇其他服務商。");
    expect(h.launches[0]!.env.ANTHROPIC_BASE_URL).toBe("https://linkai.llc");
  });

  test("沒有可用的文字對話模型時回到第一層並提示", async () => {
    const h = harness(configWith(mixroute), [pick("MixRoute"), cancel], { mixroute: { ok: true, models: ["gpt-image-1"] } });
    expect(await runMenu(h.deps, [])).toBe(0);
    expect(h.prompts[1]!.notice).toBe("「MixRoute」沒有可用的文字對話模型。");
    expect(h.launches).toHaveLength(0);
  });

  test("第二層按 Esc 返回第一層，錯誤提示不殘留", async () => {
    const h = harness(configWith(mixroute), [pick("MixRoute"), back, cancel], { mixroute: { ok: true, models: ["claude-sonnet-5"] } });
    expect(await runMenu(h.deps, [])).toBe(0);
    expect(h.prompts.map((p) => p.title)).toEqual(["選擇服務商", "選擇模型 · MixRoute", "選擇服務商"]);
    expect(h.prompts[2]!.notice).toBeUndefined();
    expect(h.launches).toHaveLength(0);
  });

  test("離開選單時不啟動也不記錄", async () => {
    const h = harness(configWith(mixroute), [cancel]);
    expect(await runMenu(h.deps, [])).toBe(0);
    expect(h.launches).toHaveLength(0);
    expect(h.saved).toHaveLength(0);
  });

  test("沒有服務商時提示開啟管理網站", async () => {
    const config = defaultConfig();
    config.providers = [];
    const h = harness(config, []);
    expect(await runMenu(h.deps, [])).toBe(1);
    expect(h.logs).toEqual(["尚未設定任何服務商，請執行 am web 開啟管理網站新增。"]);
  });

  test("沒有安裝 Claude Code 時直接提示，不顯示選單", async () => {
    const h = harness(configWith(mixroute), []);
    h.deps.claudeInstalled = () => false;
    expect(await runMenu(h.deps, [])).toBe(1);
    expect(h.prompts).toHaveLength(0);
    expect(h.logs).toEqual([CLAUDE_NOT_INSTALLED]);
  });

  test("回傳 claude 的結束代碼", async () => {
    const h = harness(configWith(), [pick("Claude 訂閱制")]);
    h.deps.launch = async () => 7;
    expect(await runMenu(h.deps, [])).toBe(7);
  });
});
