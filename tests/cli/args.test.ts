import { describe, expect, test } from "bun:test";
import { parseArgs } from "../../src/cli/args";

describe("parseArgs", () => {
  test("沒有參數時開啟選單", () => {
    expect(parseArgs([])).toEqual({ kind: "menu", claudeArgs: [] });
  });

  test("非子指令的參數原樣轉給 claude", () => {
    expect(parseArgs(["--resume", "abc"])).toEqual({ kind: "menu", claudeArgs: ["--resume", "abc"] });
  });

  test("`--` 之後的參數即使與子指令同名也轉給 claude", () => {
    expect(parseArgs(["--", "web"])).toEqual({ kind: "menu", claudeArgs: ["web"] });
  });

  test("解析子指令", () => {
    expect(parseArgs(["web"])).toEqual({ kind: "web" });
    expect(parseArgs(["server"])).toEqual({ kind: "server" });
    expect(parseArgs(["--version"])).toEqual({ kind: "version" });
    expect(parseArgs(["-h"])).toEqual({ kind: "help" });
  });

  test("autostart 需要 on、off 或 status", () => {
    expect(parseArgs(["autostart", "on"])).toEqual({ kind: "autostart", action: "on" });
    expect(parseArgs(["autostart", "status"])).toEqual({ kind: "autostart", action: "status" });
    expect(parseArgs(["autostart"]).kind).toBe("error");
    expect(parseArgs(["autostart", "maybe"]).kind).toBe("error");
  });
});
