import { expect, test } from "bun:test";
import { loginCommand, shellQuote, terminalCommand } from "../../src/platform/login";

test("shellQuote 處理單引號", () => {
  expect(shellQuote("/Users/a/.am/accounts/work")).toBe("'/Users/a/.am/accounts/work'");
  expect(shellQuote("it's")).toBe(`'it'\\''s'`);
});

test("主帳號：移除會改變帳號的環境變數後登入", () => {
  expect(loginCommand(null, null)).toBe(
    "env -u CLAUDE_CODE_OAUTH_TOKEN -u CLAUDE_CONFIG_DIR claude auth login; echo; echo '完成後可以關閉這個視窗，回到 AM 管理網站查看登入狀態。'",
  );
});

test("附加帳號：指定帳號資料夾並預填 email", () => {
  expect(loginCommand("/Users/a/.am/accounts/work", "w@example.com")).toStartWith(
    "env -u CLAUDE_CODE_OAUTH_TOKEN CLAUDE_CONFIG_DIR='/Users/a/.am/accounts/work' claude auth login --email 'w@example.com';",
  );
});

test("terminalCommand 以 AppleScript 開新的終端機視窗，並跳脫引號與反斜線", () => {
  expect(terminalCommand(`echo "a\\b"`)).toEqual([
    "osascript",
    "-e",
    'tell application "Terminal"',
    "-e",
    "activate",
    "-e",
    'do script "echo \\"a\\\\b\\""',
    "-e",
    "end tell",
  ]);
});
