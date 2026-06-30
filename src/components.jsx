/* ============================================================================
 * components.jsx — reusable UI primitives and the feature panels.
 * Loaded after icons.jsx. All components are page-global; the root in app.jsx
 * composes them. Hooks come from the aliases declared in core.js.
 * ========================================================================== */

const FOCUS_CLS = "focus:outline-none focus:ring-2 focus:ring-teal-300 focus-visible:ring-2 focus-visible:ring-teal-300";
const INPUT_CLS = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 " + FOCUS_CLS;

/** Close a layer on Escape. */
function useEscape(onClose) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
}

/* ---------------- primitives ---------------- */

function Modal({ title, onClose, children }) {
  const ref = useRef(null);
  useEscape(onClose);
  useEffect(() => { if (ref.current) ref.current.focus(); }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(15,23,42,0.4)" }} onClick={onClose} aria-hidden="true" />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
        className={"relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-y-auto " + FOCUS_CLS}
        style={{ maxHeight: "90vh" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 sticky top-0 bg-white">
          <h2 className="font-bold text-slate-900">{title}</h2>
          <button onClick={onClose} aria-label="Close dialog" className={"text-slate-400 hover:text-slate-700 rounded-md p-1 " + FOCUS_CLS}><X size={20} /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function CopyBtn({ text, label }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        if (navigator.clipboard) navigator.clipboard.writeText(text || "");
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      aria-label={done ? "Copied" : label}
      className={"inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:bg-slate-100 px-2 py-1 rounded-md " + FOCUS_CLS}
    >
      {done ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
      {done ? "Copied" : label}
    </button>
  );
}

function Section({ title, action, children }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</h4>
        {action}
      </div>
      {children}
    </div>
  );
}

function ScorePill({ score, outOf }) {
  return (
    <span className={"text-sm font-bold px-2 py-0.5 rounded-md " + scoreColor(score)} style={{ fontFamily: "ui-monospace, monospace" }}>
      {score ?? "—"}{outOf && score != null ? " / 100" : ""}
    </span>
  );
}

/* ---------------- hunt wizard ---------------- */

function HuntWizard({ defaultKeywords, defaultCountry, hasResume, onClose, onRun }) {
  const [limit, setLimit] = useState(10);
  const [keywords, setKeywords] = useState(defaultKeywords || "");
  const [country, setCountry] = useState(defaultCountry || "Anywhere");
  const [city, setCity] = useState("");
  const [workType, setWorkType] = useState("Any");
  const [useRemoteBoards, setUseRemoteBoards] = useState(true);
  const [useWebSearch, setUseWebSearch] = useState(true);
  const [companiesText, setCompaniesText] = useState("");
  const [maxAgeDays, setMaxAgeDays] = useState(14);

  const parseCompanies = (t) => t.split(/[\s,\n]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const canRun = useRemoteBoards || useWebSearch || companiesText.trim().length > 0;
  const citySuggestions = CITY_SUGGESTIONS[country] || [];
  const place = [city.trim(), country !== "Anywhere" ? country : ""].filter(Boolean).join(", ");

  return (
    <Modal onClose={onClose} title="Start a job hunt">
      <p className="text-sm text-slate-500 mb-4">Tell me how many to prepare and where to look. I'll find them, score each against your resume, and draft a cover letter, outreach email, and a tailored CV for the weaker matches.</p>
      {!hasResume && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-3">Tip: upload your resume in Profile first — scoring and tailored CVs depend on it.</p>}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="hunt-limit" className="text-xs font-medium text-slate-500">How many to prepare?</label>
          <input id="hunt-limit" type="number" min="1" max="50" value={limit} onChange={(e) => setLimit(e.target.value)} className={"mt-1 " + INPUT_CLS} />
        </div>
        <div>
          <label htmlFor="hunt-keywords" className="text-xs font-medium text-slate-500">Role / keywords</label>
          <input id="hunt-keywords" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="backend engineer" className={"mt-1 " + INPUT_CLS} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-3">
        <div>
          <label htmlFor="hunt-country" className="text-xs font-medium text-slate-500">Country</label>
          <select id="hunt-country" value={country} onChange={(e) => { setCountry(e.target.value); setCity(""); }} className={"mt-1 bg-white " + INPUT_CLS}>
            {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="hunt-city" className="text-xs font-medium text-slate-500">City <span className="text-slate-400 font-normal">(optional)</span></label>
          <input id="hunt-city" list="hunt-city-list" value={city} onChange={(e) => setCity(e.target.value)} placeholder={citySuggestions[0] ? "e.g. " + citySuggestions[0] : "e.g. Riyadh"} className={"mt-1 " + INPUT_CLS} />
          <datalist id="hunt-city-list">{citySuggestions.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-3">
        <div>
          <label htmlFor="hunt-worktype" className="text-xs font-medium text-slate-500">Work type</label>
          <select id="hunt-worktype" value={workType} onChange={(e) => setWorkType(e.target.value)} className={"mt-1 bg-white " + INPUT_CLS}>
            {WORK_TYPES.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="hunt-age" className="text-xs font-medium text-slate-500">Posted within</label>
          <select id="hunt-age" value={maxAgeDays} onChange={(e) => setMaxAgeDays(Number(e.target.value))} className={"mt-1 bg-white " + INPUT_CLS}>
            <option value={3}>Last 3 days (freshest)</option>
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={0}>Any time</option>
          </select>
        </div>
      </div>
      <p className="text-xs text-slate-400 mt-1">
        {place
          ? `Prioritises ${place} roles, then its region and remote/worldwide; newest first.`
          : "Newer postings have fewer applicants — results come back newest first."}
      </p>
      {workType === "On-site" && useRemoteBoards && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5 mt-2">The remote boards are remote-only — for on-site roles, add company career pages below.</p>
      )}

      <div className="mt-4">
        <span className="text-xs font-medium text-slate-500">Where to look</span>
        <label className="mt-1 flex items-center gap-2 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 cursor-pointer">
          <input type="checkbox" checked={useRemoteBoards} onChange={(e) => setUseRemoteBoards(e.target.checked)} className="accent-teal-600" />
          Remote job boards (Remotive + RemoteOK + Arbeitnow) — no setup needed
        </label>
        <label className="mt-2 flex items-start gap-2 text-sm text-slate-700 bg-teal-50/60 border border-teal-200 rounded-lg px-3 py-2 cursor-pointer">
          <input type="checkbox" checked={useWebSearch} onChange={(e) => setUseWebSearch(e.target.checked)} className="accent-teal-600 mt-0.5" />
          <span>
            {place ? `Find companies hiring in ${place} and search their career pages (AI)` : "Find companies hiring and search their career pages with AI"}
            <span className="text-slate-400"> — direct apply links. Slower, and needs Claude Code signed in.</span>
          </span>
        </label>
        <div className="mt-2">
          <label htmlFor="hunt-companies" className="text-xs font-medium text-slate-500">Company career pages (optional)</label>
          <textarea id="hunt-companies" value={companiesText} onChange={(e) => setCompaniesText(e.target.value)} placeholder="stripe, notion, figma" className={"mt-1 h-16 p-2.5 " + INPUT_CLS} />
          <p className="text-xs text-slate-400 mt-1">Type company names as in their careers URL. Works for companies on Greenhouse, Lever, or Ashby.</p>
        </div>
      </div>

      <div className="mt-4 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
        <span className="font-medium text-slate-700">LinkedIn &amp; Indeed:</span> they don't allow automated search, and auto-applying there can get your account banned. For a job you find on those, use <span className="font-medium">Add job</span> to paste it — it'll still be scored, tailored, and drafted.
      </div>

      <div className="flex justify-end gap-2 mt-5">
        <button onClick={onClose} className={"text-sm text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-100 " + FOCUS_CLS}>Cancel</button>
        <button
          onClick={() => onRun({ limit: Number(limit) || 10, keywords, country, city: city.trim(), workType, useRemoteBoards, useWebSearch, companies: parseCompanies(companiesText), maxAgeDays })}
          disabled={!canRun}
          className={"inline-flex items-center gap-1.5 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg disabled:opacity-50 " + FOCUS_CLS}
        >
          <Radar size={15} /> Find jobs
        </button>
      </div>
    </Modal>
  );
}

/* ---------------- add job ---------------- */

function AddJob({ defaultCountry, onClose, onSave }) {
  const [f, setF] = useState({ title: "", company: "", location: "", url: "", description: "", country: defaultCountry || "Anywhere" });
  const [parsing, setParsing] = useState(false);
  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }));

  async function autofill() {
    if (!f.description.trim()) return;
    setParsing(true);
    try {
      const r = await callClaude(autofillPrompt(f.description));
      if (r) setF((prev) => ({
        ...prev,
        title: r.title || prev.title,
        company: r.company || prev.company,
        location: r.location || prev.location,
        description: r.description || prev.description,
      }));
    } catch (_) {} finally { setParsing(false); }
  }

  const fields = [["title", "Title", "Backend Engineer"], ["company", "Company", "Stripe"], ["location", "Location", "Remote"], ["url", "Posting URL", "https://…"]];
  return (
    <Modal onClose={onClose} title="Add a job">
      <p className="text-sm text-slate-500 mb-3">Found something on LinkedIn, Indeed, or anywhere else? Paste it here.</p>
      <div className="grid grid-cols-2 gap-3">
        {fields.map(([k, label, ph]) => (
          <div key={k}>
            <label htmlFor={"add-" + k} className="text-xs font-medium text-slate-500">{label}</label>
            <input id={"add-" + k} value={f[k]} onChange={set(k)} placeholder={ph} className={"mt-1 " + INPUT_CLS} />
          </div>
        ))}
      </div>
      <div className="mt-3">
        <div className="flex items-center justify-between mb-1">
          <label htmlFor="add-description" className="text-xs font-medium text-slate-500">Job description</label>
          <button onClick={autofill} disabled={parsing || !f.description.trim()} className={"inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:bg-teal-50 px-2 py-1 rounded-md disabled:opacity-40 " + FOCUS_CLS}>
            {parsing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Autofill fields from text
          </button>
        </div>
        <textarea id="add-description" value={f.description} onChange={set("description")} placeholder="Paste the full job description here…" className={"h-32 p-2.5 " + INPUT_CLS} />
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className={"text-sm text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-100 " + FOCUS_CLS}>Cancel</button>
        <button onClick={() => onSave(f, false)} className={"text-sm font-medium text-slate-700 border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-100 " + FOCUS_CLS}>Save</button>
        <button onClick={() => onSave(f, true)} className={"inline-flex items-center gap-1.5 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white px-3 py-2 rounded-lg " + FOCUS_CLS}><Sparkles size={15} /> Save &amp; score</button>
      </div>
    </Modal>
  );
}

/* ---------------- profile / settings ---------------- */

async function extractResumeText(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".txt") || name.endsWith(".md")) return file.text();
  if (name.endsWith(".docx")) {
    const buf = await file.arrayBuffer();
    const r = await mammoth.extractRawText({ arrayBuffer: buf });
    return r.value || "";
  }
  if (name.endsWith(".pdf")) {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    const parts = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      parts.push(content.items.map((it) => it.str).join(" "));
    }
    return parts.join("\n");
  }
  return null; // unsupported
}

function SettingsModal({ profile, onClose, onSave }) {
  const [p, setP] = useState(profile);
  const [parsing, setParsing] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const resumeFileRef = useRef(null);

  async function handleFile(file) {
    if (!file) return;
    setParsing(true); setUploadMsg("");
    try {
      const raw = await extractResumeText(file);
      if (raw === null) { setUploadMsg("Unsupported file. Use PDF, Word (.docx), or text — or paste below."); return; }
      const text = raw.trim();
      if (!text) setUploadMsg("Couldn't read text from that file (a scanned image won't work). Paste it below instead.");
      else { setP((prev) => ({ ...prev, resume: text })); setUploadMsg("Loaded " + file.name + " — review below, then Save."); }
    } catch (_) {
      setUploadMsg("Couldn't read that file. Paste your resume below instead.");
    } finally {
      setParsing(false);
      if (resumeFileRef.current) resumeFileRef.current.value = "";
    }
  }

  return (
    <Modal onClose={onClose} title="Your profile">
      <p className="text-sm text-slate-500 mb-3">Your resume powers the scoring, the tailored CVs, and every draft. Upload a file or paste the text.</p>
      <div className="flex items-center gap-2 mb-2">
        <button onClick={() => resumeFileRef.current && resumeFileRef.current.click()} disabled={parsing} className={"inline-flex items-center gap-1.5 text-sm font-medium text-teal-700 border border-teal-200 hover:bg-teal-50 px-3 py-1.5 rounded-lg disabled:opacity-50 " + FOCUS_CLS}>
          {parsing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} {parsing ? "Reading…" : "Upload resume"}
        </button>
        <span className="text-xs text-slate-400">PDF, Word, or text</span>
        <input ref={resumeFileRef} type="file" accept=".pdf,.docx,.txt,.md" className="hidden" onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])} />
      </div>
      {uploadMsg && <p className="text-xs text-slate-500 mb-2">{uploadMsg}</p>}
      <label htmlFor="profile-resume" className="text-xs font-medium text-slate-500">Resume / summary</label>
      <textarea id="profile-resume" value={p.resume} onChange={(e) => setP({ ...p, resume: e.target.value })} placeholder="Upload above, or paste your resume here…" className={"mt-1 h-40 p-2.5 " + INPUT_CLS} />
      <div className="grid grid-cols-2 gap-3 mt-3">
        <div>
          <label htmlFor="profile-titles" className="text-xs font-medium text-slate-500">Target titles</label>
          <input id="profile-titles" value={p.titles} onChange={(e) => setP({ ...p, titles: e.target.value })} placeholder="Backend Engineer, SRE" className={"mt-1 " + INPUT_CLS} />
        </div>
        <div>
          <label htmlFor="profile-location" className="text-xs font-medium text-slate-500">Preferred locations</label>
          <input id="profile-location" value={p.location} onChange={(e) => setP({ ...p, location: e.target.value })} placeholder="Remote, London" className={"mt-1 " + INPUT_CLS} />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className={"text-sm text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-100 " + FOCUS_CLS}>Cancel</button>
        <button onClick={() => onSave(p)} className={"text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white px-3 py-2 rounded-lg " + FOCUS_CLS}>Save profile</button>
      </div>
    </Modal>
  );
}

