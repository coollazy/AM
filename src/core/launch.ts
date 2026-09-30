import { extname } from "node:path";

export class ClaudeNotFoundError extends Error {
  constructor() {
    super("找不到 claude 指令，請先安裝 Claude Code 並確認它在 PATH 中");
  }
}

// 解析出實際要執行的命令；Windows 上 npm 安裝的 claude 是 .cmd，需透過 cmd.exe 執行
export function resolveClaudeCommand(
  which: (cmd: string, options?: { PATH?: string }) => string | null,
  platform: NodeJS.Platform,
  env: Record<string, string>,
): string[] {
  const found = which("claude", { PATH: env.PATH ?? env.Path });
  if (!found) throw new ClaudeNotFoundError();
  const ext = extname(found).toLowerCase();
  if (platform === "win32" && (ext === ".cmd" || ext === ".bat")) {
    return [env.ComSpec ?? "cmd.exe", "/d", "/s", "/c", found];
  }
  return [found];
}

// 以指定環境變數啟動 claude，終端輸入輸出直接交給它，回傳結束代碼
export async function launchClaude(env: Record<string, string>, args: string[]): Promise<number> {
  const command = resolveClaudeCommand(Bun.which, process.platform, env);
  // Ctrl+C 交給 claude 處理，am 本身不因此中斷
  const ignore = () => {};
  process.on("SIGINT", ignore);
  try {
    const child = Bun.spawn([...command, ...args], {
      env,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
    return await child.exited;
  } finally {
    process.off("SIGINT", ignore);
  }
}

// 開機自動執行的網站由系統啟動，PATH 不含使用者自己加的目錄；補上 Claude Code 常見的安裝位置（接在原本的 PATH 後面）
export function withClaudeInstallPaths(env: Record<string, string>, home: string): Record<string, string> {
  const extra = [`${home}/.local/bin`, `${home}/.claude/local`, "/opt/homebrew/bin", "/usr/local/bin"];
  const current = (env.PATH ?? "").split(":").filter((p) => p !== "");
  return { ...env, PATH: [...current, ...extra.filter((p) => !current.includes(p))].join(":") };
}

// 在背景執行 claude 子指令（例如 auth logout），不顯示輸出；找不到 claude 或失敗時回傳 false
export async function runClaudeQuietly(env: Record<string, string>, args: string[]): Promise<boolean> {
  try {
    const command = resolveClaudeCommand(Bun.which, process.platform, env);
    const child = Bun.spawn([...command, ...args], { env, stdin: "ignore", stdout: "ignore", stderr: "ignore" });
    return (await child.exited) === 0;
  } catch {
    return false;
  }
}
