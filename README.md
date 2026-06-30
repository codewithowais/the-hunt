# The Hunt — your AI job-search command center

A personal job-search assistant that finds jobs, scores them against your resume, writes tailored cover letters, recruiter outreach emails, and ATS-friendly CVs, and tracks your whole pipeline. It runs on your own computer and uses your **Claude Max subscription** through Claude Code — no API key and no extra bill.

## What you need

- **Node.js**, version 18 or newer — https://nodejs.org
- **Claude Code**, logged in with your Claude Max account:

  ```
  npm install -g @anthropic-ai/claude-code
  claude          # run once, log in, and choose your subscription (NOT an API key)
  ```

## Run it

1. Keep all the files together in one folder (don't separate them):

   ```
   the-hunt/
     index.html
     server.js
     package.json
     README.md
     src/
       core.js
       icons.jsx
       components.jsx
       app.jsx
   ```

2. From that folder, start the server:

   ```
   node server.js
   ```

   (or `npm start` — there are no packages to install, the server uses only built-in Node modules)

3. Open **http://localhost:8787** in your browser.

> Open it at that address — **not** by double-clicking `index.html`, or the app won't load.

## How to use it

1. **Profile** — upload your resume (PDF, Word, or text). This powers the scoring, the tailored CVs, and every draft.
2. **Start a hunt** — choose how many jobs to prepare, your role/keywords, a **country** (or "Anywhere"), how recent they should be, and where to look (remote boards, and/or company career pages on Greenhouse, Lever, or Ashby). Picking a country keeps roles in that country plus remote/worldwide ones, and lists country matches first.
3. The app finds the freshest matching jobs, scores each one, drafts a cover letter and outreach email, and builds a tailored, ATS-optimized CV for the weaker matches.
4. **Review and apply** — open any job to read its score and reason, copy the drafts, view the tailored CV (with its ATS match score and any gaps), update its status, and log the responses you get back.

Found a job on **LinkedIn or Indeed**? Use **Add job** to paste it — it gets the same scoring, tailored CV, and drafts.

## Good to know

- **Your data is saved** to `data.json` in this folder, so it survives shutdowns and restarts. Back it up by copying that file. (It's git-ignored so it won't be committed.)
- **It prepares applications; you submit them.** It never auto-applies — you review and click apply on the posting, with the tailored CV and drafts ready.
- **It runs locally, for you.** That's the tradeoff for using your Max subscription instead of a paid API; it isn't a public website you can share.
- **LinkedIn & Indeed can't be auto-searched** — they have no open API and automating them risks account bans. Paste those via **Add job**.
- **Tailored CVs reshape your real experience** to fit each job and pass ATS parsing — they never invent skills or history. The ATS score reflects genuine fit, so where there's a real gap it shows it honestly.

## The pieces

- `index.html` — a small shell that loads the `src/` modules (via CDN React + Babel, no build step).
- `src/` — the app (React): `core.js` (helpers, API, prompts), `icons.jsx`, `components.jsx`, `app.jsx`.
- `server.js` — the local server: routes AI through Claude Code, searches the job sources, and saves your data to disk.
