# PROGRESS

進行中的工作與目前狀態。用來在 /compact 或重新開啟對話後接續工作。完成後將項目移到 `DONE.md`。

## 格式

```
### 項目名稱
- 開始日期：YYYY-MM-DD
- 目前狀態：
- 下一步：
- 待決問題：
```

## 進行中

### 解除安裝、無 API 服務商引導、GitHub Actions 升級
- 開始日期：2026-09-24
- 目前狀態：三項都已完成並合併回 `develop`（未 push）。修正安裝腳本以壓縮檔安裝時誤回傳失敗的 bug（已包含在 v1.0.0 中）。
- 下一步：使用者決定是否 push 並發 v1.1.0；push 後確認 Windows 自動測試（新增的解除安裝項目、升級後的 Actions）通過。
- 尚未驗證：Windows 上的 `am uninstall`（只有單元測試，Windows 自動測試要 push 後才會跑）。
- 待決問題：是否發 v1.1.0。

## 交接筆記（2026-09-24）

- **目標**：AM（Agent Account Manager）＝本機管理網站＋終端 `am` 指令，選服務商／模型後啟動 Claude Code，每個終端視窗獨立。v1.0.0 已發布。
- **已確認的事**
  - 現況：`master`＝`develop`＝`2455edc`，已 push；GitHub Release `v1.0.0`（GitHub Actions 自動打包）。本機與遠端只剩 `master`、`develop`。
  - 使用者的 `am` 安裝在 `~/.local/bin/am`（1.0.0），管理網站跑在 `127.0.0.1:4141`（非開機自動執行，手動背景啟動）；設定 `~/.am/config.json` 有 4 個服務商（含真實 key）。
  - CI：push `develop`／`master` → `test.yml`（macOS＋Windows 單元測試、打包、Windows 28 項實測）；打 tag → `release.yml` 直接打包發版，不等測試。
  - `develop` 比 v1.0.0 多的使用者可見改動只有選單提示空格；使用者決定暫不發新版。
  - `am` 參數原樣轉給 claude（`-n`、`-c`、`--resume`、`-p` 皆可）；第一個參數為 `--version`/`-v`/`--help`/`-h`/`web`/`server`/`autostart` 時由 am 處理，`am -- <參數>` 可強制轉交。
  - 網站配色 P03「晨霧藍＋海港藍」，固定淺色；訂閱制最多一個；主按鈕用主色。
  - Windows 互動選單、實際啟動 Claude Code、SmartScreen 由使用者另找人實機測試，不列 TODO。
- **已排除的做法**
  - 不清掉全部 `ANTHROPIC_*`，只清 `src/core/env.ts` 的 7 個管理變數（使用者有全域固定變數）。
  - 不匯入、不修改舊工具 `~/.local/bin/ai`、`~/.ai-profiles/`。
  - 不做 Docker、不做深色模式、不做網站登入密碼、不支援 Linux。
  - 不要 `git add -A` 前不檢查：Bun 打包會在根目錄留 `.*.bun-build`（約 60 MB），已加 `.gitignore` 並由 `scripts/build.ts` 清除；曾誤 commit 並已改寫歷史移除。
- **還沒解決的問題**：無待決事項。低優先 TODO 見 `TODO.md`（鑰匙圈、Homebrew、程式碼簽章、無 API 服務商引導、解除安裝、Actions Node.js 20 升級）。
- **下一步**：等使用者新需求或 Windows 實機測試回報；有使用者可見改動時再發版（改 `package.json` version → 合併 `master` → `git tag vX.Y.Z` → push）。
- **相關檔案/位置**
  - 規則與指令：`CLAUDE.md`；架構：`docs/architecture.md`；追蹤：`TODO.md`、`PROGRESS.md`、`DONE.md`
  - 參數解析 `src/cli/args.ts`；選單 `src/cli/menu.ts`、`src/cli/prompt.ts`；環境變數 `src/core/env.ts`；設定 `src/core/config.ts`
  - 網站 `src/server/app.ts`、`src/web/`；開機自動執行 `src/platform/`
  - 打包 `scripts/build.ts`、`scripts/package.ts`；安裝 `scripts/install/install.sh`、`install.ps1`；截圖 `scripts/screenshots.ts`
  - CI `.github/workflows/test.yml`、`release.yml`、`scripts/ci/windows-smoke.ps1`
  - 本機實測要用 `AM_CONFIG_DIR`、`AM_INSTALL_DIR`、`HOME` 指向暫存目錄並換埠號（如 4999），避免停掉使用者 4141 的網站
