import { describe, expect, test } from "bun:test";
import { defaultConfig, type ApiProvider, type Config } from "../../src/core/config";
import { buildLaunchEnv, MANAGED_ENV_VARS } from "../../src/core/env";

const subscription = { id: "subscription", type: "subscription", name: "Claude 訂閱制" } as const;
const mixroute: ApiProvider = {
  id: "mixroute",
  type: "api",
  name: "MixRoute",
  baseUrl: "https://api.mixroute.ai",
  apiKey: "sk-test",
  helperModel: null,
};

function shellEnv(): Record<string, string> {
  const env: Record<string, string> = { PATH: "/usr/bin", ANTHROPIC_CUSTOM_HEADERS: "x-team: a", CLAUDE_CODE_ENABLE_TELEMETRY: "1" };
  for (const key of MANAGED_ENV_VARS) env[key] = "舊值";
  return env;
}

describe("buildLaunchEnv", () => {
  test("訂閱制：清除 7 個管理變數，其他變數保留", () => {
    const env = buildLaunchEnv(shellEnv(), defaultConfig(), { provider: subscription });
    for (const key of MANAGED_ENV_VARS) expect(env[key]).toBeUndefined();
    expect(env.PATH).toBe("/usr/bin");
    expect(env.ANTHROPIC_CUSTOM_HEADERS).toBe("x-team: a");
    expect(env.CLAUDE_CODE_ENABLE_TELEMETRY).toBe("1");
  });

  test("API 服務商：設定網址、key、模型，不設 ANTHROPIC_API_KEY", () => {
    const env = buildLaunchEnv(shellEnv(), defaultConfig(), {
      provider: mixroute,
      model: "claude-opus-5-5",
      oneMillion: false,
      availableModels: ["claude-opus-5-5", "claude-haiku-4-5-20251001"],
    });
    expect(env.ANTHROPIC_BASE_URL).toBe("https://api.mixroute.ai");
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe("sk-test");
    expect(env.ANTHROPIC_MODEL).toBe("claude-opus-5-5");
    expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe("claude-haiku-4-5-20251001");
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.CLAUDE_CODE_MAX_OUTPUT_TOKENS).toBeUndefined();
    expect(env.CLAUDE_CODE_MAX_CONTEXT_TOKENS).toBeUndefined();
    expect(env.ANTHROPIC_CUSTOM_HEADERS).toBe("x-team: a");
  });

  test("開啟 1M 時模型名稱加上 [1m]", () => {
    const env = buildLaunchEnv({}, defaultConfig(), {
      provider: mixroute,
      model: "claude-opus-5-5",
      oneMillion: true,
      availableModels: [],
    });
    expect(env.ANTHROPIC_MODEL).toBe("claude-opus-5-5[1m]");
  });

  test("有設定輔助模型時使用設定值", () => {
    const env = buildLaunchEnv({}, defaultConfig(), {
      provider: { ...mixroute, helperModel: "claude-sonnet-5" },
      model: "claude-opus-5-5",
      oneMillion: false,
      availableModels: ["claude-haiku-4-5-20251001"],
    });
    expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe("claude-sonnet-5");
  });

  test("非 Claude 模型預設套用輸出上限", () => {
    const env = buildLaunchEnv({}, defaultConfig(), {
      provider: mixroute,
      model: "gpt-4o-mini",
      oneMillion: false,
      availableModels: ["gpt-4o-mini"],
    });
    expect(env.CLAUDE_CODE_MAX_OUTPUT_TOKENS).toBe("8192");
    expect(env.CLAUDE_CODE_MAX_CONTEXT_TOKENS).toBeUndefined();
  });

  test("有個別設定上限時改用個別設定", () => {
    const config: Config = defaultConfig();
    config.models.limits["gpt-4o-mini"] = { maxOutputTokens: 16384, maxContextTokens: 128000 };
    config.models.limits["claude-sonnet-5"] = { maxContextTokens: 500000 };
    const gpt = buildLaunchEnv({}, config, { provider: mixroute, model: "gpt-4o-mini", oneMillion: false, availableModels: [] });
    expect(gpt.CLAUDE_CODE_MAX_OUTPUT_TOKENS).toBe("16384");
    expect(gpt.CLAUDE_CODE_MAX_CONTEXT_TOKENS).toBe("128000");
    const claude = buildLaunchEnv({}, config, { provider: mixroute, model: "claude-sonnet-5", oneMillion: false, availableModels: [] });
    expect(claude.CLAUDE_CODE_MAX_OUTPUT_TOKENS).toBeUndefined();
    expect(claude.CLAUDE_CODE_MAX_CONTEXT_TOKENS).toBe("500000");
  });

  test("Windows 上不分大小寫清除管理變數", () => {
    const env = buildLaunchEnv({ anthropic_api_key: "x", Path: "C:\\bin" }, defaultConfig(), { provider: subscription }, "win32");
    expect(env.anthropic_api_key).toBeUndefined();
    expect(env.Path).toBe("C:\\bin");
  });

  test("macOS 上名稱大小寫不同的變數不屬於管理範圍", () => {
    const env = buildLaunchEnv({ anthropic_api_key: "x" }, defaultConfig(), { provider: subscription }, "darwin");
    expect(env.anthropic_api_key).toBe("x");
  });
});
