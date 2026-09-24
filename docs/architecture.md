# AM 架構設計

AM（Agent Account Manager）：本機網站管理 Claude Code 的連線設定，終端機 `am` 指令選擇服務商與模型後啟動 Claude Code。

## 1. 整體架構

一個執行檔包辦所有功能，`am` 選單與網站讀寫同一份設定檔，彼此不需要連線。網站沒在執行時，`am` 選單照樣可用。

```
┌───────────────┐        ┌────────────────┐
│ am（終端選單） │        │ am server（網站）│
└───────┬───────┘        └────────┬───────┘
        │        讀寫同一份設定檔        │
        └───────────────┬────────────────┘
                        ▼
               ~/.am/config.json
```

### 子指令

| 指令 | 用途 |
|---|---|
| `am [claude 參數...]` | 終端選單：選服務商 → 選模型 → 啟動 Claude Code。其餘參數原樣轉給 `claude`，例如 `am --resume` |
| `am web` | 用瀏覽器開啟管理網站；網站未執行時先在背景啟動 |
| `am server` | 在前景執行網站（開機自動執行用的就是這個） |
| `am autostart on` | 開啟開機自動執行 |
| `am autostart off` | 關閉開機自動執行 |
| `am autostart status` | 查看開機自動執行狀態 |

若要把與子指令同名的參數轉給 `claude`，用 `am -- <參數>`。

## 2. 技術選擇

| 項目 | 選擇 |
|---|---|
| 語言 | TypeScript |
| 執行與打包 | Bun，`bun build --compile` 打包成單一執行檔 |
| 網站後端 | Hono |
| 網站前端 | React（由 Bun 內建的 HTML 打包功能建置，嵌入執行檔） |
| 終端選單 | 自行實作（方向鍵選擇、打字篩選、Tab 切換 1M） |
| 單元測試 | `bun test` |
| 支援平台 | macOS（Apple Silicon、Intel）、Windows x64 |

## 3. 程式分層

```
src/
  core/        核心邏輯，不依賴終端或網站
    paths.ts       設定目錄路徑（macOS ~/.am、Windows %USERPROFILE%\.am）
    config.ts      設定檔讀寫（每次寫入前重新讀取＋原子寫入）
    providers.ts   向服務商查詢模型清單（逾時、重試一次）
    models.ts      過濾非 LLM 模型、判斷是否支援 1M、自動挑選輔助模型、模型上限
    env.ts         組出啟動 Claude Code 的環境變數
    launch.ts      以組好的環境變數啟動 claude
  cli/         終端機介面
    main.ts        執行檔入口，解析子指令
    menu.ts        兩層選單流程
    prompt.ts      可篩選的選擇元件
  server/      網站後端
    app.ts         Hono 應用程式、API 路由
    security.ts    請求來源檢查
  web/         網站前端（React）
  platform/    開機自動執行
    macos.ts
    windows.ts
tests/         單元測試，目錄結構對應 src/
```

原則：`core` 不讀取終端輸入、不處理 HTTP 請求；`cli` 與 `server` 只負責介面，邏輯都呼叫 `core`。需要連網或讀寫檔案的部分與純邏輯分開，讓純邏輯可以直接用模擬資料做單元測試。

## 4. 設定檔

位置：`~/.am/config.json`（Windows：`%USERPROFILE%\.am\config.json`）。可用環境變數 `AM_CONFIG_DIR` 指定其他目錄（例如測試時不動到正式設定）。macOS 上檔案權限設為 `600`、目錄 `700`。

不匯入舊工具（`~/.local/bin/ai`、`~/.ai-profiles/`）的設定，也不修改它們。

API key 以明碼存在設定檔中，不使用系統鑰匙圈（使用者決定維持現狀，2026-09-24）。

