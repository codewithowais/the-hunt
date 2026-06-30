# CLAUDE.md

This project uses **KIS** (Knowledge / Intent / State) as its lightweight operating memory.

## At session start

Before planning or implementing anything, load the current project memory, starting with State:

- `kis/state/current.md` — current operational reality, proof, and next action (read first)
- `kis/intent/PRD.md` — product goals and guardrails
- `kis/knowledge/project.md` — durable facts (points back here for full architecture)

The KIS skill (`.claude/skills/kis/`) defines how to use and synchronize this memory.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**The Hunt** is a personal, single-user, locally-run job-search command center. It finds jobs, scores them against the user's resume, drafts cover letters / recruiter outreach / ATS-tailored CVs, and tracks the application pipeline. The defining architectural constraint: **AI runs through the user's Claude Code CLI (their Claude Max subscription), not the Anthropic API.** There is no API key anywhere — the server shells out to the `claude` binary.

## Commands

```bash
node server.js     # start the app on http://localhost:8787 (or: npm start)
```

- **There are no build, lint, test, or install steps.** `package.json` declares zero dependencies; `npm install` does nothing meaningful. The server uses only built-in Node modules.
- Open the app at `http://localhost:8787` — **not** by opening `index.html` directly (it must be served so `/api/*` and `/app.jsx` resolve).
- **Prerequisite for AI features:** the `claude` CLI must be installed (`npm install -g @anthropic-ai/claude-code`) and logged in to a subscription. The server invokes it via `spawn("claude", ["-p", prompt, "--output-format", "text"])`. If `claude` isn't on PATH, every AI action fails with a "Could not run `claude`" error.
- No transpile step despite `.jsx`/`.js` modules: the browser compiles them at runtime via Babel standalone (pinned to 7.x in `index.html` — see the gotchas below).

## Architecture

No framework, no bundler. Everything loads from CDN `<script>` tags in `index.html` (React 18 UMD, Tailwind CDN, Babel standalone, plus `papaparse`, `mammoth`, `pdfjs-dist` for client-side file parsing). The frontend is split into modules under `src/`, compiled in the browser and loaded in dependency order.

**`job-sources.js`** — the **no-login job-finding agent** (CommonJS module required by `server.js`, never served to the browser). Exports `gatherJobs(cfg, extraTasks)` + `stripHtml`/`hostOf`. Owns every public-source fetcher — Remotive, RemoteOK, Arbeitnow, **The Muse** (location-aware), **Jobicy** (remote), and Greenhouse/Lever/Ashby by slug — the country/region/city alias maps, and the whole filtering/ranking pipeline (keyword → dedupe+exclude → country soft-filter → work-type filter → recency → sort city→country→newest → slice to `limit`). None of it needs an account, API key, or `claude` login. Each fetcher tags jobs with a **`source`** string (e.g. "The Muse", "Careers · stripe"). `extraTasks` are pre-invoked promises the server folds in (the login-only AI search).

**`server.js`** — Node HTTP server on port 8787. Four responsibilities:
1. **Static** — serves `index.html` at `/`, and frontend modules under `/src/*` (allowlisted extensions, path-traversal-guarded, so `data.json`, `job-sources.js`, and other root files are NOT exposed).
2. **Job search** (`POST /api/search`): calls `gatherJobs(cfg, extraTasks)` from `job-sources.js`. When `useWebSearch` is set (on by default) it adds the one **login-only** source, `fetchAiWebSearch(cfg)` — shells out to `claude` with the **WebSearch tool allowlisted** (`runClaude(prompt,{allowedTools:"WebSearch"})`) to discover companies' career-page postings with direct apply links; best-effort (returns `[]` if not signed in), strips LinkedIn/Indeed. **LinkedIn/Indeed are deliberately excluded everywhere** — no open API and automation risks bans; those come in manually via "Add job".
3. **AI proxy** (`POST /api/claude`): takes `{prompt}`, runs it through `runClaude()` (spawns the `claude` CLI, with a timeout), and returns `{content: [{type:"text", text}]}` — an Anthropic-API-shaped envelope so the client can treat it uniformly.
4. **Persistence** (`GET`/`POST /api/data`): reads/writes the entire app state (`{jobs, profile}`) to `data.json` on disk. Git-ignored; the user's only datastore — there is no database.

