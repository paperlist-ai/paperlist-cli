import { FULL_FIELDS_MAX, SLIM_LIST_MAX, SLIM_SEARCH_MAX } from "../constants.js";
import { ExitError } from "../errors.js";
import { type McpClientOptions, McpTransport } from "./mcp.js";
import type {
  ConferencesResult,
  FieldSet,
  ListPapersInput,
  PaperListResult,
  PaperResult,
  SearchPapersInput,
  SimilarPapersInput,
  TopicsFor,
} from "./types.js";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pagingFrom(data: Record<string, unknown>): PaperListResult["paging"] {
  const cursor = data.next_cursor;
  const next = typeof cursor === "string" && cursor.length > 0 ? cursor : null;
  return { next_cursor: next, has_more: next !== null };
}

function listResult(data: Record<string, unknown>): PaperListResult {
  const papers = Array.isArray(data.papers) ? data.papers : [];
  const result: PaperListResult = { papers, paging: pagingFrom(data) };
  if (typeof data.note === "string") result.note = data.note;
  if (typeof data.fields === "string") result.fields = data.fields;
  if (typeof data.total === "number" || data.total === null)
    result.total = data.total as number | null;
  if (typeof data.conference === "string") result.conference = data.conference;
  if (typeof data.year === "number") result.year = data.year;
  return result;
}

export function limitCap(
  kind: "search" | "list" | "similar",
  fields: FieldSet | undefined,
): number {
  if (fields === "full") return FULL_FIELDS_MAX;
  if (kind === "list") return SLIM_LIST_MAX;
  return SLIM_SEARCH_MAX;
}

export function assertLimit(
  kind: "search" | "list" | "similar",
  limit: number | undefined,
  fields?: FieldSet,
): void {
  if (limit === undefined) return;
  const cap = limitCap(kind, fields);
  if (!Number.isInteger(limit) || limit < 1 || limit > cap) {
    throw new ExitError(
      "usage",
      `limit must be an integer between 1 and ${cap} for ${fields === "full" ? "full" : "slim"} ${kind} results.`,
    );
  }
}

export class PaperlistClient {
  private readonly transport: McpTransport;

  constructor(opts: McpClientOptions = {}) {
    this.transport = new McpTransport(opts);
  }

  get mcpUrl(): string {
    return this.transport.mcpUrl;
  }

  async listConferences(topicsFor?: TopicsFor): Promise<ConferencesResult> {
    const args: Record<string, unknown> = {};
    if (topicsFor) args.topics_for = { conference: topicsFor.conference, year: topicsFor.year };
    const { structured, text } = await this.transport.callTool("list_conferences", args);
    const data = structured ?? safeJson(text);
    const rec = asRecord(data);
    if (!Array.isArray(rec.conferences)) rec.conferences = [];
    return rec as unknown as ConferencesResult;
  }

  async searchPapers(input: SearchPapersInput): Promise<PaperListResult> {
    assertLimit("search", input.limit, input.fields);
    const { structured, text } = await this.transport.callTool("search_papers", compact(input));
    return listResult(asRecord(structured ?? safeJson(text)));
  }

  async getPaper(id: string): Promise<PaperResult> {
    if (!id.trim()) throw new ExitError("usage", "Paper id is required.");
    const { structured, text } = await this.transport.callTool("get_paper", { id });
    const rec = asRecord(structured ?? safeJson(text));
    const paper = asRecord(rec.paper ?? rec);
    if (!paper.id && !paper.title) {
      throw new ExitError("api", "The server did not return a paper record.");
    }
    const out: PaperResult = { paper };
    if (typeof rec.note === "string") out.note = rec.note;
    return out;
  }

  async listPapers(input: ListPapersInput): Promise<PaperListResult> {
    if (!input.conference) throw new ExitError("usage", "conference is required.");
    if (!Number.isInteger(input.year)) throw new ExitError("usage", "year must be an integer.");
    assertLimit("list", input.limit, input.fields);
    const { structured, text } = await this.transport.callTool("list_papers", compact(input));
    return listResult(asRecord(structured ?? safeJson(text)));
  }

  async findSimilar(input: SimilarPapersInput): Promise<PaperListResult> {
    if (!input.id.trim()) throw new ExitError("usage", "Paper id is required.");
    assertLimit("similar", input.limit, input.fields);
    const { structured, text } = await this.transport.callTool(
      "find_similar_papers",
      compact(input),
    );
    return listResult(asRecord(structured ?? safeJson(text)));
  }

  async listTopics(): Promise<unknown> {
    const { structured, text } = await this.transport.callTool("list_topics", {});
    return structured ?? safeJson(text) ?? { text };
  }

  async getTopicStats(topic: string): Promise<unknown> {
    if (!topic.trim()) throw new ExitError("usage", "topic is required.");
    const { structured, text } = await this.transport.callTool("get_topic_stats", { topic });
    return structured ?? safeJson(text) ?? { text };
  }
}

function compact(input: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

function safeJson(text: string): Record<string, unknown> | undefined {
  if (!text) return undefined;
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}
