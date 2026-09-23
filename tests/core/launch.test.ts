import { describe, expect, test } from "bun:test";
import { ClaudeNotFoundError, resolveClaudeCommand } from "../../src/core/launch";

describe("resolveClaudeCommand", () => {
  test("找到 claude 時直接執行", () => {
    expect(resolveClaudeCommand(() => "/Users/a/.local/bin/claude", "darwin", {})).toEqual(["/Users/a/.local/bin/claude"]);
  });

  test("Windows 上 .cmd 透過 cmd.exe 執行", () => {
    const cmd = resolveClaudeCommand(() => "C:\\npm\\claude.cmd", "win32", { ComSpec: "C:\\Windows\\system32\\cmd.exe" });
    expect(cmd).toEqual(["C:\\Windows\\system32\\cmd.exe", "/d", "/s", "/c", "C:\\npm\\claude.cmd"]);
  });

  test("Windows 上 .exe 直接執行", () => {
    expect(resolveClaudeCommand(() => "C:\\bin\\claude.exe", "win32", {})).toEqual(["C:\\bin\\claude.exe"]);
  });

  test("使用傳入環境的 PATH 尋找", () => {
    let seen: string | undefined;
    resolveClaudeCommand((_, o) => ((seen = o?.PATH), "/x/claude"), "darwin", { PATH: "/x" });
    expect(seen).toBe("/x");
  });

  test("找不到時丟出 ClaudeNotFoundError", () => {
    expect(() => resolveClaudeCommand(() => null, "darwin", {})).toThrow(ClaudeNotFoundError);
  });
});
