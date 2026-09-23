import { homedir } from "node:os";
import { join } from "node:path";

export function amDir(home: string = homedir()): string {
  return join(home, ".am");
}

export function configPath(home: string = homedir()): string {
  return join(amDir(home), "config.json");
}
