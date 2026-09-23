// 產出給使用者下載的安裝包：dist/release/am-<版本>-<平台>.zip 與 SHA256SUMS.txt
import { $ } from "bun";
import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import pkg from "../package.json";

const PACKAGES = [
  { name: "macos-arm64", binary: "dist/am-macos-arm64", exe: "am", installer: "scripts/install/install.sh" },
  { name: "macos-x64", binary: "dist/am-macos-x64", exe: "am", installer: "scripts/install/install.sh" },
  { name: "windows-x64", binary: "dist/am-windows-x64.exe", exe: "am.exe", installer: "scripts/install/install.ps1" },
] as const;

await $`bun run scripts/build.ts --all`;

const releaseDir = "dist/release";
await rm(releaseDir, { recursive: true, force: true });
await mkdir(releaseDir, { recursive: true });

const zips: string[] = [];
for (const p of PACKAGES) {
  const folder = `am-${pkg.version}-${p.name}`;
  const dir = join(releaseDir, folder);
  await mkdir(dir, { recursive: true });
  await cp(p.binary, join(dir, p.exe));
  await cp(p.installer, join(dir, p.installer.split("/").at(-1)!));
  await cp("README.md", join(dir, "README.md"));
  await $`chmod +x ${join(dir, p.exe)}`;
  if (p.installer.endsWith(".sh")) await $`chmod +x ${join(dir, "install.sh")}`;
  await $`cd ${releaseDir} && zip -qry ${folder}.zip ${folder}`;
  await rm(dir, { recursive: true });
  zips.push(`${folder}.zip`);
  console.log(`已產出：${join(releaseDir, `${folder}.zip`)}`);
}

await $`cd ${releaseDir} && shasum -a 256 ${zips} > SHA256SUMS.txt`;
console.log(`已產出：${join(releaseDir, "SHA256SUMS.txt")}`);
