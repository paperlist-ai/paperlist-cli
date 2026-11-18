import { writeFileSync } from "node:fs";
import { afterAll, beforeAll, expect, test } from "vitest";
import { FIXTURE_TOKEN, type FixtureServer, startFixtureMcp } from "../helpers/fixture-mcp.js";
import { makeIsolatedHome } from "../helpers/isolated-home.js";
import { runCli } from "../helpers/run-cli.js";

let server: FixtureServer;
let homeEnv: Record<string, string>;

beforeAll(async () => {
  server = await startFixtureMcp({ delayMs: 4000 });
  const isolated = makeIsolatedHome("pl-home-");
  homeEnv = isolated.env;
  writeFileSync(isolated.filePath, JSON.stringify({ version: 1, api_key: FIXTURE_TOKEN }), {
    mode: 0o600,
  });
});

afterAll(async () => {
  await server.close();
});

function env(extra: Record<string, string> = {}) {
  return {
    isolated: true as const,
    env: {
      ...homeEnv,
      ...extra,
    },
  };
}

const _dev = ["--mcp-url", "", "--dev-send-credentials"];
function args(rest: string[], sendCreds = false): string[] {
  const out = ["--mcp-url", server.url, ...rest];
  if (sendCreds) out.splice(2, 0, "--dev-send-credentials");
  return out;
}

test("help and version", async () => {
  const help = await runCli(["--help"], env());
  expect(help.code).toBe(0);
  expect(help.stdout).toContain("conferences");
  expect(help.stdout).toContain("search");
  const version = await runCli(["--version"], env());
  expect(version.code).toBe(0);
  expect(version.stdout.trim()).toBe("0.1.0");
});

test("anonymous conferences", async () => {
  const res = await runCli(args(["conferences", "--json"]), env());
  expect(res.code).toBe(0);
  expect(res.stderr).toBe("");
  const body = JSON.parse(res.stdout);
  expect(body.ok).toBe(true);
  expect(body.conferences).toHaveLength(2);
});

test("protected search without credentials exits 3 and JSON error is on stderr", async () => {
  const empty = makeIsolatedHome("pl-empty-");
  const res = await runCli(args(["search", "widgets", "--json"]), {
    isolated: true,
    env: empty.env,
  });
  expect(res.code, `stdout=${res.stdout}\nstderr=${res.stderr}`).toBe(3);
  expect(res.stdout).toBe("");
  const err = JSON.parse(res.stderr);
  expect(err.ok).toBe(false);
  expect(err.error.code).toBe("auth_required");
});

test("search with fixture credentials", async () => {
  const res = await runCli(args(["search", "widgets", "--json"], true), env());
  expect(res.stderr, res.stderr).toBe("");
  expect(res.code).toBe(0);
  const body = JSON.parse(res.stdout);
  expect(body.papers[0].id).toBe("iclr2025-42");
  expect(body.paging.has_more).toBe(true);
  expect(body.paging.next_cursor).toBe("page-2");
});

test("empty search is success", async () => {
  const res = await runCli(args(["search", "empty", "--json"], true), env());
  expect(res.code).toBe(0);
  const body = JSON.parse(res.stdout);
  expect(body.papers).toEqual([]);
  expect(body.paging.has_more).toBe(false);
});

test("paper details and similar", async () => {
  const paper = await runCli(args(["paper", "iclr2025-42", "--json"], true), env());
  expect(paper.code).toBe(0);
  const body = JSON.parse(paper.stdout);
  expect(body.paper.abstract).toBe("We study widgets.");
  expect(body.paper.review_summary).toBe("Reviewers liked the method.");

  const missing = await runCli(args(["paper", "invalid", "--json"], true), env());
  expect(missing.code).toBe(6);
  expect(missing.stdout).toBe("");
  expect(JSON.parse(missing.stderr).error.code).toBe("api_error");

  const similar = await runCli(args(["similar", "iclr2025-42", "--json"], true), env());
  expect(similar.code).toBe(0);
  expect(JSON.parse(similar.stdout).papers[0].id).toBe("iclr2025-99");
});

test("401 vs 429 exit codes", async () => {
  const rate = await runCli(args(["search", "ratelimited", "--json"], true), env());
  expect(rate.code).toBe(4);
  expect(JSON.parse(rate.stderr).error.code).toBe("rate_limited");
});

test("timeout exit code", async () => {
  const res = await runCli(args(["search", "slow", "--timeout", "200", "--json"], true), env());
  expect(res.code).toBe(5);
  expect(JSON.parse(res.stderr).error.code).toBe("timeout");
});

test("EPIPE is not an error", async () => {
  const res = await runCli(args(["conferences"], false), { ...env(), closeStdout: true });
  expect(res.code).toBe(0);
});

test("login --api-key-stdin stores the key and does not print it", async () => {
  const loginHome = makeIsolatedHome("pl-login-");
  const res = await runCli(["login", "--api-key-stdin"], {
    isolated: true,
    env: loginHome.env,
    stdin: "pl_from_stdin_test\n",
  });
  expect(res.code, res.stderr).toBe(0);
  expect(res.stdout + res.stderr).not.toContain("pl_from_stdin_test");
  const status = await runCli(["auth", "status", "--json"], {
    isolated: true,
    env: loginHome.env,
  });
  expect(status.code).toBe(0);
  const body = JSON.parse(status.stdout);
  expect(body.method).toBe("api_key");
  expect(JSON.stringify(body)).not.toContain("pl_from_stdin_test");
});

test("login --api-key SECRET is rejected", async () => {
  const res = await runCli(["login", "--api-key", "pl_should_not_be_accepted"], env());
  expect(res.code).toBe(2);
  expect(res.stderr).toMatch(/not pass the API key/i);
});

test("non-interactive login without a key fails without inventing a browser flow", async () => {
  const ni = makeIsolatedHome("pl-ni-");
  const res = await runCli(["login"], {
    isolated: true,
    env: ni.env,
  });
  expect(res.code).toBe(3);
  expect(res.stderr).toMatch(/PAPERLIST_API_KEY|interactive/i);
});
