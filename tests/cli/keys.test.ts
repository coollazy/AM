import { expect, test } from "bun:test";
import { parseKeys } from "../../src/cli/keys";

test("方向鍵、Enter、Tab、Esc、Backspace、Ctrl+C", () => {
  expect(parseKeys("\x1b[A\x1b[B\r\t\x1b\x7f\x03").map((k) => k.name)).toEqual(["up", "down", "enter", "tab", "escape", "backspace", "ctrl-c"]);
});

test("Windows 與部分終端的方向鍵格式", () => {
  expect(parseKeys("\x1bOA\x1bOB").map((k) => k.name)).toEqual(["up", "down"]);
});

test("一般文字與貼上多個字元", () => {
  expect(parseKeys("opus 5")).toEqual([..."opus 5"].map((char) => ({ name: "char", char })));
});

test("中文與 emoji 保持完整字元", () => {
  expect(parseKeys("中🙂")).toEqual([
    { name: "char", char: "中" },
    { name: "char", char: "🙂" },
  ]);
});

test("略過未支援的控制序列（例如左右鍵）", () => {
  expect(parseKeys("\x1b[C\x1b[Da")).toEqual([{ name: "char", char: "a" }]);
});

test("PageUp、PageDown、Home、End", () => {
  expect(parseKeys("\x1b[5~\x1b[6~\x1b[H\x1b[F").map((k) => k.name)).toEqual(["pageup", "pagedown", "home", "end"]);
});
