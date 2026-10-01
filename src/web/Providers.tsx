import { useEffect, useRef, useState } from "react";
import { api, type PublicConfig, type PublicProvider } from "./api";
import { MoreIcon, PlusIcon, UserIcon } from "./icons";
import { ProviderForm } from "./ProviderForm";

type Editing = { mode: "new" } | { mode: "edit"; provider: PublicProvider } | null;

export function Providers({ config, onChange }: { config: PublicConfig; onChange: (c: PublicConfig) => void }) {
  const [editing, setEditing] = useState<Editing>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const providers = config.providers;

  async function run(action: () => Promise<PublicConfig>) {
    setError(null);
    setNotice(null);
    try {
      const next = await action();
      if (next.notice) setNotice(next.notice);
      onChange(next);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function login(p: PublicProvider) {
    setError(null);
    try {
      await api.loginProvider(p.id);
      setNotice(`已開啟終端機，請在瀏覽器完成「${p.name}」的授權；完成後回到這個頁面就會顯示登入的帳號。`);
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
        canAddSubscription={config.canAddSubscription}
        hasPrimary={providers.some((p) => p.type === "subscription" && p.primary)}
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
              {p.type === "subscription" && p.primary && <span className="badge">主帳號</span>}
            </div>
            {p.type === "subscription" ? (
              <>
                <div className="meta">{p.login ? [p.login.email, p.login.organization].filter(Boolean).join(" · ") : "尚未登入"}</div>
                <div className="note">
                  {p.primary
                    ? "直接在終端機輸入 claude 時使用這個帳號。"
                    : "只能透過 am 選擇。設定、skills、對話紀錄與 memory 和主帳號共用；MCP 沿用主帳號，在這個帳號新增或刪除的 MCP 下次啟動會被還原。"}
                </div>
                {p.warnings.map((w) => (
                  <div className="warn" key={w}>
                    {w}
                  </div>
                ))}
              </>
            ) : (
              <div className="meta">{`${hostOf(p.baseUrl)} · 輔助模型：${p.helperModel ?? "自動"}`}</div>
            )}
          </div>
          <div className="card-actions">
            {p.type === "subscription" && !p.login && config.loginButton && (
              <button className="btn-primary" onClick={() => login(p)}>
                登入
              </button>
            )}
            <button className="btn-soft" onClick={() => setEditing({ mode: "edit", provider: p })}>
              編輯
            </button>
            <MoreMenu
              canMoveUp={i > 0}
              canMoveDown={i < providers.length - 1}
              onMoveUp={() => move(i, -1)}
              onMoveDown={() => move(i, 1)}
              onDelete={() => run(() => api.deleteProvider(p.id))}
              confirmText={deleteConfirmText(p)}
            />
          </div>
        </div>
      ))}
      {notice && <p className="notice">{notice}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function deleteConfirmText(p: PublicProvider): string {
  if (p.type !== "subscription") return "確定要刪除嗎？";
  if (p.primary) return "只會從選單移除，不會登出，也不會動到 ~/.claude。確定要刪除嗎？";
  return "會登出這個帳號並刪除它的資料夾；共用的設定與對話紀錄不受影響。確定要刪除嗎？";
}

type MoreMenuProps = {
  confirmText: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
};

function MoreMenu({ confirmText, canMoveUp, canMoveDown, onMoveUp, onMoveDown, onDelete }: MoreMenuProps) {
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
              <div className="confirm">{confirmText}</div>
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
