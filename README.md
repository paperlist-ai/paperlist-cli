# @paperlist/cli

Command-line client for the hosted [Paperlist](https://paperlist.ai) MCP server at `https://paperlist.ai/mcp`. It searches and reads AI conference papers through the official Model Context Protocol SDK (Streamable HTTP). It does not run a local paper index and does not add a private REST API.

The published npm package is `@paperlist/cli`. The command it installs is `paperlist`.

## Install

Requires Node.js 20 or later.

```bash
npm install -g @paperlist/cli
paperlist --help
paperlist --version
```

Or run without a global install:

```bash
npx @paperlist/cli --help
```

## Authentication

- `list_conferences` (the `conferences` command, including `--topics-for`) works anonymously.
- `search`, `paper`, `papers`, `similar`, `topics`, and `topic-stats` require a Paperlist account.
- Credential resolution: `PAPERLIST_API_KEY` (environment) wins, then a locally stored API key, then a stored OAuth access token. Keys are sent as `Authorization: Bearer …`.
- Published Paperlist API keys start with `pl_`. Create one in dashboard settings: https://paperlist.ai/en/dashboard/settings?tab=keys
- **Never pass a key on the command line.** `paperlist login --api-key` is a boolean flag: it prompts on a TTY without echo. For scripts, use `PAPERLIST_API_KEY` or `paperlist login --api-key-stdin`.
- `paperlist login` without flags starts an OAuth authorization-code + PKCE flow and opens a browser only in an interactive terminal. Non-interactive sessions fail with instructions instead of opening a browser.
- OAuth uses the server's public discovery documents and, when advertised, dynamic client registration as a public client (`token_endpoint_auth_method=none`). This CLI does not ship a public HTTPS Client ID Metadata Document URL, so CIMD is not used.
- Tokens and keys are stored in a platform config directory (`~/.config/paperlist` on Linux, `~/Library/Application Support/paperlist` on macOS, `%APPDATA%\paperlist` on Windows) with directory mode `0700` and file mode `0600` on POSIX. Writes are atomic.
- Stored credentials are only sent to `https://paperlist.ai/mcp`. A documented `--mcp-url` is for development. `--dev-send-credentials` is required to send local/env credentials, and even then only to a loopback address.
- `paperlist logout` deletes the local credentials file. It does not reliably revoke server-side tokens or API keys.
- This CLI does not register Paperlist user accounts and does not collect telemetry.

## Commands

Global options: `--json`, `--timeout <ms>` (default 30000), `--mcp-url <url>` (development), `--dev-send-credentials` (development, loopback only).

| Command | MCP tool | Auth |
| --- | --- | --- |
| `paperlist conferences [--topics-for <slug> --year <year>]` | `list_conferences` | Anonymous |
| `paperlist search [query] [--conference] [--year-from] [--year-to] [--decision] [--topic] [--author] [--sort] [--fields] [--limit] [--cursor]` | `search_papers` | Required |
| `paperlist paper <id>` | `get_paper` | Required |
| `paperlist papers --conference <slug> --year <year> [--decision] [--topic] [--fields] [--limit] [--cursor]` | `list_papers` | Required |
| `paperlist similar <id> [--conference] [--year-from] [--year-to] [--fields] [--limit] [--cursor]` | `find_similar_papers` | Required |
| `paperlist topics` | `list_topics` | Required |
| `paperlist topic-stats <topic>` | `get_topic_stats` | Required |
| `paperlist login [--api-key \| --api-key-stdin]` | — | — |
| `paperlist logout` | — | — |
| `paperlist auth status` | — | — |

`--conference` and `--decision` may be repeated or comma-separated. Filters match what the hosted `search_papers` / `list_papers` / `find_similar_papers` tools actually accept (`sort` is `relevance|citations|newest`; `fields` is `slim|full`).

The compatibility MCP tools `search` and `fetch` are not exposed as first-class commands; `search` here maps to `search_papers`, and `paper` maps to `get_paper`.

## Output, paging, and empty results

- Default output is human-readable. `--json` writes a stable JSON document to **stdout** only. Diagnostics and JSON errors go to **stderr**.
- Empty result lists are success (exit 0), with `paging.has_more: false` when there is no `next_cursor`.
- The CLI never walks every page by itself. When `next_cursor` is present, human output prints a command with `--cursor`, and JSON includes `"paging": { "next_cursor": "...", "has_more": true }`.
- `slim` is the server default. `full` includes abstracts when the server returns them. Page size limits follow the server: slim search max 200 (default 10), `papers` slim max 250 (default 100), `full` max 25.
- `get_paper` prints an abstract or review summary only when the server includes one. Those fields are not assumed to exist for every paper.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success, including empty lists |
| 1 | Local error |
| 2 | Usage or invalid arguments |
| 3 | Authentication required or failed |
| 4 | Rate limited (retries honor `Retry-After`, bounded) |
| 5 | Network error or timeout |
| 6 | API / tool error |

Safe, idempotent reads may be retried a small number of times on transient failures (429, 502, 503, 504, network). Authentication and invalid-argument errors are not retried.

## Limitations

- BibTeX export is not implemented. The current hosted tools have not been verified to return BibTeX metadata.
- OAuth still needs a person to approve the browser prompt. Automated tests cover discovery, PKCE, state, callback, and refresh against a local fixture. A production OAuth login has not been end-to-end authorized in this repository's test run.
- This CLI cannot invent a public CIMD `client_id` URL. If dynamic client registration is rejected by the production authorization server, use an API key and report the server's error; this project does not change the Paperlist backend.

## Development

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

Tests use a local fixture MCP server. They do not need a production API key and they do not touch your real Paperlist config directory (they isolate `HOME` / `XDG_CONFIG_HOME`). Optional live checks against `https://paperlist.ai/mcp` are anonymous `conferences` plus the auth boundary for `search`; protected live searches run only when `PAPERLIST_API_KEY` is already set in the environment.

## License

MIT, Copyright (c) 2026 PaperList.
