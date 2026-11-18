import { emitJson } from "../output/emit.js";
import { printPaper } from "../output/human.js";
import { createRuntime, type GlobalOpts } from "./context.js";

export async function runPaper(id: string, opts: GlobalOpts): Promise<void> {
  const runtime = createRuntime(opts);
  const result = await runtime.client.getPaper(id);
  if (runtime.json) {
    emitJson({ ok: true, paper: result.paper, ...(result.note ? { note: result.note } : {}) });
    return;
  }
  printPaper(result);
}
