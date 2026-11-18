/** Strip ASCII control characters (except newline/tab when allowed) to avoid terminal injection. */
export function sanitizeText(value: unknown, opts: { allowNewlines?: boolean } = {}): string {
  const raw = value == null ? "" : String(value);
  const allow = opts.allowNewlines ? new Set(["\n", "\t", "\r"]) : new Set();
  let out = "";
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 32 || code === 127) {
      if (allow.has(ch)) {
        out += ch === "\r" ? "" : ch;
      }
      continue;
    }
    // Also strip C1 controls and bidi override-ish isolators that can spoof output.
    if (code >= 0x80 && code <= 0x9f) continue;
    if (code >= 0x202a && code <= 0x202e) continue;
    if (code >= 0x2066 && code <= 0x2069) continue;
    out += ch;
  }
  return out;
}

export function sanitizeUnknown(value: unknown): unknown {
  if (typeof value === "string") return sanitizeText(value, { allowNewlines: true });
  if (Array.isArray(value)) return value.map(sanitizeUnknown);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeUnknown(v);
    }
    return out;
  }
  return value;
}
