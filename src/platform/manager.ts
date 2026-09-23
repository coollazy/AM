import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  commandFromPlist,
  commandFromStartupScript,
  LAUNCH_AGENT_LABEL,
  launchAgentPath,
  launchAgentPlist,
  windowsStartupPath,
  windowsStartupScript,
  type AutostartStatus,
} from "./autostart";

export type AutostartContext = {
  platform: NodeJS.Platform;
  home: string;
  env: Record<string, string | undefined>;
  // 開機時要執行的 am 指令（不含 server）
  command: string[];
  logDir: string;
  run: (cmd: string[]) => Promise<number>;
  uid: number;
};

export class UnsupportedPlatformError extends Error {
  constructor(platform: string) {
    super(`不支援的作業系統：${platform}（僅支援 macOS 與 Windows）`);
  }
}

export async function enableAutostart(ctx: AutostartContext): Promise<AutostartStatus> {
  const env = passthroughEnv(ctx.env);
  if (ctx.platform === "darwin") {
    const file = launchAgentPath(ctx.home);
    await mkdir(dirname(file), { recursive: true });
    await mkdir(ctx.logDir, { recursive: true, mode: 0o700 });
    await writeFile(file, launchAgentPlist(ctx.command, join(ctx.logDir, "server.log"), env));
    const domain = `gui/${ctx.uid}`;
    // 已載入時先卸載再載入，套用最新設定
    await ctx.run(["launchctl", "bootout", `${domain}/${LAUNCH_AGENT_LABEL}`]);
    const code = await ctx.run(["launchctl", "bootstrap", domain, file]);
    if (code !== 0) throw new Error(`launchctl 載入失敗（代碼 ${code}）`);
    return autostartStatus(ctx);
  }
  if (ctx.platform === "win32") {
    const file = windowsStartupPath(appData(ctx));
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, windowsStartupScript(ctx.command, env));
    return autostartStatus(ctx);
  }
  throw new UnsupportedPlatformError(ctx.platform);
}

export async function disableAutostart(ctx: AutostartContext): Promise<void> {
  if (ctx.platform === "darwin") {
    await ctx.run(["launchctl", "bootout", `gui/${ctx.uid}/${LAUNCH_AGENT_LABEL}`]);
    await rm(launchAgentPath(ctx.home), { force: true });
    return;
  }
  if (ctx.platform === "win32") {
    await rm(windowsStartupPath(appData(ctx)), { force: true });
    return;
  }
  throw new UnsupportedPlatformError(ctx.platform);
}

export async function autostartStatus(ctx: AutostartContext): Promise<AutostartStatus> {
  if (ctx.platform !== "darwin" && ctx.platform !== "win32") throw new UnsupportedPlatformError(ctx.platform);
  const file = ctx.platform === "darwin" ? launchAgentPath(ctx.home) : windowsStartupPath(appData(ctx));
  let content: string;
  try {
    content = await readFile(file, "utf8");
  } catch {
    return { enabled: false, command: null, file };
  }
  const command = ctx.platform === "darwin" ? commandFromPlist(content) : commandFromStartupScript(content);
  return { enabled: true, command, file };
}

// 開機執行時沒有終端機的環境變數，自訂的設定目錄需要一併帶入
function passthroughEnv(env: Record<string, string | undefined>): Record<string, string> {
  const dir = env.AM_CONFIG_DIR?.trim();
  return dir ? { AM_CONFIG_DIR: dir } : {};
}

function appData(ctx: AutostartContext): string {
  const dir = ctx.env.APPDATA;
  if (!dir) throw new Error("找不到 APPDATA 環境變數，無法設定開機自動執行");
  return dir;
}
