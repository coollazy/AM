# CLAUDE.md

本檔案提供 Claude Code 在此專案中工作時的指引。

## 專案概述

AM（Agent Account Manager）是一套在本機執行的網站，用來管理 Claude Code 的連線設定檔（訂閱制、各家 API key 服務商），搭配終端機的 `am` 指令選擇要用哪個設定啟動 Claude Code，每個終端視窗可以各用不同設定。網站與 `am` 指令一起安裝，網站開機自動在背景執行，並提供給其他人安裝使用。

`am` 指令的選單：

- 第一層：選服務商。
- 第二層：即時向該服務商查詢可用模型後列出供選擇，只列文字對話（LLM）模型，不列圖片、語音、嵌入等其他功能的模型（依名稱關鍵字排除，關鍵字可在網站調整）。
  - 操作：方向鍵選擇，打字即時篩選。
  - 1M 上下文：在清單中按 `Tab` 切換開／關。支援 1M 的模型名單在網站維護，預設 Opus、Sonnet 系列。
  - 每個服務商記住上次選擇的模型與 1M 狀態，下次預設停在該選項。
  - 查詢失敗：自動重試一次，仍失敗則顯示失敗原因，可返回第一層換服務商。
- 非 Claude 模型的上限：預設自動套用保守的輸出上限（`CLAUDE_CODE_MAX_OUTPUT_TOKENS=8192`）；網站上為模型個別設定輸出上限（`CLAUDE_CODE_MAX_OUTPUT_TOKENS`）或上下文大小（`CLAUDE_CODE_MAX_CONTEXT_TOKENS`）時，改用個別設定。
- 輔助模型（`ANTHROPIC_DEFAULT_HAIKU_MODEL`）：不在選單中選，於網站為每個服務商設定一次（從模型清單下拉選擇）；未設定時自動挑選，清單有 Haiku 用 Haiku，否則用 Sonnet。訂閱制沒有第二層，進入 Claude Code 後用內建的 `/model` 切換。

使用者既有的舊工具（專案外）。**不可修改、不可刪除、AM 也不自動匯入**，使用者會在 AM 網站上從零手動設定：

- `~/.local/bin/ai`：終端機選單，選擇設定檔後啟動 `claude`。
- `~/.ai-profiles/*.sh`：每個設定檔一支，內含 `AI_NAME` 與 `ANTHROPIC_*` 環境變數，含真實 API key。

服務商 API 查詢結果（2026-09-23）：

- MixRoute：`https://api.mixroute.ai` 與 `https://console.mixroute.io` 都能用，`GET /v1/models` 可取得模型清單，`x-api-key` 與 `Authorization: Bearer` 兩種驗證方式都接受。清單裡混有 Gemini、GPT 等非 Claude 模型。
- LinkAI：`GET /v1/models` 可取得模型清單（8 個，全是 Claude，沒有 Haiku）；`POST /v1/messages` 正常。第一次查詢曾回傳 403「无权访问 AWSB-VIP稳 分组」，重試後正常，代表服務商可能暫時失敗，`am` 查詢要能處理失敗。
- 兩家都是 new-api 架構的服務。
- MixRoute 的非 Claude 模型可在 Claude Code 中使用（實測 `gpt-4o-mini`、`gemini-2.5-flash` 的對話與工具呼叫皆成功），但需注意：
  - Claude Code 預設要求輸出上限 32000 token，超過模型上限會失敗（`gpt-4o-mini` 上限 16384），需設定 `CLAUDE_CODE_MAX_OUTPUT_TOKENS`。
  - Claude Code 不認識的模型會假設上下文為 200k，可用 `CLAUDE_CODE_MAX_CONTEXT_TOKENS` 指定實際大小。

> 注意：`~/.ai-profiles/` 內含真實 API key，讀取時不可把 key 的值輸出到對話或寫入專案、git。

## 技術棧

- 語言：TypeScript
- 執行與打包：Bun，打包成單一執行檔，使用者不需安裝任何執行環境
- 支援平台：macOS、Windows（不支援 Linux）
- 網站後端：Hono；網站前端：React（由 Bun 內建的打包功能建置並嵌入執行檔）
- 單元測試：`bun test`

完整架構見 `docs/architecture.md`。

## 專案結構

