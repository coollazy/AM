import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { removeFromPathList, stripPathBlock, uninstall, windowsDeleteCommand, type UninstallContext } from "../../src/platform/uninstall";

describe("stripPathBlock", () => {
  // 與 scripts/install/install.sh 寫入的格式相同
  const block = '\n# AM（Agent Account Manager）\nexport PATH="/Users/a/.local/bin:$PATH"\n';

  test("移除安裝腳本寫入的區塊，保留其他內容", () => {
    expect(stripPathBlock(`export A=1\n${block}export B=2\n`, (d) => d === "/Users/a/.local/bin")).toBe("export A=1\nexport B=2\n");
  });

  test("區塊在檔案最後", () => {
    expect(stripPathBlock(`export A=1\n${block}`, (d) => d === "/Users/a/.local/bin")).toBe("export A=1\n");
  });

  test("目錄不同或沒有標記時不動", () => {
    expect(stripPathBlock(`x\n${block}`, (d) => d === "/other")).toBeNull();
    expect(stripPathBlock('export PATH="/Users/a/.local/bin:$PATH"\n', () => true)).toBeNull();
  });
});

describe("removeFromPathList", () => {
  test("不分大小寫、忽略結尾斜線", () => {
    expect(removeFromPathList("C:\\a;C:\\Users\\x\\AppData\\Local\\Programs\\AM\;C:\\b", "c:\\users\\x\\appdata\\local\\programs\\am")).toBe("C:\\a;C:\\b");
  });

  test("沒有時回傳 null", () => {
    expect(removeFromPathList("C:\\a;C:\\b", "C:\\c")).toBeNull();
  });
});

test("windowsDeleteCommand 等 am 結束後刪除執行檔與空目錄", () => {
  expect(windowsDeleteCommand("C:\\p\\am\\am.exe", "C:\\Windows\\system32\\cmd.exe")).toEqual([
    "C:\\Windows\\system32\\cmd.exe",
    "/d",
    "/c",
    'ping -n 3 127.0.0.1 >nul & del /f /q "C:\\p\\am\\am.exe" & rmdir "C:\\p\\am"',
  ]);
});

describe("uninstall", () => {
  let home: string;
  let calls: string[];
  let userPath: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "am-uninstall-"));
    calls = [];
    userPath = "";
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  async function setup(platform: NodeJS.Platform, extraFiles: string[] = []) {
    const bin = join(home, ".local", "bin");
    const exe = join(bin, platform === "win32" ? "am.exe" : "am");
    await mkdir(bin, { recursive: true });
    await writeFile(exe, "binary");
    for (const f of extraFiles) await writeFile(join(bin, f), "");
    const configDir = join(home, ".am");
    await mkdir(configDir);
    await writeFile(join(configDir, "config.json"), "{}");
    const ctx: UninstallContext = {
      platform,
      home,
      exePath: exe,
      configDir,
      stopServer: async () => calls.push("stopServer"),
      disableAutostart: async () => {
        calls.push("disableAutostart");
      },
      getUserPath: async () => userPath,
      setUserPath: async (v) => {
        userPath = v;
      },
      spawnDetached: (cmd) => calls.push(`spawn ${cmd.at(-1)}`),
      log: () => {},
    };
    return { bin, exe, configDir, ctx };
  }

  test("macOS：停止網站、關閉開機自動執行、移除 PATH 設定與執行檔，保留設定", async () => {
    const { bin, exe, configDir, ctx } = await setup("darwin");
    await writeFile(join(home, ".zshrc"), `export A=1\n\n# AM（Agent Account Manager）\nexport PATH="${bin}:$PATH"\n`);
    await uninstall(ctx, { purge: false });
    expect(calls).toEqual(["stopServer", "disableAutostart"]);
    expect(await readFile(join(home, ".zshrc"), "utf8")).toBe("export A=1\n");
    expect(await Bun.file(exe).exists()).toBe(false);
    expect(await Bun.file(join(configDir, "config.json")).exists()).toBe(true);
  });

  test("安裝目錄經過捷徑時仍能移除 PATH 設定", async () => {
    const { bin, ctx } = await setup("darwin");
    const link = join(home, "link-bin");
    await symlink(bin, link);
    await writeFile(join(home, ".zshrc"), `export A=1\n\n# AM（Agent Account Manager）\nexport PATH="${link}:$PATH"\n`);
    await uninstall(ctx, { purge: false });
    expect(await readFile(join(home, ".zshrc"), "utf8")).toBe("export A=1\n");
  });

  test("purge 時刪除設定目錄", async () => {
    const { configDir, ctx } = await setup("darwin");
    await uninstall(ctx, { purge: true });
    expect(await Bun.file(join(configDir, "config.json")).exists()).toBe(false);
  });

  test("安裝目錄還有其他工具時保留 PATH 設定", async () => {
    const { bin, ctx } = await setup("darwin", ["claude"]);
    const rc = `\n# AM（Agent Account Manager）\nexport PATH="${bin}:$PATH"\n`;
    await writeFile(join(home, ".zshrc"), rc);
    await uninstall(ctx, { purge: false });
    expect(await readFile(join(home, ".zshrc"), "utf8")).toBe(rc);
  });

  test("Windows：從使用者 PATH 移除安裝目錄，並在背景刪除執行中的 am.exe", async () => {
    const { bin, exe, ctx } = await setup("win32");
    userPath = `C:\\x;${bin}`;
    await uninstall(ctx, { purge: false });
    expect(userPath).toBe("C:\\x");
    expect(calls).toEqual(["stopServer", "disableAutostart", `spawn ${windowsDeleteCommand(exe).at(-1)}`]);
    // 執行中的檔案由背景程序刪除，這裡還在
    expect(await Bun.file(exe).exists()).toBe(true);
  });
});
