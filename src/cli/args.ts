export type Command =
  | { kind: "menu"; claudeArgs: string[] }
  | { kind: "web" }
  | { kind: "server" }
  | { kind: "autostart"; action: "on" | "off" | "status" }
  | { kind: "version" }
  | { kind: "help" }
  | { kind: "error"; message: string };

const AUTOSTART_ACTIONS = ["on", "off", "status"] as const;

// 子指令以外的參數一律原樣轉給 claude；`am -- <參數>` 可強制轉交與子指令同名的參數
export function parseArgs(argv: string[]): Command {
  const [first, ...rest] = argv;
  switch (first) {
    case undefined:
      return { kind: "menu", claudeArgs: [] };
    case "--":
      return { kind: "menu", claudeArgs: rest };
    case "web":
      return { kind: "web" };
    case "server":
      return { kind: "server" };
    case "autostart": {
      const action = rest[0];
      if (action && (AUTOSTART_ACTIONS as readonly string[]).includes(action)) {
        return { kind: "autostart", action: action as (typeof AUTOSTART_ACTIONS)[number] };
      }
      return { kind: "error", message: "用法：am autostart on | off | status" };
    }
    case "version":
    case "--version":
    case "-v":
      return { kind: "version" };
    case "help":
    case "--help":
    case "-h":
      return { kind: "help" };
    default:
      return { kind: "menu", claudeArgs: argv };
  }
}