```json
{
  "version": 1,
  "server": { "port": 4141 },
  "providers": [
    { "id": "subscription", "type": "subscription", "name": "Claude 訂閱制" },
    {
      "id": "mixroute",
      "type": "api",
      "name": "MixRoute",
      "baseUrl": "https://api.mixroute.ai",
      "apiKey": "sk-...",
      "helperModel": null
    }
  ],
  "models": {
    "excludeKeywords": ["image", "tts", "transcribe", "embedding", "audio", "whisper", "dall-e", "realtime", "moderation", "sora", "veo"],
    "oneMillionPatterns": ["claude-opus-*", "claude-sonnet-*"],
    "defaultMaxOutputTokens": 8192,
    "limits": {
      "gpt-4o-mini": { "maxOutputTokens": 16384, "maxContextTokens": 128000 }
    }
  },
  "lastSelection": {
    "providerId": "mixroute",
    "byProvider": {
      "mixroute": { "model": "claude-opus-5-5", "oneMillion": true }
    }
  }
}
```

- `providers`：`type` 為 `subscription`（訂閱制）或 `api`（API key 服務商）。`helperModel` 為 `null` 時自動挑選。
- `models.limits`：依模型名稱設定，所有服務商共用。
- `lastSelection`：由 `am` 選單寫入；其餘欄位由網站寫入。

## 5. 終端選單流程

```
am
 └─ 第一層：選服務商（預設停在上次選的服務商）
     ├─ 訂閱制 → 直接啟動 Claude Code（進去後用 /model 切換）
     └─ API 服務商 → 查詢模型清單（逾時 10 秒，失敗自動重試一次）
         ├─ 成功 → 第二層：選模型
         │          ・方向鍵選擇、打字即時篩選
         │          ・Tab 切換 1M（只對支援 1M 的模型有效，畫面顯示目前狀態）
         │          ・預設停在上次選的模型與 1M 狀態
         │          ・Esc：有搜尋文字時先清除搜尋，否則返回第一層（第一層則離開）
         │          ・Ctrl+C：離開
         │          └─ Enter → 記住選擇 → 啟動 Claude Code
         └─ 仍失敗 → 顯示失敗原因 → 返回第一層
```

模型清單過濾：模型名稱包含 `excludeKeywords` 任一關鍵字即排除（不分大小寫）。

## 6. 啟動 Claude Code 的環境變數

AM 只管理下列 7 個變數。啟動前一律先清除這 7 個，再放入所選方案的值；清單以外的環境變數一律不動。

```
ANTHROPIC_BASE_URL
ANTHROPIC_AUTH_TOKEN
ANTHROPIC_API_KEY
ANTHROPIC_MODEL
ANTHROPIC_DEFAULT_HAIKU_MODEL
CLAUDE_CODE_MAX_OUTPUT_TOKENS
CLAUDE_CODE_MAX_CONTEXT_TOKENS
```

| 變數 | 訂閱制 | API 服務商 |
|---|---|---|
| `ANTHROPIC_BASE_URL` | 不設 | 服務商網址 |
| `ANTHROPIC_AUTH_TOKEN` | 不設 | 服務商 API key |
| `ANTHROPIC_API_KEY` | 不設（確保使用訂閱登入） | 不設 |
| `ANTHROPIC_MODEL` | 不設 | 所選模型，開啟 1M 時加上 `[1m]` |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | 不設 | `helperModel`；未設定時自動挑選：清單中有 Haiku 用 Haiku，否則 Sonnet，都沒有則用主模型 |
| `CLAUDE_CODE_MAX_OUTPUT_TOKENS` | 不設 | 非 Claude 模型（名稱不以 `claude-` 開頭）：`limits` 有設定用設定值，否則用 `defaultMaxOutputTokens`；Claude 模型：`limits` 有設定才設 |
| `CLAUDE_CODE_MAX_CONTEXT_TOKENS` | 不設 | `limits` 有設定才設 |

每個終端視窗執行 `am` 都是獨立程序，設定只傳給它啟動的 Claude Code，不影響其他視窗。

## 7. 服務商 API

- 模型清單：`GET {baseUrl}/v1/models`，標頭 `Authorization: Bearer {apiKey}`、`anthropic-version: 2023-06-01`，取回應中 `data[].id`。
- 已實測 MixRoute、LinkAI（皆為 new-api 架構）支援此格式。

