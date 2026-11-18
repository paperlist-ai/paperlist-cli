import type { FieldSet } from "../client/types.js";
import { ExitError } from "../errors.js";
import { emitJson } from "../output/emit.js";
import { printPaperList } from "../output/human.js";
import { collectRepeatable, createRuntime, type GlobalOpts, parseYear } from "./context.js";

export interface PapersOpts extends GlobalOpts {
  conference?: string;
  year?: string;
  decision?: string[];
  topic?: string;
  fields?: FieldSet;
  limit?: string;
  cursor?: string;
}

export async function runPapers(opts: PapersOpts): Promise<void> {
  if (!opts.conference || !opts.year) {
    throw new ExitError("usage", "`papers` requires --conference <slug> and --year <year>.");
  }
  const runtime = createRuntime(opts);
  const limit = opts.limit !== undefined ? Number(opts.limit) : undefined;
  const result = await runtime.client.listPapers({
    conference: opts.conference,
    year: parseYear(opts.year, "year") as number,
    decision: collectRepeatable(opts.decision),
    topic: opts.topic,
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
      conference: result.conference ?? opts.conference,
      year: result.year ?? Number(opts.year),
    });
    return;
  }
  printPaperList(result, `paperlist papers --conference ${opts.conference} --year ${opts.year}`);
}
