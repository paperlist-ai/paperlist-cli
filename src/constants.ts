export { VERSION } from "./version.js";
/** Production MCP origin and URL. Credentials are only sent here (or to loopback in explicit dev tests). */
export const PRODUCTION_ORIGIN = "https://paperlist.ai";
export const PRODUCTION_MCP_URL = "https://paperlist.ai/mcp";
export const PRODUCTION_ISSUER = "https://paperlist.ai/api/auth";
export const RESOURCE_METADATA_URL =
  "https://paperlist.ai/.well-known/oauth-protected-resource/mcp";
export const OAUTH_SCOPE = "papers:read";
export const OAUTH_SCOPE_WITH_OFFLINE = "papers:read offline_access";
export const CLIENT_NAME = "Paperlist CLI";
export const CLIENT_SOFTWARE_ID = "paperlist-cli";

export const DEFAULT_TIMEOUT_MS = 30_000;
export const MAX_TIMEOUT_MS = 120_000;
export const OAUTH_CALLBACK_TIMEOUT_MS = 5 * 60_000;
export const MAX_RETRIES = 2;
export const DEFAULT_SEARCH_LIMIT = 10;
export const DEFAULT_LIST_LIMIT = 100;
export const SLIM_SEARCH_MAX = 200;
export const SLIM_LIST_MAX = 250;
export const FULL_FIELDS_MAX = 25;

export const API_KEY_ENV = "PAPERLIST_API_KEY";
export const API_KEY_PREFIX = "pl_";

export function isProductionMcpUrl(url: string | URL): boolean {
  try {
    const u = typeof url === "string" ? new URL(url) : url;
    return u.origin === PRODUCTION_ORIGIN && (u.pathname === "/mcp" || u.pathname === "/mcp/");
  } catch {
    return false;
  }
}

export function isLoopbackUrl(url: string | URL): boolean {
  try {
    const u = typeof url === "string" ? new URL(url) : url;
    return u.hostname === "127.0.0.1" || u.hostname === "localhost" || u.hostname === "::1";
  } catch {
    return false;
  }
}