## 8. 網站

- 只監聽 `127.0.0.1`，預設埠號 `4141`，可在設定檔修改。
- `am server` 啟動前先確認網站是否已在執行，已在執行就提示並結束；埠號被其他程式佔用時也提示並結束。
  - 注意：Bun 打包後的執行檔預設允許重複綁定同一埠號，啟動時必須明確設定 `reusePort: false`。
- 頁面：
  - 使用說明（頁首）：「三步驟開始使用」卡片＋資料安全提示條（滑鼠停留時顯示設定檔位置）。
  - 服務商列表：卡片顯示名稱、類型、網址主機名與輔助模型，不顯示 API key；上移、下移、刪除（需確認）收在「⋯」選單。
  - 訂閱制最多一個：Claude Code 只有一份登入資料，多個訂閱制項目效果相同。已有訂閱制時新增表單不提供此類型，API 也會拒絕；刪除後可重新加回。
  - 服務商編輯：網址、API key、「測試連線」（查詢模型清單）、輔助模型（從模型清單下拉選擇）。
  - 模型設定：排除關鍵字、支援 1M 的模型名單、非 Claude 模型預設輸出上限、個別模型上限。
- 前端建置結果嵌入執行檔，不需額外檔案。
- 視覺：溫暖親和風格，配色「晨霧藍＋海港藍」（背景 `#edf1f5`、主色 `#4f7aa8`、文字 `#1f2a37`），標題用襯線字；固定淺色，不跟隨系統深色模式。

### 安全

不設登入密碼。為防止瀏覽器中其他網站偷偷對本機網站發送請求：

- 檢查 `Host` 標頭必須是 `127.0.0.1:{port}` 或 `localhost:{port}`（防止 DNS rebinding）。
- 會修改資料的請求，`Origin` 標頭必須是 AM 網站本身，且內容必須是 JSON（擋掉其他網站用表單直接送出）。
- API 回應中的 API key 一律遮蔽；完整的 key 只存在設定檔，不會回傳給瀏覽器。

## 9. 開機自動執行

| 平台 | 方式 |
|---|---|
| macOS | 在 `~/Library/LaunchAgents/` 放一個 LaunchAgent 設定，登入時執行 `am server` |
| Windows | 在使用者的「啟動」資料夾放一個啟動腳本，登入時在背景（不顯示視窗）執行 `am server`；不需系統管理員權限 |

- `am autostart on`：寫入開機設定並立即在背景啟動網站。開機設定記錄的是當下執行檔的完整路徑，移動執行檔後需重新執行一次。
- `am autostart off`：移除開機設定，並透過網站的關閉 API（`POST /api/shutdown`，同樣經過來源檢查）停止執行中的網站。
- macOS 網站的輸出記錄在設定目錄下的 `server.log`。

## 10. 衝突處理

| 狀況 | 處理 |
|---|---|
| 網站與 `am` 同時寫設定檔 | 共用同一份檔案。每次寫入前重新讀取最新內容再修改，並先寫暫存檔再替換，避免寫壞 |
| 網站重複啟動 | 啟動前先檢查網站是否已在執行；埠號被佔用也提示並結束 |
| Windows 更新執行檔 | 執行中的執行檔會被鎖住，更新前需先停止網站 |

## 11. 開發順序

每項一個功能分支，測試通過即合併回 `develop`。

1. 專案骨架（`feature/project-setup`）
2. 核心（`feature/core`）
3. 管理網站（`feature/web`）
4. 終端選單（`feature/cli-menu`）
5. 開機自動執行（`feature/autostart`）
6. 發佈：打包 macOS、Windows 版本與安裝方式（`feature/release`）

## 12. 發佈與安裝

### 發佈

推送版本 tag（`v<版本>`）時，GitHub Actions（`.github/workflows/release.yml`，在 macOS 機器上執行）會：檢查 tag 與 `package.json` 版本一致 → 單元測試 → 型別檢查 → `bun run package` → 建立 GitHub Release 並上傳安裝包。

