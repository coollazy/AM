import { useState, type FormEvent } from "react";
import { api, type PublicConfig } from "./api";

type LimitRow = { model: string; maxOutputTokens: string; maxContextTokens: string };

export function ModelSettings({ config, onChange }: { config: PublicConfig; onChange: (c: PublicConfig) => void }) {
  const m = config.models;
  const [excludeKeywords, setExcludeKeywords] = useState(m.excludeKeywords.join("\n"));
  const [oneMillionPatterns, setOneMillionPatterns] = useState(m.oneMillionPatterns.join("\n"));
  const [defaultMaxOutputTokens, setDefaultMaxOutputTokens] = useState(String(m.defaultMaxOutputTokens));
  const [limits, setLimits] = useState<LimitRow[]>(
    Object.entries(m.limits).map(([model, l]) => ({
      model,
      maxOutputTokens: l.maxOutputTokens?.toString() ?? "",
      maxContextTokens: l.maxContextTokens?.toString() ?? "",
    })),
  );
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  function updateRow(index: number, patch: Partial<LimitRow>) {
    setLimits((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const saved = await api.saveModelSettings({
        excludeKeywords: splitLines(excludeKeywords),
        oneMillionPatterns: splitLines(oneMillionPatterns),
        defaultMaxOutputTokens: toNumber(defaultMaxOutputTokens),
        limits: Object.fromEntries(
          limits.map((r) => [r.model, { maxOutputTokens: toNumber(r.maxOutputTokens), maxContextTokens: toNumber(r.maxContextTokens) }]),
        ),
      });
      onChange(saved);
      setMessage({ ok: true, text: "已儲存" });
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <section className="panel">
        <h2>模型清單過濾</h2>
        <div className="section-intro">
          <p>
            <strong>
              過濾的是：終端機輸入 <code>am</code>、選完服務商後，第二層列出的模型清單。
            </strong>
          </p>
          <p>
            <strong>為什麼要過濾：</strong>服務商提供的模型裡，有些是畫圖、語音、影片用的，不能拿來對話，在 Claude Code 裡選到會出錯；而且混在一起會讓清單變得很長、不好找（例如 MixRoute 的 112 個模型中有 23 個是這類模型）。
          </p>
          <p>模型名稱只要包含下面任一個關鍵字，就不會出現在清單中（不分大小寫）。</p>
          <p>新增服務商時「測試連線」列出的模型，也會套用同樣的過濾。</p>
        </div>
        <label>
          <span>排除關鍵字（一行一個）</span>
          <textarea value={excludeKeywords} onChange={(e) => setExcludeKeywords(e.target.value)} />
        </label>
      </section>

      <section className="panel">
        <h2>1M 上下文</h2>
        <div className="section-intro">
          <p>
            <strong>1M 上下文是什麼：</strong>Claude Code 在一次對話中能記住的內容量。一般模式約 20 萬 token，1M 模式可以到 100 萬 token，適合讀大型專案或進行很長的對話。內容越多，每次的用量越大，費用也會跟著增加。
          </p>
          <p>
            <strong>這裡設定的是：</strong>終端機輸入 <code>am</code> 後的第二層選單中，哪些模型可以按 <code>Tab</code> 切換成 1M 模式。
          </p>
          <p>
            <strong>為什麼要有這份名單：</strong>服務商的模型清單不會標示哪些模型支援 1M，所以要在這裡列出。不在名單上的模型，即使開啟 1M 也會以一般模式啟動。
          </p>
          <p>
            一行一個，<code>*</code> 代表任意文字，例如 <code>claude-opus-*</code> 代表所有 Opus 模型。
          </p>
        </div>
        <label>
          <span>支援 1M 的模型（一行一個）</span>
          <textarea value={oneMillionPatterns} onChange={(e) => setOneMillionPatterns(e.target.value)} />
        </label>
      </section>

      <section className="panel">
        <h2>模型上限</h2>
        <div className="section-intro">
          <p>
            <strong>這裡設定的是：</strong>透過 API 服務商使用模型時，Claude Code 每次最多要求模型回覆多少內容（輸出上限），以及模型能記住多少內容（上下文大小）。訂閱制不受影響。
          </p>
          <p>
            <strong>為什麼要設定：</strong>Claude Code 是為 Claude 模型設計的，預設每次最多要求回覆 32,000 token。GPT、Gemini 等非 Claude 模型的上限常常比較小（例如 gpt-4o-mini 只到 16,384），超過就會直接出錯。所以非 Claude 模型會自動改用下面的預設值，確保能正常使用；Claude 模型不受影響。
          </p>
          <p>
            <strong>什麼時候要個別設定：</strong>某個模型能回覆更長、想放寬限制，或某個模型用預設值仍然出錯時，在下方表格為它單獨設定。上下文大小只在 Claude Code 不認識的模型才需要填：它會假設為 20 萬 token，模型實際不同時再填。數值可以在服務商的模型說明中查到，不確定就不用填。
          </p>
        </div>
        <label>
          <span>非 Claude 模型的預設輸出上限（token）</span>
          <input type="number" min={1} value={defaultMaxOutputTokens} onChange={(e) => setDefaultMaxOutputTokens(e.target.value)} required />
        </label>
        {limits.length === 0 ? (
          <div className="empty-limits">還沒有個別設定。需要時按「新增一列」，為某個模型單獨設定上限。</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>模型名稱</th>
                  <th>輸出上限</th>
                  <th>上下文大小</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {limits.map((r, i) => (
                  <tr key={i}>
                    <td>
                      <input value={r.model} onChange={(e) => updateRow(i, { model: e.target.value })} placeholder="gpt-4o-mini" />
                    </td>
                    <td>
                      <input type="number" min={1} value={r.maxOutputTokens} onChange={(e) => updateRow(i, { maxOutputTokens: e.target.value })} placeholder="不設定" />
                    </td>
                    <td>
                      <input type="number" min={1} value={r.maxContextTokens} onChange={(e) => updateRow(i, { maxContextTokens: e.target.value })} placeholder="不設定" />
                    </td>
                    <td>
                      <button type="button" className="btn-danger" onClick={() => setLimits((rows) => rows.filter((_, j) => j !== i))}>
                        移除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="hint">個別設定會取代上面的預設值，所有服務商共用；留空的欄位不設定。</div>
        <div className="footer-actions">
          <button type="button" className="btn-soft" onClick={() => setLimits((rows) => [...rows, { model: "", maxOutputTokens: "", maxContextTokens: "" }])}>
            新增一列
          </button>
        </div>
      </section>

      <div className="footer-actions save-bar">
        {message && <span className={message.ok ? "success" : "error"}>{message.text}</span>}
        <button className="btn-primary" type="submit" disabled={saving}>
          {saving ? "儲存中…" : "儲存模型設定"}
        </button>
      </div>
    </form>
  );
}

function splitLines(text: string): string[] {
  return text.split(/[\n,]/).map((s) => s.trim()).filter((s) => s !== "");
}

function toNumber(text: string): number | undefined {
  const t = text.trim();
  return t === "" ? undefined : Number(t);
}
