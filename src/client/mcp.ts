import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CredentialStore } from "../auth/credentials.js";
import { refreshOauthIfNeeded, StoreOAuthProvider } from "../auth/oauth.js";
import {
  CLIENT_SOFTWARE_ID,
  DEFAULT_TIMEOUT_MS,
  isLoopbackUrl,
  isProductionMcpUrl,
  MAX_RETRIES,
  PRODUCTION_MCP_URL,
  VERSION,
} from "../constants.js";
import { ExitError, messageOf } from "../errors.js";

export interface McpClientOptions {
  /** Target MCP URL. Defaults to the production Paperlist server. */
  mcpUrl?: string;
  store?: CredentialStore;
  /** Explicit bearer for tests (constructor injection). */
  authHeader?: string;
  /**
   * Allow sending store/env credentials to a loopback --mcp-url.
   * Never sends stored or env credentials to a non-loopback, non-production host.
   */
  allowDevCredentials?: boolean;
  timeoutMs?: number;
  fetch?: typeof fetch;
  /** Override "now" for tests. */
  now?: () => number;
}

export interface ToolCallResult {
  structured: Record<string, unknown> | undefined;
  isError: boolean;
  text: string;
}

export function canSendCredentials(mcpUrl: string, allowDevCredentials: boolean): boolean {
  if (isProductionMcpUrl(mcpUrl)) return true;
  return allowDevCredentials && isLoopbackUrl(mcpUrl);
}

function composeSignals(signals: Array<AbortSignal | null | undefined>): AbortSignal {
  const list = signals.filter((s): s is AbortSignal => s != null);
  if (list.length === 0) return new AbortController().signal;
  const only = list[0];
  if (list.length === 1 && only) return only;
  const ctrl = new AbortController();
  for (const s of list) {
    if (s.aborted) {
      ctrl.abort(s.reason);
      return ctrl.signal;
    }
    s.addEventListener("abort", () => ctrl.abort(s.reason), { once: true });
  }
  return ctrl.signal;
}

export function parseRetryAfter(header: string | null, now = Date.now()): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30_000);
  const when = Date.parse(header);
  if (Number.isFinite(when)) return Math.min(Math.max(0, when - now), 30_000);
  return undefined;
}

export function classifyHttpOrRpc(opts: {
  httpStatus?: number;
  rpcCode?: number;
  message: string;
  retryAfterMs?: number;
}): ExitError {
  const msg = opts.message || "Request failed";
  const status = opts.httpStatus;
  if (
    status === 401 ||
    status === 403 ||
    opts.rpcCode === -32001 ||
    (/auth|sign-in|unauthorized|api key/i.test(msg) && status !== 429)
  ) {
    if (status === 429) {
      /* fall through */
    } else if (
      status === 401 ||
      status === 403 ||
      opts.rpcCode === -32001 ||
      /auth_required|sign-in required|unauthorized/i.test(msg)
    ) {
      return new ExitError("auth", msg, { httpStatus: status, rpcCode: opts.rpcCode });
    }
  }
  if (status === 429 || /rate.?limit|too many requests|retry later/i.test(msg)) {
    return new ExitError("rate_limit", msg, {
      httpStatus: status,
      retryAfterMs: opts.retryAfterMs,
    });
  }
  if (status === 408 || /timeout|timed out|aborted/i.test(msg)) {
    return new ExitError("timeout", msg, { httpStatus: status });
  }
  if (status && status >= 500) {
    return new ExitError("api", msg, { httpStatus: status });
  }
  if (opts.rpcCode === -32602 || /invalid arguments|invalid params/i.test(msg)) {
    return new ExitError("usage", msg);
  }
  return new ExitError("api", msg, { httpStatus: status, rpcCode: opts.rpcCode });
}

function isRetryable(err: ExitError, attempt: number): boolean {
  if (attempt >= MAX_RETRIES) return false;
  if (err.kind === "auth" || err.kind === "usage") return false;
  if (err.kind === "rate_limit") return true;
  if (err.kind === "timeout" || err.kind === "network") return true;
  if (err.kind === "api") {
    const status = (err.details as { httpStatus?: number } | undefined)?.httpStatus;
    return status === 502 || status === 503 || status === 504;
  }
  return false;
}

