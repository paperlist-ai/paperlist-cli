import { createServer, type IncomingMessage } from "node:http";

export const FIXTURE_TOKEN = "pl_test_fixture_token";

const CONFERENCES = [
  {
    slug: "iclr",
    name: "ICLR",
    full_name: "International Conference on Learning Representations",
    years: [2026, 2025],
    domains: ["Machine Learning"],
  },
  {
    slug: "neurips",
    name: "NeurIPS",
    full_name: "Neural Information Processing Systems",
    years: [2025, 2024],
    domains: ["Machine Learning"],
  },
];

const SLIM_PAPER = {
  id: "iclr2025-42",
  title: "A Study of Widgets",
  conference: "iclr",
  year: 2025,
  decision: "Oral",
  rating_avg: 8.1,
  url: "https://paperlist.ai/en/paper/iclr2025-42",
  topics: ["world-models"],
};

const FULL_PAPER = {
  id: "iclr2025-42",
  paper_id: 42,
  title: "A Study of Widgets",
  abstract: "We study widgets.",
  authors: ["Ada Lovelace"],
  conference: { slug: "iclr", name: "ICLR", year: 2025 },
  decision: "Oral",
  track: "Main",
  topics: [{ slug: "world-models", name: "World Models" }],
  keywords: ["widgets"],
  citation_count: 3,
  rating_avg: 8.1,
  published_at: "2025-01-01",
  links: {
    paperlist: "https://paperlist.ai/en/paper/iclr2025-42",
    paper: "https://example.com/paper",
    pdf: null,
    code: null,
    doi: null,
    openreview: null,
  },
  review_summary: "Reviewers liked the method.",
};

export interface FixtureServer {
  url: string;
  close: () => Promise<void>;
  requests: Array<{ method?: string; auth?: string; body: unknown }>;
}

