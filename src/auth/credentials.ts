import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { API_KEY_ENV } from "../constants.js";
import { ExitError } from "../errors.js";
import { configDir, credentialsPath, oauthSessionPath } from "../paths.js";

export interface OauthTokens {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_at?: number;
  expires_in?: number;
  scope?: string;
  issuer?: string;
}

export interface OauthClientInfo {
  client_id: string;
  client_secret?: string;
  client_id_issued_at?: number;
  client_secret_expires_at?: number;
  issuer?: string;
}

export interface StoredCredentials {
  version: 1;
  api_key?: string;
  oauth?: OauthTokens;
  client?: OauthClientInfo;
}

export interface OauthPendingSession {
  state: string;
  code_verifier?: string;
  redirect_uri: string;
  created_at: number;
}

export interface CredentialStoreOptions {
  home?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
}

export class CredentialStore {
  readonly home: string;
  readonly env: NodeJS.ProcessEnv;
  readonly platform: NodeJS.Platform;

  constructor(opts: CredentialStoreOptions = {}) {
    this.home = opts.home ?? os.homedir();
    this.env = opts.env ?? process.env;
    this.platform = opts.platform ?? process.platform;
  }

  get filePath(): string {
    return credentialsPath(this.home, this.env);
  }

  get sessionFilePath(): string {
    return oauthSessionPath(this.home, this.env);
  }

  get directory(): string {
    return configDir(this.home, this.env);
  }

  /** Environment API key, if set and non-empty. */
  envApiKey(): string | undefined {
    const value = this.env[API_KEY_ENV];
    return value?.trim() ? value : undefined;
  }

  /**
   * Resolve a bearer token: env API key > stored API key > stored OAuth access token.
   * Does not refresh OAuth; callers handle refresh separately.
   */
  async resolveBearer(): Promise<{ token: string; source: "env" | "api_key" | "oauth" } | null> {
    const envKey = this.envApiKey();
    if (envKey) return { token: envKey, source: "env" };
    const stored = await this.read();
    if (stored?.api_key) return { token: stored.api_key, source: "api_key" };
    if (stored?.oauth?.access_token) return { token: stored.oauth.access_token, source: "oauth" };
    return null;
  }

  async read(): Promise<StoredCredentials | null> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const data = JSON.parse(raw) as StoredCredentials;
      if (!data || typeof data !== "object") return null;
      return data;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return null;
      throw new ExitError("local", `Could not read credentials file: ${(err as Error).message}`);
    }
  }

  async write(next: StoredCredentials): Promise<void> {
    await this.withLock(async () => {
      await this.writeUnlocked(next);
    });
  }

  async clear(): Promise<void> {
    await this.withLock(async () => {
      await fs.rm(this.filePath, { force: true });
    });
    await fs.rm(this.sessionFilePath, { force: true });
  }

  async saveApiKey(apiKey: string): Promise<void> {
    await this.withLock(async () => {
      const current = (await this.read()) ?? { version: 1 as const };
      await this.writeUnlocked({
        version: 1,
        api_key: apiKey,
        // An explicit API-key login replaces OAuth tokens for this store.
        client: current.client,
      });
    });
  }

  async saveOauthTokens(tokens: OauthTokens, client?: OauthClientInfo): Promise<void> {
    await this.withLock(async () => {
      const current = (await this.read()) ?? { version: 1 as const };
      const expires_at =
        tokens.expires_at ??
        (typeof tokens.expires_in === "number" ? Date.now() + tokens.expires_in * 1000 : undefined);
      await this.writeUnlocked({
        version: 1,
        // Keep a stored API key if present; env still wins at resolve time.
        api_key: current.api_key,
        oauth: { ...tokens, expires_at },
        client: client ?? current.client,
      });
    });
  }

  async saveClient(client: OauthClientInfo): Promise<void> {
    await this.withLock(async () => {
      const current = (await this.read()) ?? { version: 1 as const };
      await this.writeUnlocked({ ...current, version: 1, client });
    });
  }

  async clearOauth(): Promise<void> {
    await this.withLock(async () => {
      const current = (await this.read()) ?? { version: 1 as const };
      const next: StoredCredentials = { version: 1 };
      if (current.api_key) next.api_key = current.api_key;
      await this.writeUnlocked(next);
    });
    await fs.rm(this.sessionFilePath, { force: true });
  }

  async saveSession(session: OauthPendingSession): Promise<void> {
    await this.ensureDir();
    await atomicWrite(this.sessionFilePath, `${JSON.stringify(session, null, 2)}\n`, this.platform);
  }

  async readSession(): Promise<OauthPendingSession | null> {
    try {
      const raw = await fs.readFile(this.sessionFilePath, "utf8");
      return JSON.parse(raw) as OauthPendingSession;
    } catch {
      return null;
    }
  }

  async clearSession(): Promise<void> {
    await fs.rm(this.sessionFilePath, { force: true });
  }

  private async writeUnlocked(data: StoredCredentials): Promise<void> {
    const keys = Object.keys(data).filter((k) => k !== "version");
    const meaningful = keys.some((k) => (data as unknown as Record<string, unknown>)[k] != null);
    await this.ensureDir();
    if (!meaningful) {
      await fs.rm(this.filePath, { force: true });
      return;
    }
    await atomicWrite(this.filePath, `${JSON.stringify(data, null, 2)}\n`, this.platform);
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    await chmodBestEffort(this.directory, 0o700, this.platform);
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.ensureDir();
    const lockPath = path.join(this.directory, ".credentials.lock");
    const handle = await acquireLock(lockPath);
    try {
      return await fn();
    } finally {
      await handle.release();
    }
  }
}

async function atomicWrite(
  filePath: string,
  contents: string,
  platform: NodeJS.Platform,
): Promise<void> {
  const dir = path.dirname(filePath);
  const temp = path.join(dir, `.${path.basename(filePath)}.${randomBytes(6).toString("hex")}.tmp`);
  try {
    const fh = await fs.open(temp, "wx", 0o600);
    try {
      await fh.writeFile(contents, "utf8");
      await fh.sync();
    } finally {
      await fh.close();
    }
    await chmodBestEffort(temp, 0o600, platform);
    await fs.rename(temp, filePath);
    await chmodBestEffort(filePath, 0o600, platform);
  } finally {
    await fs.rm(temp, { force: true });
  }
}

async function chmodBestEffort(
  target: string,
  mode: number,
  platform: NodeJS.Platform,
): Promise<void> {
  try {
    await fs.chmod(target, mode);
  } catch (err) {
    if (platform !== "win32") throw err;
  }
}

async function acquireLock(lockPath: string): Promise<{ release: () => Promise<void> }> {
  const deadline = Date.now() + 5_000;
  while (true) {
    try {
      const fh = await fs.open(lockPath, "wx", 0o600);
      return {
        release: async () => {
          try {
            await fh.close();
          } finally {
            await fs.rm(lockPath, { force: true });
          }
        },
      };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw err;
      if (Date.now() > deadline) {
        // Stale lock: a crashed writer may have left it behind.
        try {
          const st = await fs.stat(lockPath);
          if (Date.now() - st.mtimeMs > 10_000) {
            await fs.rm(lockPath, { force: true });
            continue;
          }
        } catch {
          // ignore
        }
        throw new ExitError("local", "Timed out waiting for the credentials file lock.");
      }
      await new Promise((r) => setTimeout(r, 20));
    }
  }
}
