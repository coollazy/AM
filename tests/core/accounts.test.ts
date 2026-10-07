import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { appendFile, lstat, mkdir, mkdtemp, readFile, readlink, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  accountEnv,
  accountStatePath,
  linkSharedItems,
  prepareAccount,
  readLogin,
  removeAccount,
  SHARED_DIRS,
  SHARED_FILES,
  subscriptionEnvProblem,
  syncAccountState,
} from "../../src/core/accounts";

let root: string;
let primaryDir: string;
let primaryState: string;
let accountsRoot: string;
let account: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "am-accounts-"));
  primaryDir = join(root, ".claude");
  primaryState = join(root, ".claude.json");
  accountsRoot = join(root, ".am", "accounts");
  account = join(accountsRoot, "work");
  await mkdir(primaryDir);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const writeJson = (path: string, value: unknown) => writeFile(path, JSON.stringify(value));
const readJson = async (path: string) => JSON.parse(await readFile(path, "utf8"));

describe("linkSharedItems", () => {
  test("每個共用項目都建立捷徑指向主帳號，不共用的項目不建立", async () => {
    await writeFile(join(primaryDir, "settings.json"), '{"a":1}');
    await mkdir(join(primaryDir, "skills"));
    expect(await linkSharedItems(primaryDir, account)).toEqual([]);
    for (const name of [...SHARED_FILES, ...SHARED_DIRS]) {
      expect(await readlink(join(account, name))).toBe(join(primaryDir, name));
    }
    await expect(lstat(join(account, "sessions"))).rejects.toThrow();
    await expect(lstat(join(account, "hooks"))).rejects.toThrow();
  });

  test("透過捷徑讀寫的是主帳號的內容", async () => {
    await writeFile(join(primaryDir, "CLAUDE.md"), "主帳號的指示");
    await linkSharedItems(primaryDir, account);
    expect(await readFile(join(account, "CLAUDE.md"), "utf8")).toBe("主帳號的指示");
    await writeFile(join(account, "skills", "new.md"), "x");
    expect(await readFile(join(primaryDir, "skills", "new.md"), "utf8")).toBe("x");
  });

  test("主帳號缺少的資料夾先建立；缺少的檔案在第一次寫入時建在主帳號", async () => {
    await linkSharedItems(primaryDir, account);
    for (const name of SHARED_DIRS) expect((await stat(join(primaryDir, name))).isDirectory()).toBe(true);
    await expect(stat(join(primaryDir, "history.jsonl"))).rejects.toThrow();
    await appendFile(join(account, "history.jsonl"), "{}\n");
    expect(await readFile(join(primaryDir, "history.jsonl"), "utf8")).toBe("{}\n");
  });

  test("再次執行不會重複處理", async () => {
    await linkSharedItems(primaryDir, account);
    expect(await linkSharedItems(primaryDir, account)).toEqual([]);
  });

  test("捷徑被換成真的檔案或資料夾時，改名備份後重建並提示", async () => {
    await linkSharedItems(primaryDir, account);
    await rm(join(account, "settings.json"));
    await writeFile(join(account, "settings.json"), '{"local":true}');
    await rm(join(account, "skills"));
    await mkdir(join(account, "skills"));
    const notices = await linkSharedItems(primaryDir, account, new Date(2026, 8, 30, 14, 5, 9));
    expect(notices).toHaveLength(2);
    expect(notices[0]).toContain("settings.json");
    expect(await readFile(join(account, "settings.json.bak-20260930140509"), "utf8")).toBe('{"local":true}');
    expect((await stat(join(account, "skills.bak-20260930140509"))).isDirectory()).toBe(true);
    expect(await readlink(join(account, "settings.json"))).toBe(join(primaryDir, "settings.json"));
    expect(await readlink(join(account, "skills"))).toBe(join(primaryDir, "skills"));
  });

  test("捷徑指向別處時改指回主帳號", async () => {
    await linkSharedItems(join(root, "old"), account);
    expect(await linkSharedItems(primaryDir, account)).toEqual([]);
    expect(await readlink(join(account, "plans"))).toBe(join(primaryDir, "plans"));
  });
});

