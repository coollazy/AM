# AM · Agent Account Manager

在終端機輸入 `am`，就能選擇要用哪個服務商、哪個模型來啟動 Claude Code，不用每次手動切換 API key。

- 支援 Claude 訂閱制，以及提供 Anthropic 相容 API 的第三方服務商（例如 MixRoute、LinkAI）。
- 每個終端視窗可以各用不同的服務商與模型，互不影響。
- 開啟選單時即時查詢服務商目前可用的模型，服務商換模型也不用改設定。
- 在本機的管理網站新增、編輯服務商，不用手動改設定檔。

支援 macOS（Apple 晶片、Intel）與 Windows。使用前需先安裝 [Claude Code](https://claude.com/claude-code)。

## 安裝

下載符合你電腦的壓縮檔並解壓縮：

| 電腦 | 檔案 |
|---|---|
| Mac（Apple 晶片，M1 之後） | `am-<版本>-macos-arm64.zip` |
| Mac（Intel） | `am-<版本>-macos-x64.zip` |
| Windows | `am-<版本>-windows-x64.zip` |

**macOS**：在終端機進入解壓縮後的資料夾，執行：

```sh
./install.sh
```

會安裝到 `~/.local/bin/am`。如果畫面提示該目錄不在 PATH 中，照提示加入 `~/.zshrc` 後重新開啟終端機。

**Windows**：在 PowerShell 中進入解壓縮後的資料夾，執行：

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

會安裝到 `%LOCALAPPDATA%\Programs\am\am.exe` 並加入 PATH，完成後重新開啟終端機。Windows 可能跳出「Windows 已保護您的電腦」提示，點「其他資訊」→「仍要執行」。

**更新**：下載新版後同樣執行安裝腳本即可。腳本會先停止執行中的管理網站再替換，並保留開機自動執行的設定。

## 使用

1. 開啟管理網站，新增服務商：

   ```sh
   am web
   ```

   填入名稱、API 網址與 API key 後，按「測試連線」確認可以取得模型清單再儲存。

2. 設定開機自動執行管理網站（選擇性）：

   ```sh
   am autostart on
   ```

3. 啟動 Claude Code：

   ```sh
   am
   ```

   - 第一層選服務商；選訂閱制會直接啟動。
   - 第二層選模型：方向鍵選擇，直接打字篩選，`Tab` 切換 1M 上下文，`Esc` 返回。
   - 會記住每個服務商上次選的模型，下次預設停在那裡。

`am` 後面的參數會原樣交給 Claude Code，例如 `am --resume`。

## 指令

| 指令 | 用途 |
|---|---|
| `am [claude 參數...]` | 選擇服務商與模型後啟動 Claude Code |
| `am web` | 用瀏覽器開啟管理網站（未執行時自動啟動） |
| `am server` | 在前景執行管理網站 |
| `am autostart on` / `off` / `status` | 開啟、關閉、查看開機自動執行 |
| `am -- <參數...>` | 參數與上述子指令同名時，用這個方式交給 Claude Code |
| `am --version` | 顯示版本 |

## 設定與安全

- 設定存在 `~/.am/config.json`（Windows：`%USERPROFILE%\.am\config.json`），包含 API key，macOS 上只有你自己能讀取。
- 管理網站只接受本機連線（`http://127.0.0.1:4747`），並拒絕來自其他網站的請求。
- 啟動 Claude Code 時，AM 只會調整下列環境變數，其他環境變數維持不變：
  `ANTHROPIC_BASE_URL`、`ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_API_KEY`、`ANTHROPIC_MODEL`、`ANTHROPIC_DEFAULT_HAIKU_MODEL`、`CLAUDE_CODE_MAX_OUTPUT_TOKENS`、`CLAUDE_CODE_MAX_CONTEXT_TOKENS`。

## 開發

需要 [Bun](https://bun.sh)。

```sh
bun install
bun test              # 單元測試
bun run typecheck     # 型別檢查
bun run dev           # 開發模式執行管理網站
bun run package       # 產出所有平台的安裝包到 dist/release/
```

架構說明見 [`docs/architecture.md`](docs/architecture.md)。
