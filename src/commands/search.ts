import type { FieldSet, SortOrder } from "../client/types.js";
import { emitJson } from "../output/emit.js";
import { printPaperList } from "../output/human.js";
import { collectRepeatable, createRuntime, type GlobalOpts, parseYear } from "./context.js";

export interface SearchOpts extends GlobalOpts {
  conference?: string[];
  yearFrom?: string;
  yearTo?: string;
  decision?: string[];
  topic?: string;
  author?: string;
  sort?: SortOrder;
  fields?: FieldSet;
  limit?: string;
  cursor?: string;
}

export async function runSearch(query: string | undefined, opts: SearchOpts): Promise<void> {
  const runtime = createRuntime(opts);
  const limit = opts.limit !== undefined ? Number(opts.limit) : undefined;
  const result = await runtime.client.searchPapers({
    query: query?.trim() || undefined,
    conferences: collectRepeatable(opts.conference),
    year_from: parseYear(opts.yearFrom, "year-from"),
    year_to: parseYear(opts.yearTo, "year-to"),
    decision: collectRepeatable(opts.decision),
    topic: opts.topic,
    author: opts.author,
    sort: opts.sort,
    fields: opts.fields,
    limit: Number.isFinite(limit as number) ? limit : undefined,
    cursor: opts.cursor,
  });
  if (runtime.json) {
    emitJson({
      ok: true,
      papers: result.papers,
      paging: result.paging,
      ...(result.note ? { note: result.note } : {}),
      ...(result.fields ? { fields: result.fields } : {}),
      ...(result.total !== undefined ? { total: result.total } : {}),
    });
    return;
  }
  const hintParts = ["paperlist search"];
  if (query) hintParts.push(JSON.stringify(query));
  if (opts.cursor) hintParts.push("--cursor", opts.cursor);
  printPaperList(result, hintParts.join(" "));
}
