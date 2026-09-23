import { useEffect, useRef, useState } from "react";
import { api, type PublicConfig, type PublicProvider } from "./api";
import { MoreIcon, PlusIcon, UserIcon } from "./icons";
import { ProviderForm } from "./ProviderForm";

type Editing = { mode: "new" } | { mode: "edit"; provider: PublicProvider } | null;

export function Providers({ config, onChange }: { config: PublicConfig; onChange: (c: PublicConfig) => void }) {
  const [editing, setEditing] = useState<Editing>(null);
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
        canAddSubscription={!providers.some((p) => p.type === "subscription")}
        onCancel={() => setEditing(null)}
        onSaved={(c) => {
          onChange(c);
          setEditing(null);
        }}
      />
    );
  }

  return (
    <section>
      <div className="section-head">
        <div>
          <h2>服務商</h2>
          <p>終端機選單會依這個順序列出</p>
        </div>
        <button className="btn-primary" onClick={() => setEditing({ mode: "new" })}>
          <PlusIcon />
          新增服務商
        </button>
      </div>
      {providers.length === 0 && <div className="empty">還沒有服務商，按「新增服務商」開始設定。</div>}
      {providers.map((p, i) => (
        <div className="card" key={p.id}>
          <div className={`avatar c${p.type === "subscription" ? 0 : 1 + (i % 3)}`}>
            {p.type === "subscription" ? <UserIcon /> : initial(p.name)}
          </div>
          <div className="info">
            <div className="name">
              {p.name}
              <span className={p.type === "subscription" ? "badge sub" : "badge"}>{p.type === "subscription" ? "訂閱制" : "API"}</span>
            </div>
            <div className="meta">{p.type === "subscription" ? "使用你的 Claude 帳號登入" : `${hostOf(p.baseUrl)} · 輔助模型：${p.helperModel ?? "自動"}`}</div>
          </div>
          <div className="card-actions">
            <button className="btn-soft" onClick={() => setEditing({ mode: "edit", provider: p })}>
              編輯
            </button>
            <MoreMenu
              canMoveUp={i > 0}
              canMoveDown={i < providers.length - 1}
              onMoveUp={() => move(i, -1)}
              onMoveDown={() => move(i, 1)}
              onDelete={() => run(() => api.deleteProvider(p.id))}
            />
          </div>
        </div>
      ))}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

type MoreMenuProps = {
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
};

function MoreMenu({ canMoveUp, canMoveDown, onMoveUp, onMoveDown, onDelete }: MoreMenuProps) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 點選單外面或按 Esc 關閉
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function close() {
    setOpen(false);
    setConfirming(false);
  }

  function pick(action: () => void) {
    close();
    action();
  }

  return (
    <div ref={ref}>
      <button className="btn-icon" aria-label="更多操作" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}>
        <MoreIcon />
      </button>
      {open && (
        <div className="menu" role="menu">
          {confirming ? (
            <>
              <div className="confirm">確定要刪除嗎？</div>
              <div className="confirm-actions">
                <button className="btn-soft" onClick={() => setConfirming(false)}>
                  取消
                </button>
                <button className="btn-danger" onClick={() => pick(onDelete)}>
                  刪除
                </button>
              </div>
            </>
          ) : (
            <>
              <button role="menuitem" disabled={!canMoveUp} onClick={() => pick(onMoveUp)}>
                上移
              </button>
              <button role="menuitem" disabled={!canMoveDown} onClick={() => pick(onMoveDown)}>
                下移
              </button>
              <button role="menuitem" className="danger" onClick={() => setConfirming(true)}>
                刪除
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function initial(name: string): string {
  return [...name.trim()][0]?.toUpperCase() ?? "?";
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
