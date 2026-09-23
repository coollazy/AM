import { useState } from "react";
import { api, type PublicConfig, type PublicProvider } from "./api";
import { ProviderForm } from "./ProviderForm";

type Editing = { mode: "new" } | { mode: "edit"; provider: PublicProvider } | null;

export function Providers({ config, onChange }: { config: PublicConfig; onChange: (c: PublicConfig) => void }) {
  const [editing, setEditing] = useState<Editing>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const providers = config.providers;

  async function run(action: () => Promise<PublicConfig>) {
    setError(null);
    try {
      onChange(await action());
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function move(index: number, delta: number) {
    const ids = providers.map((p) => p.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + delta, 0, id!);
    run(() => api.reorderProviders(ids));
  }

  if (editing) {
    return (
      <ProviderForm
        provider={editing.mode === "edit" ? editing.provider : null}
        onCancel={() => setEditing(null)}
        onSaved={(c) => {
          onChange(c);
          setEditing(null);
        }}
      />
    );
  }

  return (
    <section className="panel">
      <h2>服務商</h2>
      <p className="hint">終端機執行 am 時會依這裡的順序列出。</p>
      {providers.length === 0 && <p className="hint">尚未設定任何服務商。</p>}
      {providers.map((p, i) => (
        <div className="row" key={p.id}>
          <div className="info">
            <div className="name">
              {p.name}
              <span className="tag">{p.type === "subscription" ? "訂閱制" : "API"}</span>
            </div>
            {p.type === "api" && (
              <div className="meta">
                {p.baseUrl} · key {p.apiKeyMasked} · 輔助模型 {p.helperModel ?? "自動"}
              </div>
            )}
            {p.type === "subscription" && <div className="meta">使用 Claude 帳號登入，進入 Claude Code 後用 /model 切換模型</div>}
          </div>
          <div className="actions">
            <button className="small" disabled={i === 0} onClick={() => move(i, -1)} aria-label="上移">
              ↑
            </button>
            <button className="small" disabled={i === providers.length - 1} onClick={() => move(i, 1)} aria-label="下移">
              ↓
            </button>
            <button className="small" onClick={() => setEditing({ mode: "edit", provider: p })}>
              編輯
            </button>
            {confirmDelete === p.id ? (
              <>
                <button className="small danger" onClick={() => run(() => api.deleteProvider(p.id)).then(() => setConfirmDelete(null))}>
                  確定刪除
                </button>
                <button className="small" onClick={() => setConfirmDelete(null)}>
                  取消
                </button>
              </>
            ) : (
              <button className="small danger" onClick={() => setConfirmDelete(p.id)}>
                刪除
              </button>
            )}
          </div>
        </div>
      ))}
      {error && <p className="error">{error}</p>}
      <div className="footer-actions">
        <button className="primary" onClick={() => setEditing({ mode: "new" })}>
          新增服務商
        </button>
      </div>
    </section>
  );
}
