import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchAgentPath, windowsStartupPath } from "../../src/platform/autostart";
import { autostartStatus, disableAutostart, enableAutostart, UnsupportedPlatformError, type AutostartContext } from "../../src/platform/manager";

let home: string;
let commands: string[][];

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "am-autostart-"));
  commands = [];
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

function ctx(platform: NodeJS.Platform, env: Record<string, string> = {}): AutostartContext {
  return {
    platform,
    home,
    env: { APPDATA: join(home, "AppData"), ...env },
    command: ["/opt/am"],
    logDir: join(home, ".am"),
    run: async (cmd) => {
      commands.push(cmd);
      return 0;
    },
    uid: 501,
  };
}

describe("macOS", () => {
  test("開啟：寫入 LaunchAgent 並重新載入", async () => {
    const status = await enableAutostart(ctx("darwin"));
    expect(status).toEqual({ enabled: true, command: "/opt/am server", file: launchAgentPath(home) });
    expect(commands).toEqual([
      ["launchctl", "bootout", "gui/501/local.am.server"],
      ["launchctl", "bootstrap", "gui/501", launchAgentPath(home)],
    ]);
  });

  test("launchctl 載入失敗時回報錯誤", async () => {
    const c = ctx("darwin");
    c.run = async (cmd) => (cmd[1] === "bootstrap" ? 5 : 0);
    await expect(enableAutostart(c)).rejects.toThrow("launchctl 載入失敗（代碼 5）");
  });

  test("自訂設定目錄會帶入開機環境", async () => {
    await enableAutostart(ctx("darwin", { AM_CONFIG_DIR: "/tmp/x" }));
    expect(await readFile(launchAgentPath(home), "utf8")).toContain("<key>AM_CONFIG_DIR</key>");
  });

  test("關閉：卸載並刪除設定檔", async () => {
    await enableAutostart(ctx("darwin"));
    commands = [];
    await disableAutostart(ctx("darwin"));
    expect(commands).toEqual([["launchctl", "bootout", "gui/501/local.am.server"]]);
    expect((await autostartStatus(ctx("darwin"))).enabled).toBe(false);
  });
});

describe("Windows", () => {
  test("開啟、查詢、關閉", async () => {
    const status = await enableAutostart(ctx("win32"));
    expect(status).toEqual({ enabled: true, command: "/opt/am server", file: windowsStartupPath(join(home, "AppData")) });
    expect(commands).toEqual([]);
    await disableAutostart(ctx("win32"));
    expect((await autostartStatus(ctx("win32"))).enabled).toBe(false);
  });

  test("沒有 APPDATA 時回報錯誤", async () => {
    const c = ctx("win32");
    c.env = {};
    await expect(enableAutostart(c)).rejects.toThrow("APPDATA");
  });
});

test("關閉未開啟的自動執行不會出錯", async () => {
  await disableAutostart(ctx("darwin"));
  await disableAutostart(ctx("win32"));
});

test("Linux 不支援", async () => {
  await expect(enableAutostart(ctx("linux"))).rejects.toBeInstanceOf(UnsupportedPlatformError);
  await expect(autostartStatus(ctx("linux"))).rejects.toBeInstanceOf(UnsupportedPlatformError);
});
