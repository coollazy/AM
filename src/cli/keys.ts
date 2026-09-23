export type Key =
  | { name: "up" | "down" | "pageup" | "pagedown" | "home" | "end" | "enter" | "escape" | "tab" | "backspace" | "ctrl-c" }
  | { name: "char"; char: string };

const SEQUENCES: Record<string, Key["name"]> = {
  "\x1b[A": "up",
  "\x1bOA": "up",
  "\x1b[B": "down",
  "\x1bOB": "down",
  "\x1b[5~": "pageup",
  "\x1b[6~": "pagedown",
  "\x1b[H": "home",
  "\x1b[1~": "home",
  "\x1bOH": "home",
  "\x1b[F": "end",
  "\x1b[4~": "end",
  "\x1bOF": "end",
};

// 把終端機原始輸入轉成按鍵；一次輸入可能包含多個按鍵（例如貼上文字）
export function parseKeys(input: string): Key[] {
  const keys: Key[] = [];
  let i = 0;
  while (i < input.length) {
    const rest = input.slice(i);
    const seq = Object.keys(SEQUENCES).find((s) => rest.startsWith(s));
    if (seq) {
      keys.push({ name: SEQUENCES[seq]! } as Key);
      i += seq.length;
      continue;
    }
    const ch = input[i]!;
    if (ch === "\x1b") {
      // 未知的控制序列（例如左右鍵）整段略過；單獨的 ESC 視為 Esc 鍵
      const unknown = /^\x1b(\[[0-9;]*[~A-Za-z]|O[A-Za-z])/.exec(rest);
      if (unknown) {
        i += unknown[0].length;
      } else {
        keys.push({ name: "escape" });
        i += 1;
      }
      continue;
    }
    i += 1;
    if (ch === "\r" || ch === "\n") keys.push({ name: "enter" });
    else if (ch === "\t") keys.push({ name: "tab" });
    else if (ch === "\x7f" || ch === "\b") keys.push({ name: "backspace" });
    else if (ch === "\x03") keys.push({ name: "ctrl-c" });
    else if (ch >= " ") {
      // 保留 emoji 等由兩個 UTF-16 單元組成的字元
      const cp = input.codePointAt(i - 1)!;
      const char = String.fromCodePoint(cp);
      if (char.length === 2) i += 1;
      keys.push({ name: "char", char });
    }
  }
  return keys;
}
