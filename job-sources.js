/* ============================================================================
 * job-sources.js — the no-login job-finding agent.
 *
 * Fetches/scrapes jobs from PUBLIC sources that need no account, no API key,
 * and no `claude` login: Remotive, RemoteOK, Arbeitnow, The Muse (location-
 * aware), Jobicy (remote), and Greenhouse/Lever/Ashby company boards by slug.
 *
 * `gatherJobs(cfg, extraTasks)` runs the relevant sources concurrently, then
 * keyword-filters, dedupes, applies the country (soft) + work-type filters,
 * recency-filters, ranks (city → country → newest), and slices to `limit`.
 * `extraTasks` lets the server fold in optional login-only sources (AI web
 * search) without this module depending on Claude.
 *
 * LinkedIn / Indeed are intentionally excluded: no open API, and automating
 * them risks account bans. Paste those manually via "Add job".
 * ========================================================================== */

const SOURCE_TIMEOUT_MS = 10000; // per source request

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
function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch (_) { return ""; }
}

/* ---------------- public sources (no login) ---------------- */
async function fetchRemotive(kw) {
  const d = await getJson("https://remotive.com/api/remote-jobs?search=" + encodeURIComponent(kw || ""));
  return (d.jobs || []).map((j) => ({ company: j.company_name, title: j.title, location: j.candidate_required_location || "Remote", url: j.url, description: stripHtml(j.description), postedAt: j.publication_date || null, source: "Remotive" }));
}
async function fetchRemoteOK() {
  const d = await getJson("https://remoteok.com/api");
  return (Array.isArray(d) ? d : []).filter((x) => x && x.position).map((j) => ({ company: j.company, title: j.position, location: j.location || "Remote", url: j.url, description: stripHtml(j.description), postedAt: j.date || null, source: "RemoteOK" }));
}
async function fetchArbeitnow() {
  const d = await getJson("https://www.arbeitnow.com/api/job-board-api");
  return (d.data || []).map((j) => ({ company: j.company_name, title: j.title, location: j.remote ? (j.location ? j.location + " (remote)" : "Remote") : (j.location || ""), url: j.url, description: stripHtml(j.description), postedAt: j.created_at ? new Date(j.created_at * 1000).toISOString() : null, source: "Arbeitnow" }));
}
// The Muse — location-aware, returns real company postings with apply links.
async function fetchTheMuse({ keywords, country, city }) {
  const where = [city, country && country !== "Anywhere" ? country : ""].filter(Boolean).join(", ");
  const loc = where ? "&location=" + encodeURIComponent(where) : "";
  const pages = await Promise.all([1, 2].map((p) => getJson("https://www.themuse.com/api/public/jobs?page=" + p + loc).catch(() => ({ results: [] }))));
  return pages.flatMap((d) => d.results || []).map((j) => ({
    company: (j.company || {}).name || "",
    title: j.name,
    location: ((j.locations || [])[0] || {}).name || "",
    url: (j.refs || {}).landing_page || "",
    description: stripHtml(j.contents || ""),
    postedAt: j.publication_date || null,
    source: "The Muse",
  }));
}
// Jobicy — remote jobs, no key.
async function fetchJobicy({ keywords }) {
  const tag = (keywords || "").trim().split(/[\s,]+/).filter(Boolean)[0] || "";
  const d = await getJson("https://jobicy.com/api/v2/remote-jobs?count=50" + (tag ? "&tag=" + encodeURIComponent(tag) : ""));
  return (d.jobs || []).map((j) => ({ company: j.companyName, title: j.jobTitle, location: j.jobGeo || "Remote", url: j.url, description: stripHtml(j.jobExcerpt || j.jobDescription || ""), postedAt: j.pubDate || null, source: "Jobicy" }));
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

/* ---------------- location & work-type matching ---------------- */
const REMOTE_RE = /\b(remote|anywhere|worldwide|world ?wide|global|distributed|wfh)\b/i;
const HYBRID_RE = /\bhybrid\b/i;
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
  "Mexico": ["americas", "latam", "north america", "latin america"],
  "Argentina": ["americas", "latam", "south america", "latin america"],
  "Chile": ["americas", "latam", "south america", "latin america"],
  "Colombia": ["americas", "latam", "south america", "latin america"],
  "Peru": ["americas", "latam", "south america", "latin america"],
  "Costa Rica": ["americas", "latam", "central america", "latin america"],
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
  "Uruguay": ["americas", "latam", "south america", "latin america"],
  "Panama": ["americas", "latam", "central america", "latin america"],
  "Ecuador": ["americas", "latam", "south america", "latin america"],
  "Dominican Republic": ["americas", "latam", "caribbean", "latin america"],
  "Guatemala": ["americas", "latam", "central america", "latin america"],
  "Luxembourg": ["europe", "emea", "eu", "benelux"],
  "Iceland": ["europe", "emea", "nordics?", "scandinavia"],
  "Slovakia": ["europe", "emea", "eu", "cee"],
  "Bulgaria": ["europe", "emea", "eu", "cee"],
  "Croatia": ["europe", "emea", "eu", "balkans?"],
  "Serbia": ["europe", "emea", "balkans?"],
  "Slovenia": ["europe", "emea", "eu", "balkans?"],
  "Cyprus": ["europe", "emea", "eu"],
  "Malta": ["europe", "emea", "eu"],
  "Jordan": ["middle east", "mena", "emea"],
  "Lebanon": ["middle east", "mena", "emea"],
  "Tunisia": ["mena", "africa", "emea"],
  "Algeria": ["mena", "africa", "emea"],
  "Ghana": ["africa", "emea"],
  "Ethiopia": ["africa", "emea"],
  "Tanzania": ["africa", "emea"],
  "Uganda": ["africa", "emea"],
  "Rwanda": ["africa", "emea"],
  "Nepal": ["asia", "south asia", "apac"],
  "Taiwan": ["asia", "apac", "east asia"],
  "Cambodia": ["asia", "apac", "south ?east asia", "sea"],
  "Kazakhstan": ["asia", "apac", "central asia"],
};
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function makePattern(alts) { return alts && alts.length ? new RegExp("\\b(" + alts.join("|") + ")\\b", "i") : null; }
function aliasesFor(country) { return COUNTRY_ALIASES[country] || [escapeRe(country.toLowerCase())]; }
function exactPattern(country) { return makePattern(aliasesFor(country)); }
function broadPattern(country) { return makePattern([...aliasesFor(country), ...(REGION_ALIASES[country] || [])]); }
function applyCountry(results, country) {
  if (!country || country === "Anywhere") return results;
  const broad = broadPattern(country);
  if (!broad) return results;
  return results.filter((j) => {
    const loc = (j.location || "").trim();
    if (!loc) return true; // unknown → keep (soft)
    return broad.test(loc) || REMOTE_RE.test(loc);
  });
}
function cityPattern(city) {
  if (!city || !city.trim()) return null;
  return new RegExp("\\b" + escapeRe(city.trim()) + "\\b", "i");
}
function locationRank(job, exact, cityPat) {
  const loc = job.location || "";
  if (cityPat && cityPat.test(loc)) return 0;
  if (exact && exact.test(loc)) return 1;
  return 2;
}
function applyWorkType(results, workType) {
  if (!workType || workType === "Any") return results;
  if (workType === "Remote") return results.filter((j) => { const l = (j.location || "").trim(); return !l || REMOTE_RE.test(l); });
  if (workType === "Hybrid") return results.filter((j) => HYBRID_RE.test(j.location || ""));
  if (workType === "On-site") return results.filter((j) => { const l = (j.location || "").trim(); return l && !REMOTE_RE.test(l) && !HYBRID_RE.test(l); });
  return results;
}