export class McpTransport {
  readonly mcpUrl: string;
  private readonly store: CredentialStore;
  private readonly authHeader?: string;
  private readonly allowDevCredentials: boolean;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: McpClientOptions = {}) {
    this.mcpUrl = opts.mcpUrl ?? PRODUCTION_MCP_URL;
    this.store = opts.store ?? new CredentialStore();
    this.authHeader = opts.authHeader;
    this.allowDevCredentials = opts.allowDevCredentials === true;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = opts.fetch ?? fetch;
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<ToolCallResult> {
    let last: ExitError | undefined;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.callOnce(name, args);
      } catch (err) {
        const exit = err instanceof ExitError ? err : this.mapUnknown(err);
        last = exit;
        if (!isRetryable(exit, attempt)) throw exit;
        const wait =
          (exit.details as { retryAfterMs?: number } | undefined)?.retryAfterMs ??
          Math.min(1000 * 2 ** attempt, 4000);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
    throw last ?? new ExitError("api", "Request failed");
  }

  private async callOnce(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    const authz = await this.resolveAuthorization();
    const timeout = AbortSignal.timeout
      ? AbortSignal.timeout(this.timeoutMs)
      : (() => {
          const c = new AbortController();
          setTimeout(() => c.abort(new Error("timeout")), this.timeoutMs);
          return c.signal;
        })();

    const fetchFn: typeof fetch = (input, init) => {
      const signal = composeSignals([init?.signal, timeout]);
      return this.fetchImpl(input, { ...init, signal });
    };

    // Do not set MCP-Protocol-Version here. The SDK advertises its latest
    // version in initialize and then stamps the negotiated value on later
    // requests. A second, different header value is combined as
    // "2025-11-25, 2025-06-18" and rejected by the hosted server.
    const headers: Record<string, string> = {};
    // API keys (and explicit test tokens) go on the Authorization header.
    // OAuth access tokens are supplied through the SDK auth provider so refresh works.
    if (authz?.mode === "header") headers.Authorization = `Bearer ${authz.token}`;

    const transport = new StreamableHTTPClientTransport(new URL(this.mcpUrl), {
      requestInit: { headers },
      fetch: fetchFn,
      authProvider: authz?.mode === "oauth" ? authz.provider : undefined,
      reconnectionOptions: {
        maxReconnectionDelay: 2000,
        initialReconnectionDelay: 200,
        reconnectionDelayGrowFactor: 1.5,
        maxRetries: 0,
      },
    });

    const client = new Client({ name: CLIENT_SOFTWARE_ID, version: VERSION });
    try {
      await client.connect(transport);
      const result = await client.callTool({ name, arguments: args }, undefined, {
        timeout: this.timeoutMs,
      });
      const isError = result.isError === true;
      const structured = (result.structuredContent ?? undefined) as
        | Record<string, unknown>
        | undefined;
      const text = extractText(result.content);
      if (isError) {
        throw classifyHttpOrRpc({ message: text || `Tool ${name} returned an error` });
      }
      return { structured, isError: false, text };
    } catch (err) {
      throw this.mapUnknown(err);
    } finally {
      try {
        await client.close();
      } catch {
        try {
          await transport.close();
        } catch {
          // ignore
        }
      }
    }
  }

  private async resolveAuthorization(): Promise<
    { mode: "header"; token: string } | { mode: "oauth"; provider: StoreOAuthProvider } | undefined
  > {
    if (this.authHeader) {
      const token = this.authHeader.replace(/^Bearer\s+/i, "");
      return { mode: "header", token };
    }
    if (!canSendCredentials(this.mcpUrl, this.allowDevCredentials)) {
      return undefined;
    }
    const envOrKey = this.store.envApiKey();
    if (envOrKey) return { mode: "header", token: envOrKey };
    const stored = await this.store.read();
    if (stored?.api_key) return { mode: "header", token: stored.api_key };
    if (stored?.oauth?.access_token) {
      if (stored.oauth.refresh_token) {
        await refreshOauthIfNeeded({
          store: this.store,
          mcpUrl: this.mcpUrl,
          fetch: this.fetchImpl,
        });
      }
      const provider = new StoreOAuthProvider({
        store: this.store,
        redirectUrl: "http://127.0.0.1/unused",
        onRedirect: async () => {
          throw new ExitError(
            "auth",
            "This command requires authentication. Set PAPERLIST_API_KEY, or run `paperlist login` in an interactive terminal.",
          );
        },
      });
      return { mode: "oauth", provider };
    }
    return undefined;
  }

  private mapUnknown(err: unknown): ExitError {
    if (err instanceof ExitError) return err;
    if (err instanceof UnauthorizedError) {
      return new ExitError("auth", err.message || "Authentication required.");
    }
    if (err instanceof StreamableHTTPError) {
      const status = err.code;
      const retryAfterMs = parseRetryAfter(
        typeof (err as { retryAfter?: string }).retryAfter === "string"
          ? ((err as { retryAfter?: string }).retryAfter ?? null)
          : null,
      );
      return classifyHttpOrRpc({
        httpStatus: status,
        message: err.message || `HTTP ${status ?? "error"}`,
        retryAfterMs,
      });
    }
    const msg = messageOf(err);
    if (
      /abort|timeout|TimeoutError/i.test(msg) ||
      (err as { name?: string }).name === "TimeoutError"
    ) {
      return new ExitError("timeout", `The request timed out after ${this.timeoutMs}ms.`);
    }
    if (/fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|network|socket/i.test(msg)) {
      return new ExitError("network", msg);
    }
    // JSON-RPC style
    const rpc = err as { code?: number; message?: string };
    if (typeof rpc.code === "number" && rpc.message) {
      return classifyHttpOrRpc({ rpcCode: rpc.code, message: rpc.message });
    }
    return new ExitError("api", msg);
  }
}

function extractText(content: unknown): string {
  if (!Array.isArray(content)) return typeof content === "string" ? content : "";
  return content
    .map((part) => {
      if (part && typeof part === "object" && (part as { type?: string }).type === "text") {
        return String((part as { text?: string }).text ?? "");
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}
