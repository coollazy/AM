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
