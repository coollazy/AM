import { parseKeys } from "./keys";
import { reduce, render, type PromptResult, type PromptState } from "./prompt";

export class NotATerminalError extends Error {
  constructor() {
    super("am 選單需要在終端機中執行");
  }
}

// 在終端機中執行選單：讀取按鍵、原地重繪畫面，選好後清掉選單畫面
export function runPrompt<T>(initial: PromptState<T>): Promise<PromptResult<T>> {
  const { stdin, stdout } = process;
  if (!stdin.isTTY || !stdout.isTTY) return Promise.reject(new NotATerminalError());

  return new Promise((resolve) => {
    let state = initial;
    let drawn = 0;
    const color = !process.env.NO_COLOR;

    const draw = () => {
      const lines = render(state, { width: stdout.columns || 80, height: stdout.rows || 24, color });
      stdout.write(clear(drawn) + lines.join("\n"));
      drawn = lines.length;
    };

    const finish = (result: PromptResult<T>) => {
      stdin.off("data", onData);
      stdout.off("resize", draw);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write(clear(drawn) + "\x1b[?25h");
      resolve(result);
    };

    const onData = (data: Buffer) => {
      for (const key of parseKeys(data.toString("utf8"))) {
        const next = reduce(state, key);
        state = next.state;
        if (next.result) return finish(next.result);
      }
      draw();
    };

    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
    stdout.on("resize", draw);
    stdout.write("\x1b[?25l");
    draw();
  });
}

// 回到上次畫面的第一行並清除到畫面底部
function clear(lines: number): string {
  if (lines === 0) return "";
  return "\r" + (lines > 1 ? `\x1b[${lines - 1}A` : "") + "\x1b[J";
}
