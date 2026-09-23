import { LockIcon, PlusIcon, SparkIcon, TerminalIcon } from "./icons";

const STEPS = [
  { icon: <PlusIcon />, title: "新增服務商", text: "填入服務商的網址與 API key，測試連線成功就能儲存。訂閱制已內建。" },
  { icon: <TerminalIcon />, title: "在終端機輸入 am", text: "先選服務商，再選模型。打字就能篩選，Tab 切換 1M。" },
  { icon: <SparkIcon />, title: "開始使用 Claude Code", text: "每個視窗可以用不同的服務商，互不影響，還會記住上次的選擇。" },
];

export function Guide({ configPath }: { configPath?: string }) {
  return (
    <section className="hero">
      <h1>三步驟開始使用</h1>
      <div className="steps">
        {STEPS.map((s, i) => (
          <div className="step" key={s.title}>
            <div className="icon">{s.icon}</div>
            <div className="num">{i + 1}</div>
            <h3>{s.title}</h3>
            <p>{s.text}</p>
          </div>
        ))}
      </div>
      <div className="privacy" title={configPath ? `設定檔位置：${configPath}` : undefined}>
        <LockIcon />
        <span>
          <b>資料只存在這台電腦。</b>API key 只會傳給你設定的服務商，不會上傳到其他任何地方。
        </span>
      </div>
    </section>
  );
}
