import { lstat, mkdir, readFile, readlink, rename, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

// 附加帳號與主帳號（~/.claude）共用的項目：在附加帳號資料夾裡建立捷徑指向主帳號
// 只列 Claude Code 的標準設定與工作紀錄；帳號、執行狀態、暫存與非標準項目不共用
export const SHARED_FILES = ["CLAUDE.md", "settings.json", "keybindings.json", "history.jsonl"];
export const SHARED_DIRS = [
  "agents",
  "commands",
  "skills",
  "plugins",
  "rules",
  "output-styles",
  "workflows",
  "agent-memory",
  "themes",
  "projects",
  "file-history",
  "plans",
  "tasks",
  "paste-cache",
  "uploads",
];

// 每次啟動附加帳號前，從主帳號的 .claude.json 複製過去的欄位（主帳號是正本）
// 鏡像：主帳號沒有就一併刪除，讓附加帳號自己新增的 MCP 被還原
const MIRROR_KEYS = ["mcpServers"];
// 複製：主帳號有才覆蓋（首次使用與介面偏好）
const COPY_KEYS = ["hasCompletedOnboarding", "lastOnboardingVersion", "theme", "editorMode", "verbose", "preferredNotifChannel", "autoCompactEnabled"];
// 各專案的 MCP 與信任設定
const PROJECT_MIRROR_KEYS = ["mcpServers", "enabledMcpjsonServers", "disabledMcpjsonServers", "disabledMcpServers"];
const PROJECT_COPY_KEYS = ["hasTrustDialogAccepted", "allowedTools", "hasClaudeMdExternalIncludesApproved", "hasClaudeMdExternalIncludesWarningShown"];

export function accountStatePath(accountDir: string): string {
  return join(accountDir, ".claude.json");
}

// 建立附加帳號資料夾與共用捷徑；回傳要提示使用者的訊息
// 主帳號缺少的資料夾先建立（捷徑指向不存在的資料夾時，Claude Code 無法在裡面建檔）；
// 缺少的檔案不先建立，Claude Code 第一次寫入時會透過捷徑直接建在主帳號
// 捷徑被換成真的檔案或資料夾時，改名備份後重建
export async function linkSharedItems(primaryDir: string, accountDir: string, now = new Date()): Promise<string[]> {
  const notices: string[] = [];
  await mkdir(accountDir, { recursive: true, mode: 0o700 });
  const items = [...SHARED_FILES.map((name) => ({ name, dir: false })), ...SHARED_DIRS.map((name) => ({ name, dir: true }))];
  for (const { name, dir } of items) {
    const target = join(primaryDir, name);
    const link = join(accountDir, name);
    if (dir) await mkdir(target, { recursive: true });
    const current = await lstat(link).catch(() => null);
    if (current?.isSymbolicLink()) {
      if ((await readlink(link)) === target) continue;
      await unlink(link);
    } else if (current) {
      const backup = `${link}.bak-${timestamp(now)}`;
      await rename(link, backup);
      notices.push(`已修復共用項目「${name}」：它被換成了獨立的${dir ? "資料夾" : "檔案"}，原內容備份在 ${backup}`);
    }
    await symlink(target, link, dir ? "dir" : "file");
  }
  return notices;
}

// 從主帳號的 .claude.json 複製 MCP、專案信任設定與介面偏好到附加帳號；回傳要提示使用者的訊息
export async function syncAccountState(primaryStatePath: string, accountDir: string): Promise<string[]> {
  const primary = await readJsonObject(primaryStatePath);
  if (primary === "invalid") return [`無法讀取 ${primaryStatePath}，這次沒有同步 MCP 設定`];
  const path = accountStatePath(accountDir);
  const account = await readJsonObject(path);
  if (account === "invalid") return [`無法讀取 ${path}，這次沒有同步 MCP 設定`];

  const next = { ...(account ?? {}) };
  const source = primary ?? {};
  applyKeys(next, source, MIRROR_KEYS, COPY_KEYS);
  if (isObject(source.projects)) {
    const projects = isObject(next.projects) ? { ...next.projects } : {};
    for (const [dir, settings] of Object.entries(source.projects)) {
      if (!isObject(settings)) continue;
      const project = isObject(projects[dir]) ? { ...projects[dir] } : {};
      applyKeys(project, settings, PROJECT_MIRROR_KEYS, PROJECT_COPY_KEYS);
      projects[dir] = project;
    }
    next.projects = projects;
  }

  const tmp = `${path}.am-${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(next, null, 2), { mode: 0o600 });
  await rename(tmp, path);
  return [];
}

// 準備好附加帳號後才能啟動：建立共用捷徑、同步設定
export async function prepareAccount(options: { primaryDir: string; primaryStatePath: string; accountDir: string; now?: Date }): Promise<string[]> {
  const notices = await linkSharedItems(options.primaryDir, options.accountDir, options.now);
  notices.push(...(await syncAccountState(options.primaryStatePath, options.accountDir)));
  return notices;
}

export type LoginInfo = { email: string; organization: string | null };

// 讀取帳號目前登入的 email（Claude Code 登入後寫在 .claude.json 的 oauthAccount）；未登入回傳 null
export async function readLogin(statePath: string): Promise<LoginInfo | null> {
  const state = await readJsonObject(statePath);
  if (state === null || state === "invalid" || !isObject(state.oauthAccount)) return null;
  const { emailAddress, organizationName } = state.oauthAccount;
  if (typeof emailAddress !== "string" || emailAddress === "") return null;
  return { email: emailAddress, organization: typeof organizationName === "string" && organizationName !== "" ? organizationName : null };
}

// 會讓 AM 選的訂閱帳號失效的環境變數；有設定時回傳錯誤說明
const CONFLICTING_ENV = [
  { name: "CLAUDE_CONFIG_DIR", effect: "Claude Code 會改用它指定的設定資料夾，而不是你選的帳號" },
  { name: "CLAUDE_CODE_OAUTH_TOKEN", effect: "Claude Code 不管選哪個帳號，都會用這個權杖登入同一個帳號" },
];

export function subscriptionEnvProblem(env: Record<string, string | undefined>, platform: NodeJS.Platform = process.platform): string | null {
  const found = CONFLICTING_ENV.filter(({ name }) => envValue(env, name, platform));
  if (found.length === 0) return null;
  const names = found.map((f) => f.name);
  return [
    `無法以訂閱帳號啟動：偵測到環境變數 ${names.join("、")}。`,
    ...found.map((f) => `  ${f.name}：${f.effect}。`),
    "修復方式：",
    `  1. 找出設定它的地方（通常在 ~/.zshrc），刪除 ${names.map((n) => `export ${n}=…`).join("、")} 那一行`,
    `  2. 重新開啟終端機，或在目前的終端機執行：unset ${names.join(" ")}`,
    "API 服務商不受影響，可以照常選擇。",
  ].join("\n");
}

// 刪除附加帳號：先登出（由 Claude Code 清除鑰匙圈裡的登入），再刪資料夾；登出失敗仍刪除
// 只允許刪除 accountsRoot 底下的資料夾，確保不會登出或刪除主帳號
export async function removeAccount(accountsRoot: string, accountDir: string, logout: () => Promise<boolean>): Promise<{ loggedOut: boolean }> {
  const rel = relative(resolve(accountsRoot), resolve(accountDir));
  if (rel === "" || rel.startsWith("..") || rel.includes(sep)) throw new Error(`不是附加帳號的資料夾：${accountDir}`);
  const exists = await lstat(accountDir).catch(() => null);
  const loggedOut = exists ? await logout().catch(() => false) : true;
  await rm(accountDir, { recursive: true, force: true });
  return { loggedOut };
}

// 以附加帳號執行 claude 的環境變數（登入、登出用）
export function accountEnv(env: Record<string, string | undefined>, accountDir: string | null): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && !CONFLICTING_ENV.some((c) => c.name === key.toUpperCase())) next[key] = value;
  }
  if (accountDir !== null) next.CLAUDE_CONFIG_DIR = accountDir;
  return next;
}

function applyKeys(target: Record<string, unknown>, source: Record<string, unknown>, mirror: string[], copy: string[]) {
  for (const key of mirror) {
    if (key in source) target[key] = source[key];
    else delete target[key];
  }
  for (const key of copy) if (key in source) target[key] = source[key];
}

async function readJsonObject(path: string): Promise<Record<string, any> | null | "invalid"> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  try {
    const value = JSON.parse(text);
    return isObject(value) ? value : "invalid";
  } catch {
    return "invalid";
  }
}

function envValue(env: Record<string, string | undefined>, name: string, platform: NodeJS.Platform): string | undefined {
  const key = platform === "win32" ? Object.keys(env).find((k) => k.toUpperCase() === name) : name;
  const value = key === undefined ? undefined : env[key];
  return value !== undefined && value.trim() !== "" ? value : undefined;
}

function isObject(v: unknown): v is Record<string, any> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function timestamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
