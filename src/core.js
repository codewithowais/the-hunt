/* ============================================================================
 * core.js — constants, pure helpers, country data, and the API client.
 * No JSX here. Loaded first; everything below lives in the shared global
 * lexical scope of the page, so later modules (icons, components, app) can use
 * it without imports. React hook aliases are declared HERE and only here —
 * re-declaring them in another file would be a duplicate-binding error.
 * ========================================================================== */

const { useState, useEffect, useRef, useMemo, useCallback } = React;

/* ---------------- constants ---------------- */
const STAGES = ["New", "Applied", "Screening", "Interview", "Offer"];
const ALL_STATUSES = [...STAGES, "Rejected"];
const STORAGE_KEY = "jobtracker:v1";
const TAILOR_THRESHOLD = 75;
const DESC_LIMIT = 4000; // chars of job description sent to the model

const STATUS_STYLES = {
  New: "bg-slate-100 text-slate-700 border-slate-200",
  Applied: "bg-blue-50 text-blue-700 border-blue-200",
  Screening: "bg-amber-50 text-amber-700 border-amber-200",
  Interview: "bg-violet-50 text-violet-700 border-violet-200",
  Offer: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Rejected: "bg-rose-50 text-rose-600 border-rose-200",
};

/* ---------------- countries, cities, work type ----------------
 * The hunt's location preference. "Anywhere" disables the country filter. The
 * server owns the matching aliases; the client needs the labels for the dropdown,
 * the city suggestions (free text is also allowed), and the work-type options. */
const COUNTRIES = [
  "Anywhere",
  // Americas
  "United States", "Canada", "Mexico", "Brazil", "Argentina", "Chile", "Colombia", "Peru", "Uruguay",
  "Costa Rica", "Panama", "Ecuador", "Dominican Republic", "Guatemala",
  // Europe
  "United Kingdom", "Ireland", "Germany", "France", "Netherlands", "Belgium", "Luxembourg", "Spain", "Portugal",
  "Italy", "Switzerland", "Austria", "Sweden", "Norway", "Denmark", "Finland", "Iceland", "Poland",
  "Czech Republic", "Slovakia", "Hungary", "Romania", "Bulgaria", "Greece", "Croatia", "Serbia", "Slovenia",
  "Ukraine", "Estonia", "Lithuania", "Latvia", "Cyprus", "Malta",
  // Middle East & Africa
  "United Arab Emirates", "Saudi Arabia", "Qatar", "Kuwait", "Bahrain", "Oman", "Jordan", "Lebanon", "Israel",
  "Turkey", "Egypt", "Morocco", "Tunisia", "Algeria", "Nigeria", "Kenya", "Ghana", "South Africa", "Ethiopia",
  "Tanzania", "Uganda", "Rwanda",
  // Asia & Pacific
  "Pakistan", "India", "Bangladesh", "Sri Lanka", "Nepal", "China", "Hong Kong", "Taiwan", "Japan",
  "South Korea", "Singapore", "Malaysia", "Indonesia", "Thailand", "Vietnam", "Philippines", "Cambodia",
  "Kazakhstan", "Australia", "New Zealand",
];

