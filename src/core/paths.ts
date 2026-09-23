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
