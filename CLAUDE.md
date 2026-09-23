# CLAUDE.md

本檔案提供 Claude Code 在此專案中工作時的指引。

## 專案概述

AM 是一套在本機執行的網站，用來管理 Claude Code 的連線設定檔（訂閱制、各家 API key 服務商），搭配終端機的 `ai` 指令選擇要用哪個設定啟動 Claude Code，每個終端視窗可以各用不同設定。

現有基礎（專案外，已可使用）：

- `~/.local/bin/ai`：終端機選單，選擇設定檔後啟動 `claude`。
- `~/.ai-profiles/*.sh`：每個設定檔一支，內含 `AI_NAME` 與 `ANTHROPIC_*` 環境變數，含真實 API key。

> 注意：`~/.ai-profiles/` 內含真實 API key，讀取時不可把 key 的值輸出到對話或寫入專案、git。

## 技術棧

> 待補：語言、框架、主要第三方套件。

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

> 其餘規則待制定。

## 常用指令

> 待補：建置、測試、執行等指令。
