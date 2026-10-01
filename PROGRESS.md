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

### 多個 Claude 訂閱帳號（macOS）
- 開始日期：2026-09-30
- 分支：`feature/multi-subscription`
- 決定（2026-09-30 與使用者逐題確認）：
  - 範圍：只做 macOS；Windows 維持最多一個訂閱制。不做網站管理 MCP、指定主帳號、各帳號選不同 MCP、額度用完自動換帳號。
  - 主帳號＝首次安裝內建的訂閱制，對應 `~/.claude`（直接打 `claude` 就是它）。可刪除（只從選單移除，不登出、不動資料）、可加回（沒有主帳號時新增的訂閱制自動成為主帳號）。換主帳號＝在 `claude` 裡手動重新登入，網站寫說明。
  - 附加帳號：資料夾 `~/.am/accounts/<id>/`，啟動時設 `CLAUDE_CONFIG_DIR`，只能透過 `am` 進入。
  - 刪除附加帳號：`claude auth logout`（帶該帳號的 `CLAUDE_CONFIG_DIR`）後刪資料夾；登出失敗仍刪並提示。`am uninstall --purge` 同樣逐一登出附加帳號，絕不登出主帳號。
  - 捷徑共用（指向 `~/.claude`）：CLAUDE.md、settings.json、keybindings.json、history.jsonl、agents、commands、skills、plugins、rules、output-styles、workflows、agent-memory、themes、projects、file-history、plans、tasks、paste-cache、uploads。其餘（帳號／執行狀態／暫存、非標準項目）不共用。
  - 每次啟動附加帳號前，從 `~/.claude.json` 複製：全域 `mcpServers`、各專案的 MCP 與信任設定、已完成首次使用與介面偏好。附加帳號改的會被還原；網站附加帳號加說明。
  - 捷徑被換成真檔案：改名備份、重建捷徑、提示後照常啟動。
  - 登入：終端機自己登入，或網站「登入」按鈕開 macOS 內建「終端機」執行 `claude auth login`（有 email 就 `--email` 預填）；提醒用無痕視窗授權。
  - 訂閱制有 email 選填欄位（主帳號也可填）；登入後 email 不一致、兩帳號 email 相同都警告。
  - 網站與 `am` 選單都顯示登入 email（網站另顯示組織名稱）；未登入顯示「尚未登入」。email 讀各帳號 `.claude.json` 的 `oauthAccount`。
  - 選訂閱帳號時若有 `CLAUDE_CONFIG_DIR` 或 `CLAUDE_CODE_OAUTH_TOKEN`，`am` 報錯停止並說明修復方式；API 服務商不檢查；網站不處理。
- 已查證：`CLAUDE_CONFIG_DIR` 各自獨立登入（鑰匙圈項目依路徑區分）；Claude Code 寫 settings.json 會保留捷徑（`claude plugin disable` 實測）；`claude auth login/logout/status` 存在。
- 開發時要實測：對話中編輯全域 CLAUDE.md 是否保留捷徑；`--email` 預填在瀏覽器已登入其他帳號時的效果。
- 目前狀態：已合併 develop（2026-10-01，使用者決定先合併）。`bun test`（182 項）、typecheck、打包皆通過；README／architecture／截圖已更新。
- 已實測（暫存 HOME／AM_CONFIG_DIR／埠號 4999，真的 claude 2.1.280）：新增附加帳號會建立 19 個捷徑並同步 MCP；附加帳號裡 `claude mcp get` 讀得到主帳號的 MCP；主帳號缺 settings.json 時，Claude Code 透過捷徑寫入會建在主帳號且捷徑保留；刪除附加帳號真的執行 `claude auth logout` 成功、主帳號鑰匙圈項目仍在；打包後的執行檔網站正常。
- 實作補充：背景網站 PATH 不含 ~/.local/bin，登出時補上 Claude Code 常見安裝位置。
- 尚未實測（需要使用者的第二個真實帳號）：網站「登入」按鈕實際開終端機與授權流程；`--email` 預填在瀏覽器已登入其他帳號時的效果；對話中編輯全域 CLAUDE.md 是否保留捷徑；兩個帳號同時使用。
- 下一步：用使用者第二個真實帳號實測下方「尚未實測」各項 →（要發版時）改版號、合併 master、打 tag。
- 待決問題：無。