describe("syncAccountState", () => {
  test("複製 MCP、專案信任設定與介面偏好，保留附加帳號自己的登入資料", async () => {
    await writeJson(primaryState, {
      oauthAccount: { emailAddress: "me@example.com" },
      userID: "primary-user",
      mcpServers: { jira: { command: "jira-mcp" } },
      hasCompletedOnboarding: true,
      lastOnboardingVersion: "2.1.280",
      theme: "dark",
      numStartups: 99,
      projects: {
        "/code/am": { hasTrustDialogAccepted: true, mcpServers: { db: { command: "db" } }, lastCost: 1.5 },
      },
    });
    await mkdir(account, { recursive: true });
    await writeJson(accountStatePath(account), { oauthAccount: { emailAddress: "work@example.com" }, userID: "work-user", numStartups: 1 });
    expect(await syncAccountState(primaryState, account)).toEqual([]);
    expect(await readJson(accountStatePath(account))).toEqual({
      oauthAccount: { emailAddress: "work@example.com" },
      userID: "work-user",
      numStartups: 1,
      mcpServers: { jira: { command: "jira-mcp" } },
      hasCompletedOnboarding: true,
      lastOnboardingVersion: "2.1.280",
      theme: "dark",
      projects: { "/code/am": { hasTrustDialogAccepted: true, mcpServers: { db: { command: "db" } } } },
    });
  });

  test("附加帳號自己新增的 MCP 會被還原成主帳號的設定", async () => {
    await writeJson(primaryState, { projects: { "/code/am": { hasTrustDialogAccepted: true } } });
    await mkdir(account, { recursive: true });
    await writeJson(accountStatePath(account), {
      mcpServers: { mine: {} },
      hasCompletedOnboarding: true,
      projects: { "/code/am": { mcpServers: { mine: {} }, lastCost: 2 }, "/code/other": { mcpServers: { x: {} } } },
    });
    await syncAccountState(primaryState, account);
    expect(await readJson(accountStatePath(account))).toEqual({
      // 主帳號沒有的偏好不刪，避免附加帳號每次都重跑首次使用畫面
      hasCompletedOnboarding: true,
      projects: { "/code/am": { lastCost: 2, hasTrustDialogAccepted: true }, "/code/other": { mcpServers: { x: {} } } },
    });
  });

  test("附加帳號還沒有 .claude.json 時建立", async () => {
    await writeJson(primaryState, { mcpServers: { a: {} } });
    await mkdir(account, { recursive: true });
    await syncAccountState(primaryState, account);
    expect(await readJson(accountStatePath(account))).toEqual({ mcpServers: { a: {} } });
  });

  test("檔案壞掉時不同步，回傳提示", async () => {
    await writeFile(primaryState, "{壞掉");
    await mkdir(account, { recursive: true });
    const notices = await syncAccountState(primaryState, account);
    expect(notices[0]).toContain("沒有同步 MCP 設定");
    await expect(stat(accountStatePath(account))).rejects.toThrow();
  });
});

test("prepareAccount 建立捷徑並同步設定", async () => {
  await writeJson(primaryState, { mcpServers: { a: {} } });
  expect(await prepareAccount({ primaryDir, primaryStatePath: primaryState, accountDir: account })).toEqual([]);
  expect(await readlink(join(account, "projects"))).toBe(join(primaryDir, "projects"));
  expect((await readJson(accountStatePath(account))).mcpServers).toEqual({ a: {} });
});

