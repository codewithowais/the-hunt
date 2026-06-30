// Runs the job tracker LOCALLY on your Claude Max subscription via Claude Code.
// No API key, no second bill. Runs only on your own computer.
// Data is saved to data.json on disk, so it survives shutdowns/restarts.
//
// One-time setup:
//   1) Install Node.js (>=18)        -> https://nodejs.org
//   2) Install Claude Code:          npm install -g @anthropic-ai/claude-code
//   3) Run `claude` once, log in, and choose your subscription (NOT an API key)
//   4) From this folder:             node server.js
//   5) Open http://localhost:8787

const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const PORT = process.env.PORT || 8787;
const ROOT = __dirname;
const SRC_DIR = path.join(ROOT, "src");
const INDEX = path.join(ROOT, "index.html");
const DATA = path.join(ROOT, "data.json");

const SOURCE_TIMEOUT_MS = 10000; // per job-source request
const CLAUDE_TIMEOUT_MS = 180000; // safety cap on a single AI call

/* ============================================================================
 * Job finding (open sources only)
 * LinkedIn / Indeed are intentionally NOT here: they have no open API and
 * forbid automated access. For those, paste a posting via "Add job".
 * ========================================================================== */

async function getJson(url, timeoutMs = SOURCE_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { "User-Agent": "job-agent/1.0" }, signal: ctrl.signal });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

