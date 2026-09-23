# CLAUDE.md

本檔案提供 Claude Code 在此專案中工作時的指引。

## 專案概述

AM 是一套在本機執行的網站，用來管理 Claude Code 的連線設定檔（訂閱制、各家 API key 服務商），搭配終端機的 `am` 指令選擇要用哪個設定啟動 Claude Code，每個終端視窗可以各用不同設定。網站與 `am` 指令一起安裝，網站開機自動在背景執行，並提供給其他人安裝使用。

`am` 指令的選單：

- 第一層：選服務商。
- 第二層：即時向該服務商查詢可用模型後列出供選擇。訂閱制沒有第二層，進入 Claude Code 後用內建的 `/model` 切換。

現有基礎（專案外，已可使用）：

- `~/.local/bin/ai`：終端機選單，選擇設定檔後啟動 `claude`。
- `~/.ai-profiles/*.sh`：每個設定檔一支，內含 `AI_NAME` 與 `ANTHROPIC_*` 環境變數，含真實 API key。

服務商 API 查詢結果（2026-09-23）：

- MixRoute：`https://api.mixroute.ai` 與 `https://console.mixroute.io` 都能用，`GET /v1/models` 可取得模型清單，`x-api-key` 與 `Authorization: Bearer` 兩種驗證方式都接受。清單裡混有 Gemini、GPT 等非 Claude 模型。
- LinkAI：`GET /v1/models` 可取得模型清單（8 個，全是 Claude，沒有 Haiku）；`POST /v1/messages` 正常。第一次查詢曾回傳 403「无权访问 AWSB-VIP稳 分组」，重試後正常，代表服務商可能暫時失敗，`am` 查詢要能處理失敗。
- 兩家都是 new-api 架構的服務。

> 注意：`~/.ai-profiles/` 內含真實 API key，讀取時不可把 key 的值輸出到對話或寫入專案、git。

## 技術棧

- 語言：TypeScript
- 執行與打包：Bun，打包成單一執行檔，使用者不需安裝任何執行環境
- 支援平台：Windows（其他平台待確認）

> 待補：網站框架、主要第三方套件。

## 專案結構

> 待補：目錄結構與各模組職責。

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
- 每個功能都必須有自動化測試，測試全部通過才算完成。

> 其餘規則待制定。

## 常用指令

> 待補：建置、測試、執行等指令。
