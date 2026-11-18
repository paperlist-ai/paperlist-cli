import { afterEach, beforeEach, expect, test } from "vitest";
import { CredentialStore } from "../../src/auth/credentials.js";
import { PaperlistClient } from "../../src/client/paperlist.js";
import { ExitError } from "../../src/errors.js";
import { FIXTURE_TOKEN, type FixtureServer, startFixtureMcp } from "../helpers/fixture-mcp.js";
import { makeIsolatedHome } from "../helpers/isolated-home.js";

let server: FixtureServer;

beforeEach(async () => {
  server = await startFixtureMcp({ delayMs: 4000 });
});
afterEach(async () => {
  await server.close();
});

function client(token?: string) {
  const isolated = makeIsolatedHome("pl-cli-");
  const store = new CredentialStore({
    home: isolated.home,
    env: isolated.env,
  });
  return new PaperlistClient({
    mcpUrl: server.url,
    store,
    allowDevCredentials: Boolean(token),
    authHeader: token,
    timeoutMs: 1500,
  });
}

test("list_conferences works anonymously", async () => {
  const result = await client().listConferences();
  expect(result.conferences.map((c) => c.slug)).toEqual(["iclr", "neurips"]);
});

test("topics_for is included when requested", async () => {
  const result = await client().listConferences({ conference: "iclr", year: 2025 });
  expect(result.topics?.items[0]?.slug).toBe("world-models");
});

test("protected search without a token is auth", async () => {
  await expect(client().searchPapers({ query: "widgets" })).rejects.toMatchObject({
    kind: "auth",
    exitCode: 3,
  });
});

test("search returns paging metadata and empty results as success", async () => {
  const authed = client(FIXTURE_TOKEN);
  const page = await authed.searchPapers({ query: "widgets" });
  expect(page.papers).toHaveLength(1);
  expect(page.paging).toEqual({ next_cursor: "page-2", has_more: true });
  const empty = await authed.searchPapers({ query: "empty" });
  expect(empty.papers).toEqual([]);
  expect(empty.paging.has_more).toBe(false);
});

test("get_paper missing id is an API/usage-style error, not empty success", async () => {
  await expect(client(FIXTURE_TOKEN).getPaper("missing-id")).rejects.toBeInstanceOf(ExitError);
});

test("get_paper omits review summary when the server does not send one", async () => {
  const result = await client(FIXTURE_TOKEN).getPaper("no-review");
  expect(result.paper.review_summary).toBeUndefined();
  expect(result.paper.abstract).toBeNull();
});

test("similar papers", async () => {
  const result = await client(FIXTURE_TOKEN).findSimilar({ id: "iclr2025-42" });
  expect(result.papers[0]).toMatchObject({ id: "iclr2025-99" });
});

test("timeout is classified", async () => {
  const slow = new PaperlistClient({
    mcpUrl: server.url,
    authHeader: FIXTURE_TOKEN,
    allowDevCredentials: true,
    timeoutMs: 200,
  });
  await expect(slow.searchPapers({ query: "slow" })).rejects.toMatchObject({
    kind: "timeout",
    exitCode: 5,
  });
});
