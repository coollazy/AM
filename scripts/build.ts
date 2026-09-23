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
  console.log(`已打包：${outfile}`);
}
