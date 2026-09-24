# TODO

待辦事項清單。開始進行某項工作時，將它移到 `PROGRESS.md`。

## 格式

```
- [ ] 項目描述（優先序：高／中／低）
```

## 待辦

- [ ] 提供 Homebrew 安裝方式（需要另建 tap 儲存庫）（優先序：低）
- [ ] 執行檔程式碼簽章（macOS 公證、Windows 簽章），避免系統跳出安全警告（優先序：低）
- [ ] `am` 選單上方提示有新版本（一天最多查一次，查詢失敗略過）（優先序：低，使用者決定先不做）

## 已放棄

- 支援 Antigravity CLI（`agy`，Google 的 Gemini 訂閱版）（2026-09-24 放棄）
  - 訂閱制：選了只會直接啟動 `agy`，跟使用者自己輸入 `agy` 一樣，透過 `am` 沒有好處。
  - API key 服務商（例如 MixRoute）：技術上可行（2026-09-24 實測 MixRoute 可用 Gemini 格式對話），但 `agy` 要改用 API key，必須在自己的設定檔 `~/.gemini/antigravity-cli/settings.json` 寫入 `modelProvider: "gemini"`，不能只用環境變數切換（官方文件確認）。這個設定會影響整台電腦的 `agy`，無法做到每個終端各用不同設定；替 `agy` 換暫時家目錄的變通方法會讓它執行的 git、ssh 等指令讀不到使用者設定，不夠穩定。
