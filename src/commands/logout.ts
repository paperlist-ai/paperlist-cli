import { emitDiag, emitJson } from "../output/emit.js";
import { createRuntime, type GlobalOpts } from "./context.js";

export async function runLogout(opts: GlobalOpts): Promise<void> {
  const runtime = createRuntime(opts);
  await runtime.store.clear();
  const message =
    "Local credentials were deleted from this machine. This does not necessarily revoke tokens or API keys on the server.";
  if (runtime.json) {
    emitJson({ ok: true, cleared: true, message });
    return;
  }
  emitDiag(message);
}
