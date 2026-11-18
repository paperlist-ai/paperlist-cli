import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { auth, UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import {
  CLIENT_NAME,
  CLIENT_SOFTWARE_ID,
  isLoopbackUrl,
  isProductionMcpUrl,
  OAUTH_CALLBACK_TIMEOUT_MS,
  OAUTH_SCOPE,
  OAUTH_SCOPE_WITH_OFFLINE,
  PRODUCTION_MCP_URL,
  RESOURCE_METADATA_URL,
  VERSION,
} from "../constants.js";
import { ExitError } from "../errors.js";
import type { CredentialStore, OauthClientInfo, OauthTokens } from "./credentials.js";

export interface BrowserOpener {
  open(url: string): Promise<void>;
}

export interface OauthLoginOptions {
  store: CredentialStore;
  mcpUrl: string;
  interactive: boolean;
  openBrowser: BrowserOpener;
  fetch?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
}

export class StoreOAuthProvider implements OAuthClientProvider {
  readonly clientMetadataUrl?: string;
  private readonly redirect: string;
  private readonly store: CredentialStore;
  private pendingState: string;
  onRedirect?: (url: URL) => void | Promise<void>;

  constructor(opts: {
    store: CredentialStore;
    redirectUrl: string;
    onRedirect?: (url: URL) => void | Promise<void>;
  }) {
    this.store = opts.store;
    this.redirect = opts.redirectUrl;
    this.onRedirect = opts.onRedirect;
    this.pendingState = randomBytes(16).toString("hex");
  }

  get redirectUrl(): string {
    return this.redirect;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [this.redirect],
      client_name: CLIENT_NAME,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: OAUTH_SCOPE_WITH_OFFLINE,
      software_id: CLIENT_SOFTWARE_ID,
      software_version: VERSION,
    };
  }

  state(): string {
    return this.pendingState;
  }

  async clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
    const stored = await this.store.read();
    return stored?.client as OAuthClientInformationMixed | undefined;
  }

  async saveClientInformation(info: OAuthClientInformationMixed): Promise<void> {
    await this.store.saveClient(info as OauthClientInfo);
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    const stored = await this.store.read();
    return stored?.oauth as OAuthTokens | undefined;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await this.store.saveOauthTokens(tokens as OauthTokens);
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    if (this.onRedirect) await this.onRedirect(authorizationUrl);
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    const session = await this.store.readSession();
    await this.store.saveSession({
      state: session?.state ?? this.pendingState,
      code_verifier: codeVerifier,
      redirect_uri: this.redirect,
      created_at: session?.created_at ?? Date.now(),
    });
  }

  async codeVerifier(): Promise<string> {
    const session = await this.store.readSession();
    if (!session?.code_verifier) {
      throw new ExitError("auth", "Missing PKCE code verifier; restart `paperlist login`.");
    }
    return session.code_verifier;
  }

  async invalidateCredentials(
    scope: "all" | "client" | "tokens" | "verifier" | "discovery",
  ): Promise<void> {
    if (scope === "all") {
      await this.store.clear();
      return;
    }
    if (scope === "tokens") {
      await this.store.clearOauth();
      return;
    }
    if (scope === "verifier") {
      await this.store.clearSession();
    }
  }
}

/**
 * Interactive OAuth login. Opens a browser only when the user ran `paperlist login`
 * in an interactive terminal. Uses the SDK's discovery, PKCE, state, and (when
 * advertised) dynamic client registration as a public client. CIMD is not used
 * because this CLI has no public HTTPS client_id metadata URL.
 */