// Suggested cities per country (free text is still allowed in the City field).
const CITY_SUGGESTIONS = {
  // Americas
  "United States": ["New York", "San Francisco", "Seattle", "Austin", "Boston", "Chicago", "Los Angeles", "Washington DC", "Denver", "Atlanta", "Dallas", "Miami"],
  "Canada": ["Toronto", "Vancouver", "Montreal", "Ottawa", "Calgary", "Waterloo"],
  "Mexico": ["Mexico City", "Guadalajara", "Monterrey", "Querétaro"],
  "Brazil": ["São Paulo", "Rio de Janeiro", "Belo Horizonte", "Curitiba", "Porto Alegre"],
  "Argentina": ["Buenos Aires", "Córdoba", "Rosario"],
  "Chile": ["Santiago", "Valparaíso"],
  "Colombia": ["Bogotá", "Medellín", "Cali"],
  "Peru": ["Lima", "Arequipa"],
  "Uruguay": ["Montevideo"],
  "Costa Rica": ["San José", "Heredia"],
  "Panama": ["Panama City"],
  "Ecuador": ["Quito", "Guayaquil"],
  "Dominican Republic": ["Santo Domingo", "Santiago"],
  "Guatemala": ["Guatemala City"],
  // Europe
  "United Kingdom": ["London", "Manchester", "Edinburgh", "Bristol", "Cambridge", "Leeds", "Birmingham", "Glasgow"],
  "Ireland": ["Dublin", "Cork", "Galway", "Limerick"],
  "Germany": ["Berlin", "Munich", "Hamburg", "Frankfurt", "Cologne", "Stuttgart", "Düsseldorf"],
  "France": ["Paris", "Lyon", "Toulouse", "Nantes", "Bordeaux", "Lille"],
  "Netherlands": ["Amsterdam", "Rotterdam", "Utrecht", "Eindhoven", "The Hague"],
  "Belgium": ["Brussels", "Antwerp", "Ghent"],
  "Luxembourg": ["Luxembourg City"],
  "Spain": ["Madrid", "Barcelona", "Valencia", "Seville", "Málaga"],
  "Portugal": ["Lisbon", "Porto", "Braga"],
  "Italy": ["Milan", "Rome", "Turin", "Bologna", "Florence"],
  "Switzerland": ["Zurich", "Geneva", "Lausanne", "Basel", "Bern"],
  "Austria": ["Vienna", "Graz", "Linz"],
  "Sweden": ["Stockholm", "Gothenburg", "Malmö"],
  "Norway": ["Oslo", "Bergen", "Trondheim"],
  "Denmark": ["Copenhagen", "Aarhus"],
  "Finland": ["Helsinki", "Espoo", "Tampere"],
  "Iceland": ["Reykjavik"],
  "Poland": ["Warsaw", "Kraków", "Wrocław", "Gdańsk", "Poznań"],
  "Czech Republic": ["Prague", "Brno", "Ostrava"],
  "Slovakia": ["Bratislava", "Košice"],
  "Hungary": ["Budapest", "Debrecen"],
  "Romania": ["Bucharest", "Cluj-Napoca", "Timișoara", "Iași"],
  "Bulgaria": ["Sofia", "Plovdiv", "Varna"],
  "Greece": ["Athens", "Thessaloniki"],
  "Croatia": ["Zagreb", "Split"],
  "Serbia": ["Belgrade", "Novi Sad"],
  "Slovenia": ["Ljubljana"],
  "Ukraine": ["Kyiv", "Lviv", "Kharkiv"],
  "Estonia": ["Tallinn", "Tartu"],
  "Lithuania": ["Vilnius", "Kaunas"],
  "Latvia": ["Riga"],
  "Cyprus": ["Nicosia", "Limassol"],
  "Malta": ["Valletta", "Sliema"],
  // Middle East & Africa
  "United Arab Emirates": ["Dubai", "Abu Dhabi", "Sharjah"],
  "Saudi Arabia": ["Riyadh", "Jeddah", "Dammam", "Khobar", "Mecca", "Medina"],
  "Qatar": ["Doha", "Al Rayyan"],
  "Kuwait": ["Kuwait City"],
  "Bahrain": ["Manama"],
  "Oman": ["Muscat"],
  "Jordan": ["Amman"],
  "Lebanon": ["Beirut"],
  "Israel": ["Tel Aviv", "Jerusalem", "Haifa"],
  "Turkey": ["Istanbul", "Ankara", "Izmir"],
  "Egypt": ["Cairo", "Alexandria", "Giza"],
  "Morocco": ["Casablanca", "Rabat", "Marrakesh"],
  "Tunisia": ["Tunis"],
  "Algeria": ["Algiers"],
  "Nigeria": ["Lagos", "Abuja", "Port Harcourt"],
  "Kenya": ["Nairobi", "Mombasa"],
  "Ghana": ["Accra", "Kumasi"],
  "South Africa": ["Johannesburg", "Cape Town", "Durban", "Pretoria"],
  "Ethiopia": ["Addis Ababa"],
  "Tanzania": ["Dar es Salaam"],
  "Uganda": ["Kampala"],
  "Rwanda": ["Kigali"],
  // Asia & Pacific
  "Pakistan": ["Karachi", "Lahore", "Islamabad", "Rawalpindi", "Faisalabad", "Peshawar", "Multan"],
  "India": ["Bengaluru", "Mumbai", "Hyderabad", "Pune", "Delhi", "Chennai", "Gurgaon", "Noida", "Kolkata", "Ahmedabad"],
  "Bangladesh": ["Dhaka", "Chittagong"],
  "Sri Lanka": ["Colombo"],
  "Nepal": ["Kathmandu"],
  "China": ["Beijing", "Shanghai", "Shenzhen", "Guangzhou", "Hangzhou"],
  "Hong Kong": ["Hong Kong"],
  "Taiwan": ["Taipei", "Hsinchu"],
  "Japan": ["Tokyo", "Osaka", "Kyoto", "Fukuoka"],
  "South Korea": ["Seoul", "Busan"],
  "Singapore": ["Singapore"],
  "Malaysia": ["Kuala Lumpur", "Penang"],
  "Indonesia": ["Jakarta", "Bandung", "Surabaya"],
  "Thailand": ["Bangkok", "Chiang Mai"],
  "Vietnam": ["Ho Chi Minh City", "Hanoi", "Da Nang"],
  "Philippines": ["Manila", "Cebu", "Makati"],
  "Cambodia": ["Phnom Penh"],
  "Kazakhstan": ["Almaty", "Astana"],
  "Australia": ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide"],
  "New Zealand": ["Auckland", "Wellington", "Christchurch"],
};

