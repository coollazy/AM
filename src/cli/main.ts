import { ConfigError, loadConfig, updateConfig } from "../core/config";
import { ClaudeNotFoundError, launchClaude } from "../core/launch";
import { fetchModels } from "../core/providers";
import { configPath } from "../core/paths";
import { PortInUseError, startServer } from "../server/serve";
import { VERSION } from "../version";
import { parseArgs } from "./args";
import { runMenu } from "./menu";
import { NotATerminalError, runPrompt } from "./terminal";
import { isServerRunning, openBrowser, serverUrl, startServerInBackground, waitForServer } from "./web";

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
        const server = startServer({ configPath: configPath(), port: config.server.port });
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
    case "menu": {
      const path = configPath();
      return runMenu(
        {
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

try {
  process.exit(await main());
} catch (err) {
  if (err instanceof ConfigError || err instanceof ClaudeNotFoundError || err instanceof NotATerminalError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}
