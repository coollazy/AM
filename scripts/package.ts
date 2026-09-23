// 產出給使用者下載的安裝包：dist/release/am-<平台>.zip 與 SHA256SUMS.txt
// 檔名不含版本號，一行指令安裝才能用固定網址下載最新版（releases/latest/download/<檔名>）
import { $ } from "bun";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const PACKAGES = [
  { name: "macos-arm64", binary: "dist/am-macos-arm64", exe: "am", installer: "install.sh" },
  { name: "macos-x64", binary: "dist/am-macos-x64", exe: "am", installer: "install.sh" },
  { name: "windows-x64", binary: "dist/am-windows-x64.exe", exe: "am.exe", installer: "install.ps1" },
] as const;

await $`bun run scripts/build.ts --all`;

const releaseDir = "dist/release";
await rm(releaseDir, { recursive: true, force: true });
await mkdir(releaseDir, { recursive: true });

const assets: string[] = [];
for (const p of PACKAGES) {
  const folder = `am-${p.name}`;
  const dir = join(releaseDir, folder);
  await mkdir(dir, { recursive: true });
  await cp(p.binary, join(dir, p.exe));
  await cp("README.md", join(dir, "README.md"));
  const installer = await readFile(join("scripts/install", p.installer), "utf8");
  // 壓縮檔內的 install.ps1 以「powershell -File」執行，Windows PowerShell 5.1 需要 BOM 才會以 UTF-8 讀取中文；
  // 儲存庫中的版本不加 BOM，給一行指令（irm | iex）使用
  await writeFile(join(dir, p.installer), p.installer.endsWith(".ps1") ? "﻿" + installer : installer);
  await $`chmod +x ${join(dir, p.exe)}`;
  if (p.installer.endsWith(".sh")) await $`chmod +x ${join(dir, p.installer)}`;
  await $`cd ${releaseDir} && zip -qry ${folder}.zip ${folder}`;
  await rm(dir, { recursive: true });
  assets.push(`${folder}.zip`);
  console.log(`已產出：${join(releaseDir, `${folder}.zip`)}`);
}

await $`cd ${releaseDir} && shasum -a 256 ${assets} > SHA256SUMS.txt`;
console.log(`已產出：${join(releaseDir, "SHA256SUMS.txt")}`);
