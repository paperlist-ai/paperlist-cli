import { API_KEY_PREFIX } from "../constants.js";

/** Redact a secret for status output and logs. Never returns the raw value. */
export function redactSecret(value: string | undefined | null): string {
  if (!value) return "(none)";
  if (value.startsWith(API_KEY_PREFIX) && value.length > API_KEY_PREFIX.length + 2) {
    return `${API_KEY_PREFIX}${"*".repeat(Math.min(12, value.length - API_KEY_PREFIX.length))}`;
  }
  if (value.length <= 8) return "********";
  return `${value.slice(0, 3)}${"*".repeat(8)}…`;
}

/** Remove credential-like values from arbitrary objects before logging. */
export function redactRecord(input: unknown): unknown {
  if (typeof input === "string") {
    if (/^(pl_|sk_|Bearer\s)/i.test(input) || input.length > 40) return redactSecret(input);
    return input;
  }
  if (Array.isArray(input)) return input.map(redactRecord);
  if (input && typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      const key = k.toLowerCase();
      if (
        key.includes("token") ||
        key.includes("secret") ||
        key.includes("api_key") ||
        key.includes("apikey") ||
        key === "authorization" ||
        key === "code_verifier" ||
        key === "refresh_token" ||
        key === "access_token" ||
        key === "client_secret"
      ) {
        out[k] = typeof v === "string" ? redactSecret(v) : v == null ? v : "[redacted]";
      } else {
        out[k] = redactRecord(v);
      }
    }
    return out;
  }
  return input;
}

/** True if a string looks like it might be a pasted secret (for help/argv checks). */
export function looksLikeSecretFlag(arg: string): boolean {
  return arg.startsWith("--api-key=") || /^(pl_)[A-Za-z0-9_-]{8,}$/.test(arg);
}
