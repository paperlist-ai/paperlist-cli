# Contributing

This is a small TypeScript CLI for the hosted Paperlist MCP server.

1. Use Node.js 20 or later.
2. Run `npm install`, then `npm run lint`, `npm run typecheck`, `npm test`, and `npm run pack:smoke` (pack, install, and the published bin; not part of `npm test`).
3. Do not commit credentials, `.env` files, or production tokens.
4. Do not point tests at a personal config directory; isolate `HOME` / `XDG_CONFIG_HOME`.
5. New filters or response fields should come from the live `tools/list` schema, not from guesswork.
6. Do not add telemetry.

If you need a change in the hosted API itself, that is outside this repository.
