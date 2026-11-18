import { emitJson } from "../output/emit.js";
import { printGeneric } from "../output/human.js";
import { createRuntime, type GlobalOpts } from "./context.js";

export async function runTopics(opts: GlobalOpts): Promise<void> {
  const runtime = createRuntime(opts);
  const result = await runtime.client.listTopics();
  if (runtime.json) {
    emitJson({ ok: true, data: result });
    return;
  }
  printGeneric(result);
}

export async function runTopicStats(topic: string, opts: GlobalOpts): Promise<void> {
  const runtime = createRuntime(opts);
  const result = await runtime.client.getTopicStats(topic);
  if (runtime.json) {
    emitJson({ ok: true, data: result });
    return;
  }
  printGeneric(result);
}
