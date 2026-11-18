import { Command, Option } from "commander";
import { runAuthStatus } from "./commands/auth.js";
import { runConferences } from "./commands/conferences.js";
import { runLogin } from "./commands/login.js";
import { runLogout } from "./commands/logout.js";
import { runPaper } from "./commands/paper.js";
import { runPapers } from "./commands/papers.js";
import { runSearch } from "./commands/search.js";
import { runSimilar } from "./commands/similar.js";
import { runTopicStats, runTopics } from "./commands/topics.js";
import { ExitError } from "./errors.js";
import { VERSION } from "./version.js";

function addGlobalOptions(cmd: Command): Command {
  return cmd
    .option("--json", "Write a stable JSON document to stdout; diagnostics go to stderr")
    .option("--timeout <ms>", "Request timeout in milliseconds (default 30000)")
    .option(
      "--mcp-url <url>",
      "Development only: MCP endpoint (default https://paperlist.ai/mcp). Stored or env credentials are never sent to a non-production, non-loopback URL.",
    )
    .option(
      "--dev-send-credentials",
      "Development only: allow sending local/env credentials to a loopback --mcp-url",
    );
}

export function buildProgram(): Command {
  const program = new Command("paperlist")
    .description("CLI for the hosted Paperlist MCP server (AI conference papers).")
    .version(VERSION, "-V, --version", "Show version")
    .showHelpAfterError()
    .configureHelp({ showGlobalOptions: true })
    .exitOverride((err) => {
      // Help and --version use exitCode 0; let main() treat that as success.
      throw err.exitCode === 0 ? err : new ExitError("usage", err.message.replace(/^error: /i, ""));
    });

  addGlobalOptions(program);

  program
    .command("conferences")
    .description("List conferences (anonymous). Optionally include topics for one edition.")
    .option("--topics-for <slug>", "Conference slug whose topics should also be returned")
    .option("--year <year>", "Edition year (required with --topics-for)")
    .action(async (opts, cmd) => {
      await runConferences({ ...cmd.optsWithGlobals(), ...opts });
    });

  program
    .command("search")
    .description("Search papers. Requires authentication. Does not fetch every page automatically.")
    .argument("[query]", "Search words (quoted phrases, OR/AND/NOT). Optional if filters are set.")
    .option("--conference <slug>", "Conference slug; repeat or comma-separate", collect, [])
    .option("--year-from <year>", "First year to include")
    .option("--year-to <year>", "Last year to include")
    .option(
      "--decision <value>",
      "Acceptance type, e.g. Oral; repeat or comma-separate",
      collect,
      [],
    )
    .option("--topic <slug>", "Topic slug from conferences --topics-for")
    .option("--author <name>", "Author name tokens (must match one author)")
    .addOption(
      new Option("--sort <order>", "Sort order").choices(["relevance", "citations", "newest"]),
    )
    .addOption(
      new Option("--fields <set>", "slim (default) or full (includes abstracts)").choices([
        "slim",
        "full",
      ]),
    )
    .option("--limit <n>", "Page size (slim search default 10, max 200; full max 25)")
    .option("--cursor <token>", "next_cursor from a previous page")
    .action(async (query, opts, cmd) => {
      await runSearch(query, { ...cmd.optsWithGlobals(), ...opts });
    });

  program
    .command("paper")
    .description(
      "Show one paper's full record. Abstract and review summary appear only when the server returns them. Requires authentication.",
    )
    .argument("<id>", "Paper id from search or list results")
    .action(async (id, opts, cmd) => {
      await runPaper(id, { ...cmd.optsWithGlobals(), ...opts });
    });

  program
    .command("papers")
    .description("List papers in one conference edition. Requires authentication.")
    .requiredOption("--conference <slug>", "Conference slug, e.g. iclr")
    .requiredOption("--year <year>", "Edition year")
    .option("--decision <value>", "Acceptance type; repeat or comma-separate", collect, [])
    .option("--topic <slug>", "Topic slug")
    .addOption(new Option("--fields <set>", "slim (default) or full").choices(["slim", "full"]))
    .option("--limit <n>", "Page size (slim default 100, max 250; full max 25)")
    .option("--cursor <token>", "next_cursor from a previous page")
    .action(async (opts, cmd) => {
      await runPapers({ ...cmd.optsWithGlobals(), ...opts });
    });

  program
    .command("similar")
    .description("Find papers similar to one id. Requires authentication.")
    .argument("<id>", "Paper id")
    .option("--conference <slug>", "Conference slug; repeat or comma-separate", collect, [])
    .option("--year-from <year>", "First year to include")
    .option("--year-to <year>", "Last year to include")
    .addOption(new Option("--fields <set>", "slim (default) or full").choices(["slim", "full"]))
    .option("--limit <n>", "Page size (slim max 200; full max 25)")
    .option("--cursor <token>", "next_cursor from a previous page")
    .action(async (id, opts, cmd) => {
      await runSimilar(id, { ...cmd.optsWithGlobals(), ...opts });
    });

  program
    .command("topics")
    .description("List research topics. Requires authentication.")
    .action(async (opts, cmd) => {
      await runTopics({ ...cmd.optsWithGlobals(), ...opts });
    });

  program
    .command("topic-stats")
    .description("Show stats for one topic slug. Requires authentication.")
    .argument("<topic>", "Topic slug from `topics` or conferences --topics-for")
    .action(async (topic, opts, cmd) => {
      await runTopicStats(topic, { ...cmd.optsWithGlobals(), ...opts });
    });

  program
    .command("login")
    .description(
      "Sign in. OAuth opens a browser only in this command when the terminal is interactive. Prefer an API key for scripts.",
    )
    .option("--api-key", "Prompt on a TTY for an API key (the key is not passed as an argument)")
    .option("--api-key-stdin", "Read the API key from stdin")
    .action(async (opts, cmd) => {
      await runLogin({ ...cmd.optsWithGlobals(), ...opts });
    });

  program
    .command("logout")
    .description(
      "Delete local credentials. This does not reliably revoke server-side tokens or keys.",
    )
    .action(async (opts, cmd) => {
      await runLogout({ ...cmd.optsWithGlobals(), ...opts });
    });

  const auth = program.command("auth").description("Show or manage authentication.");
  auth
    .command("status", { isDefault: true })
    .description("Show how this CLI is authenticated (secrets are redacted)")
    .action(async (opts, cmd) => {
      await runAuthStatus({ ...cmd.optsWithGlobals(), ...opts });
    });

  program.addHelpText(
    "after",
    `
list_conferences is anonymous. search, paper, papers, similar, topics, and topic-stats require a Paperlist account.

Do not pass API keys on the command line. Use PAPERLIST_API_KEY, \`paperlist login --api-key\`, or \`paperlist login --api-key-stdin\`.

This CLI talks to the hosted MCP server at https://paperlist.ai/mcp. It does not crawl every page unless you pass --cursor yourself.
`,
  );

  return program;
}

function collect(value: string, previous: string[]): string[] {
  return previous.concat(value);
}
