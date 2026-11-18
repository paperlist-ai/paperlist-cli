import { type ErrorKind, type ExitError, jsonErrorCode } from "../errors.js";
import { sanitizeText, sanitizeUnknown } from "./sanitize.js";

export interface OutputMode {
  json: boolean;
}

export function emitJson(data: unknown): void {
  const payload = sanitizeUnknown(data);
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

export function emitText(line = ""): void {
  process.stdout.write(`${sanitizeText(line, { allowNewlines: true })}\n`);
}

export function emitDiag(line = ""): void {
  process.stderr.write(`${sanitizeText(line, { allowNewlines: true })}\n`);
}

export function emitJsonError(err: ExitError): void {
  const body = {
    ok: false,
    error: {
      code: jsonErrorCode(err.kind),
      message: sanitizeText(err.message, { allowNewlines: false }),
      ...(err.details && typeof err.details === "object"
        ? { details: sanitizeUnknown(err.details) }
        : {}),
    },
  };
  process.stderr.write(`${JSON.stringify(body)}\n`);
}

export function emitHumanError(err: ExitError): void {
  emitDiag(`Error: ${err.message}`);
}

export function isJsonMode(json?: boolean): boolean {
  return json === true;
}

export function kindHint(kind: ErrorKind): string | undefined {
  if (kind === "auth") {
    return "Set PAPERLIST_API_KEY, or run `paperlist login` / `paperlist login --api-key`.";
  }
  return undefined;
}
