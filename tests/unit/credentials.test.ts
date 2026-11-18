import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { CredentialStore } from "../../src/auth/credentials.js";
import { redactSecret } from "../../src/auth/redact.js";
import { canSendCredentials } from "../../src/client/mcp.js";
import { rejectApiKeyValueOnArgv } from "../../src/commands/login.js";
import { ExitError } from "../../src/errors.js";
import { makeIsolatedHome } from "../helpers/isolated-home.js";

function isolatedStore() {
  const isolated = makeIsolatedHome("pl-creds-");
  const store = new CredentialStore({
    home: isolated.home,
    env: isolated.env,
    platform: process.platform,
  });
  return { home: isolated.home, store };
}

describe("CredentialStore", () => {
  test("env API key wins over stored values", async () => {
    const { store, home } = isolatedStore();
    await store.saveApiKey("pl_stored");
    const envStore = new CredentialStore({
      home,
      env: { ...store.env, PAPERLIST_API_KEY: "pl_from_env" },
      platform: process.platform,
    });
    const resolved = await envStore.resolveBearer();
    expect(resolved).toEqual({ token: "pl_from_env", source: "env" });
  });

  test("stored api key wins over oauth", async () => {
    const { store } = isolatedStore();
    await store.saveOauthTokens({
      access_token: "oauth-token",
      issuer: "https://paperlist.ai/api/auth",
    });
    await store.saveApiKey("pl_stored");
    const resolved = await store.resolveBearer();
    expect(resolved?.source).toBe("api_key");
    expect(resolved?.token).toBe("pl_stored");
  });

  test("writes 0o600 files and 0o700 dirs on POSIX", async () => {
    if (process.platform === "win32") return;
    const { store } = isolatedStore();
    await store.saveApiKey("pl_secret");
    const dirMode = statSync(store.directory).mode & 0o777;
    const fileMode = statSync(store.filePath).mode & 0o777;
    expect(dirMode).toBe(0o700);
    expect(fileMode).toBe(0o600);
    // The raw key is in the file but not in logs; sanity: file exists.
    expect(existsSync(store.filePath)).toBe(true);
    expect(readFileSync(store.filePath, "utf8")).toContain("pl_secret");
  });

  test("clear removes the credentials file", async () => {
    const { store } = isolatedStore();
    await store.saveApiKey("pl_secret");
    await store.clear();
    expect(await store.read()).toBeNull();
    expect(existsSync(store.filePath)).toBe(false);
  });
});

describe("redaction and argv", () => {
  test("redacts api keys", () => {
    const shown = redactSecret("pl_abcdefghijklmnopqrstuvwxyz");
    expect(shown.startsWith("pl_")).toBe(true);
    expect(shown.includes("abc")).toBe(false);
    expect(shown).not.toContain("lmnop");
  });

  test("rejects --api-key <secret> on argv", () => {
    expect(() =>
      rejectApiKeyValueOnArgv(["node", "paperlist", "login", "--api-key", "pl_secret"]),
    ).toThrow(ExitError);
    expect(() =>
      rejectApiKeyValueOnArgv(["node", "paperlist", "login", "--api-key=pl_secret"]),
    ).toThrow(ExitError);
    expect(() =>
      rejectApiKeyValueOnArgv(["node", "paperlist", "login", "--api-key"]),
    ).not.toThrow();
  });
});

describe("credential sending policy", () => {
  test("production URLs may send credentials", () => {
    expect(canSendCredentials("https://paperlist.ai/mcp", false)).toBe(true);
  });

  test("random hosts never receive credentials", () => {
    expect(canSendCredentials("https://evil.example/mcp", true)).toBe(false);
    expect(canSendCredentials("https://evil.example/mcp", false)).toBe(false);
  });

  test("loopback only with an explicit dev flag", () => {
    expect(canSendCredentials("http://127.0.0.1:9/mcp", false)).toBe(false);
    expect(canSendCredentials("http://127.0.0.1:9/mcp", true)).toBe(true);
  });
});
