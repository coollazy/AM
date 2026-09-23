import { $ } from "bun";
import { rm } from "node:fs/promises";

// 打包成單一執行檔。預設只打包本機平台；--all 打包所有支援平台
const TARGETS = [
  { target: "bun-darwin-arm64", outfile: "dist/am-macos-arm64" },
  { target: "bun-darwin-x64", outfile: "dist/am-macos-x64" },
  { target: "bun-windows-x64", outfile: "dist/am-windows-x64.exe" },
] as const;

const all = process.argv.includes("--all");
const builds = all ? TARGETS : [{ target: undefined, outfile: "dist/am" }];

for (const { target, outfile } of builds) {
  const result = await Bun.build({
    entrypoints: ["src/cli/main.ts"],
    compile: target ? { target, outfile } : { outfile },
    minify: true,
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
  // 打包會改動執行檔內容，使原本的簽章失效；macOS 會拒絕執行簽章無效的下載檔案，所以重新做臨時簽章
  const isMac = target ? target.startsWith("bun-darwin") : process.platform === "darwin";
  if (isMac) {
    if (process.platform !== "darwin") {
      console.error("macOS 執行檔必須在 macOS 上打包，才能重新簽章");
      process.exit(1);
    }
    await $`codesign --force --sign - ${outfile}`.quiet();
    await $`codesign --verify --strict ${outfile}`;
  }
  console.log(`已打包：${outfile}`);
}

// Bun 打包偶爾會在專案根目錄留下 .*.bun-build 暫存檔（每個約 60 MB），打包完一併清掉
for await (const leftover of new Bun.Glob(".*.bun-build").scan({ dot: true })) {
  await rm(leftover, { force: true });
}
