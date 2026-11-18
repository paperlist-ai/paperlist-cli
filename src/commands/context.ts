import { CredentialStore } from "../auth/credentials.js";
import { PaperlistClient } from "../client/paperlist.js";
import { DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS, PRODUCTION_MCP_URL } from "../constants.js";
import { ExitError } from "../errors.js";

export interface GlobalOpts {
  json?: boolean;
  timeout?: string | number;
  mcpUrl?: string;
  devSendCredentials?: boolean;
}

export interface Runtime {
  client: PaperlistClient;
  store: CredentialStore;
  json: boolean;
  mcpUrl: string;
  timeoutMs: number;
  allowDevCredentials: boolean;
}

export function parseTimeout(raw: string | number | undefined): number {
  if (raw === undefined || raw === "") return DEFAULT_TIMEOUT_MS;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > MAX_TIMEOUT_MS) {
    throw new ExitError("usage", `timeout must be between 1 and ${MAX_TIMEOUT_MS} milliseconds.`);
  }
  return Math.floor(n);
}

export function createRuntime(opts: GlobalOpts, store?: CredentialStore): Runtime {
  const timeoutMs = parseTimeout(opts.timeout);
  const mcpUrl = opts.mcpUrl?.trim() || PRODUCTION_MCP_URL;
  try {
    // eslint-disable-next-line no-new
    new URL(mcpUrl);
  } catch {
    throw new ExitError("usage", "Invalid --mcp-url.");
  }
  const allowDevCredentials = opts.devSendCredentials === true;
  const creds = store ?? new CredentialStore();
  return {
    client: new PaperlistClient({
      mcpUrl,
      store: creds,
      timeoutMs,
      allowDevCredentials,
    }),
    store: creds,
    json: opts.json === true,
    mcpUrl,
    timeoutMs,
    allowDevCredentials,
  };
}

export function splitList(value: string[] | string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const parts = (Array.isArray(value) ? value : [value])
    .flatMap((v) => v.split(","))
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : undefined;
}

export function parseYear(raw: string | undefined, name: string): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new ExitError("usage", `${name} must be an integer year.`);
  return n;
}

export function collectRepeatable(value: string | string[] | undefined): string[] | undefined {
  return splitList(value);
}
