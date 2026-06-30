# Knowledge — project

**The Hunt** — a personal, single-user, locally-run job-search command center. Finds jobs, scores them against the user's resume, drafts cover letters / recruiter outreach / ATS-tailored CVs, and tracks the application pipeline.

## Durable facts / decisions
- AI runs through the user's **Claude Code CLI** (Claude Max subscription), not the Anthropic API. No API key anywhere — `server.js` spawns the `claude` binary.
- Four files, zero npm dependencies, no build step. React/Tailwind/Babel + file parsers load from CDN; server uses only built-in Node modules. Requires Node ≥18.
- It **prepares** applications; never auto-submits. LinkedIn/Indeed deliberately excluded (no open API; automation risks bans) — added manually via "Add job".
- Single datastore: `data.json` on disk (git-ignored). No database.

## Full architecture & conventions
See [CLAUDE.md](../../CLAUDE.md) — it is the authoritative technical reference (commands, architecture, AI flow, gotchas). Do not duplicate it here; update it there.
