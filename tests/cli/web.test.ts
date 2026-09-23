import { expect, test } from "bun:test";
import { browserCommand, serverUrl } from "../../src/cli/web";

test("serverUrl 只使用本機位址", () => {
  expect(serverUrl(4141)).toBe("http://127.0.0.1:4141/");
});

test("browserCommand 依平台開啟瀏覽器", () => {
  expect(browserCommand("http://127.0.0.1:4141/", "darwin")).toEqual(["open", "http://127.0.0.1:4141/"]);
  expect(browserCommand("http://127.0.0.1:4141/", "win32")).toEqual(["cmd.exe", "/d", "/c", "start", '""', "http://127.0.0.1:4141/"]);
});