export async function loginWithOAuth(opts: OauthLoginOptions): Promise<void> {
  if (!isProductionMcpUrl(opts.mcpUrl) && !isLoopbackUrl(opts.mcpUrl)) {
    throw new ExitError(
      "auth",
      "OAuth login is only supported against the production Paperlist MCP server, or a loopback URL in tests.",
    );
  }
  if (!opts.interactive) {
    throw new ExitError(
      "auth",
      "OAuth login needs an interactive terminal so you can authorize in a browser. For CI or scripts, set PAPERLIST_API_KEY or run `paperlist login --api-key-stdin`.",
    );
  }

  const timeoutMs = opts.timeoutMs ?? OAUTH_CALLBACK_TIMEOUT_MS;
  const callback = await startCallbackServer();
  const provider = new StoreOAuthProvider({
    store: opts.store,
    redirectUrl: callback.redirectUri,
  });
  await opts.store.saveSession({
    state: provider.state(),
    redirect_uri: callback.redirectUri,
    created_at: Date.now(),
  });

  let authorizationUrl: URL | undefined;
  provider.onRedirect = async (url) => {
    authorizationUrl = url;
  };

  try {
    const first = await auth(provider, {
      serverUrl: opts.mcpUrl,
      scope: OAUTH_SCOPE_WITH_OFFLINE,
      resourceMetadataUrl: isProductionMcpUrl(opts.mcpUrl)
        ? new URL(RESOURCE_METADATA_URL)
        : undefined,
      fetchFn: opts.fetch,
    });
    if (first === "AUTHORIZED") {
      await opts.store.clearSession();
      return;
    }
    if (!authorizationUrl) {
      throw new ExitError("auth", "Authorization server did not provide a login URL.");
    }
    const waited = callback.wait(timeoutMs, provider.state());
    try {
      await opts.openBrowser.open(authorizationUrl.toString());
    } catch (err) {
      throw new ExitError(
        "auth",
        `Could not open a browser. Open this URL yourself, or use an API key instead: ${authorizationUrl}`,
        { cause: String(err) },
      );
    }

    const result = await waited;
    if (result.error) {
      throw new ExitError(
        "auth",
        `Authorization failed: ${result.error}${result.error_description ? ` (${result.error_description})` : ""}`,
      );
    }
    if (!result.code) {
      throw new ExitError("auth", "Authorization callback did not include a code.");
    }
    const second = await auth(provider, {
      serverUrl: opts.mcpUrl,
      authorizationCode: result.code,
      scope: OAUTH_SCOPE_WITH_OFFLINE,
      resourceMetadataUrl: isProductionMcpUrl(opts.mcpUrl)
        ? new URL(RESOURCE_METADATA_URL)
        : undefined,
      fetchFn: opts.fetch,
    });
    if (second !== "AUTHORIZED") {
      throw new ExitError("auth", "Authorization did not complete after the callback.");
    }
    await opts.store.clearSession();
  } catch (err) {
    if (err instanceof ExitError) throw err;
    if (err instanceof UnauthorizedError) {
      throw new ExitError("auth", err.message || "Authorization was not completed.");
    }
    throw new ExitError("auth", `OAuth login failed: ${(err as Error).message}`);
  } finally {
    await callback.close();
  }
}

export async function refreshOauthIfNeeded(opts: {
  store: CredentialStore;
  mcpUrl: string;
  fetch?: typeof fetch;
}): Promise<boolean> {
  const stored = await opts.store.read();
  const tokens = stored?.oauth;
  if (!tokens?.refresh_token) return false;
  const expiresAt = tokens.expires_at;
  if (expiresAt && expiresAt - 60_000 > Date.now()) return true;

  const provider = new StoreOAuthProvider({
    store: opts.store,
    redirectUrl: "http://127.0.0.1/unused",
  });
  try {
    const result = await auth(provider, {
      serverUrl: opts.mcpUrl,
      scope: tokens.scope ?? OAUTH_SCOPE,
      resourceMetadataUrl: isProductionMcpUrl(opts.mcpUrl)
        ? new URL(RESOURCE_METADATA_URL)
        : undefined,
      fetchFn: opts.fetch,
    });
    return result === "AUTHORIZED";
  } catch {
    return false;
  }
}

interface CallbackResult {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}

function startCallbackServer(): Promise<{
  redirectUri: string;
  wait: (timeoutMs: number, expectedState: string) => Promise<CallbackResult>;
  close: () => Promise<void>;
}> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Could not bind OAuth callback server"));
        return;
      }
      const redirectUri = `http://127.0.0.1:${addr.port}/callback`;
      let finished: ((value: CallbackResult) => void) | undefined;
      let early: CallbackResult | undefined;
      const wait = (timeoutMs: number, expectedState: string) =>
        new Promise<CallbackResult>((res, rej) => {
          const timer = setTimeout(() => {
            rej(
              new ExitError(
                "auth",
                "Timed out waiting for the authorization callback. Try again, or use an API key.",
              ),
            );
          }, timeoutMs);
          const complete = (value: CallbackResult) => {
            clearTimeout(timer);
            if (value.state && value.state !== expectedState) {
              rej(
                new ExitError("auth", "OAuth state mismatch; aborting to prevent a CSRF attack."),
              );
              return;
            }
            res(value);
          };
          if (early) {
            complete(early);
            return;
          }
          finished = complete;
        });

      server.on("request", (req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url ?? "/", `http://127.0.0.1:${addr.port}`);
        if (url.pathname !== "/callback") {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        const result: CallbackResult = {
          code: url.searchParams.get("code") ?? undefined,
          state: url.searchParams.get("state") ?? undefined,
          error: url.searchParams.get("error") ?? undefined,
          error_description: url.searchParams.get("error_description") ?? undefined,
        };
        const ok = !result.error && Boolean(result.code);
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(
          ok
            ? "<!doctype html><html><body><p>Paperlist CLI is now signed in. You can close this window.</p></body></html>"
            : `<!doctype html><html><body><p>Authorization did not complete.</p></body></html>`,
        );
        if (finished) finished(result);
        else early = result;
      });

      resolve({
        redirectUri,
        wait,
        close: () =>
          new Promise<void>((res) => {
            server.close(() => res());
          }),
      });
    });
  });
}

export { PRODUCTION_MCP_URL };
