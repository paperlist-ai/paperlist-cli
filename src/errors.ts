export type ErrorKind = "usage" | "auth" | "rate_limit" | "timeout" | "network" | "api" | "local";

export const EXIT_CODES = {
  ok: 0,
  local: 1,
  usage: 2,
  auth: 3,
  rate_limit: 4,
  timeout: 5,
  network: 5,
  api: 6,
} as const;

const KIND_TO_EXIT: Record<ErrorKind, number> = {
  local: EXIT_CODES.local,
  usage: EXIT_CODES.usage,
  auth: EXIT_CODES.auth,
  rate_limit: EXIT_CODES.rate_limit,
  timeout: EXIT_CODES.timeout,
  network: EXIT_CODES.network,
  api: EXIT_CODES.api,
};

export class ExitError extends Error {
  readonly kind: ErrorKind;
  readonly exitCode: number;
  readonly details?: unknown;

  constructor(kind: ErrorKind, message: string, details?: unknown) {
    super(message);
    this.name = "ExitError";
    this.kind = kind;
    this.exitCode = KIND_TO_EXIT[kind];
    this.details = details;
  }
}

export function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export function asExitError(err: unknown): ExitError {
  if (err instanceof ExitError) return err;
  return new ExitError("local", messageOf(err));
}

/** Stable machine-readable error code written to stderr under --json. */
export function jsonErrorCode(kind: ErrorKind): string {
  switch (kind) {
    case "usage":
      return "usage_error";
    case "auth":
      return "auth_required";
    case "rate_limit":
      return "rate_limited";
    case "timeout":
      return "timeout";
    case "network":
      return "network_error";
    case "api":
      return "api_error";
    default:
      return "local_error";
  }
}
