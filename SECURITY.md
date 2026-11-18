# Security

- Do not pass API keys on the command line. Use `PAPERLIST_API_KEY`, `paperlist login --api-key`, or `--api-key-stdin`.
- Report vulnerabilities through the Paperlist site (https://paperlist.ai) rather than filing a public issue with secrets attached. This file does not list a personal email address.
- Stored credentials live in the platform config directory with restricted POSIX permissions. `logout` only deletes the local file.
