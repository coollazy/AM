// 產生 README 用的截圖（docs/images/）。需要本機安裝 Google Chrome。
// 使用示範資料與暫存設定目錄，不會讀取或修改使用者的設定。
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPrompt, render, type PromptState } from "../src/cli/prompt";
import { updateConfig, type Provider } from "../src/core/config";
import { startServer } from "../src/server/serve";

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT = "docs/images";
const PORT = 4998;
const DEBUG_PORT = 9336;

// 示範資料
const tmp = await mkdtemp(join(tmpdir(), "am-screenshots-"));
const configPath = join(tmp, "config.json");
await updateConfig(configPath, (c) => {
  c.server.port = PORT;
  c.providers.push(
    { id: "mixroute", type: "api", name: "MixRoute", baseUrl: "https://api.mixroute.ai", apiKey: "sk-demo-000000000000", helperModel: null },
    { id: "linkai", type: "api", name: "LinkAI", baseUrl: "https://linkai.llc", apiKey: "sk-demo-000000000000", helperModel: "claude-sonnet-5" },
  );
});
const server = startServer({ configPath, port: PORT });

const chrome = Bun.spawn([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${join(tmp, "chrome")}`, "about:blank"], {
  stdout: "ignore",
  stderr: "ignore",
});

try {
  let target: { webSocketDebuggerUrl: string } | undefined;
  for (let i = 0; i < 50 && !target; i++) {
    try {
      target = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`, { method: "PUT" })).json();
    } catch {
      await Bun.sleep(200);
    }
  }
  if (!target) throw new Error("無法連線到 Chrome");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map<number, (v: any) => void>();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data as string);
    pending.get(m.id)?.(m);
    pending.delete(m.id);
  };
  const send = (method: string, params: object = {}) =>
    new Promise<any>((r) => {
      const i = ++id;
      pending.set(i, r);
      ws.send(JSON.stringify({ id: i, method, params }));
    });

  // 截取整頁（高度依內容），2 倍解析度讓 README 上的圖清晰
  async function capture(url: string, width: number, file: string) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 100, deviceScaleFactor: 2, mobile: false });
    await send("Page.navigate", { url });
    await Bun.sleep(1500);
    const { result } = await send("Runtime.evaluate", { expression: "Math.ceil(document.body.getBoundingClientRect().height + parseFloat(getComputedStyle(document.body).marginTop) + parseFloat(getComputedStyle(document.body).marginBottom))", returnByValue: true });
    const height = result.result.value as number;
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: false });
    await Bun.sleep(400);
    const shot = await send("Page.captureScreenshot", { format: "png" });
    await Bun.write(join(OUT, file), Buffer.from(shot.result.data, "base64"));
    console.log(`已產生：${join(OUT, file)}`);
  }

  await capture(`http://127.0.0.1:${PORT}/`, 1000, "web.png");

  // 終端機選單：以正式的選單畫面產生函式輸出，再排版成終端機視窗
  const providers: Provider[] = [
    { id: "subscription", type: "subscription", name: "Claude 訂閱制" },
    { id: "mixroute", type: "api", name: "MixRoute", baseUrl: "", apiKey: "", helperModel: null },
    { id: "linkai", type: "api", name: "LinkAI", baseUrl: "", apiKey: "", helperModel: null },
  ];
  const layer1 = createPrompt<Provider>({
    title: "選擇服務商",
    items: providers.map((p) => ({ label: p.name, value: p, hint: p.type === "subscription" ? "訂閱制" : undefined })),
    initial: providers[1],
    escape: "cancel",
  });
  const models = ["claude-fable-5-1", "claude-haiku-4-5-20251001", "claude-opus-5", "claude-opus-5-5", "claude-sonnet-4-6", "claude-sonnet-5", "gemini-2.5-pro", "gpt-5.5"];
  const layer2 = createPrompt<string>({
    title: "選擇模型 · MixRoute",
    items: models.map((m) => ({ label: m, value: m })),
    initial: "claude-opus-5-5",
    toggle: { label: "1M 上下文", on: true, available: (m) => /^claude-(opus|sonnet)-/.test(m) },
    escape: "back",
  });
  const terminal = (state: PromptState<any>, title: string) =>
    `<div class="win"><div class="bar"><i></i><i></i><i></i><span>${title}</span></div><pre>${ansiToHtml(
      "$ am\n" + render(state, { width: 76, height: 16, color: true }).join("\n"),
    )}</pre></div>`;
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;padding:28px;background:#edf1f5;display:flex;gap:24px;align-items:flex-start;font-family:-apple-system,"PingFang TC",sans-serif}
    .win{flex:1;background:#1f2a37;border-radius:12px;overflow:hidden;box-shadow:0 12px 32px -12px rgba(31,42,55,.45)}
    .bar{display:flex;align-items:center;gap:7px;padding:11px 14px;background:#283545}
    .bar i{width:12px;height:12px;border-radius:50%;background:#ff5f57}.bar i:nth-child(2){background:#febc2e}.bar i:nth-child(3){background:#28c840}
    .bar span{margin-left:10px;color:#9aa4b1;font-size:13px}
    pre{margin:0;padding:16px 18px 20px;color:#e6eaef;font:14px/1.6 "SF Mono",Menlo,Consolas,"PingFang TC",monospace}
    .b{font-weight:700}.d{color:#8793a3}.r{color:#f28b82}.g{color:#7ee2a8}.c{color:#7cc4ff}
  </style>${terminal(layer1, "第一層：選服務商")}${terminal(layer2, "第二層：選模型（Tab 切換 1M）")}`;
  const htmlPath = join(tmp, "terminal.html");
  await Bun.write(htmlPath, html);
  await capture(`file://${htmlPath}`, 1280, "terminal.png");

  ws.close();
} finally {
  chrome.kill();
  server.stop(true);
  await rm(tmp, { recursive: true, force: true });
}

// 逐段解析 ANSI 顏色碼，支援巢狀（例如選中行的顏色裡包著淡色標記）
function ansiToHtml(text: string): string {
  const classes: Record<string, string> = { "1": "b", "2": "d", "31": "r", "32": "g", "36": "c" };
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let open = 0;
  let html = "";
  for (const part of text.split(/(\x1b\[\d+m)/)) {
    const code = /^\x1b\[(\d+)m$/.exec(part)?.[1];
    if (code === undefined) html += escape(part);
    else if (code === "0") {
      html += "</span>".repeat(open);
      open = 0;
    } else {
      html += `<span class="${classes[code] ?? ""}">`;
      open++;
    }
  }
  return html + "</span>".repeat(open);
}
