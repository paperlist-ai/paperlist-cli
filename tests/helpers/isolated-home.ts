import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { configDir, credentialsPath } from "../../src/paths.js";

/** Platform-correct env so tests hit the same config dir the CLI uses. */
export function isolatedHomeEnv(home: string): Record<string, string> {
  return {
    HOME: home,
    USERPROFILE: home,
    APPDATA: path.join(home, "AppData", "Roaming"),
    LOCALAPPDATA: path.join(home, "AppData", "Local"),
    XDG_CONFIG_HOME: path.join(home, ".config"),
  };
}

export function makeIsolatedHome(prefix = "pl-home-"): {
  home: string;
  env: Record<string, string>;
  directory: string;
  filePath: string;
} {
  const home = mkdtempSync(path.join(tmpdir(), prefix));
  const env = isolatedHomeEnv(home);
  const directory = configDir(home, env);
  const filePath = credentialsPath(home, env);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  return { home, env, directory, filePath };
}
