// 網站的「登入」按鈕：開啟 macOS 內建的「終端機」，以指定帳號執行 claude auth login

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

// accountDir 為 null 表示主帳號（~/.claude）；一律移除會讓登入落到其他帳號的環境變數
export function loginCommand(accountDir: string | null, email: string | null): string {
  const env = ["env", "-u", "CLAUDE_CODE_OAUTH_TOKEN", ...(accountDir === null ? ["-u", "CLAUDE_CONFIG_DIR"] : [`CLAUDE_CONFIG_DIR=${shellQuote(accountDir)}`])];
  const login = [...env, "claude", "auth", "login", ...(email === null ? [] : ["--email", shellQuote(email)])].join(" ");
  return `${login}; echo; echo '完成後可以關閉這個視窗，回到 AM 管理網站查看登入狀態。'`;
}

// 以 AppleScript 在新的「終端機」視窗執行指令
export function terminalCommand(command: string): string[] {
  const script = command.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return ["osascript", "-e", 'tell application "Terminal"', "-e", "activate", "-e", `do script "${script}"`, "-e", "end tell"];
}
