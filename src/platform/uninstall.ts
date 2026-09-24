import { readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, win32 } from "node:path";

// 安裝腳本（scripts/install/install.sh）寫入 shell 設定檔的標記
export const PATH_MARKER = "# AM（Agent Account Manager）";
export const SHELL_RC_FILES = [".zshrc", ".bash_profile", ".profile"];

// 移除安裝腳本寫入的 PATH 設定（標記行＋下一行 export）；isInstallDir 判斷該行的目錄是否為 am 的安裝目錄
// 沒有符合的區塊時回傳 null
export function stripPathBlock(content: string, isInstallDir: (dir: string) => boolean): string | null {
  const pattern = new RegExp(`(\\n?)${escapeRegExp(PATH_MARKER)}\\nexport PATH="([^"\\n]*):\\$PATH"(\\n|$)`, "g");
  let changed = false;
  const next = content.replace(pattern, (whole, _lead: string, dir: string) => {
    if (!isInstallDir(dir)) return whole;
    changed = true;
    return "";
  });
  return changed ? next : null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 從 Windows 的 PATH 字串移除指定目錄（不分大小寫、忽略結尾的斜線）；沒有時回傳 null
export function removeFromPathList(list: string, dir: string): string | null {
  const norm = (p: string) => p.trim().replace(/[\\/]+$/, "").toLowerCase();
  const parts = list.split(";");
  const kept = parts.filter((p) => norm(p) !== norm(dir));
  return kept.length === parts.length ? null : kept.join(";");
}

// Windows 無法刪除執行中的 am.exe：由背景程序等 am 結束後刪除，目錄空了也一併移除
export function windowsDeleteCommand(exe: string, comSpec = "cmd.exe"): string[] {
  const dir = win32.dirname(exe);
  return [comSpec, "/d", "/c", `ping -n 3 127.0.0.1 >nul & del /f /q "${exe}" & rmdir "${dir}"`];
}

export type UninstallContext = {
  platform: NodeJS.Platform;
  home: string;
  // 正在執行的 am 執行檔
  exePath: string;
  configDir: string;
  stopServer: () => Promise<unknown>;
  disableAutostart: () => Promise<void>;
  // Windows 使用者 PATH（登錄檔）
  getUserPath: () => Promise<string>;
  setUserPath: (value: string) => Promise<void>;
  spawnDetached: (cmd: string[]) => void;
  log: (message: string) => void;
};

export type UninstallOptions = { purge: boolean };

export async function uninstall(ctx: UninstallContext, { purge }: UninstallOptions): Promise<void> {
  const installDir = dirname(ctx.exePath);

  await ctx.stopServer();
  await ctx.disableAutostart();
  ctx.log("已停止管理網站並關閉開機自動執行");

  // 安裝目錄除了 am 之外還有其他檔案時（例如 ~/.local/bin 也放了其他工具），保留 PATH 設定
  const others = (await readdir(installDir)).filter((f) => f !== basename(ctx.exePath) && !f.startsWith("."));
  if (others.length > 0) {
    ctx.log(`安裝目錄 ${installDir} 還有其他檔案，保留 PATH 設定`);
  } else if (ctx.platform === "win32") {
    const next = removeFromPathList(await ctx.getUserPath(), installDir);
    if (next !== null) {
      await ctx.setUserPath(next);
      ctx.log(`已從 PATH 移除 ${installDir}`);
    }
  } else {
    // 路徑可能經過捷徑（例如 macOS 的 /tmp 指向 /private/tmp），以實際位置比對
    const real = async (p: string) => realpath(p).catch(() => p);
    const target = await real(installDir);
    for (const name of SHELL_RC_FILES) {
      const file = join(ctx.home, name);
      let content: string;
      try {
        content = await readFile(file, "utf8");
      } catch {
        continue;
      }
      const dirs = [...content.matchAll(/export PATH="([^"\n]*):\$PATH"/g)].map((m) => m[1]!);
      const matching = new Set<string>();
      for (const dir of dirs) if ((await real(dir)) === target) matching.add(dir);
      const next = stripPathBlock(content, (dir) => matching.has(dir));
      if (next !== null) {
        await writeFile(file, next);
        ctx.log(`已從 ${file} 移除 PATH 設定`);
      }
    }
  }

  if (purge) {
    await rm(ctx.configDir, { recursive: true, force: true });
    ctx.log(`已刪除設定目錄 ${ctx.configDir}`);
  } else {
    ctx.log(`保留設定目錄 ${ctx.configDir}（重新安裝後可繼續使用）`);
  }

  if (ctx.platform === "win32") {
    ctx.spawnDetached(windowsDeleteCommand(ctx.exePath));
  } else {
    await rm(ctx.exePath, { force: true });
  }
  ctx.log(`已移除 ${ctx.exePath}`);
}