```
src/
  core/       核心邏輯（設定檔、查詢模型、過濾模型、環境變數、啟動 claude），不依賴終端或網站
  cli/        終端選單與子指令入口
  server/     網站後端（Hono）
  web/        網站前端（React）
  platform/   開機自動執行（macOS、Windows）
tests/        單元測試，目錄結構對應 src/
docs/         設計文件
```

`cli` 與 `server` 只負責介面，邏輯一律放在 `core`。

## 開發規則

### 工作追蹤

每次開發都必須同步更新以下三個檔案：

- `TODO.md`：待辦事項。新需求或發現的待做工作都記在這裡。
- `PROGRESS.md`：進行中的工作。記錄目前狀態、下一步與待決問題，讓工作在 /compact 或重新開啟對話後能接續。
- `DONE.md`：已完成項目。依完成時間由舊到新排列，新項目一律加在最下方。

項目的流向：`TODO.md` → `PROGRESS.md` → `DONE.md`。開始做某項工作時，把它從 TODO 移到 PROGRESS；做完後從 PROGRESS 移到 DONE 並標上完成日期。

### Git 分支

- `develop`：開發主要分支，功能分支都從這裡開出、也合併回這裡。
- `master`：只放正式版本。只從 `develop` merge 進來，merge 後即為定版，並打上版本 tag。
- 不可直接在 `master` 上 commit。
- 功能分支命名：
  - `feature/<簡述>`：新功能
  - `fix/<簡述>`：修正錯誤
  - `docs/<簡述>`、`refactor/<簡述>`、`chore/<簡述>`：文件、重構、雜項
- 合併一律在本機進行，不開 PR。
- 版本 tag 格式：`v<主版號>.<次版號>.<修訂號>`，例如 `v1.0.0`。
- **不可 push**，除非使用者明確要求。

### Commit 訊息

採用 Conventional Commits 格式：

```
<type>: <description>
```

常用 type：`feat`、`fix`、`docs`、`refactor`、`test`、`chore`。

### 開發流程

- 採輕量流程：需求討論清楚後直接開發，不另寫正式規格文件。
- 每個功能都必須有單元測試，測試全部通過才算完成。
- 單元測試不可連線到任何外部服務，一律使用模擬資料；模擬資料要餵給正式程式碼處理，不可另寫一套與正式程式碼無關的假邏輯。

> 其餘規則待制定。

## 常用指令

```sh
bun install          # 安裝套件
bun test             # 執行單元測試
bun run typecheck    # 型別檢查
bun run start        # 直接執行 am（不打包），例如 bun run start -- --help
bun run dev          # 開發模式執行管理網站（修改後自動重載）
bun run build        # 打包本機平台執行檔到 dist/am
bun run build:all    # 打包 macOS（arm64、x64）與 Windows x64 執行檔到 dist/
bun run package      # 產出給使用者的安裝包（zip＋SHA256SUMS）到 dist/release/
bun run screenshots  # 重新產生 README 截圖（docs/images/）；網站或選單畫面改動後要重跑
```

每次完成功能前必須 `bun test` 與 `bun run typecheck` 都通過。

實際執行測試時，用 `AM_CONFIG_DIR=/tmp/...` 指定暫存設定目錄、`AM_INSTALL_DIR` 指定暫存安裝目錄、`HOME` 指定暫存家目錄（安裝腳本會修改 `~/.zshrc`），不可動到使用者的 `~/.am`、`~/.local/bin`、`~/.zshrc`。暫存設定要另外指定埠號（例如 4999），否則安裝腳本會把使用者正在執行的管理網站當成要更新的對象停掉。

### 撰寫注意事項

- Shell／PowerShell 腳本中，變數後面緊接中文時一律加大括號（`${DEST}（`），否則會被當成變數名稱的一部分。
- 儲存庫中的 `scripts/install/install.ps1` 不加 BOM（給 `irm | iex` 使用）；壓縮檔內的版本由 `scripts/package.ts` 加上 BOM（給 Windows PowerShell 5.1 以 `-File` 執行）。
- `install.ps1` 可能以 `irm | iex` 在使用者目前的 PowerShell 中執行，出錯一律用 `throw`，不可用 `exit`。
- macOS 執行檔打包後必須重新臨時簽章（`scripts/build.ts` 已處理），所以 macOS 版只能在 macOS 上打包。
- 在 zsh 中不可用 `path` 當變數名稱（它與 `PATH` 連動）。
