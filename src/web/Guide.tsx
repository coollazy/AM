import { useState } from "react";

const STORAGE_KEY = "am.guide.collapsed";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  } catch {}
}

export function Guide({ configPath }: { configPath?: string }) {
  const [collapsed, setCollapsed] = useState(readCollapsed);

  function toggle() {
    setCollapsed(!collapsed);
    writeCollapsed(!collapsed);
  }

  return (
    <section className="panel guide">
      <div className="guide-head">
        <h2>使用說明</h2>
        <button className="small" onClick={toggle} aria-expanded={!collapsed}>
          {collapsed ? "展開" : "收合"}
        </button>
      </div>
      {!collapsed && (
        <div className="guide-body">
          <div>
            <h3>使用方法</h3>
            <ol>
              <li>
                <strong>新增服務商</strong>：在下方「服務商」按「新增服務商」，填入名稱、API 網址與 API key，按「測試連線」確認可以取得模型後儲存。Claude 訂閱制已內建，不需要設定。
              </li>
              <li>
                <strong>在終端機輸入 <code>am</code></strong>：先選服務商，再選模型，就會啟動 Claude Code。
                <ul>
                  <li>方向鍵選擇、直接打字篩選、<kbd>Enter</kbd> 確認、<kbd>Esc</kbd> 返回</li>
                  <li>支援 1M 的模型可以按 <kbd>Tab</kbd> 切換 1M 上下文</li>
                  <li>選訂閱制會直接啟動，進入後用 <code>/model</code> 切換模型</li>
                </ul>
              </li>
              <li>
                <strong>每個終端視窗各自獨立</strong>：不同視窗可以同時用不同的服務商與模型，互不影響；每個服務商會記住上次選的模型。
              </li>
            </ol>
          </div>
          <div>
            <h3>資料安全</h3>
            <ul>
              <li>
                所有設定（包含 API key）只存在這台電腦{configPath ? <>的 <code>{configPath}</code></> : ""}，不會上傳到任何地方。
              </li>
              <li>這個網站只有這台電腦能開啟，其他裝置或網站都無法存取。</li>
              <li>API key 只會送到你自己設定的服務商：測試連線、查詢模型清單，以及 Claude Code 對話時使用。</li>
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