**`src/` (frontend modules, loaded in this order — order matters, see gotchas):**
- `core.js` — constants, pure helpers, country list, the API client, and the **prompt builders** (`scorePrompt`, `tailorPrompt`, `autofillPrompt`). Declares the React hook aliases (`useState`, etc.) **once** for the whole app. No JSX.
- `icons.jsx` — the stroke-icon set built on one `<Svg>` primitive.
- `components.jsx` — UI primitives (`Modal`, `CopyBtn`, `Section`, `ScorePill`, `useEscape`) and the feature panels (`HuntWizard`, `AddJob`, `SettingsModal`, `JobCard`, `Drawer`).
- `app.jsx` — `JobTracker` root (owns all state via `usePersistentState`, runs the hunt pipeline) and the `ReactDOM.createRoot(...).render()` call.

A `Job` object is created by `blankJob()` and carries everything: search fields, the `country` preference, AI outputs (`score`, `reason`, `coverLetter`, `outreachEmail`), tailored-CV fields (`tailoredResume`, `atsScore`, `atsMatched`, `atsMissing`), and pipeline fields (`status`, `response`, `notes`).

### The AI flow (the core logic)

Prompts are built by the `*Prompt()` functions in `src/core.js`. The model returns text; the client parses it. Two key helpers:
- `callClaude(prompt)` → expects JSON, parsed by `parseJson()` (strips ```` ```json ```` fences, falls back to regex-matching the first `{...}`).
- `parseTailored(text)` → parses the CV-tailoring response, which uses literal `###RESUME###` / `###ATS###` delimiters instead of JSON (the resume body is freeform text, so it can't be a JSON string).

The hunt pipeline (`runHunt` in `app.jsx`): search → create blank jobs (stamped with the hunt's `country`) → for each, `scoreAndDraft()` (one Claude call returning score + reason + cover letter + outreach email) → if `score < TAILOR_THRESHOLD` (75) and a resume exists, automatically `tailorResume()` (a second Claude call). Calls run **sequentially** per job (each is a separate CLI spawn, so they're slow — this is intentional, not a bug to "fix" with parallelism without considering CLI load).

## Conventions & gotchas

- **Module load order is load-bearing.** The `src/` files are classic scripts sharing one global lexical scope (no ES modules/bundler). They MUST load core → icons → components → app. Declare shared bindings (e.g. the React hook aliases) **exactly once** — re-`const`-ing `useState` in a second file is a duplicate-declaration SyntaxError. New top-level symbols are global; reference across files freely as long as the defining file loads first.
- **Babel is pinned to `@7.29.7`** in `index.html`. Babel 8's React preset defaults to the automatic JSX runtime (`import "react/jsx-runtime"`), which breaks this bundler-less UMD-React setup. Don't unpin it. (React/ReactDOM are also pinned; Tailwind CDN is not — a latent drift risk.)
- **Prompts encode hard product rules** — especially `tailorPrompt`'s "NEVER invent or exaggerate" constraint and the honest ATS `missing` list. These are deliberate product/ethics decisions (see README "Good to know"); preserve them when editing prompts.
- **Location filtering** (`job-sources.js`): **country** is a *soft preference* (`applyCountry` + `COUNTRY_ALIASES` + `REGION_ALIASES` — keeps jobs naming the country, its region e.g. "Europe", remote/worldwide, or no location; drops only other named places). **city** is free text that only *re-ranks* (never drops — `cityPattern`/`locationRank`: city match → country match → region/remote). **workType** (`applyWorkType`) is an explicit *filter* (Remote/Hybrid/On-site/Any); note Remotive+RemoteOK are remote-only, so On-site comes from Arbeitnow + company pages. Sort order: city → country → newest-first. The client lists (`COUNTRIES` ~90 countries, `CITY_SUGGESTIONS` per-country city lists, `WORK_TYPES` in `core.js`) and the server alias maps are intentionally separate — keep labels in sync. The City field is an `<input list=…>` + `<datalist>` (a combobox): it suggests the country's cities **and** accepts any typed value. Any country with no curated `COUNTRY_ALIASES` entry still filters by its own name via `aliasesFor()` (name-fallback), so the country list can grow without touching the server.
- **`minScore` filter defaults to 90** (`app.jsx`) — the list shows only strong matches out of the box; the slider lowers it. (Distinct from `TAILOR_THRESHOLD = 75`, which controls auto-tailoring.)
- Pipeline stages are the constant `STAGES` (`New → Applied → Screening → Interview → Offer`) plus `Rejected`; `TAILOR_THRESHOLD = 75` controls auto-tailoring.
- State persisted to `data.json` is exactly `{jobs: [...], profile: {resume, titles, location, country}}`. Loaded jobs are re-spread through `blankJob()` so older records backfill new fields — handle missing fields gracefully this way.
- Descriptions sent to the model are truncated (`.slice(0, DESC_LIMIT)`, 4000) to bound prompt size.
- It **prepares** applications; it never auto-submits. Don't add auto-apply behavior.
