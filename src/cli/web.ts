import { spawn } from "node:child_process";
import { HOSTNAME } from "../server/serve";

// 目前執行的是打包後的執行檔，還是用 bun 直接跑原始碼
export function selfCommand(): string[] {
  const compiled = Bun.main.startsWith("/$bunfs/") || /^[A-Z]:[\\/]~BUN[\\/]/i.test(Bun.main);
  return compiled ? [process.execPath] : [process.execPath, Bun.main];
}

export function serverUrl(port: number): string {
  return `http://${HOSTNAME}:${port}/`;
}

// 確認該埠號上跑的是 AM 管理網站
export async function isServerRunning(port: number): Promise<boolean> {
  try {
    const res = await fetch(`${serverUrl(port)}api/health`, { signal: AbortSignal.timeout(1000) });
    const body = (await res.json()) as { app?: string };
    return body.app === "am";
  } catch {
    return false;
  }
}

// 請執行中的網站自行關閉；沒有在執行時回傳 false
export async function stopServer(port: number): Promise<boolean> {
  if (!(await isServerRunning(port))) return false;
  const origin = serverUrl(port).replace(/\/$/, "");
  try {
    await fetch(`${origin}/api/shutdown`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    return false;
  }
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (!(await isServerRunning(port))) return true;
    await Bun.sleep(100);
  }
  return false;
}

export function startServerInBackground(): void {
  const [cmd, ...args] = selfCommand();
  const child = spawn(cmd!, [...args, "server"], { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
}

export async function waitForServer(port: number, timeoutMs = 5000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isServerRunning(port)) return true;
    await Bun.sleep(150);
  }
  return false;
}

export function browserCommand(url: string, platform: NodeJS.Platform): string[] {
  // Windows 的 start 會把第一個加引號的參數當成視窗標題，所以先給空標題
  if (platform === "win32") return ["cmd.exe", "/d", "/c", "start", '""', url];
  return ["open", url];
}

export function openBrowser(url: string): void {
  const [cmd, ...args] = browserCommand(url, process.platform);
  spawn(cmd!, args, { detached: true, stdio: "ignore", windowsHide: true, windowsVerbatimArguments: true }).unref();
}
