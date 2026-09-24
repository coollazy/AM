import type { Key } from "./keys";

export type Item<T> = { label: string; value: T; hint?: string };

export type Toggle<T> = {
  label: string;
  on: boolean;
  // 目前游標所在項目是否可以使用此開關
  available: (value: T) => boolean;
};

export type PromptState<T> = {
  title: string;
  notice?: string;
  // 一般提示（淡色），例如引導新使用者下一步
  tip?: string;
  items: Item<T>[];
  query: string;
  cursor: number;
  toggle?: Toggle<T>;
  // Esc 在沒有搜尋文字時的意義：返回上一層或離開
  escape: "back" | "cancel";
};

export type PromptResult<T> =
  | { type: "select"; value: T; toggleOn: boolean }
  | { type: "back" }
  | { type: "cancel" };

export function createPrompt<T>(options: {
  title: string;
  items: Item<T>[];
  initial?: T;
  notice?: string;
  tip?: string;
  toggle?: Toggle<T>;
  escape: "back" | "cancel";
}): PromptState<T> {
  const index = options.initial === undefined ? -1 : options.items.findIndex((i) => i.value === options.initial);
  return {
    title: options.title,
    notice: options.notice,
    tip: options.tip,
    items: options.items,
    query: "",
    cursor: Math.max(0, index),
    toggle: options.toggle,
    escape: options.escape,
  };
}

// 搜尋文字以空白分隔，每個詞都要出現在名稱中（不分大小寫）
export function filteredItems<T>(state: PromptState<T>): Item<T>[] {
  const words = state.query.toLowerCase().split(/\s+/).filter((w) => w !== "");
  if (words.length === 0) return state.items;
  return state.items.filter((item) => {
    const label = item.label.toLowerCase();
    return words.every((w) => label.includes(w));
  });
}

export function currentItem<T>(state: PromptState<T>): Item<T> | undefined {
  return filteredItems(state)[state.cursor];
}

export const PAGE_SIZE = 10;

export function reduce<T>(state: PromptState<T>, key: Key): { state: PromptState<T>; result?: PromptResult<T> } {
  const count = filteredItems(state).length;
  const moveTo = (cursor: number) => ({ state: { ...state, cursor: count === 0 ? 0 : clamp(cursor, 0, count - 1) } });
  switch (key.name) {
    case "up":
      return moveTo(state.cursor === 0 ? count - 1 : state.cursor - 1);
    case "down":
      return moveTo(state.cursor >= count - 1 ? 0 : state.cursor + 1);
    case "pageup":
      return moveTo(state.cursor - PAGE_SIZE);
    case "pagedown":
      return moveTo(state.cursor + PAGE_SIZE);
    case "home":
      return moveTo(0);
    case "end":
      return moveTo(count - 1);
    case "enter": {
      const item = currentItem(state);
      if (!item) return { state };
      const toggleOn = state.toggle ? state.toggle.on && state.toggle.available(item.value) : false;
      return { state, result: { type: "select", value: item.value, toggleOn } };
    }
    case "tab":
      if (!state.toggle) return { state };
      return { state: { ...state, toggle: { ...state.toggle, on: !state.toggle.on } } };
    case "escape":
      if (state.query !== "") return { state: { ...state, query: "", cursor: 0 } };
      return { state, result: { type: state.escape } };
    case "ctrl-c":
      return { state, result: { type: "cancel" } };
    case "backspace":
      return { state: { ...state, query: [...state.query].slice(0, -1).join(""), cursor: 0 } };
    case "char":
      return { state: { ...state, query: state.query + key.char, cursor: 0 } };
  }
}

export type RenderOptions = { width: number; height: number; color: boolean };

// 畫出目前畫面；清單超出高度時捲動，讓游標保持在可見範圍內
export function render<T>(state: PromptState<T>, { width, height, color }: RenderOptions): string[] {
  const c = colors(color);
  const lines: string[] = [];
  lines.push(c.bold(state.title));
  if (state.notice) lines.push(c.red(state.notice));
  if (state.tip) lines.push(c.dim(state.tip));
  lines.push(`${c.dim("搜尋：")}${state.query}${c.dim("▏")}`);

  const items = filteredItems(state);
  const item = items[state.cursor];
  const footer: string[] = [];
  if (state.toggle) {
    const usable = item ? state.toggle.available(item.value) : false;
    const status = state.toggle.on ? c.green("開") : "關";
    footer.push(`${state.toggle.label}：${status}${usable || !state.toggle.on ? "" : c.dim("（此模型不支援，將以一般模式啟動）")}`);
  }
  const escHint = state.escape === "back" ? "Esc 返回" : "Esc 離開";
  footer.push(c.dim(`↑↓ 選擇 · 輸入文字篩選 · Enter 確認${state.toggle ? ` · Tab 切換 ${state.toggle.label}` : ""} · ${escHint}`));

  const room = Math.max(3, height - lines.length - footer.length - 1);
  if (items.length === 0) {
    lines.push(c.dim("  （沒有符合的項目）"));
  } else {
    const start = clamp(state.cursor - Math.floor(room / 2), 0, Math.max(0, items.length - room));
    const visible = items.slice(start, start + room);
    visible.forEach((it, i) => {
      const selected = start + i === state.cursor;
      const tag = state.toggle?.available(it.value) ? c.dim(" · 可用 1M") : "";
      const hint = it.hint ? c.dim(`  ${it.hint}`) : "";
      const text = `${selected ? "❯ " : "  "}${it.label}${tag}${hint}`;
      lines.push(selected ? c.cyan(text) : text);
    });
    if (items.length > room) lines.push(c.dim(`  （共 ${items.length} 項，第 ${state.cursor + 1} 項）`));
  }
  lines.push(...footer);
  return lines.map((l) => truncate(l, width));
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

function colors(enabled: boolean) {
  const wrap = (code: string) => (s: string) => (enabled ? `\x1b[${code}m${s}\x1b[0m` : s);
  return { bold: wrap("1"), dim: wrap("2"), red: wrap("31"), green: wrap("32"), cyan: wrap("36") };
}

// 依顯示寬度截斷（中日韓文字佔兩格），避免換行打亂畫面重繪；保留 ANSI 顏色碼
export function truncate(line: string, width: number): string {
  let out = "";
  let used = 0;
  const parts = line.split(/(\x1b\[[0-9;]*m)/);
  for (const part of parts) {
    if (part.startsWith("\x1b[")) {
      out += part;
      continue;
    }
    for (const ch of part) {
      const w = charWidth(ch);
      if (used + w > width - 1) return out + (line.includes("\x1b[") ? "\x1b[0m" : "");
      out += ch;
      used += w;
    }
  }
  return out;
}

export function charWidth(ch: string): number {
  const cp = ch.codePointAt(0)!;
  if (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1faff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  ) {
    return 2;
  }
  return 1;
}
