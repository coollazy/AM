import { describe, expect, test } from "bun:test";
import type { Key } from "../../src/cli/keys";
import { charWidth, createPrompt, currentItem, filteredItems, reduce, render, truncate, type PromptState } from "../../src/cli/prompt";

const models = ["claude-haiku-4-5", "claude-opus-5-5", "claude-sonnet-5", "gpt-4o-mini"];

function modelPrompt(initial?: string, on = false) {
  return createPrompt<string>({
    title: "選擇模型",
    items: models.map((m) => ({ label: m, value: m })),
    initial,
    toggle: { label: "1M 上下文", on, available: (m) => m.includes("opus") || m.includes("sonnet") },
    escape: "back",
  });
}

function press<T>(state: PromptState<T>, ...keys: Array<Key | string>) {
  let result;
  for (const k of keys) {
    const key: Key = typeof k === "string" ? { name: "char", char: k } : k;
    ({ state, result } = reduce(state, key));
    if (result) break;
  }
  return { state, result };
}

const up: Key = { name: "up" };
const down: Key = { name: "down" };
const enter: Key = { name: "enter" };
const tab: Key = { name: "tab" };
const esc: Key = { name: "escape" };

describe("選擇", () => {
  test("預設停在上次選擇的項目", () => {
    expect(currentItem(modelPrompt("claude-sonnet-5"))?.value).toBe("claude-sonnet-5");
    expect(currentItem(modelPrompt("已不存在的模型"))?.value).toBe("claude-haiku-4-5");
  });

  test("上下鍵移動，超出頭尾時繞回", () => {
    expect(press(modelPrompt(), down, down).state.cursor).toBe(2);
    expect(press(modelPrompt(), up).state.cursor).toBe(3);
    expect(press(modelPrompt("gpt-4o-mini"), down).state.cursor).toBe(0);
  });

  test("Enter 回傳目前項目", () => {
    expect(press(modelPrompt(), down, enter).result).toEqual({ type: "select", value: "claude-opus-5-5", toggleOn: false });
  });
});

describe("篩選", () => {
  test("輸入文字即時篩選，游標回到第一項", () => {
    const { state } = press(modelPrompt("gpt-4o-mini"), "o", "p", "u", "s");
    expect(filteredItems(state).map((i) => i.value)).toEqual(["claude-opus-5-5"]);
    expect(state.cursor).toBe(0);
  });

  test("多個詞都要符合，不分大小寫", () => {
    const { state } = press(modelPrompt(), "C", "L", " ", "5");
    expect(filteredItems(state).map((i) => i.value)).toEqual(["claude-haiku-4-5", "claude-opus-5-5", "claude-sonnet-5"]);
  });

  test("Backspace 刪除最後一個字", () => {
    expect(press(modelPrompt(), "g", "x", { name: "backspace" }).state.query).toBe("g");
  });

  test("沒有符合項目時 Enter 不會選到東西", () => {
    expect(press(modelPrompt(), "z", "z", enter).result).toBeUndefined();
  });
});

describe("1M 切換", () => {
  test("Tab 切換開關，支援的模型選擇時帶出開啟狀態", () => {
    expect(press(modelPrompt("claude-opus-5-5"), tab, enter).result).toEqual({ type: "select", value: "claude-opus-5-5", toggleOn: true });
  });

  test("不支援 1M 的模型即使開關開著也以一般模式回傳", () => {
    expect(press(modelPrompt("gpt-4o-mini", true), enter).result).toEqual({ type: "select", value: "gpt-4o-mini", toggleOn: false });
  });

  test("沒有開關時 Tab 沒有作用", () => {
    const state = createPrompt({ title: "t", items: [{ label: "a", value: "a" }], escape: "cancel" });
    expect(press(state, tab).state).toEqual(state);
  });
});

describe("Esc 與 Ctrl+C", () => {
  test("有搜尋文字時 Esc 先清除搜尋", () => {
    const { state, result } = press(modelPrompt(), "g", esc);
    expect(result).toBeUndefined();
    expect(state.query).toBe("");
  });

  test("沒有搜尋文字時 Esc 返回上一層或離開", () => {
    expect(press(modelPrompt(), esc).result).toEqual({ type: "back" });
    const top = createPrompt({ title: "t", items: [{ label: "a", value: "a" }], escape: "cancel" });
    expect(press(top, esc).result).toEqual({ type: "cancel" });
  });

  test("Ctrl+C 一律離開", () => {
    expect(press(modelPrompt(), { name: "ctrl-c" }).result).toEqual({ type: "cancel" });
  });
});

describe("畫面", () => {
  const opts = { width: 80, height: 24, color: false };

  test("顯示標題、搜尋列、游標、1M 狀態與操作提示", () => {
    const lines = render(modelPrompt("claude-opus-5-5", true), opts);
    expect(lines[0]).toBe("選擇模型");
    expect(lines).toContain("❯ claude-opus-5-5 · 可用 1M");
    expect(lines).toContain("  gpt-4o-mini");
    expect(lines).toContain("1M 上下文：開");
    expect(lines.at(-1)).toContain("Tab 切換1M 上下文");
    expect(lines.at(-1)).toContain("Esc 返回");
  });

  test("游標在不支援 1M 的模型且開關開著時提示將以一般模式啟動", () => {
    expect(render(modelPrompt("gpt-4o-mini", true), opts)).toContain("1M 上下文：開（此模型不支援，將以一般模式啟動）");
  });

  test("項目超過畫面高度時捲動並顯示位置", () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ label: `m${i}`, value: i }));
    const lines = render(createPrompt({ title: "t", items, initial: 40, escape: "cancel" }), { ...opts, height: 12 });
    expect(lines.length).toBeLessThanOrEqual(12);
    expect(lines).toContain("❯ m40");
    expect(lines).toContain("  （共 50 項，第 41 項）");
  });

  test("顯示錯誤提示", () => {
    const state = createPrompt({ title: "t", items: [{ label: "a", value: "a" }], notice: "查詢失敗", escape: "cancel" });
    expect(render(state, opts)[1]).toBe("查詢失敗");
  });
});

test("依顯示寬度截斷，中文佔兩格", () => {
  expect(charWidth("中")).toBe(2);
  expect(charWidth("a")).toBe(1);
  expect(truncate("abcdef", 4)).toBe("abc");
  expect(truncate("中文字", 6)).toBe("中文");
  expect(truncate("\x1b[1mabcdef\x1b[0m", 4)).toBe("\x1b[1mabc\x1b[0m");
});
