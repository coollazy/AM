import { expect, test } from "bun:test";
import { join } from "node:path";
import { amDir, configPath } from "../../src/core/paths";

test("預設放在家目錄的 .am", () => {
  expect(amDir("/Users/a", {})).toBe(join("/Users/a", ".am"));
  expect(configPath("/Users/a", {})).toBe(join("/Users/a", ".am", "config.json"));
});

test("AM_CONFIG_DIR 可指定其他目錄，空白時忽略", () => {
  expect(amDir("/Users/a", { AM_CONFIG_DIR: "/tmp/am-test" })).toBe("/tmp/am-test");
  expect(amDir("/Users/a", { AM_CONFIG_DIR: "  " })).toBe(join("/Users/a", ".am"));
});
