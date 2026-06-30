// Runs the job tracker LOCALLY on your Claude Max subscription via Claude Code.
// No API key, no second bill. Runs only on your own computer.
//
// One-time setup:
//   1) Install Node.js (>=18)        -> https://nodejs.org
//   2) Install Claude Code:          npm install -g @anthropic-ai/claude-code
//   3) Run `claude` once, log in, and choose your subscription (NOT an API key)
//   4) From this folder:             node server.js
//   5) Open http://localhost:8787
//
// Job FINDING needs no login — see job-sources.js (the public-source agent).
// Only AI scoring/drafting/tailoring and the optional AI web search use `claude`.

const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { gatherJobs, stripHtml, hostOf } = require("./job-sources");

const PORT = process.env.PORT || 8787;
const ROOT = __dirname;
const SRC_DIR = path.join(ROOT, "src");
const INDEX = path.join(ROOT, "index.html");
const DATA = path.join(ROOT, "data.json");
const CLAUDE_TIMEOUT_MS = 180000; // safety cap on a single AI call

/* ============================================================================
 * Claude Code (your subscription) — used for scoring/drafting/tailoring and
 * the optional AI web search. Job FINDING does not need this.
 * ========================================================================== */
const stripAnsi = (s) => (s || "").replace(/\x1b\[[0-9;]*m/g, "").trim();

function runClaude(prompt, opts = {}) {
  const args = ["-p", prompt, "--output-format", "text"];
  // Allowlist specific tools (e.g. "WebSearch") so they run without a permission prompt.
  if (opts.allowedTools) args.push("--allowedTools", opts.allowedTools);
  const timeoutMs = opts.timeoutMs || CLAUDE_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    // stdio[0]="ignore" closes stdin so `claude` doesn't wait ~3s for piped input.
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
      if (/authenticat|invalid.*credential|\b401\b|not logged in|please run .*login/i.test(msg)) {
        return reject(new Error("Claude Code isn't signed in. Run `claude` in your terminal, log in with your Max account, then try again."));
      }
      reject(new Error(msg || ("claude exited with code " + code)));
    });
  });
}

// Optional, login-only discovery: ask Claude (with WebSearch) to find public
// postings on companies' career pages. Returns [] gracefully if not signed in.
function parseJsonArray(text) {
  const clean = (text || "").replace(/```json/gi, "").replace(/```/g, "").trim();
  try { const v = JSON.parse(clean); if (Array.isArray(v)) return v; } catch (_) {}
  const m = clean.match(/\[[\s\S]*\]/);
  if (m) { try { const v = JSON.parse(m[0]); if (Array.isArray(v)) return v; } catch (_) {} }
  return [];
}
async function fetchAiWebSearch({ keywords, country, city, limit }) {
  const where = [city, country && country !== "Anywhere" ? country : ""].filter(Boolean).join(", ");
  const n = Math.min(Number(limit) || 10, 15);
  const target = where ? `at companies based in or actively hiring in ${where}` : "at companies hiring remotely / anywhere";
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
      .map((j) => ({ company: j.company || "", title: j.title || "", location: j.location || "", url: j.url || "", description: stripHtml(j.description || "").slice(0, 2000), postedAt: j.postedAt || null, source: j.source || hostOf(j.url) || "Web search" }))
      .filter((j) => j.url && !/linkedin\.com|indeed\.com/i.test(j.url));
  } catch (_) {
    return [];
  }
}

/* ============================================================================
 * HTTP server
 * ========================================================================== */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = "";
    req.on("data", (c) => { b += c; if (b.length > 5_000_000) { reject(new Error("Request body too large")); req.destroy(); } });
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

  // Job search — no-login public sources via the agent, plus optional AI web search.
  if (req.method === "POST" && url === "/api/search") {
    try {
      const cfg = JSON.parse((await readBody(req)) || "{}");
      const extraTasks = cfg.useWebSearch ? [fetchAiWebSearch(cfg)] : [];
      const jobs = await gatherJobs(cfg, extraTasks);
      json(200, { jobs });
    } catch (e) { json(500, { error: String(e.message || e) }); }
    return;
  }

  // AI proxy (scoring / drafting / tailoring)
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
  console.log("Job finding works without login. AI scoring/drafting needs `claude` signed in (run `claude` once).");
});
