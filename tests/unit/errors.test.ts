import { describe, expect, test } from "vitest";
import { classifyHttpOrRpc, parseRetryAfter } from "../../src/client/mcp.js";
import { EXIT_CODES, jsonErrorCode } from "../../src/errors.js";

describe("classifyHttpOrRpc", () => {
  test("maps 401 and -32001 to auth", () => {
    expect(classifyHttpOrRpc({ httpStatus: 401, message: "Sign-in required" }).kind).toBe("auth");
    expect(classifyHttpOrRpc({ rpcCode: -32001, message: "Sign-in required" }).exitCode).toBe(
      EXIT_CODES.auth,
    );
  });

  test("maps 429 to rate_limit", () => {
    const err = classifyHttpOrRpc({
      httpStatus: 429,
      message: "Rate limit exceeded",
      retryAfterMs: 1000,
    });
    expect(err.kind).toBe("rate_limit");
    expect(err.exitCode).toBe(EXIT_CODES.rate_limit);
  });

  test("maps invalid args to usage", () => {
    expect(classifyHttpOrRpc({ rpcCode: -32602, message: "Invalid params" }).kind).toBe("usage");
  });
});

describe("parseRetryAfter", () => {
  test("parses seconds", () => {
    expect(parseRetryAfter("2")).toBe(2000);
  });

  test("parses HTTP date", () => {
    const when = Date.now() + 5000;
    const header = new Date(when).toUTCString();
    const ms = parseRetryAfter(header, Date.now());
    expect(ms).toBeGreaterThan(1000);
    expect(ms).toBeLessThanOrEqual(30_000);
  });
});

test("json error codes are stable", () => {
  expect(jsonErrorCode("auth")).toBe("auth_required");
  expect(jsonErrorCode("rate_limit")).toBe("rate_limited");
});
