import { describe, expect, test } from "bun:test";
import { defaultConfig } from "../../src/core/config";
import { filterLlmModels, isClaudeModel, pickHelperModel, supportsOneMillion } from "../../src/core/models";

// 取自 2026-09-23 實測 MixRoute 模型清單的片段
const MIXROUTE_SAMPLE = [
  "gpt-4o-mini-tts",
  "claude-sonnet-5",
  "gemini-2.5-flash-image",
  "claude-opus-5-5",
  "gpt-4o-transcribe-diarize",
  "gemini-embedding-2-preview",
  "claude-haiku-4-5-20251001",
  "gpt-4o-mini",
  "gemini-2.5-flash",
  "gpt-4o-mini-transcribe",
  "sora-2",
];

describe("filterLlmModels", () => {
  const keywords = defaultConfig().models.excludeKeywords;

  test("排除圖片、語音、嵌入模型，並依名稱排序", () => {
    expect(filterLlmModels(MIXROUTE_SAMPLE, keywords)).toEqual([
      "claude-haiku-4-5-20251001",
      "claude-opus-5-5",
      "claude-sonnet-5",
      "gemini-2.5-flash",
      "gpt-4o-mini",
    ]);
  });

  test("關鍵字不分大小寫，空白關鍵字會被忽略", () => {
    expect(filterLlmModels(["My-IMAGE-Model", "chat"], ["image", " ", ""])).toEqual(["chat"]);
  });

  test("重複的模型只列一次", () => {
    expect(filterLlmModels(["a", "a", "b"], [])).toEqual(["a", "b"]);
  });

  test("數字依自然順序排序", () => {
    expect(filterLlmModels(["claude-opus-4-10", "claude-opus-4-9"], [])).toEqual(["claude-opus-4-9", "claude-opus-4-10"]);
  });
});

describe("supportsOneMillion", () => {
  const patterns = defaultConfig().models.oneMillionPatterns;

  test("預設名單支援 Opus 與 Sonnet 系列", () => {
    expect(supportsOneMillion("claude-opus-5-5", patterns)).toBe(true);
    expect(supportsOneMillion("claude-sonnet-5", patterns)).toBe(true);
    expect(supportsOneMillion("claude-haiku-4-5-20251001", patterns)).toBe(false);
    expect(supportsOneMillion("gpt-4o-mini", patterns)).toBe(false);
  });

  test("萬用字元以外的符號照字面比對", () => {
    expect(supportsOneMillion("gpt-4.1", ["gpt-4.1"])).toBe(true);
    expect(supportsOneMillion("gpt-401", ["gpt-4.1"])).toBe(false);
  });
});

describe("pickHelperModel", () => {
  test("有 Haiku 時用最新的 Haiku", () => {
    expect(pickHelperModel(["claude-haiku-4-5", "claude-haiku-4-6", "claude-sonnet-5"], "claude-opus-5")).toBe("claude-haiku-4-6");
  });

  test("沒有 Haiku 時用最新的 Sonnet（LinkAI 的情況）", () => {
    const linkai = ["claude-fable-5", "claude-opus-5", "claude-sonnet-4-6", "claude-sonnet-5"];
    expect(pickHelperModel(linkai, "claude-opus-5")).toBe("claude-sonnet-5");
  });

  test("都沒有時用主模型", () => {
    expect(pickHelperModel(["gpt-4o-mini", "gemini-2.5-flash"], "gpt-4o-mini")).toBe("gpt-4o-mini");
  });
});

test("isClaudeModel 依名稱前綴判斷", () => {
  expect(isClaudeModel("claude-sonnet-5")).toBe(true);
  expect(isClaudeModel("Claude-Sonnet-5")).toBe(true);
  expect(isClaudeModel("gpt-4o-mini")).toBe(false);
});
