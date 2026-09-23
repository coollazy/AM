import { describe, expect, test } from "bun:test";
import {
  commandFromPlist,
  commandFromStartupScript,
  launchAgentPath,
  launchAgentPlist,
  windowsStartupPath,
  windowsStartupScript,
} from "../../src/platform/autostart";

describe("macOS LaunchAgent", () => {
  const plist = launchAgentPlist(["/Users/a/My Apps/am"], "/Users/a/.am/server.log", {});

  test("登入時執行 am server，異常結束才重啟", () => {
    expect(plist).toContain("<string>local.am.server</string>");
    expect(plist).toContain("<string>/Users/a/My Apps/am</string>\n    <string>server</string>");
    expect(plist).toContain("<key>RunAtLoad</key>\n  <true/>");
    expect(plist).toContain("<key>SuccessfulExit</key>\n    <false/>");
    expect(plist).toContain("<string>/Users/a/.am/server.log</string>");
    expect(plist).not.toContain("EnvironmentVariables");
  });

  test("可讀回執行指令，路徑有空白時加引號", () => {
    expect(commandFromPlist(plist)).toBe('"/Users/a/My Apps/am" server');
  });

  test("特殊字元經過 XML 轉義並可正確讀回", () => {
    const p = launchAgentPlist(["/x/a&b<c>"], "/log", { AM_CONFIG_DIR: "/tmp/a&b" });
    expect(p).toContain("<string>/x/a&amp;b&lt;c&gt;</string>");
    expect(p).toContain("<key>AM_CONFIG_DIR</key>\n    <string>/tmp/a&amp;b</string>");
    expect(commandFromPlist(p)).toBe("/x/a&b<c> server");
  });

  test("設定檔位置", () => {
    expect(launchAgentPath("/Users/a")).toBe("/Users/a/Library/LaunchAgents/local.am.server.plist");
  });
});

describe("Windows 啟動資料夾", () => {
  test("以隱藏視窗執行 am server，路徑中的引號正確轉義", () => {
    const script = windowsStartupScript(["C:\\Program Files\\AM\\am.exe"], {});
    expect(script).toBe(
      'Set shell = CreateObject("WScript.Shell")\r\nshell.Run """C:\\Program Files\\AM\\am.exe"" server", 0, False\r\n',
    );
    expect(commandFromStartupScript(script)).toBe('"C:\\Program Files\\AM\\am.exe" server');
  });

  test("帶入自訂設定目錄", () => {
    const script = windowsStartupScript(["C:\\am.exe"], { AM_CONFIG_DIR: "D:\\am" });
    expect(script).toContain('shell.Environment("Process")("AM_CONFIG_DIR") = "D:\\am"');
  });

  test("設定檔位置", () => {
    expect(windowsStartupPath("C:\\Users\\a\\AppData\\Roaming")).toContain("Startup");
  });
});