## 交接筆記（2026-09-24）

- **目標**：AM（Agent Account Manager）＝本機管理網站＋終端 `am` 指令，選服務商／模型後啟動 Claude Code，每個終端視窗獨立。v1.1.0 已發布。
- **已確認的事**
  - 現況：`master`＝tag `v1.1.0`，已 push；GitHub Release `v1.1.0`（GitHub Actions 自動打包）。
  - 使用者的 `am` 安裝在 `~/.local/bin/am`（1.1.0），管理網站跑在 `127.0.0.1:4141`（非開機自動執行，手動背景啟動）；設定 `~/.am/config.json` 有 4 個服務商（含真實 key）。
  - CI：push `develop`／`master` → `test.yml`（macOS＋Windows 單元測試、打包、Windows 28 項實測）；打 tag → `release.yml` 直接打包發版，不等測試。
  - `am` 參數原樣轉給 claude（`-n`、`-c`、`--resume`、`-p` 皆可）；第一個參數為 `--version`/`-v`/`--help`/`-h`/`web`/`server`/`autostart` 時由 am 處理，`am -- <參數>` 可強制轉交。
  - 網站配色 P03「晨霧藍＋海港藍」，固定淺色；訂閱制最多一個；主按鈕用主色。
  - Windows 互動選單、實際啟動 Claude Code、SmartScreen 由使用者另找人實機測試，不列 TODO。
- **已排除的做法**
  - 不清掉全部 `ANTHROPIC_*`，只清 `src/core/env.ts` 的 7 個管理變數（使用者有全域固定變數）。
  - 不匯入、不修改舊工具 `~/.local/bin/ai`、`~/.ai-profiles/`。
  - 不做 Docker、不做深色模式、不做網站登入密碼、不支援 Linux。
  - 不支援 Antigravity CLI（`agy`），原因見 `TODO.md`「已放棄」。
  - 不要 `git add -A` 前不檢查：Bun 打包會在根目錄留 `.*.bun-build`（約 60 MB），已加 `.gitignore` 並由 `scripts/build.ts` 清除；曾誤 commit 並已改寫歷史移除。
- **還沒解決的問題**：無待決事項。低優先 TODO 見 `TODO.md`（Homebrew、程式碼簽章、新版提醒）。
- **下一步**：等使用者新需求或 Windows 實機測試回報；有使用者可見改動時再發版（改 `package.json` version → 合併 `master` → `git tag vX.Y.Z` → push）。
- **相關檔案/位置**
  - 規則與指令：`CLAUDE.md`；架構：`docs/architecture.md`；追蹤：`TODO.md`、`PROGRESS.md`、`DONE.md`
  - 參數解析 `src/cli/args.ts`；選單 `src/cli/menu.ts`、`src/cli/prompt.ts`；環境變數 `src/core/env.ts`；設定 `src/core/config.ts`
  - 網站 `src/server/app.ts`、`src/web/`；開機自動執行 `src/platform/`
  - 打包 `scripts/build.ts`、`scripts/package.ts`；安裝 `scripts/install/install.sh`、`install.ps1`；截圖 `scripts/screenshots.ts`
  - CI `.github/workflows/test.yml`、`release.yml`、`scripts/ci/windows-smoke.ps1`
  - 本機實測要用 `AM_CONFIG_DIR`、`AM_INSTALL_DIR`、`HOME` 指向暫存目錄並換埠號（如 4999），避免停掉使用者 4141 的網站
