import { stdin as input, stdout as output } from "node:process";
import { ExitError } from "../errors.js";

/** Read a secret from the TTY without echoing. Not for argv. */
export async function promptSecret(label: string): Promise<string> {
  if (!input.isTTY || !output.isTTY) {
    throw new ExitError(
      "auth",
      "No TTY available to type an API key. Use `paperlist login --api-key-stdin` or set PAPERLIST_API_KEY.",
    );
  }
  output.write(label);
  const wasRaw = input.isRaw;
  input.setRawMode?.(true);
  input.resume();
  let value = "";
  try {
    value = await new Promise<string>((resolve, reject) => {
      const onData = (chunk: Buffer | string) => {
        const s = chunk.toString("utf8");
        for (const ch of s) {
          if (ch === "\n" || ch === "\r") {
            cleanup();
            output.write("\n");
            resolve(value);
            return;
          }
          if (ch === "\u0003") {
            cleanup();
            output.write("\n");
            reject(new ExitError("local", "Cancelled."));
            return;
          }
          if (ch === "\u007f" || ch === "\b") {
            value = value.slice(0, -1);
            continue;
          }
          if (ch < " ") continue;
          value += ch;
        }
      };
      const cleanup = () => {
        input.off("data", onData);
      };
      input.on("data", onData);
    });
  } finally {
    input.setRawMode?.(wasRaw ?? false);
    input.pause();
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ExitError("usage", "No API key was entered.");
  }
  return trimmed;
}

/** Read a secret from stdin (for CI). Stops at the first newline. */
export async function readSecretFromStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of input) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8");
  const first = text.split(/\r?\n/, 1)[0]?.trim() ?? "";
  if (!first) throw new ExitError("usage", "No API key was provided on stdin.");
  return first;
}
