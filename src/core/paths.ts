import { homedir } from "node:os";
import { join } from "node:path";

// 可用 AM_CONFIG_DIR 指定其他設定目錄（例如測試時不動到正式設定）
export function amDir(home: string = homedir(), env: Record<string, string | undefined> = process.env): string {
  const override = env.AM_CONFIG_DIR?.trim();
  return override ? override : join(home, ".am");
}

export function configPath(home: string = homedir(), env: Record<string, string | undefined> = process.env): string {
  return join(amDir(home, env), "config.json");
}

// 附加訂閱帳號的資料夾，每個帳號一個（Claude Code 以 CLAUDE_CONFIG_DIR 指向它）
export function accountDir(id: string, home: string = homedir(), env: Record<string, string | undefined> = process.env): string {
  return join(amDir(home, env), "accounts", id);
}

// 主帳號：Claude Code 預設的設定資料夾與狀態檔（沒有設定 CLAUDE_CONFIG_DIR 時）
export function claudeDir(home: string = homedir()): string {
  return join(home, ".claude");
}

export function claudeStatePath(home: string = homedir()): string {
  return join(home, ".claude.json");
}
