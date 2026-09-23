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
        <label>
          <span>排除關鍵字（一行一個）</span>
          <textarea value={excludeKeywords} onChange={(e) => setExcludeKeywords(e.target.value)} />
          <div className="hint">模型名稱包含任一關鍵字就不列出，用來排除圖片、語音、影片等非文字對話模型。不分大小寫。</div>
        </label>
      </section>

      <section className="panel">
        <h2>1M 上下文</h2>
        <label>
          <span>支援 1M 的模型（一行一個，可用 * 萬用字元）</span>
          <textarea value={oneMillionPatterns} onChange={(e) => setOneMillionPatterns(e.target.value)} />
          <div className="hint">終端選單中只有這些模型可以按 Tab 切換 1M。</div>
        </label>
      </section>

      <section className="panel">
        <h2>模型上限</h2>
        <label>
          <span>非 Claude 模型的預設輸出上限（token）</span>
          <input type="number" min={1} value={defaultMaxOutputTokens} onChange={(e) => setDefaultMaxOutputTokens(e.target.value)} required />
          <div className="hint">GPT、Gemini 等模型的輸出上限通常比 Claude Code 預設的小，未個別設定時套用這個值。</div>
        </label>
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
                    <button type="button" className="small danger" onClick={() => setLimits((rows) => rows.filter((_, j) => j !== i))}>
                      移除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="hint">個別設定會取代預設值；所有服務商共用。</div>
        <div className="footer-actions">
          <button type="button" className="small" onClick={() => setLimits((rows) => [...rows, { model: "", maxOutputTokens: "", maxContextTokens: "" }])}>
            新增一列
          </button>
        </div>
      </section>

      {message && <p className={message.ok ? "success" : "error"}>{message.text}</p>}
      <div className="footer-actions">
        <button className="primary" type="submit" disabled={saving}>
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
