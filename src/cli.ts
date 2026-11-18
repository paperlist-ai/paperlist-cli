import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CommanderError } from "commander";
import { rejectApiKeyValueOnArgv } from "./commands/login.js";
import { asExitError, EXIT_CODES, ExitError } from "./errors.js";
import { emitHumanError, emitJsonError } from "./output/emit.js";
import { buildProgram } from "./program.js";

export async function main(argv: string[] = process.argv): Promise<number> {
  const json = argv.includes("--json");
  const program = buildProgram();
  try {
    rejectApiKeyValueOnArgv(argv);
    await program.parseAsync(argv);
    return EXIT_CODES.ok;
  } catch (err) {
    if (err instanceof CommanderError) {
      if (err.exitCode === 0) return 0;
      const exit = new ExitError("usage", err.message.replace(/^error: /i, ""));
      if (json) emitJsonError(exit);
      else emitHumanError(exit);
      return exit.exitCode;
    }
    const exit = asExitError(err);
    if (json) emitJsonError(exit);
    else emitHumanError(exit);
    return exit.exitCode;
  }
}

const entry = process.argv[1];
if (entry && realpathSync(entry) === fileURLToPath(import.meta.url)) {
  process.stdout.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EPIPE") process.exit(0);
    throw err;
  });
  process.exitCode = await main();
}
