import { redactSecret } from "../auth/redact.js";
import { API_KEY_ENV, isProductionMcpUrl } from "../constants.js";
import { emitJson, emitText } from "../output/emit.js";
import { createRuntime, type GlobalOpts } from "./context.js";

export async function runAuthStatus(opts: GlobalOpts): Promise<void> {
  const runtime = createRuntime(opts);
  const envKey = runtime.store.envApiKey();
  const stored = await runtime.store.read();
  let method: "env" | "api_key" | "oauth" | "none" = "none";
  let preview: string | undefined;
  let expires_at: number | undefined;
  if (envKey) {
    method = "env";
    preview = redactSecret(envKey);
  } else if (stored?.api_key) {
    method = "api_key";
    preview = redactSecret(stored.api_key);
  } else if (stored?.oauth?.access_token) {
    method = "oauth";
    preview = redactSecret(stored.oauth.access_token);
    expires_at = stored.oauth.expires_at;
  }
  const body = {
    ok: true,
    method,
    credential_preview: preview ?? null,
    env_var: API_KEY_ENV,
    mcp_url: runtime.mcpUrl,
    production_target: isProductionMcpUrl(runtime.mcpUrl),
    credentials_file: runtime.store.filePath,
    oauth_expires_at: expires_at ?? null,
  };
  if (runtime.json) {
    emitJson(body);
    return;
  }
  emitText(`Auth: ${method}`);
  if (preview) emitText(`Credential: ${preview}`);
  emitText(`MCP: ${runtime.mcpUrl}`);
  emitText(`Store: ${runtime.store.filePath}`);
  if (method === "none") {
    emitText(
      "Not signed in. Set PAPERLIST_API_KEY, or run `paperlist login` / `paperlist login --api-key`.",
    );
  }
}