`bun run package` 產出 `dist/release/am-<平台>.zip`（macos-arm64、macos-x64、windows-x64）與 `SHA256SUMS.txt`。檔名不含版本號，才能用固定網址 `releases/latest/download/<檔名>` 下載最新版。每個壓縮檔包含執行檔、安裝腳本、README。

macOS 執行檔：打包會改動執行檔內容，使原本的簽章失效，而 macOS 會拒絕執行簽章無效的下載檔案。因此打包後以 `codesign --force --sign -` 重新做臨時簽章，並以 `codesign --verify --strict` 檢查；這一步只能在 macOS 上執行。

### 自動測試

推送到 `develop`、`master` 時，`.github/workflows/test.yml` 會：
- 在 macOS 與 Windows 上跑單元測試與型別檢查；
- 在 macOS 上以正式發版方式打包，再到 Windows 上執行 `scripts/ci/windows-smoke.ps1`，實測 `am.exe`（網站、開機自動執行、Claude Code 檢查）與兩種安裝方式（PowerShell 5.1）。

推送版本 tag 時只由 `release.yml` 打包發版，不另外等待測試。

### 安裝

| 平台 | 一行指令 | 安裝位置 |
|---|---|---|
| macOS | `curl -fsSL https://raw.githubusercontent.com/coollazy/AM/master/scripts/install/install.sh \| sh` | `~/.local/bin/am` |
| Windows | `irm https://raw.githubusercontent.com/coollazy/AM/master/scripts/install/install.ps1 \| iex` | `%LOCALAPPDATA%\Programs\am\am.exe` |

安裝腳本（`scripts/install/`）同時支援兩種用法：一行指令執行時從 GitHub Releases 下載；在解壓縮後的安裝包資料夾中執行時，安裝旁邊的執行檔。流程：

1. 判斷電腦類型（macOS 以 `hw.optional.arm64` 判斷，避免在 Rosetta 下誤判），下載壓縮檔與 `SHA256SUMS.txt` 並核對檢查碼。
2. 移除下載標記（macOS 隔離屬性、Windows `Unblock-File`）。
3. 若管理網站執行中，先呼叫關閉 API 停止（Windows 執行中的檔案會被鎖住）。
4. 替換執行檔。
5. 設定 PATH：macOS 依使用者的 shell 寫入 `~/.zshrc`、`~/.bash_profile` 或 `~/.profile`（已存在則不重複寫入）；Windows 寫入使用者 PATH 並更新目前視窗。
6. 原本有開機自動執行 → 重新執行 `am autostart on`；原本網站手動執行中 → 重新啟動；全新安裝 → 詢問是否開啟開機自動執行、是否開啟管理網站（預設「是」）。

可用環境變數：`AM_VERSION`（指定版本）、`AM_INSTALL_DIR`（安裝目錄）、`AM_NO_PROMPT=1`（不詢問）、`AM_NO_MODIFY_PATH=1`（macOS 不修改 shell 設定檔）、`AM_DOWNLOAD_URL`（下載位置，可指向鏡像站或測試伺服器）。

Windows 編碼：`irm | iex` 下載的腳本以 UTF-8 解讀（GitHub raw 回應帶 `charset=utf-8`），儲存庫中的 `install.ps1` 不加 BOM；壓縮檔內的 `install.ps1` 以 `powershell -File` 執行，Windows PowerShell 5.1 需要 BOM 才會正確讀取中文，由 `scripts/package.ts` 打包時加上。一行指令執行時腳本跑在使用者目前的 PowerShell 中，出錯只能用 `throw`，不可用 `exit`（會關掉視窗）。

Windows 上 `am` 啟動時會將終端機字碼頁切換為 UTF-8，以正確顯示中文。

### 啟動前檢查

`am` 選單開始前先確認找得到 `claude` 指令，找不到就提示安裝 Claude Code 並結束，避免選完服務商與模型才發現沒安裝。
