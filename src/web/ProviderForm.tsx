import { useState, type FormEvent } from "react";
import { api, type ModelsResult, type PublicConfig, type PublicProvider } from "./api";

type Props = {
  provider: PublicProvider | null;
  onCancel: () => void;
  onSaved: (config: PublicConfig) => void;
};

export function ProviderForm({ provider, onCancel, onSaved }: Props) {
  const isNew = provider === null;
  const [type, setType] = useState<"api" | "subscription">(provider?.type ?? "api");
  const [name, setName] = useState(provider?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(provider?.type === "api" ? provider.baseUrl : "");
  const [apiKey, setApiKey] = useState("");
  const [helperModel, setHelperModel] = useState(provider?.type === "api" ? (provider.helperModel ?? "") : "");
  const [models, setModels] = useState<ModelsResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function testConnection() {
    setTesting(true);
    setModels(null);
    try {
      setModels(await api.models({ providerId: provider?.id, baseUrl, apiKey }));
    } catch (e) {
      setModels({ ok: false, error: (e as Error).message });
    } finally {
      setTesting(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = type === "subscription" ? { type, name } : { type, name, baseUrl, apiKey, helperModel };
    try {
      onSaved(isNew ? await api.createProvider(body) : await api.updateProvider(provider.id, body));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const modelOptions = models?.ok ? models.models : [];
  const helperOptions = helperModel && !modelOptions.includes(helperModel) ? [helperModel, ...modelOptions] : modelOptions;

  return (
    <form className="panel" onSubmit={submit}>
      <h2>{isNew ? "新增服務商" : `編輯「${provider.name}」`}</h2>
      {isNew && (
        <label>
          <span>類型</span>
          <select value={type} onChange={(e) => setType(e.target.value as "api" | "subscription")}>
            <option value="api">API 服務商（使用 API key）</option>
            <option value="subscription">Claude 訂閱制（使用帳號登入）</option>
          </select>
        </label>
      )}
      <label>
        <span>名稱</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={type === "api" ? "例如：MixRoute" : "例如：Claude 訂閱制"} required />
      </label>
      {type === "api" && (
        <>
          <label>
            <span>API 網址</span>
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com" required />
          </label>
          <label>
            <span>API key</span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={isNew ? "" : `目前：${provider.type === "api" ? provider.apiKeyMasked : ""}（留空表示不變更）`}
              required={isNew}
              autoComplete="off"
            />
          </label>
          <div className="inline">
            <button type="button" onClick={testConnection} disabled={testing || baseUrl.trim() === "" || (isNew && apiKey.trim() === "")}>
              {testing ? "測試中…" : "測試連線"}
            </button>
            {models?.ok && (
              <span className="success">
                連線成功：{models.models.length} 個可用模型（服務商共 {models.total} 個，已排除非文字對話模型）
              </span>
            )}
            {models && !models.ok && <span className="error">連線失敗：{models.error}</span>}
          </div>
          {models?.ok && models.models.length > 0 && <div className="models">{models.models.join("、")}</div>}
          <label style={{ marginTop: 14 }}>
            <span>輔助模型（Claude Code 處理小任務時使用）</span>
            <select value={helperModel} onChange={(e) => setHelperModel(e.target.value)}>
              <option value="">自動（有 Haiku 用 Haiku，否則用 Sonnet）</option>
              {helperOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            {!models?.ok && <div className="hint">先按「測試連線」即可從模型清單中選擇。</div>}
          </label>
        </>
      )}
      {error && <p className="error">{error}</p>}
      <div className="footer-actions">
        <button type="button" onClick={onCancel}>
          取消
        </button>
        <button className="primary" type="submit" disabled={saving}>
          {saving ? "儲存中…" : "儲存"}
        </button>
      </div>
    </form>
  );
}
