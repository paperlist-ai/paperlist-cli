import { loginWithOAuth } from "../auth/oauth.js";
import { openInBrowser } from "../auth/open-browser.js";
import { promptSecret, readSecretFromStdin } from "../auth/prompt.js";
import { API_KEY_PREFIX, isProductionMcpUrl, PRODUCTION_MCP_URL } from "../constants.js";
import { ExitError } from "../errors.js";
import { emitDiag, emitJson } from "../output/emit.js";
import { createRuntime, type GlobalOpts } from "./context.js";

export interface LoginOpts extends GlobalOpts {
  apiKey?: boolean;
  apiKeyStdin?: boolean;
}

export function rejectApiKeyValueOnArgv(argv: string[] = process.argv): void {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (arg.startsWith("--api-key=")) {
      throw new ExitError(
        "usage",
        "Do not pass the API key as a flag value. Use `paperlist login --api-key` (TTY prompt) or `--api-key-stdin`.",
      );
    }
    if (arg === "--api-key") {
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        throw new ExitError(
          "usage",
          "Do not pass the API key as a flag value. Use `paperlist login --api-key` (TTY prompt) or `--api-key-stdin`.",
        );
      }
    }
  }
}

export async function runLogin(opts: LoginOpts): Promise<void> {
  rejectApiKeyValueOnArgv();
  const runtime = createRuntime(opts);
  if (opts.apiKey && opts.apiKeyStdin) {
    throw new ExitError("usage", "Use only one of --api-key or --api-key-stdin.");
  }
  if (opts.apiKey || opts.apiKeyStdin) {
    const key = opts.apiKeyStdin
      ? await readSecretFromStdin()
      : await promptSecret("Paperlist API key: ");
    await runtime.store.saveApiKey(key);
    const prefixNote = key.startsWith(API_KEY_PREFIX)
      ? undefined
      : "Note: published Paperlist API keys start with pl_. The value was stored anyway.";
    if (runtime.json) {
      emitJson({ ok: true, method: "api_key", ...(prefixNote ? { warning: prefixNote } : {}) });
    } else {
      emitDiag("API key saved to the local credentials file (not printed).");
      if (prefixNote) emitDiag(prefixNote);
    }
    return;
  }

  if (!isProductionMcpUrl(runtime.mcpUrl) && runtime.mcpUrl !== PRODUCTION_MCP_URL) {
    // Loopback OAuth is for tests that inject a fixture authorization server via the SDK discovery.
    // The production login path is the default.
  }
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  await loginWithOAuth({
    store: runtime.store,
    mcpUrl: runtime.mcpUrl,
    interactive,
    openBrowser: { open: openInBrowser },
  });
  if (runtime.json) {
    emitJson({ ok: true, method: "oauth" });
  } else {
    emitDiag("Signed in. Tokens are stored locally and are not printed.");
  }
}
