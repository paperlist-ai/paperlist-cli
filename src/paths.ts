import os from "node:os";
import path from "node:path";

export function configDir(home = os.homedir(), env: NodeJS.ProcessEnv = process.env): string {
  const platform = process.platform;
  if (platform === "darwin") {
    return path.join(home, "Library", "Application Support", "paperlist");
  }
  if (platform === "win32") {
    const base = env.APPDATA || path.join(home, "AppData", "Roaming");
    return path.join(base, "paperlist");
  }
  const xdg = env.XDG_CONFIG_HOME;
  const base = xdg && path.isAbsolute(xdg) ? xdg : path.join(home, ".config");
  return path.join(base, "paperlist");
}

export function credentialsPath(home?: string, env?: NodeJS.ProcessEnv): string {
  return path.join(configDir(home, env), "credentials.json");
}

export function oauthSessionPath(home?: string, env?: NodeJS.ProcessEnv): string {
  return path.join(configDir(home, env), "oauth-session.json");
}