function decode(s) {
  return (s || "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
}
function stripHtml(s) {
  return decode(s).replace(/<[^>]+>/g, " ").replace(/&[a-z0-9#]+;/gi, " ").replace(/\s+/g, " ").trim();
}

async function fetchRemotive(kw) {
  const d = await getJson("https://remotive.com/api/remote-jobs?search=" + encodeURIComponent(kw || ""));
  return (d.jobs || []).map((j) => ({ company: j.company_name, title: j.title, location: j.candidate_required_location || "Remote", url: j.url, description: stripHtml(j.description), postedAt: j.publication_date || null, source: "Remotive" }));
}
async function fetchRemoteOK() {
  const d = await getJson("https://remoteok.com/api");
  return (Array.isArray(d) ? d : []).filter((x) => x && x.position).map((j) => ({ company: j.company, title: j.position, location: j.location || "Remote", url: j.url, description: stripHtml(j.description), postedAt: j.date || null, source: "RemoteOK" }));
}
async function fetchGreenhouse(slug) {
  const d = await getJson("https://boards-api.greenhouse.io/v1/boards/" + slug + "/jobs?content=true");
  return (d.jobs || []).map((j) => ({ company: slug, title: j.title, location: (j.location || {}).name || "", url: j.absolute_url, description: stripHtml(j.content), postedAt: j.updated_at || null, source: "Careers · " + slug }));
}
async function fetchLever(slug) {
  const d = await getJson("https://api.lever.co/v0/postings/" + slug + "?mode=json");
  return (d || []).map((j) => ({ company: slug, title: j.text, location: (j.categories || {}).location || "", url: j.hostedUrl, description: stripHtml(j.descriptionPlain || j.description), postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null, source: "Careers · " + slug }));
}
async function fetchAshby(slug) {
  const d = await getJson("https://api.ashbyhq.com/posting-api/job-board/" + slug);
  return (d.jobs || []).map((j) => ({ company: slug, title: j.title, location: j.location || "", url: j.jobUrl, description: stripHtml(j.descriptionPlain || j.descriptionHtml), postedAt: j.publishedDate || j.publishedAt || null, source: "Careers · " + slug }));
}
async function fetchArbeitnow() {
  const d = await getJson("https://www.arbeitnow.com/api/job-board-api");
  return (d.data || []).map((j) => ({
    company: j.company_name,
    title: j.title,
    location: j.remote ? (j.location ? j.location + " (remote)" : "Remote") : (j.location || ""),
    url: j.url,
    description: stripHtml(j.description),
    postedAt: j.created_at ? new Date(j.created_at * 1000).toISOString() : null,
    source: "Arbeitnow",
  }));
}

// AI-powered discovery: ask Claude Code (with its WebSearch tool) to find
// CURRENT public postings beyond the fixed API boards. Best-effort and opt-in —
// it needs `claude` signed in, and it deliberately excludes LinkedIn/Indeed
// (no open API; automating them risks account bans).
function parseJsonArray(text) {
  const clean = (text || "").replace(/```json/gi, "").replace(/```/g, "").trim();
  try { const v = JSON.parse(clean); if (Array.isArray(v)) return v; } catch (_) {}
  const m = clean.match(/\[[\s\S]*\]/);
  if (m) { try { const v = JSON.parse(m[0]); if (Array.isArray(v)) return v; } catch (_) {} }
  return [];
}
function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch (_) { return ""; }
}
async function fetchAiWebSearch({ keywords, country, city, limit }) {
  const where = [city, country && country !== "Anywhere" ? country : ""].filter(Boolean).join(", ");
  const n = Math.min(Number(limit) || 10, 15);
  const target = where
    ? `at companies based in or actively hiring in ${where}`
    : "at companies hiring remotely / anywhere";
  const prompt = `You are a job-search researcher. Use web search to discover ${n} CURRENT, real job openings for "${keywords || "software engineer"}" roles ${target}.
First identify real companies that fit, then read THEIR OWN careers/jobs pages (or their Greenhouse/Lever/Ashby/Workable boards) and pull live openings. Do NOT include LinkedIn or Indeed URLs.
For each opening, give the DIRECT application link so it's one click to apply.
Return ONLY a JSON array (no prose, no markdown fences). Each item:
{"company","title","location","url","source","description","postedAt"}
- "url": the direct application/apply link
- "source": the company's careers page or board it came from (a reference for applying)
- "postedAt": ISO date string or null
- "description": short plain-text summary`;
  try {
    const text = await runClaude(prompt, { allowedTools: "WebSearch", timeoutMs: 150000 });
    return parseJsonArray(text)
      .map((j) => ({
        company: j.company || "",
        title: j.title || "",
        location: j.location || "",
        url: j.url || "",
        description: stripHtml(j.description || "").slice(0, 2000),
        postedAt: j.postedAt || null,
        source: j.source || hostOf(j.url) || "Web search",
      }))
      .filter((j) => j.url && !/linkedin\.com|indeed\.com/i.test(j.url));
  } catch (_) {
    return []; // not signed in / tool unavailable / bad output → contribute nothing
  }
}

/* ---------------- country filtering (soft preference) ----------------
 * Keep jobs whose location names the chosen country, OR its wider region
 * (e.g. "Europe", "Americas"), OR look remote/worldwide, OR have no location.
 * Only postings that explicitly name a DIFFERENT, unrelated place are dropped.
 * Jobs that name the country EXACTLY rank ahead of region/remote/unknown ones. */
const REMOTE_RE = /\b(remote|anywhere|worldwide|world ?wide|global|distributed|wfh)\b/i;
const COUNTRY_ALIASES = {
  "United States": ["united states", "usa", "u\\.?s\\.?a?", "america", "us"],
  "United Kingdom": ["united kingdom", "uk", "u\\.?k\\.?", "england", "scotland", "wales", "britain", "gb"],
  "Canada": ["canada", "canadian"],
  "Ireland": ["ireland", "irish"],
  "Germany": ["germany", "deutschland", "german"],
  "France": ["france", "french"],
  "Netherlands": ["netherlands", "holland", "dutch", "nl"],
  "Spain": ["spain", "spanish", "espana", "españa"],
  "Italy": ["italy", "italian", "italia"],
  "Poland": ["poland", "polish", "polska"],
  "Portugal": ["portugal", "portuguese"],
  "Switzerland": ["switzerland", "swiss", "schweiz"],
  "Sweden": ["sweden", "swedish", "sverige"],
  "United Arab Emirates": ["united arab emirates", "uae", "dubai", "abu dhabi"],
  "Saudi Arabia": ["saudi arabia", "saudi", "ksa", "k\\.s\\.a"],
  "Qatar": ["qatar", "qatari"],
  "Pakistan": ["pakistan", "pakistani"],
  "India": ["india", "indian"],
  "Singapore": ["singapore"],
  "Japan": ["japan", "japanese", "nippon"],
  "Australia": ["australia", "australian", "aus"],
  "New Zealand": ["new zealand", "nz"],
  "Brazil": ["brazil", "brazilian", "brasil"],
  "South Korea": ["south korea", "korea", "republic of korea", "rok"],
  "Hong Kong": ["hong kong", "hk"],
  "Czech Republic": ["czech republic", "czechia", "czech"],
  "South Africa": ["south africa", "rsa"],
};
// Region terms that a country also belongs to. Used for soft matching only —
// these do NOT count as an exact match for ranking.
const REGION_ALIASES = {
  "United States": ["americas", "north america", "us timezones?", "est", "pst"],
  "United Kingdom": ["europe", "emea", "eu", "uk timezones?"],
  "Canada": ["americas", "north america"],
  "Ireland": ["europe", "emea", "eu"],
  "Germany": ["europe", "emea", "eu", "dach"],
  "France": ["europe", "emea", "eu"],
  "Netherlands": ["europe", "emea", "eu", "benelux"],
  "Spain": ["europe", "emea", "eu"],
  "Italy": ["europe", "emea", "eu"],
  "Poland": ["europe", "emea", "eu", "cee"],
  "Portugal": ["europe", "emea", "eu"],
  "Switzerland": ["europe", "emea", "eu", "dach"],
  "Sweden": ["europe", "emea", "eu", "nordics?", "scandinavia"],
  "United Arab Emirates": ["middle east", "mena", "gcc"],
  "Saudi Arabia": ["middle east", "mena", "gcc"],
  "Qatar": ["middle east", "mena", "gcc"],
  "Pakistan": ["asia", "south asia", "apac"],
  "India": ["asia", "south asia", "apac"],
  "Singapore": ["asia", "apac", "south ?east asia", "sea"],
  "Japan": ["asia", "apac", "east asia"],
  "Australia": ["oceania", "apac", "anz", "australasia"],
  "New Zealand": ["oceania", "apac", "anz", "australasia"],
  "Brazil": ["americas", "latam", "south america", "latin america"],
  // Americas
  "Mexico": ["americas", "latam", "north america", "latin america"],
  "Argentina": ["americas", "latam", "south america", "latin america"],
  "Chile": ["americas", "latam", "south america", "latin america"],
  "Colombia": ["americas", "latam", "south america", "latin america"],
  "Peru": ["americas", "latam", "south america", "latin america"],
  "Costa Rica": ["americas", "latam", "central america", "latin america"],
  // Europe
  "Belgium": ["europe", "emea", "eu", "benelux"],
  "Austria": ["europe", "emea", "eu", "dach"],
  "Norway": ["europe", "emea", "eu", "nordics?", "scandinavia"],
  "Denmark": ["europe", "emea", "eu", "nordics?", "scandinavia"],
  "Finland": ["europe", "emea", "eu", "nordics?", "scandinavia"],
  "Czech Republic": ["europe", "emea", "eu", "cee"],
  "Romania": ["europe", "emea", "eu", "cee"],
  "Hungary": ["europe", "emea", "eu", "cee"],
  "Greece": ["europe", "emea", "eu"],
  "Ukraine": ["europe", "emea", "eu", "cee"],
  "Estonia": ["europe", "emea", "eu", "baltics?", "cee"],
  "Lithuania": ["europe", "emea", "eu", "baltics?", "cee"],
  "Latvia": ["europe", "emea", "eu", "baltics?", "cee"],
  // Middle East & Africa
  "Kuwait": ["middle east", "mena", "gcc"],
  "Bahrain": ["middle east", "mena", "gcc"],
  "Oman": ["middle east", "mena", "gcc"],
  "Israel": ["middle east", "mena", "emea"],
  "Turkey": ["middle east", "mena", "emea", "europe"],
  "Egypt": ["middle east", "mena", "africa", "emea"],
  "Nigeria": ["africa", "emea"],
  "Kenya": ["africa", "emea"],
  "South Africa": ["africa", "emea"],
  "Morocco": ["africa", "mena", "emea"],
  // Asia & Pacific
  "Bangladesh": ["asia", "south asia", "apac"],
  "Sri Lanka": ["asia", "south asia", "apac"],
  "China": ["asia", "apac", "east asia"],
  "Hong Kong": ["asia", "apac", "east asia"],
  "South Korea": ["asia", "apac", "east asia"],
  "Malaysia": ["asia", "apac", "south ?east asia", "sea"],
  "Indonesia": ["asia", "apac", "south ?east asia", "sea"],
  "Thailand": ["asia", "apac", "south ?east asia", "sea"],
  "Vietnam": ["asia", "apac", "south ?east asia", "sea"],
  "Philippines": ["asia", "apac", "south ?east asia", "sea"],
  // Americas (added)
  "Uruguay": ["americas", "latam", "south america", "latin america"],
  "Panama": ["americas", "latam", "central america", "latin america"],
  "Ecuador": ["americas", "latam", "south america", "latin america"],
  "Dominican Republic": ["americas", "latam", "caribbean", "latin america"],
  "Guatemala": ["americas", "latam", "central america", "latin america"],
  // Europe (added)
  "Luxembourg": ["europe", "emea", "eu", "benelux"],
  "Iceland": ["europe", "emea", "nordics?", "scandinavia"],
  "Slovakia": ["europe", "emea", "eu", "cee"],
  "Bulgaria": ["europe", "emea", "eu", "cee"],
  "Croatia": ["europe", "emea", "eu", "balkans?"],
  "Serbia": ["europe", "emea", "balkans?"],
  "Slovenia": ["europe", "emea", "eu", "balkans?"],
  "Cyprus": ["europe", "emea", "eu"],
  "Malta": ["europe", "emea", "eu"],
  // Middle East & Africa (added)
  "Jordan": ["middle east", "mena", "emea"],
  "Lebanon": ["middle east", "mena", "emea"],
  "Tunisia": ["mena", "africa", "emea"],
  "Algeria": ["mena", "africa", "emea"],
  "Ghana": ["africa", "emea"],
  "Ethiopia": ["africa", "emea"],
  "Tanzania": ["africa", "emea"],
  "Uganda": ["africa", "emea"],
  "Rwanda": ["africa", "emea"],
  // Asia & Pacific (added)
  "Nepal": ["asia", "south asia", "apac"],
  "Taiwan": ["asia", "apac", "east asia"],
  "Cambodia": ["asia", "apac", "south ?east asia", "sea"],
  "Kazakhstan": ["asia", "apac", "central asia"],
};
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function makePattern(alts) {
  return alts && alts.length ? new RegExp("\\b(" + alts.join("|") + ")\\b", "i") : null;
}
// Every country at least matches its own name; curated entries add abbreviations.
function aliasesFor(country) { return COUNTRY_ALIASES[country] || [escapeRe(country.toLowerCase())]; }
function exactPattern(country) { return makePattern(aliasesFor(country)); }
function broadPattern(country) { return makePattern([...aliasesFor(country), ...(REGION_ALIASES[country] || [])]); }
function applyCountry(results, country) {
  if (!country || country === "Anywhere") return results;
  const broad = broadPattern(country);
  if (!broad) return results; // unknown country label — don't over-filter
  return results.filter((j) => {
    const loc = (j.location || "").trim();
    if (!loc) return true; // unknown → keep (soft)
    return broad.test(loc) || REMOTE_RE.test(loc);
  });
}

// City is free text. Used to rank matches to the top — it does NOT drop
// country/remote matches (stays a soft preference, keeps counts up).
function cityPattern(city) {
  if (!city || !city.trim()) return null;
  const esc = city.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("\\b" + esc + "\\b", "i");
}
function locationRank(job, exact, cityPat) {
  const loc = job.location || "";
  if (cityPat && cityPat.test(loc)) return 0; // names the city — best
  if (exact && exact.test(loc)) return 1;     // names the country
  return 2;                                    // region / remote / unknown
}

// Work-type is an explicit choice, so it filters (stricter than country).
const HYBRID_RE = /\bhybrid\b/i;
function applyWorkType(results, workType) {
  if (!workType || workType === "Any") return results;
  if (workType === "Remote") return results.filter((j) => { const l = (j.location || "").trim(); return !l || REMOTE_RE.test(l); });
  if (workType === "Hybrid") return results.filter((j) => HYBRID_RE.test(j.location || ""));
  if (workType === "On-site") return results.filter((j) => { const l = (j.location || "").trim(); return l && !REMOTE_RE.test(l) && !HYBRID_RE.test(l); });
  return results;
}

async function searchJobs({ limit, keywords, useRemoteBoards, useWebSearch, companies, maxAgeDays, country, city, workType, exclude }) {
  const tasks = [];
  if (useRemoteBoards) { tasks.push(fetchRemotive(keywords)); tasks.push(fetchRemoteOK()); tasks.push(fetchArbeitnow()); }
  if (useWebSearch) { tasks.push(fetchAiWebSearch({ keywords, country, city, limit })); }
  for (const slug of companies || []) { tasks.push(fetchGreenhouse(slug)); tasks.push(fetchLever(slug)); tasks.push(fetchAshby(slug)); }

  // A failing/timed-out source contributes nothing rather than failing the hunt.
  const settled = await Promise.all(tasks.map((p) => p.catch(() => [])));
  let results = settled.flat();

  // Keyword filter.
  const tokens = (keywords || "").toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (tokens.length) {
    results = results.filter((j) => {
      const hay = ((j.title || "") + " " + (j.description || "")).toLowerCase();
      return tokens.some((t) => hay.includes(t));
    });
  }

  // Dedupe by URL and drop anything already in the caller's tracker, so a
  // re-hunt fills up to `limit` with genuinely NEW jobs.
  const excludeSet = new Set(Array.isArray(exclude) ? exclude : []);
  const seen = new Set();
  results = results.filter((j) => j.url && !seen.has(j.url) && !excludeSet.has(j.url) && seen.add(j.url));

  // Country soft-preference filter, then work-type filter.
  results = applyCountry(results, country);
  results = applyWorkType(results, workType);

  // Recency: drop postings older than the cutoff (when a date is known).
  const days = Number(maxAgeDays) || 0;
  const ts = (j) => (j.postedAt ? Date.parse(j.postedAt) : NaN);
  if (days > 0) {
    const cutoff = Date.now() - days * 86400000;
    results = results.filter((j) => isNaN(ts(j)) || ts(j) >= cutoff);
  }

  // Sort: city matches first, then country matches, then newest-first (undated last).
  const exact = country && country !== "Anywhere" ? exactPattern(country) : null;
  const cityPat = cityPattern(city);
  results.sort((a, b) => {
    if (exact || cityPat) {
      const ra = locationRank(a, exact, cityPat), rb = locationRank(b, exact, cityPat);
      if (ra !== rb) return ra - rb;
    }
    const ta = ts(a), tb = ts(b);
    if (isNaN(ta) && isNaN(tb)) return 0;
    if (isNaN(ta)) return 1;
    if (isNaN(tb)) return -1;
    return tb - ta;
  });

  return results.slice(0, Number(limit) || 10);
}

/* ============================================================================
 * Claude Code (your subscription)
 * ========================================================================== */
const stripAnsi = (s) => (s || "").replace(/\x1b\[[0-9;]*m/g, "").trim();

function runClaude(prompt, opts = {}) {
  const args = ["-p", prompt, "--output-format", "text"];
  // Allowlist specific tools (e.g. "WebSearch") so they run without a permission prompt.
  if (opts.allowedTools) args.push("--allowedTools", opts.allowedTools);
  const timeoutMs = opts.timeoutMs || CLAUDE_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    // stdio[0]="ignore" closes stdin so `claude` doesn't wait ~3s for piped input
    // (the prompt is passed via -p, not stdin).
    const child = spawn("claude", args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    const timer = setTimeout(() => { child.kill("SIGTERM"); reject(new Error("Claude timed out after " + (timeoutMs / 1000) + "s")); }, timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => { clearTimeout(timer); reject(new Error("Could not run `claude`. Is Claude Code installed and on your PATH? " + e.message)); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve(out.trim());
      const msg = stripAnsi(out + "\n" + err);
      // The auth failure prints to stdout/stderr; surface a clear, actionable message.
      if (/authenticat|invalid.*credential|\b401\b|not logged in|please run .*login/i.test(msg)) {
        return reject(new Error("Claude Code isn't signed in. Run `claude` in your terminal, log in with your Max account, then try again."));
      }
      reject(new Error(msg || ("claude exited with code " + code)));
    });
  });
}

/* ============================================================================
 * HTTP server
 * ========================================================================== */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = "";
    req.on("data", (c) => {
      b += c;
      if (b.length > 5_000_000) { reject(new Error("Request body too large")); req.destroy(); }
    });
    req.on("end", () => resolve(b));
    req.on("error", reject);
  });
}

