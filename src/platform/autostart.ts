import { join } from "node:path";

export const LAUNCH_AGENT_LABEL = "local.am.server";
export const WINDOWS_STARTUP_FILE = "am-server.vbs";

export type AutostartStatus = {
  enabled: boolean;
  // 開機時會執行的指令（從已安裝的設定讀出），方便確認執行檔路徑
  command: string | null;
  file: string;
};

export function launchAgentPath(home: string): string {
  return join(home, "Library", "LaunchAgents", `${LAUNCH_AGENT_LABEL}.plist`);
}

export function windowsStartupPath(appData: string): string {
  return join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Startup", WINDOWS_STARTUP_FILE);
}

// macOS：登入時執行 am server；異常結束才重新啟動（已在執行而正常結束時不重啟）
export function launchAgentPlist(command: string[], logPath: string, env: Record<string, string>): string {
  const args = [...command, "server"].map((a) => `    <string>${xml(a)}</string>`).join("\n");
  const envEntries = Object.entries(env);
  const envBlock =
    envEntries.length === 0
      ? ""
      : `  <key>EnvironmentVariables</key>\n  <dict>\n${envEntries
          .map(([k, v]) => `    <key>${xml(k)}</key>\n    <string>${xml(v)}</string>`)
          .join("\n")}\n  </dict>\n`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCH_AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
${envBlock}  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>StandardOutPath</key>
  <string>${xml(logPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(logPath)}</string>
</dict>
</plist>
`;
}

// 從 plist 讀回開機時會執行的指令
export function commandFromPlist(plist: string): string | null {
  const array = /<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(plist)?.[1];
  if (!array) return null;
  const args = [...array.matchAll(/<string>([\s\S]*?)<\/string>/g)].map((m) => unxml(m[1]!));
  return args.length === 0 ? null : args.map(quoteIfNeeded).join(" ");
}

// Windows：放在「啟動」資料夾的 VBScript，登入時以隱藏視窗執行 am server
export function windowsStartupScript(command: string[], env: Record<string, string>): string {
  const commandLine = [...command, "server"].map(quoteIfNeeded).join(" ");
  const lines = ['Set shell = CreateObject("WScript.Shell")'];
  for (const [k, v] of Object.entries(env)) {
    lines.push(`shell.Environment("Process")(${vbs(k)}) = ${vbs(v)}`);
  }
  lines.push(`shell.Run ${vbs(commandLine)}, 0, False`);
  return lines.join("\r\n") + "\r\n";
}

export function commandFromStartupScript(script: string): string | null {
  const m = /shell\.Run "((?:[^"]|"")*)", 0, False/.exec(script);
  return m ? m[1]!.replace(/""/g, '"') : null;
}

function xml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function unxml(s: string): string {
  return s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function vbs(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

function quoteIfNeeded(s: string): string {
  return /[\s"]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s;
}
