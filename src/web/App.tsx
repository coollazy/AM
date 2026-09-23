import { useEffect, useState } from "react";
import { api, type PublicConfig } from "./api";
import { Guide } from "./Guide";
import { ModelSettings } from "./ModelSettings";
import { Providers } from "./Providers";

type Tab = "providers" | "models";

export function App() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("providers");

  useEffect(() => {
    api.config().then(setConfig, (e: Error) => setError(e.message));
  }, []);

  return (
    <div className="page">
      <header>
        <h1>AM</h1>
        <span className="sub">Agent Account Manager · 管理 Claude Code 的服務商與模型</span>
      </header>
      {config && <Guide configPath={config.configPath} />}
      <nav>
        <button className={tab === "providers" ? "active" : ""} onClick={() => setTab("providers")}>
          服務商
        </button>
        <button className={tab === "models" ? "active" : ""} onClick={() => setTab("models")}>
          模型設定
        </button>
      </nav>
      {error && <p className="error">無法讀取設定：{error}</p>}
      {config && tab === "providers" && <Providers config={config} onChange={setConfig} />}
      {config && tab === "models" && <ModelSettings config={config} onChange={setConfig} />}
    </div>
  );
}