export function startFixtureMcp(opts: { delayMs?: number } = {}): Promise<FixtureServer> {
  const requests: FixtureServer["requests"] = [];
  const server = createServer(async (req, res) => {
    if (req.method === "DELETE") {
      res.statusCode = 200;
      res.end();
      return;
    }
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }
    const body = await readBody(req);
    let parsed: any = {};
    try {
      parsed = body ? JSON.parse(body) : {};
    } catch {
      parsed = {};
    }
    const auth = req.headers.authorization;
    requests.push({
      method: parsed.method,
      auth: Array.isArray(auth) ? auth[0] : auth,
      body: parsed,
    });

    const respond = (status: number, payload: unknown, extra: Record<string, string> = {}) => {
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json");
      for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
      res.end(JSON.stringify(payload));
    };

    if (parsed.method === "initialize") {
      respond(200, {
        jsonrpc: "2.0",
        id: parsed.id,
        result: {
          protocolVersion: "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "paperlist-fixture", version: "0.0.0" },
        },
      });
      return;
    }
    if (parsed.method === "notifications/initialized") {
      res.statusCode = 202;
      res.end();
      return;
    }
    if (parsed.method === "tools/list") {
      respond(200, { jsonrpc: "2.0", id: parsed.id, result: { tools: [] } });
      return;
    }
    if (parsed.method === "ping") {
      respond(200, { jsonrpc: "2.0", id: parsed.id, result: {} });
      return;
    }
    if (parsed.method !== "tools/call") {
      respond(200, {
        jsonrpc: "2.0",
        id: parsed.id,
        error: { code: -32601, message: "Method not found" },
      });
      return;
    }

    const name = parsed.params?.name as string;
    const args = parsed.params?.arguments ?? {};
    const isAuthed = extractBearer(auth) === FIXTURE_TOKEN;
    const publicTool = name === "list_conferences";

    if (!publicTool && !isAuthed) {
      respond(
        401,
        {
          jsonrpc: "2.0",
          id: parsed.id ?? null,
          error: {
            code: -32001,
            message: "Sign-in required. Send Authorization: Bearer pl_... or sign in.",
          },
        },
        {
          "WWW-Authenticate":
            'Bearer error="invalid_request", error_description="Authentication required.", resource_metadata="https://paperlist.ai/.well-known/oauth-protected-resource/mcp", scope="papers:read"',
        },
      );
      return;
    }

    if (extractBearer(auth) === "pl_rate_limited" || args.query === "ratelimited") {
      respond(
        429,
        { jsonrpc: "2.0", id: parsed.id, error: { code: -32000, message: "Rate limit exceeded" } },
        { "Retry-After": "1" },
      );
      return;
    }

    if (name === "list_conferences") {
      const result: Record<string, unknown> = { conferences: CONFERENCES };
      if (args.topics_for) {
        result.topics = {
          conference: args.topics_for.conference,
          year: args.topics_for.year,
          paper_total: 2,
          items: [{ slug: "world-models", name: "World Models", paper_count: 2 }],
        };
      }
      respond(200, toolResult(parsed.id, result));
      return;
    }

    if (name === "search_papers") {
      if (args.query === "slow") {
        await sleep(opts.delayMs ?? 5_000);
      }
      if (args.query === "empty") {
        respond(
          200,
          toolResult(parsed.id, {
            papers: [],
            next_cursor: null,
            fields: args.fields ?? "slim",
            total: 0,
          }),
        );
        return;
      }
      const hasMore = args.cursor !== "page-2";
      respond(
        200,
        toolResult(parsed.id, {
          papers: [SLIM_PAPER],
          next_cursor: hasMore ? "page-2" : null,
          fields: args.fields ?? "slim",
          total: 2,
        }),
      );
      return;
    }

    if (name === "list_papers") {
      respond(
        200,
        toolResult(parsed.id, {
          papers: [SLIM_PAPER],
          next_cursor: null,
          fields: args.fields ?? "slim",
          total: 1,
          conference: args.conference,
          year: args.year,
        }),
      );
      return;
    }

    if (name === "get_paper") {
      if (args.id === "missing-id" || args.id === "invalid") {
        respond(200, toolError(parsed.id, "Paper not found"));
        return;
      }
      const paper = { ...FULL_PAPER, id: args.id };
      if (args.id === "no-review") {
        const copy = { ...paper };
        delete (copy as { review_summary?: string }).review_summary;
        (copy as { abstract?: string | null }).abstract = null;
        respond(200, toolResult(parsed.id, { paper: copy }));
        return;
      }
      respond(200, toolResult(parsed.id, { paper }));
      return;
    }

    if (name === "find_similar_papers") {
      respond(
        200,
        toolResult(parsed.id, {
          papers: [{ ...SLIM_PAPER, id: "iclr2025-99", title: "Related Widgets" }],
          next_cursor: null,
          total: 1,
        }),
      );
      return;
    }

    if (name === "list_topics") {
      respond(
        200,
        toolResult(parsed.id, { topics: [{ slug: "world-models", name: "World Models" }] }),
      );
      return;
    }
    if (name === "get_topic_stats") {
      respond(200, toolResult(parsed.id, { topic: args.topic, papers: 10 }));
      return;
    }

    respond(200, toolError(parsed.id, `Unknown tool ${name}`));
  });

  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("no address"));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${addr.port}/mcp`,
        requests,
        close: () =>
          new Promise<void>((res) => {
            server.close(() => res());
          }),
      });
    });
    server.on("error", reject);
  });
}

function toolResult(id: unknown, structuredContent: unknown) {
  return {
    jsonrpc: "2.0",
    id,
    result: {
      content: [{ type: "text", text: JSON.stringify(structuredContent) }],
      structuredContent,
    },
  };
}

function toolError(id: unknown, message: string) {
  return {
    jsonrpc: "2.0",
    id,
    result: {
      isError: true,
      content: [{ type: "text", text: message }],
    },
  };
}

function extractBearer(auth: string | string[] | undefined): string | undefined {
  const v = Array.isArray(auth) ? auth[0] : auth;
  if (!v) return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(v);
  return m?.[1];
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