/* ---------------- the agent ---------------- */
async function gatherJobs(cfg, extraTasks = []) {
  const { limit, keywords, useRemoteBoards, companies, maxAgeDays, country, city, workType, exclude } = cfg || {};
  const tasks = [];
  if (useRemoteBoards) {
    tasks.push(fetchRemotive(keywords), fetchRemoteOK(), fetchArbeitnow(), fetchTheMuse({ keywords, country, city }), fetchJobicy({ keywords }));
  }
  for (const slug of companies || []) { tasks.push(fetchGreenhouse(slug), fetchLever(slug), fetchAshby(slug)); }
  // extraTasks are already-invoked promises (e.g. AI web search from the server).
  for (const t of extraTasks) tasks.push(Promise.resolve(t));

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

  // Dedupe by URL and drop anything already in the tracker.
  const excludeSet = new Set(Array.isArray(exclude) ? exclude : []);
  const seen = new Set();
  results = results.filter((j) => j.url && !seen.has(j.url) && !excludeSet.has(j.url) && seen.add(j.url));

  // Country (soft) + work-type filters.
  results = applyCountry(results, country);
  results = applyWorkType(results, workType);

  // Recency.
  const days = Number(maxAgeDays) || 0;
  const ts = (j) => (j.postedAt ? Date.parse(j.postedAt) : NaN);
  if (days > 0) {
    const cutoff = Date.now() - days * 86400000;
    results = results.filter((j) => isNaN(ts(j)) || ts(j) >= cutoff);
  }

  // Sort: city → country → newest-first (undated last).
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

module.exports = { gatherJobs, stripHtml, hostOf };
