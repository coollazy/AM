import { expect, test } from "bun:test";
import { browserCommand, serverUrl } from "../../src/cli/web";

test("serverUrl 只使用本機位址", () => {
  expect(serverUrl(4747)).toBe("http://127.0.0.1:4747/");
});

test("browserCommand 依平台開啟瀏覽器", () => {
  expect(browserCommand("http://127.0.0.1:4747/", "darwin")).toEqual(["open", "http://127.0.0.1:4747/"]);
  expect(browserCommand("http://127.0.0.1:4747/", "win32")).toEqual(["cmd.exe", "/d", "/c", "start", '""', "http://127.0.0.1:4747/"]);
});