const CONTENT_TYPES = { ".html": "text/html", ".js": "application/javascript", ".jsx": "application/javascript", ".css": "text/css", ".map": "application/json" };

// Serve a file from src/ only, with path-traversal protection.
function serveSrc(urlPath, res) {
  const rel = decodeURIComponent(urlPath.replace(/^\/+/, ""));
  const full = path.normalize(path.join(ROOT, rel));
  if (full !== SRC_DIR && !full.startsWith(SRC_DIR + path.sep)) { res.writeHead(403); res.end("Forbidden"); return; }
  const ext = path.extname(full);
  if (!CONTENT_TYPES[ext]) { res.writeHead(404); res.end("Not found"); return; }
  fs.readFile(full, (e, data) => {
    if (e) { res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(200, { "Content-Type": CONTENT_TYPES[ext] });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const json = (status, obj) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
  const url = (req.url || "/").split("?")[0];

  // Static
  if (req.method === "GET" && (url === "/" || url === "/index.html")) {
    fs.readFile(INDEX, (e, data) => {
      if (e) { res.writeHead(500); res.end("Put index.html in the same folder as server.js"); return; }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(data);
    });
    return;
  }
  if (req.method === "GET" && url.startsWith("/src/")) { serveSrc(url, res); return; }

  // Data persistence
  if (req.method === "GET" && url === "/api/data") {
    fs.readFile(DATA, "utf8", (e, d) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(!e && d ? d : JSON.stringify({ jobs: [], profile: {} })); });
    return;
  }
  if (req.method === "POST" && url === "/api/data") {
    try {
      const body = await readBody(req);
      fs.writeFile(DATA, body || "{}", "utf8", (e) => (e ? json(500, { error: String(e) }) : json(200, { ok: true })));
    } catch (e) { json(413, { error: String(e.message || e) }); }
    return;
  }

  // Job search
  if (req.method === "POST" && url === "/api/search") {
    try {
      const cfg = JSON.parse((await readBody(req)) || "{}");
      const jobs = await searchJobs(cfg);
      json(200, { jobs });
    } catch (e) { json(500, { error: String(e.message || e) }); }
    return;
  }

  // AI proxy
  if (req.method === "POST" && url === "/api/claude") {
    try {
      const { prompt } = JSON.parse((await readBody(req)) || "{}");
      if (!prompt) return json(400, { error: "Missing prompt" });
      const text = await runClaude(prompt);
      json(200, { content: [{ type: "text", text }] });
    } catch (e) { json(500, { error: String(e.message || e) }); }
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log("Job tracker running on http://localhost:" + PORT);
  console.log("Data is saved to " + DATA);
  console.log("Make sure Claude Code is logged in with your Max account (run `claude` once).");
});
