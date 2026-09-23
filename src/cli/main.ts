import { ConfigError, loadConfig, updateConfig } from "../core/config";
import { ClaudeNotFoundError, launchClaude, resolveClaudeCommand } from "../core/launch";
import { fetchModels } from "../core/providers";
import { configPath } from "../core/paths";
import { PortInUseError, startServer } from "../server/serve";
import { VERSION } from "../version";
import { parseArgs } from "./args";
import { useUtf8Console } from "./console";
import { runMenu } from "./menu";
import { NotATerminalError, runPrompt } from "./terminal";
import { homedir } from "node:os";
import { amDir } from "../core/paths";
import { autostartStatus, disableAutostart, enableAutostart, UnsupportedPlatformError, type AutostartContext } from "../platform/manager";
import { isServerRunning, openBrowser, selfCommand, serverUrl, startServerInBackground, stopServer, waitForServer } from "./web";

const HELP = `AM（Agent Account Manager） ${VERSION}

用法：
  am [claude 參數...]           選擇服務商與模型後啟動 Claude Code
  am web                        用瀏覽器開啟管理網站
  am server                     在前景執行管理網站
  am autostart on|off|status    開機自動執行管理網站
  am -- <參數...>               把與子指令同名的參數轉給 claude
  am --version                  顯示版本`;

async function main(): Promise<number> {
  const command = parseArgs(process.argv.slice(2));
  switch (command.kind) {
    case "version":
      console.log(VERSION);
      return 0;
    case "help":
      console.log(HELP);
      return 0;
    case "error":
      console.error(command.message);
      return 1;
    case "server": {
      const config = await loadConfig(configPath());
      if (await isServerRunning(config.server.port)) {
        console.log(`AM 管理網站已在執行中：${serverUrl(config.server.port)}`);
        return 0;
      }
      try {
        const server = startServer({ configPath: configPath(), port: config.server.port, onShutdown: () => process.exit(0) });
        console.log(`AM 管理網站：${server.url}`);
      } catch (err) {
        if (err instanceof PortInUseError) {
          console.log(err.message);
          return 0;
        }
        throw err;
      }
      return new Promise(() => {});
    }
    case "web": {
      const { port } = (await loadConfig(configPath())).server;
      if (!(await isServerRunning(port))) {
        startServerInBackground();
        if (!(await waitForServer(port))) {
          console.error(`無法啟動管理網站，請執行 am server 查看錯誤訊息`);
          return 1;
        }
      }
      openBrowser(serverUrl(port));
      console.log(`已開啟 ${serverUrl(port)}`);
      return 0;
    }
    case "autostart": {
      const { port } = (await loadConfig(configPath())).server;
      const ctx = autostartContext();
      if (command.action === "on") {
        const status = await enableAutostart(ctx);
        // macOS 載入後會立即啟動；Windows 要到下次登入才執行，所以先在背景啟動
        if (!(await waitForServer(port, 3000))) startServerInBackground();
        const running = await waitForServer(port);
        console.log(`已開啟開機自動執行：${status.command}`);
        console.log(running ? `管理網站：${serverUrl(port)}` : "管理網站尚未啟動，請執行 am server 查看錯誤訊息");
        return running ? 0 : 1;
      }
      if (command.action === "off") {
        await disableAutostart(ctx);
        await stopServer(port);
        console.log("已關閉開機自動執行，並停止管理網站");
        return 0;
      }
      const status = await autostartStatus(ctx);
      console.log(`開機自動執行：${status.enabled ? "開啟" : "關閉"}`);
      if (status.command) console.log(`執行指令：${status.command}`);
      console.log(`設定檔：${status.file}`);
      console.log(`管理網站：${(await isServerRunning(port)) ? `執行中（${serverUrl(port)}）` : "未執行"}`);
      return 0;
    }
    case "menu": {
      const path = configPath();
      return runMenu(
        {
          claudeInstalled: () => {
            try {
              resolveClaudeCommand(Bun.which, process.platform, process.env as Record<string, string>);
              return true;
            } catch {
              return false;
            }
          },
          loadConfig: () => loadConfig(path),
          saveSelection: async (providerId, selection) => {
            await updateConfig(path, (config) => {
              config.lastSelection.providerId = providerId;
              if (selection) config.lastSelection.byProvider[providerId] = selection;
            });
          },
          fetchModels: (provider) => fetchModels(provider),
          prompt: runPrompt,
          launch: launchClaude,
          log: (message) => console.log(message),
          env: process.env,
        },
        command.claudeArgs,
      );
    }
    default:
      console.error("尚未實作");
      return 1;
  }
}

function autostartContext(): AutostartContext {
  return {
    platform: process.platform,
    home: homedir(),
    env: process.env,
    command: selfCommand(),
    logDir: amDir(),
    run: async (cmd) => Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" }).exited,
    uid: process.getuid?.() ?? 0,
  };
}

useUtf8Console();

try {
  process.exit(await main());
} catch (err) {
  if (err instanceof ConfigError || err instanceof ClaudeNotFoundError || err instanceof NotATerminalError || err instanceof UnsupportedPlatformError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}