/* ---------------- job card (list item) ---------------- */

function JobCard({ job, busy, tailoring, onSelect, onScore }) {
  return (
    <div
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
      role="button" tabIndex={0}
      aria-label={`Open ${job.title || "untitled role"} at ${job.company || "unknown company"}`}
      className={"bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 hover:shadow-sm transition cursor-pointer " + FOCUS_CLS}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900 truncate">{job.title || "Untitled role"}</h3>
          <p className="text-sm text-slate-500 truncate">{job.company}{job.location ? " · " + job.location : ""}{job.postedAt ? " · " + relTime(job.postedAt) : ""}</p>
        </div>
        <ScorePill score={job.score} />
      </div>
      {job.source && <p className="text-xs text-slate-400 mt-1 truncate">via {job.source}</p>}
      {job.reason && <p className="text-xs text-slate-500 mt-2 line-clamp-2">{job.reason}</p>}
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-1.5">
          <span className={"text-xs font-medium px-2 py-0.5 rounded-full border " + STATUS_STYLES[job.status]}>{job.status}</span>
          {job.tailoredResume && <span className="inline-flex items-center gap-1 text-xs text-teal-700"><FileText size={12} /> CV</span>}
          {tailoring && <span className="inline-flex items-center gap-1 text-xs text-slate-400"><Loader2 size={12} className="animate-spin" /> CV…</span>}
        </div>
        <div className="flex items-center gap-1.5">
          {job.url && (
            <a href={job.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className={"inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:bg-teal-50 px-2 py-1 rounded-md " + FOCUS_CLS}>
              <ExternalLink size={12} /> Apply
            </a>
          )}
          {job.score == null ? (
            <button
              onClick={(e) => { e.stopPropagation(); onScore(); }}
              disabled={busy}
              className={"inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:bg-teal-50 px-2 py-1 rounded-md disabled:opacity-50 " + FOCUS_CLS}
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Score &amp; draft
            </button>
          ) : (<span className="text-xs text-slate-400">View →</span>)}
        </div>
      </div>
    </div>
  );
}

/* ---------------- job drawer (detail) ---------------- */

function Drawer({ job, busy, tailoring, hasResume, onClose, onUpdate, onRerun, onTailor, onDelete }) {
  useEscape(onClose);
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(15,23,42,0.3)" }} onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label={job.title || "Job details"} className="relative w-full max-w-xl bg-white h-full overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-start justify-between gap-3 z-10">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900">{job.title || "Untitled role"}</h2>
            <p className="text-sm text-slate-500">{job.company}{job.location ? " · " + job.location : ""}</p>
            {job.source && <p className="text-xs text-slate-400 mt-0.5">Reference: {job.source}</p>}
          </div>
          <button onClick={onClose} aria-label="Close details" className={"text-slate-400 hover:text-slate-700 p-1 rounded-md " + FOCUS_CLS}><X size={20} /></button>
        </div>
        <div className="px-5 py-4 space-y-5">
          <div className="flex items-center gap-3 flex-wrap">
            <ScorePill score={job.score} outOf />
            <label className="sr-only" htmlFor="drawer-status">Status</label>
            <select id="drawer-status" value={job.status} onChange={(e) => onUpdate({ status: e.target.value })} className={"text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white " + FOCUS_CLS}>
              {ALL_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
            {job.url && <a href={job.url} target="_blank" rel="noreferrer" className={"inline-flex items-center gap-1 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 px-2.5 py-1 rounded-lg " + FOCUS_CLS}><ExternalLink size={14} /> Apply</a>}
            <div className="flex-1" />
            <button onClick={onRerun} disabled={busy} className={"inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:bg-slate-100 px-2 py-1 rounded-md disabled:opacity-50 " + FOCUS_CLS}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} {job.score == null ? "Score & draft" : "Re-run AI"}
            </button>
          </div>
          {job.reason && <p className="text-sm text-slate-600 bg-slate-50 border border-slate-100 rounded-lg p-3">{job.reason}</p>}

          <Section
            title="Tailored CV for this job"
            action={job.tailoredResume ? (
              <div className="flex items-center gap-1">
                <CopyBtn text={job.tailoredResume} label="Copy" />
                <button onClick={() => downloadText((job.company || "cv").replace(/\s+/g, "_") + "_resume.txt", job.tailoredResume)} className={"inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:bg-slate-100 px-2 py-1 rounded-md " + FOCUS_CLS}><Download size={13} /> .txt</button>
              </div>
            ) : null}
          >
            {!hasResume ? (
              <p className="text-sm text-slate-400">Upload your resume in Profile to enable tailoring.</p>
            ) : job.tailoredResume ? (
              <div>
                {job.atsScore != null && (
                  <div className="mb-2 bg-slate-50 border border-slate-100 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <ScorePill score={job.atsScore} />
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">ATS match</span>
                    </div>
                    {job.atsMatched && job.atsMatched.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">{job.atsMatched.slice(0, 12).map((k, i) => <span key={i} className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0.5 rounded">{k}</span>)}</div>
                    )}
                    {job.atsMissing && job.atsMissing.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-slate-500 mb-1">Job asks for these, but they're not in your background:</p>
                        <div className="flex flex-wrap gap-1">{job.atsMissing.slice(0, 12).map((k, i) => <span key={i} className="text-xs bg-rose-50 text-rose-600 border border-rose-100 px-1.5 py-0.5 rounded">{k}</span>)}</div>
                        <p className="text-xs text-slate-400 mt-1">If you genuinely have any of these, add them to your resume in Profile and re-tailor.</p>
                      </div>
                    )}
                  </div>
                )}
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto bg-slate-50 border border-slate-100 rounded-lg p-3">{job.tailoredResume}</p>
                <button onClick={onTailor} disabled={tailoring} className={"mt-2 inline-flex items-center gap-1 text-xs text-slate-500 hover:bg-slate-100 px-2 py-1 rounded-md disabled:opacity-50 " + FOCUS_CLS}>{tailoring ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Re-tailor</button>
              </div>
            ) : (
              <div>
                <button onClick={onTailor} disabled={tailoring} className={"inline-flex items-center gap-1.5 text-sm font-medium text-teal-700 border border-teal-200 hover:bg-teal-50 px-3 py-1.5 rounded-lg disabled:opacity-50 " + FOCUS_CLS}>{tailoring ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {tailoring ? "Tailoring…" : "Tailor my CV for this job"}</button>
                {job.tailorError && <p className="text-xs text-rose-600 mt-2">⚠️ Couldn't tailor: {job.tailorError}</p>}
              </div>
            )}
          </Section>

          {job.coverLetter && <Section title="Cover letter" action={<CopyBtn text={job.coverLetter} label="Copy" />}><p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{job.coverLetter}</p></Section>}
          {job.outreachEmail && <Section title="Outreach email" action={<CopyBtn text={job.outreachEmail} label="Copy" />}><p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{job.outreachEmail}</p></Section>}
          <Section title="Response from company"><textarea value={job.response} onChange={(e) => onUpdate({ response: e.target.value })} placeholder="Paste any reply, interview invite, or rejection here…" className={"h-20 p-2.5 " + INPUT_CLS} /></Section>
          <Section title="Notes"><textarea value={job.notes} onChange={(e) => onUpdate({ notes: e.target.value })} placeholder="Contacts, follow-up dates, prep reminders…" className={"h-20 p-2.5 " + INPUT_CLS} /></Section>
          {job.description && <Section title="Job description"><p className="text-sm text-slate-500 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">{job.description}</p></Section>}
          <button onClick={onDelete} className={"inline-flex items-center gap-1 text-xs text-rose-500 hover:bg-rose-50 px-2 py-1 rounded-md " + FOCUS_CLS}><Trash2 size={13} /> Remove from tracker</button>
        </div>
      </div>
    </div>
  );
}
