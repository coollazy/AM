import { createInterface } from "node:readline/promises";

// 在終端機詢問是/否；直接按 Enter 採用預設值
export async function askYesNo(question: string, defaultYes: boolean): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${question} ${defaultYes ? "[Y/n]" : "[y/N]"} `)).trim().toLowerCase();
    if (answer === "") return defaultYes;
    return answer.startsWith("y");
  } finally {
    rl.close();
  }
}
