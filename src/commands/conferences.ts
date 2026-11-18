import { ExitError } from "../errors.js";
import { emitJson } from "../output/emit.js";
import { printConferences } from "../output/human.js";
import { createRuntime, type GlobalOpts, parseYear } from "./context.js";

export interface ConferencesOpts extends GlobalOpts {
  topicsFor?: string;
  year?: string;
}

export async function runConferences(opts: ConferencesOpts): Promise<void> {
  const runtime = createRuntime(opts);
  let topicsFor: { conference: string; year: number } | undefined;
  if (opts.topicsFor || opts.year) {
    if (!opts.topicsFor || !opts.year) {
      throw new ExitError(
        "usage",
        "topics-for requires both --topics-for <slug> and --year <year>.",
      );
    }
    topicsFor = { conference: opts.topicsFor, year: parseYear(opts.year, "year") as number };
  }
  const result = await runtime.client.listConferences(topicsFor);
  if (runtime.json) {
    emitJson({ ok: true, ...result });
    return;
  }
  printConferences(result);
}