const WORK_TYPES = ["Any", "Remote", "Hybrid", "On-site"];

/* ---------------- formatting helpers ---------------- */
function scoreColor(s) {
  if (s == null) return "bg-slate-100 text-slate-400";
  if (s >= 80) return "bg-emerald-100 text-emerald-800";
  if (s >= 70) return "bg-teal-100 text-teal-800";
  if (s >= 50) return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-500";
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Canonical Job shape. Spreading `extra` last lets callers override any field;
 * spreading defaults first means jobs loaded from an older data.json that lack
 * newer fields (e.g. `country`) get them filled in safely.
 */
function blankJob(extra) {
  return {
    id: uid(),
    company: "", title: "", location: "", url: "", description: "",
    score: null, reason: "",
    coverLetter: "", outreachEmail: "",
    tailoredResume: "", atsScore: null, atsMatched: [], atsMissing: [], tailorError: "",
    status: "New", response: "", notes: "",
    country: "", city: "", workType: "", source: "", postedAt: null, dateAdded: todayISO(),
    ...extra,
  };
}

function downloadText(filename, text) {
  const blob = new Blob([text || ""], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function relTime(iso) {
  if (!iso) return "";
  const d = Date.parse(iso);
  if (isNaN(d)) return "";
  const days = Math.floor((Date.now() - d) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return days + "d ago";
  return Math.floor(days / 30) + "mo ago";
}

/* ---------------- model-output parsing ---------------- */
// The model returns prose; these tolerantly extract structured data from it.
function parseJson(text) {
  const clean = (text || "").replace(/```json/gi, "").replace(/```/g, "").trim();
  try { return JSON.parse(clean); } catch (_) {}
  const m = clean.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (_) {} }
  return null;
}

// Tailored-CV responses use literal ###RESUME### / ###ATS### delimiters because
// the resume body is freeform text that can't be embedded as a JSON string.
function parseTailored(text) {
  let t = text || "";
  const A = "###ATS###", R = "###RESUME###";
  let atsPart = "";
  const aIdx = t.indexOf(A);
  if (aIdx !== -1) { atsPart = t.slice(aIdx + A.length); t = t.slice(0, aIdx); }
  const rIdx = t.indexOf(R);
  let resume = rIdx !== -1 ? t.slice(rIdx + R.length) : t;
  resume = resume.replace(/```[a-z]*\n?/gi, "").replace(/```/g, "").trim();
  const ats = parseJson(atsPart) || {};
  return {
    resume,
    score: ats.score != null ? Number(ats.score) : null,
    matched: Array.isArray(ats.matched) ? ats.matched : [],
    missing: Array.isArray(ats.missing) ? ats.missing : [],
  };
}

/* ---------------- API client ----------------
 * Thin wrappers over the local server. Each throws a human-readable Error on
 * failure so callers can surface a useful message. */
async function apiJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json()).error || ""; } catch (_) {}
    throw new Error(detail || `Request to ${url} failed (${res.status})`);
  }
  return res.json();
}

