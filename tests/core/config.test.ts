import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigError, defaultConfig, loadConfig, normalizeConfig, normalizeProvider, updateConfig } from "../../src/core/config";
import { configPath } from "../../src/core/paths";

let home: string;
let path: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "am-test-"));
  path = configPath(home, {});
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe("loadConfig", () => {
  test("設定檔不存在時回傳預設設定，且不建立檔案", async () => {
    expect(await loadConfig(path)).toEqual(defaultConfig());
    expect(await Bun.file(path).exists()).toBe(false);
  });

  test("不是 JSON 時丟出 ConfigError", async () => {
    await updateConfig(path, () => {});
    await writeFile(path, "{壞掉");
    await expect(loadConfig(path)).rejects.toBeInstanceOf(ConfigError);
  });
});

describe("updateConfig", () => {
  test("寫入後可以讀回，檔案權限只有自己可讀寫", async () => {
    await updateConfig(path, (c) => {
      c.providers.push({ id: "mixroute", type: "api", name: "MixRoute", baseUrl: "https://api.mixroute.ai/", apiKey: "sk-1", helperModel: null });
    });
    const config = await loadConfig(path);
    expect(config.providers.map((p) => p.id)).toEqual(["subscription", "mixroute"]);
    // 網址結尾的 / 會被移除
    expect(config.providers[1]).toMatchObject({ baseUrl: "https://api.mixroute.ai" });
    if (process.platform !== "win32") {
      expect((await stat(path)).mode & 0o777).toBe(0o600);
      expect((await stat(join(home, ".am"))).mode & 0o777).toBe(0o700);
    }
  });

  test("每次寫入前重新讀取，不會覆蓋另一方剛寫入的內容", async () => {
    await updateConfig(path, (c) => {
      c.server.port = 5000;
    });
    // 模擬網站與 am 選單各自寫入不同欄位
    await updateConfig(path, (c) => {
      c.lastSelection.providerId = "subscription";
    });
    const config = await loadConfig(path);
    expect(config.server.port).toBe(5000);
    expect(config.lastSelection.providerId).toBe("subscription");
  });

  test("修改內容不合法時不寫入", async () => {
    await updateConfig(path, () => {});
    const before = await readFile(path, "utf8");
    await expect(
      updateConfig(path, (c) => {
        c.server.port = 0;
      }),
    ).rejects.toBeInstanceOf(ConfigError);
    expect(await readFile(path, "utf8")).toBe(before);
  });

  test("不留下暫存檔", async () => {
    await updateConfig(path, () => {});
    const files = await Array.fromAsync(new Bun.Glob("*").scan(join(home, ".am")));
    expect(files).toEqual(["config.json"]);
  });
});

describe("normalizeConfig", () => {
  test("缺少的欄位補上預設值", () => {
    expect(normalizeConfig({})).toEqual(defaultConfig());
  });

  test("服務商 id 重複時丟出錯誤", () => {
    const dup = { id: "a", type: "subscription", name: "A" };
    expect(() => normalizeConfig({ providers: [dup, dup] })).toThrow("重複");
  });

  test("格式不對的上次選擇會被略過", () => {
    const config = normalizeConfig({ lastSelection: { providerId: "x", byProvider: { a: { model: "m", oneMillion: true }, b: "壞掉" } } });
    expect(config.lastSelection).toEqual({ providerId: "x", byProvider: { a: { model: "m", oneMillion: true } } });
  });

  test("模型上限必須是正整數", () => {
    expect(() => normalizeConfig({ models: { limits: { m: { maxOutputTokens: -1 } } } })).toThrow(ConfigError);
    expect(normalizeConfig({ models: { limits: { m: { maxOutputTokens: 100 } } } }).models.limits).toEqual({ m: { maxOutputTokens: 100 } });
  });
});

describe("normalizeProvider", () => {
  const api = { id: "linkai", type: "api", name: " LinkAI ", baseUrl: "https://linkai.llc", apiKey: " sk-2 " };

  test("API 服務商：去除前後空白，helperModel 預設為 null", () => {
    expect(normalizeProvider(api)).toEqual({ id: "linkai", type: "api", name: "LinkAI", baseUrl: "https://linkai.llc", apiKey: "sk-2", helperModel: null });
  });

  test("檢查必要欄位", () => {
    expect(() => normalizeProvider({ ...api, id: "Link AI" })).toThrow(ConfigError);
    expect(() => normalizeProvider({ ...api, name: "" })).toThrow(ConfigError);
    expect(() => normalizeProvider({ ...api, baseUrl: "linkai.llc" })).toThrow(ConfigError);
    expect(() => normalizeProvider({ ...api, apiKey: "" })).toThrow(ConfigError);
    expect(() => normalizeProvider({ ...api, type: "other" })).toThrow(ConfigError);
    expect(() => normalizeProvider({ ...api, helperModel: 1 })).toThrow(ConfigError);
  });
});
