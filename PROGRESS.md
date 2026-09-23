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

### 架構設計
- 開始日期：2026-09-23
- 目前狀態：已決定：設定檔用新的 `~/.am/`（不匯入舊設定）、網站前端 React、網站安全只檢查請求來源（不設密碼）、Windows 開機用啟動資料夾、單元測試只用模擬資料、舊 `ai` 與 `~/.ai-profiles/` 完全不動。
- 下一步：使用者確認第 5 步的理解後，寫入 `docs/architecture.md`，並補齊 `CLAUDE.md` 的專案結構與常用指令。
- 待決問題：無。已確定：啟動時只清 AM 管理的 7 個變數（含 `ANTHROPIC_API_KEY`）、子指令 `am`／`am web`／`am server`／`am autostart on|off|status`、設定與上次選擇共用 `~/.am/config.json`（每次寫入前重新讀取＋原子寫入）、埠號被佔用時提示已在執行、Windows 更新前需停止網站。
