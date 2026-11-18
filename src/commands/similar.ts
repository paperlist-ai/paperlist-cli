import type { FieldSet } from "../client/types.js";
import { emitJson } from "../output/emit.js";
import { printPaperList } from "../output/human.js";
import { collectRepeatable, createRuntime, type GlobalOpts, parseYear } from "./context.js";

export interface SimilarOpts extends GlobalOpts {
  conference?: string[];
  yearFrom?: string;
  yearTo?: string;
  fields?: FieldSet;
  limit?: string;
  cursor?: string;
}

export async function runSimilar(id: string, opts: SimilarOpts): Promise<void> {
  const runtime = createRuntime(opts);
  const limit = opts.limit !== undefined ? Number(opts.limit) : undefined;
  const result = await runtime.client.findSimilar({
    id,
    conferences: collectRepeatable(opts.conference),
    year_from: parseYear(opts.yearFrom, "year-from"),
    year_to: parseYear(opts.yearTo, "year-to"),
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
  printPaperList(result, `paperlist similar ${id}`);
}
