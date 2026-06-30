/* ============================================================================
 * app.jsx — root component. Owns all state, runs the hunt pipeline, and renders.
 * Loaded last so every component/helper it references already exists.
 * ========================================================================== */

/** Load {jobs, profile} once on mount, then debounce-persist on every change. */
function usePersistentState() {
  const [jobs, setJobs] = useState([]);
  const [profile, setProfile] = useState({ resume: "", titles: "", location: "", country: "Anywhere" });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const d = await loadData();
      if (d) {
        if (Array.isArray(d.jobs)) setJobs(d.jobs.map((j) => blankJob(j))); // backfill missing fields
        if (d.profile) setProfile((prev) => ({ ...prev, ...d.profile }));
      }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => saveData({ jobs, profile }), 600);
    return () => clearTimeout(t);
  }, [jobs, profile, loaded]);

  return { jobs, setJobs, profile, setProfile, loaded };
}

function JobTracker() {
  const { jobs, setJobs, profile, setProfile, loaded } = usePersistentState();

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [minScore, setMinScore] = useState(90);

  const [selectedId, setSelectedId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHunt, setShowHunt] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [tailoringId, setTailoringId] = useState(null);
  const [hunt, setHunt] = useState(null); // {running, message, scored, total}
  const fileRef = useRef(null);

  const update = useCallback((id, patch) => setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j))), [setJobs]);
  const remove = useCallback((id) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
  }, [setJobs]);

  async function tailorResume(job) {
    if (!profile.resume) return;
    setTailoringId(job.id);
    update(job.id, { tailorError: "" });
    try {
      const out = await callClaudeText(tailorPrompt(job, profile));
      const p = parseTailored(out);
      if (!p.resume || p.resume.length < 40) {
        throw new Error("the tailored CV came back empty — try Re-tailor.");
      }
      update(job.id, { tailoredResume: p.resume, atsScore: p.score, atsMatched: p.matched, atsMissing: p.missing, tailorError: "" });
    } catch (e) {
      // Surface the failure (e.g. not logged in) instead of silently skipping.
      update(job.id, { tailorError: e.message });
    } finally {
      setTailoringId(null);
    }
  }

  async function scoreAndDraft(job) {
    setBusyId(job.id);
    try {
      const r = await callClaude(scorePrompt(job, profile));
      if (!r) throw new Error("Could not read the AI response");
      const score = Number(r.score) || 0;
      update(job.id, { score, reason: r.reason || "", coverLetter: r.cover_letter || "", outreachEmail: r.outreach_email || "" });
      if (score < TAILOR_THRESHOLD && profile.resume && !job.tailoredResume) {
        await tailorResume(job);
      }
    } catch (e) {
      update(job.id, { reason: "⚠️ AI error: " + e.message });
    } finally {
      setBusyId(null);
    }
  }

  async function runHunt(cfg) {
    setShowHunt(false);
    setHunt({ running: true, message: "Searching the sources…", scored: 0, total: 0 });
    try {
      const want = Number(cfg.limit) || 10;
      // Send the URLs already in the tracker so the server returns NEW jobs only,
      // filling up to `limit` instead of handing back duplicates we'd discard.
      const exclude = jobs.map((j) => j.url).filter(Boolean);
      const found = await searchJobsApi({ ...cfg, exclude });
      // Defensive client-side dedupe (server already excludes these).
      const existing = new Set(exclude);
      const fresh = found.filter((j) => j.url && !existing.has(j.url));
      const newJobs = fresh.map((j) => blankJob({
        company: j.company || "", title: j.title || "", location: j.location || "",
        url: j.url || "", description: j.description || "", postedAt: j.postedAt || null,
        source: j.source || "", country: cfg.country || "Anywhere", city: cfg.city || "", workType: cfg.workType || "Any",
      }));

      if (newJobs.length === 0) {
        setHunt({ running: false, message: "No new jobs found — try different keywords, a wider date range, another country, or more companies." });
        setTimeout(() => setHunt(null), 7000);
        return;
      }

      setJobs((prev) => [...newJobs, ...prev]);
      setHunt({ running: true, message: "Scoring and prepping matches…", scored: 0, total: newJobs.length });
      // Sequential by design: each call is a separate `claude` CLI spawn.
      for (let i = 0; i < newJobs.length; i++) {
        await scoreAndDraft(newJobs[i]);
        setHunt((h) => (h ? { ...h, scored: i + 1 } : h));
      }
      const shortfall = newJobs.length < want
        ? ` (the open sources had only ${newJobs.length} new match${newJobs.length === 1 ? "" : "es"} for these filters)`
        : "";
      setHunt({ running: false, message: "Done — added " + newJobs.length + " jobs" + shortfall + ".", scored: newJobs.length, total: newJobs.length });
      setTimeout(() => setHunt(null), shortfall ? 8000 : 5000);
    } catch (e) {
      setHunt({ running: false, message: "Hunt failed: " + (e.message || e) });
      setTimeout(() => setHunt(null), 6000);
    }
  }

  function importCsv(file) {
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (res) => {
        const existing = new Set(jobs.map((j) => j.url).filter(Boolean));
        const rows = res.data
          .filter((r) => r.url && !existing.has(r.url))
          .map((r) => blankJob({
            company: r.company || "", title: r.title || "", location: r.location || "",
            url: r.url || "", description: r.description || "",
            score: r.score ? Number(r.score) : null, reason: r.reason || "",
            coverLetter: r.cover_letter || "", outreachEmail: r.outreach_email || "",
            status: ALL_STATUSES.includes(r.status) ? r.status : "New",
            dateAdded: r.date_found || todayISO(),
          }));
        setJobs((prev) => [...rows, ...prev]);
      },
    });
    if (fileRef.current) fileRef.current.value = "";
  }

  const counts = useMemo(
    () => ALL_STATUSES.reduce((acc, s) => { acc[s] = jobs.filter((j) => j.status === s).length; return acc; }, {}),
    [jobs]
  );

  const visible = useMemo(() => {
    const q = query.toLowerCase();
    return jobs
      .filter((j) => (statusFilter === "All" ? true : j.status === statusFilter))
      // Min score only hides *scored* low matches; not-yet-scored jobs always show.
      .filter((j) => j.score == null || j.score >= minScore)
      .filter((j) => !q || (j.title + " " + j.company).toLowerCase().includes(q))
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  }, [jobs, statusFilter, minScore, query]);

  const selected = jobs.find((j) => j.id === selectedId);
  const huntRunning = !!(hunt && hunt.running);
  const btn = "text-sm font-medium px-3 py-2 rounded-lg border border-slate-200 inline-flex items-center gap-1.5 text-slate-700 hover:bg-slate-100 " + FOCUS_CLS;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900" style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <header className="px-6 py-6 text-slate-100" style={{ background: "linear-gradient(135deg,#0F172A 0%,#0B3B36 100%)" }}>
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
            <div className="flex items-center gap-2">
              <Briefcase size={20} className="text-teal-300" />
              <h1 className="text-xl font-bold tracking-tight">The Hunt</h1>
              <span className="text-slate-400 text-sm ml-2 hidden sm:inline">your job-search command center</span>
            </div>
            <button onClick={() => setShowHunt(true)} disabled={huntRunning} className={"inline-flex items-center gap-2 bg-teal-500 hover:bg-teal-400 text-slate-900 font-semibold text-sm px-4 py-2 rounded-lg disabled:opacity-60 " + FOCUS_CLS}>
              <Radar size={16} /> Start a hunt
            </button>
          </div>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            {STAGES.map((s, i) => (
              <div key={s} className="flex items-end gap-6">
                <div>
                  <div className="text-3xl font-bold leading-none" style={{ fontFamily: "ui-monospace, monospace", color: counts[s] ? "#5EEAD4" : "#475569" }}>{String(counts[s]).padStart(2, "0")}</div>
                  <div className="text-xs uppercase tracking-wider text-slate-400 mt-1">{s}</div>
                </div>
                {i < STAGES.length - 1 && <div className="text-slate-600 pb-4" aria-hidden="true">›</div>}
              </div>
            ))}
            {counts.Rejected > 0 && <div className="ml-2 pb-1"><span className="text-xs text-slate-500" style={{ fontFamily: "ui-monospace, monospace" }}>{counts.Rejected} closed</span></div>}
          </div>
        </div>
      </header>

      {hunt && (
        <div role="status" aria-live="polite" className={huntRunning ? "bg-teal-50 border-b border-teal-100" : "bg-slate-100 border-b border-slate-200"}>
          <div className="max-w-6xl mx-auto px-6 py-2 flex items-center gap-2 text-sm text-slate-700">
            {huntRunning ? <Loader2 size={15} className="animate-spin text-teal-600" /> : <Check size={15} className="text-emerald-600" />}
            <span>{hunt.message}{hunt.total ? " (" + hunt.scored + "/" + hunt.total + ")" : ""}</span>
          </div>
        </div>
      )}

      <div className="border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-3 flex flex-wrap items-center gap-3">
          <button onClick={() => setShowAdd(true)} className={btn}><Plus size={16} /> Add job</button>
          <button onClick={() => fileRef.current && fileRef.current.click()} className={btn}><Upload size={16} /> Import CSV</button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files[0] && importCsv(e.target.files[0])} />
          <button onClick={() => setShowSettings(true)} className={btn}><Settings size={16} /> Profile</button>
          <div className="flex-1" />
          <div className="relative">
            <Search size={15} className="absolute left-2.5 top-2.5 text-slate-400" />
            <label className="sr-only" htmlFor="search">Search title or company</label>
            <input id="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title or company" className={"pl-8 pr-3 py-2 text-sm rounded-lg border border-slate-200 w-56 " + FOCUS_CLS} />
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-6 pb-3 flex flex-wrap items-center gap-2">
          {["All", ...ALL_STATUSES].map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)} aria-pressed={statusFilter === s} className={"text-xs font-medium px-2.5 py-1 rounded-full border " + FOCUS_CLS + " " + (statusFilter === s ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300")}>{s}</button>
          ))}
          <div className="flex items-center gap-2 ml-2">
            <label htmlFor="minscore" className="text-xs text-slate-500">Min score</label>
            <input id="minscore" type="range" min="0" max="100" step="10" value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} className="w-28 accent-teal-600" />
            <span className="text-xs w-6 text-slate-700" style={{ fontFamily: "ui-monospace, monospace" }}>{minScore}</span>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-6 py-6">
        {!loaded ? (
          <div className="flex items-center gap-2 text-slate-400 py-20 justify-center"><Loader2 className="animate-spin" size={18} /> Loading your tracker…</div>
        ) : visible.length === 0 ? (
          <div className="max-w-md mx-auto py-16">
            {jobs.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <h2 className="font-bold text-slate-900 mb-1">Two steps to get going</h2>
                <p className="text-sm text-slate-500 mb-5">Set up once, then let the hunt do the legwork.</p>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className={"w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold " + (profile.resume ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")}>{profile.resume ? "✓" : "1"}</span>
                    <button onClick={() => setShowSettings(true)} className={"text-sm font-medium text-teal-700 hover:underline rounded " + FOCUS_CLS}>Upload your resume</button>
                    <span className="text-xs text-slate-400">{profile.resume ? "done" : "powers scoring & tailored CVs"}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-slate-100 text-slate-500">2</span>
                    <button onClick={() => setShowHunt(true)} className={"text-sm font-medium text-teal-700 hover:underline rounded " + FOCUS_CLS}>Start a hunt</button>
                    <span className="text-xs text-slate-400">pick how many & where</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center"><Briefcase className="mx-auto text-slate-300 mb-3" size={32} /><p className="text-slate-500">Nothing matches these filters.</p></div>
            )}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {visible.map((job) => (
              <JobCard
                key={job.id} job={job}
                busy={busyId === job.id} tailoring={tailoringId === job.id}
                onSelect={() => setSelectedId(job.id)} onScore={() => scoreAndDraft(job)}
              />
            ))}
          </div>
        )}
      </main>

      {selected && <Drawer job={selected} busy={busyId === selected.id} tailoring={tailoringId === selected.id} hasResume={!!profile.resume} onClose={() => setSelectedId(null)} onUpdate={(p) => update(selected.id, p)} onRerun={() => scoreAndDraft(selected)} onTailor={() => tailorResume(selected)} onDelete={() => remove(selected.id)} />}
      {showHunt && <HuntWizard defaultKeywords={profile.titles} defaultCountry={profile.country} hasResume={!!profile.resume} onClose={() => setShowHunt(false)} onRun={runHunt} />}
      {showAdd && <AddJob defaultCountry={profile.country} onClose={() => setShowAdd(false)} onSave={(job, thenScore) => { const full = blankJob(job); setJobs((prev) => [full, ...prev]); setShowAdd(false); if (thenScore) scoreAndDraft(full); }} />}
      {showSettings && <SettingsModal profile={profile} onClose={() => setShowSettings(false)} onSave={(p) => { setProfile(p); setShowSettings(false); }} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<JobTracker />);
