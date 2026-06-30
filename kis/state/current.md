# State — current

What branch?  No git repo (not initialized).
What task?    Refactor (modularize, zero-build) + add country filter to hunt. DONE.
What command? `node server.js` → http://localhost:8787  (Preview: launch.json "the-hunt")
What blocker? **`claude` is NOT signed in** (verified: `claude -p` → 401 Invalid auth). Search/UI work; AI scoring/drafting/tailoring will fail until the user runs `claude` and logs in. App now shows a clear "Claude Code isn't signed in…" message and keeps the data clean (score stays null).
What's next?  User runs `claude` in terminal, logs in with Max account. Then AI features work.

## Status: ready to run (refactored)

## Architecture now (changed this session)
- Frontend split from one app.jsx into `src/`: core.js (consts/utils/api/prompts + React hook aliases), icons.jsx, components.jsx, app.jsx. Loaded in THAT order as classic scripts sharing one global scope (no bundler). Order is load-bearing; declare shared bindings once.
- server.js: serves `/src/*` (allowlisted ext, traversal-guarded — data.json NOT exposed), per-source fetch timeouts, claude timeout, country soft-filter.
- Country feature: HuntWizard has a Country select (COUNTRIES in core.js); server `applyCountry`/`COUNTRY_ALIASES` filters soft (keep country-match OR remote OR unknown; drop other named places; country matches sort first). Job carries `country`; profile has `country`.
- a11y added: role=dialog/aria-modal, ESC-to-close (useEscape), labels, keyboard-activatable cards.

## Done (this session)
- Authored CLAUDE.md (project guide).
- Upgraded Node 16 → 25 via `sudo n 25.0.0` (Node 16 broke `fetch()` in server.js).
- Confirmed zero npm dependencies (by design — empty dependency tree).
- Bootstrapped KIS.
- FIXED blank-page bug: pinned `@babel/standalone` to `@7.29.7` in index.html.
- Refactored frontend into `src/` modules (kept zero-build); hardened server.js; added country soft-filter; a11y pass. Deleted old root app.jsx.
- "Return 10" work: added Arbeitnow source (bigger pool), region-aware country matching (REGION_ALIASES — "Europe"/"Americas" count), server-side `exclude` of existing tracker URLs (re-hunts fill to limit), honest shortfall message in UI.
- Auth handling: runClaude now closes stdin (no 3s warning) + detects 401/auth → friendly "Claude Code isn't signed in" message. Verified end-to-end in browser.
- Location targeting expanded: 24 countries (added Saudi Arabia, Qatar, Italy, Switzerland, Sweden, Japan, Brazil); free-text **City** field w/ per-country datalist (CITY_SUGGESTIONS); city re-ranks (soft, no drop) via cityPattern/locationRank. **Work type** filter (Any/Remote/Hybrid/On-site) via applyWorkType. Job carries country/city/workType; fed into scorePrompt. Verified: Germany+Berlin → Berlin ranks #1-2; On-site → 39 jobs.
- Tailoring robustness: tailorResume no longer fails silently — validates output (>=40 chars) and sets `tailorError` shown in Drawer. Auto-tailor still triggers on score<75 with a resume.
- AI web search source (opt-in `useWebSearch`): runClaude now takes opts incl. `allowedTools:"WebSearch"`; fetchAiWebSearch asks claude (web) for public postings → JSON array, strips LinkedIn/Indeed. Graceful [] if not signed in (verified: returns board results, ~8s, no error). NOTE: full web-search path UNVERIFIED end-to-end (claude not logged in).
- Country list expanded to ~63 (was 24) across all continents. Server `aliasesFor()` name-fallback → any country filters by its own name even without curated aliases; added regions for new ones. Verified: Nigeria/South Korea/Mexico/Netherlands filter correctly.
- minScore filter default 0 → **90** (show only strong matches; slider lowers). Deliberately did NOT add LinkedIn/Indeed browser scraping (ban-risk product rule) — used AI web search instead.
- AI company/career-page discovery now **ON by default** (useWebSearch=true). fetchAiWebSearch prompt reworked: discover companies hiring in chosen city/country → read their career pages → return DIRECT apply links. Wizard label is dynamic ("Find companies hiring in {place} and search their career pages (AI)"). Still needs claude login (graceful [] otherwise) — UNVERIFIED end-to-end.
- Every job now carries a **`source`** reference (Remotive/RemoteOK/Arbeitnow/"Careers · slug"/web domain). UI shows "via {source}" on cards + "Reference: …" in drawer, plus a prominent **Apply** link (card) / button (drawer) to the direct URL. Verified via seeded job.
- Countries expanded to **90** (all continents); CITY_SUGGESTIONS now covers ~75 countries with multiple cities each. City field is a datalist combobox: pick a suggestion OR type any city (verified custom "Aswan" accepted). New countries filter via name-fallback + added region aliases (verified Egypt/Taiwan/Nigeria).
- **No-login job-finding agent**: extracted all public-source fetching + filtering into `job-sources.js` (CommonJS, required by server.js, not web-served). Added two no-login sources: **The Muse** (location-aware — real city/company jobs) and **Jobicy** (remote). server.js slimmed to require `gatherJobs`; AI web search stays in server.js, passed as an extraTask. Verified: London → 10 jobs (9 The Muse, all London); Riyadh → 10; all without claude login. Wizard label: "Public job boards — Remotive, RemoteOK, Arbeitnow, The Muse & Jobicy. No login, no setup."

## Bug fixed: blank page / "Cannot use import statement outside a module"
- Root cause: index.html loaded `@babel/standalone` **unpinned** → drifted to **8.0.3**. Babel 8's
  React preset defaults to the *automatic* JSX runtime, which emits `import "react/jsx-runtime"`.
  This app has no bundler and uses UMD-global React, so that import threw → React never mounted.
- Fix: pin to `@babel/standalone@7.29.7` (classic runtime default → `React.createElement`, no import).
- Lesson: pin CDN deps. React is pinned (@18); Tailwind is still unpinned (`cdn.tailwindcss.com`) — a latent drift risk, not yet biting.

## Proof
- `node --version` → v25.0.0
- `npm ls --depth=0` → empty (0 deps, expected)
- Server boot: `GET /` → 200, `GET /app.jsx` → 200, `POST /api/search` → 200 (real RemoteOK job → `fetch()` works on Node 25)
- Reproduced transform: Babel 8.0.3 `presets:[react]` emits `import`; Babel 7.29.7 emits `React.createElement` (no import)
- Browser verify (Preview), post-refactor: 0 console errors; multi-file globals shared (blankJob/JobCard/COUNTRIES resolve); modals open w/ role=dialog+aria-modal; ESC closes; country select 17 opts w/ dynamic helper; add-job→card→drawer flow works; persists to data.json incl. `country`; empty state renders; screenshot OK
- Server tests: `/src/*` served, `/data.json` + `/src/../server.js` both 404 (blocked); `/api/search` country=UK → London ranked first then Worldwide; country=Pakistan → Worldwide remote kept
- `command -v claude` → /Users/codewithowais/.local/bin/claude

## Notes
- Node 25 is current/non-LTS; works fine. LTS alternative: `sudo n 22`.
- App data persists to `data.json` (git-ignored). No database.
- `.claude/launch.json` added so the Preview tool can run the server (`node server.js`, port 8787).