async function callClaudeText(prompt) {
  const data = await apiJson("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  return (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

async function callClaude(prompt) {
  return parseJson(await callClaudeText(prompt));
}

async function searchJobsApi(cfg) {
  const data = await apiJson("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cfg),
  });
  return data.jobs || [];
}

async function loadData() {
  try {
    const res = await fetch("/api/data");
    if (res.ok) return await res.json();
  } catch (_) {}
  // Fall back to localStorage (e.g. opened without the server reachable).
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return null;
}

function saveData(payloadObj) {
  const payload = JSON.stringify(payloadObj);
  try { localStorage.setItem(STORAGE_KEY, payload); } catch (_) {}
  return fetch("/api/data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
  }).catch(() => {});
}

/* ---------------- prompt builders ----------------
 * Prompts encode hard product rules (honest scoring, never fabricate). Keep
 * these intact when editing — they're product/ethics decisions, not cosmetics. */
function scorePrompt(job, profile) {
  const recency = job.postedAt
    ? `This role was posted on ${job.postedAt}. Don't change the match score for recency, but the outreach email may briefly mention applying early if it is genuinely recent.`
    : "";
  const where = [job.city, job.country && job.country !== "Anywhere" ? job.country : ""].filter(Boolean).join(", ");
  const arrangement = job.workType && job.workType !== "Any" ? ` They prefer ${job.workType.toLowerCase()} work.` : "";
  const countryNote = where
    ? `The candidate is targeting roles in ${where}.${arrangement} Weigh location/eligibility fit accordingly (remote-friendly roles still count).`
    : (arrangement ? `The candidate prefers ${job.workType.toLowerCase()} work; weigh arrangement fit.` : "");
  return `You are a sharp technical recruiter helping a specific candidate.

CANDIDATE PROFILE:
${profile.resume || "(no resume provided yet)"}
TARGETING: ${profile.titles || "(not specified)"} in ${profile.location || "(any location)"}

JOB:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location}
${recency}
${countryNote}
Description: ${(job.description || "").slice(0, DESC_LIMIT)}

Do two things, tailored specifically to this role (no clichés, no invented facts about the candidate):
1. Score the match 0-100 (skills, seniority, location) and give a one-sentence reason. Be discerning.
2. Write a cover_letter (~180 words) and a short outreach_email (~90 words) to a recruiter or hiring manager.

Reply with ONLY this JSON: {"score": <int>, "reason": "<sentence>", "cover_letter": "<text>", "outreach_email": "<text>"}`;
}

function tailorPrompt(job, profile) {
  return `You are an expert resume writer and ATS (applicant tracking system) optimiser. Tailor this candidate's resume to this job so it scores as highly as an ATS honestly allows.

RULES:
- Mirror the job's exact wording for skills, tools and titles WHERE THE CANDIDATE TRUTHFULLY HAS THEM.
- Lead each role with strong action verbs and quantified results, using only real numbers from the base resume.
- Use clean, ATS-safe structure: simple headings (Summary, Skills, Experience, Education), reverse-chronological, plain text, no tables, columns, graphics or special characters.
- Be concise and relevant; cut what does not help for this job.
- NEVER invent or exaggerate: no fake employers, dates, titles, degrees, or skills. Only reshape and surface what is genuinely there. (Fabrication fails interviews and gets offers pulled.)

BASE RESUME:
${profile.resume}

JOB:
Title: ${job.title}
Company: ${job.company}
Description: ${(job.description || "").slice(0, DESC_LIMIT)}

Output EXACTLY in this format and nothing else:
###RESUME###
<the full tailored resume in plain text>
###ATS###
{"score": <0-100 honest ATS match for this job>, "matched": ["skills/keywords the job wants that the resume genuinely covers"], "missing": ["things the job asks for that are NOT in the candidate's background"]}`;
}

function autofillPrompt(text) {
  return `Extract fields from this job posting. Reply with ONLY JSON {"title","company","location","description"} where description is a clean plain-text version.

${(text || "").slice(0, 6000)}`;
}