describe("readLogin", () => {
  test("讀取登入的 email 與組織", async () => {
    await writeJson(primaryState, { oauthAccount: { emailAddress: "me@example.com", organizationName: "ACME" } });
    expect(await readLogin(primaryState)).toEqual({ email: "me@example.com", organization: "ACME" });
  });

  test("未登入、檔案不存在或壞掉時回傳 null", async () => {
    await writeJson(primaryState, { numStartups: 1 });
    expect(await readLogin(primaryState)).toBeNull();
    expect(await readLogin(join(root, "none.json"))).toBeNull();
    await writeFile(primaryState, "x");
    expect(await readLogin(primaryState)).toBeNull();
  });
});

describe("subscriptionEnvProblem", () => {
  test("沒有衝突的變數時通過", () => {
    expect(subscriptionEnvProblem({ PATH: "/bin", CLAUDE_CONFIG_DIR: "  " }, "darwin")).toBeNull();
  });

  test("偵測到時說明原因與修復方式", () => {
    const message = subscriptionEnvProblem({ CLAUDE_CODE_OAUTH_TOKEN: "t", CLAUDE_CONFIG_DIR: "/x" }, "darwin")!;
    expect(message).toContain("CLAUDE_CONFIG_DIR、CLAUDE_CODE_OAUTH_TOKEN");
    expect(message).toContain("unset CLAUDE_CONFIG_DIR CLAUDE_CODE_OAUTH_TOKEN");
    expect(message).toContain("~/.zshrc");
  });

  test("Windows 不分大小寫", () => {
    expect(subscriptionEnvProblem({ claude_code_oauth_token: "t" }, "win32")).toContain("CLAUDE_CODE_OAUTH_TOKEN");
  });
});

test("accountEnv 移除衝突變數並指定帳號資料夾", () => {
  expect(accountEnv({ PATH: "/bin", CLAUDE_CODE_OAUTH_TOKEN: "t", CLAUDE_CONFIG_DIR: "/x" }, account)).toEqual({ PATH: "/bin", CLAUDE_CONFIG_DIR: account });
  expect(accountEnv({ PATH: "/bin", CLAUDE_CONFIG_DIR: "/x" }, null)).toEqual({ PATH: "/bin" });
});

describe("removeAccount", () => {
  test("先登出再刪除資料夾，主帳號的內容不受影響", async () => {
    await writeFile(join(primaryDir, "CLAUDE.md"), "keep");
    await linkSharedItems(primaryDir, account);
    let calls = 0;
    expect(await removeAccount(accountsRoot, account, async () => (calls++, true))).toEqual({ loggedOut: true });
    expect(calls).toBe(1);
    await expect(lstat(account)).rejects.toThrow();
    expect(await readFile(join(primaryDir, "CLAUDE.md"), "utf8")).toBe("keep");
    expect((await stat(join(primaryDir, "skills"))).isDirectory()).toBe(true);
  });

  test("登出失敗仍刪除資料夾並回報", async () => {
    await mkdir(account, { recursive: true });
    expect(await removeAccount(accountsRoot, account, async () => false)).toEqual({ loggedOut: false });
    expect(await removeAccount(accountsRoot, join(accountsRoot, "gone"), async () => { throw new Error("不該呼叫"); })).toEqual({ loggedOut: true });
    await mkdir(account, { recursive: true });
    expect(await removeAccount(accountsRoot, account, async () => { throw new Error("x"); })).toEqual({ loggedOut: false });
  });

  test("拒絕處理附加帳號資料夾以外的位置（例如主帳號）", async () => {
    let called = false;
    const logout = async () => ((called = true), true);
    await expect(removeAccount(accountsRoot, primaryDir, logout)).rejects.toThrow("不是附加帳號的資料夾");
    await expect(removeAccount(accountsRoot, accountsRoot, logout)).rejects.toThrow();
    await expect(removeAccount(accountsRoot, join(account, "sub"), logout)).rejects.toThrow();
    expect(called).toBe(false);
    expect((await stat(primaryDir)).isDirectory()).toBe(true);
  });
});
