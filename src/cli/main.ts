import { VERSION } from "../version";
import { startServer } from "../server/serve";
import { parseArgs } from "./args";

const HELP = `AM（Agent Account Manager） ${VERSION}

用法：
  am [claude 參數...]    選擇服務商與模型後啟動 Claude Code
  am web                 用瀏覽器開啟管理網站
  am server              在前景執行管理網站
  am autostart on|off|status   開機自動執行管理網站
  am -- <參數...>        把與子指令同名的參數轉給 claude
  am --version           顯示版本`;

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
      const server = startServer(4747);
      console.log(`AM 管理網站：${server.url}`);
      return new Promise(() => {});
    }
    default:
      console.error("尚未實作");
      return 1;
  }
}

process.exit(await main());
