import { useState, useRef, useEffect } from "react";

const AGENTS = [
  {
    key: "orchestrator",
    label: "Dev Team Orchestrator",
    role: "orchestrator",
    icon: "◈",
    color: "#f0a500",
    description: "Analyse le brief et coordonne l'équipe",
  },
  {
    key: "dev",
    label: "Senior Dev Agent",
    role: "developer",
    icon: "⌥",
    color: "#4fc3f7",
    description: "Développe la solution technique",
  },
  {
    key: "qa",
    label: "QA Engineer Agent",
    role: "qa",
    icon: "◉",
    color: "#81c784",
    description: "Teste et valide la solution",
  },
];

const SYSTEM_PROMPTS = {
  orchestrator: `Tu es le Dev Team Orchestrator. Tu reçois un brief de projet et tu le décomposes en tâches claires pour ton équipe.
Tu dois:
1. Analyser le brief
2. Identifier les composants techniques nécessaires
3. Rédiger des instructions précises pour le Senior Dev
4. Définir les critères de test pour le QA Engineer
Réponds en français. Sois concis et structuré.`,

  developer: `Tu es le Senior Dev Agent. Tu reçois les instructions de l'Orchestrator et tu développes la solution.
Tu dois:
1. Lire les instructions de l'Orchestrator
2. Produire le code complet et fonctionnel
3. Documenter ton code
4. Expliquer les choix techniques
Réponds en français. Fournis du code propre et commenté.`,

  qa: `Tu es le QA Engineer Agent. Tu reçois le travail du Dev et tu le testes rigoureusement.
Tu dois:
1. Analyser le code du développeur
2. Identifier les bugs potentiels
3. Vérifier que les critères de l'Orchestrator sont respectés
4. Proposer des améliorations
5. Donner un verdict final: APPROUVÉ ✓ ou RÉVISION REQUISE ✗
Réponds en français. Sois rigoureux et précis.`,
};

function TypewriterText({ text, speed = 8 }) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  const idx = useRef(0);

  useEffect(() => {
    setDisplayed("");
    setDone(false);
    idx.current = 0;
    if (!text) return;
    const interval = setInterval(() => {
      if (idx.current < text.length) {
        setDisplayed(text.slice(0, idx.current + 1));
        idx.current++;
      } else {
        setDone(true);
        clearInterval(interval);
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text]);

  return (
    <span>
      {displayed}
      {!done && <span className="cursor">▋</span>}
    </span>
  );
}

export default function AgentPipeline() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("anthropic_api_key") || "");
  const [agentIds, setAgentIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem("agent_ids")) || { orchestrator: "", dev: "", qa: "" }; }
    catch { return { orchestrator: "", dev: "", qa: "" }; }
  });
  const [brief, setBrief] = useState("");
  const [results, setResults] = useState({ orchestrator: null, iterations: [] });
  const [loading, setLoading] = useState(null);
  const [phase, setPhase] = useState("idle");
  const [showConfig, setShowConfig] = useState(true);
  const [activeTab, setActiveTab] = useState(null);
  const [currentIteration, setCurrentIteration] = useState(0);
  const [maxIterations, setMaxIterations] = useState(() => parseInt(localStorage.getItem("max_iterations")) || 3);
  const [savedSession, setSavedSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem("last_session")) || null; } catch { return null; }
  });
  const [githubToken, setGithubToken] = useState(() => localStorage.getItem("github_token") || "");
  const [githubRepo, setGithubRepo] = useState(() => localStorage.getItem("github_repo") || "");
  const [githubBranch, setGithubBranch] = useState(() => localStorage.getItem("github_branch") || "main");
  const [githubPath, setGithubPath] = useState(() => localStorage.getItem("github_path") || "pipeline-output.md");
  const [showGithubConfig, setShowGithubConfig] = useState(false);
  const [commitStatus, setCommitStatus] = useState("idle");
  const [commitUrl, setCommitUrl] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => { localStorage.setItem("anthropic_api_key", apiKey); }, [apiKey]);
  useEffect(() => { localStorage.setItem("agent_ids", JSON.stringify(agentIds)); }, [agentIds]);
  useEffect(() => { localStorage.setItem("max_iterations", String(maxIterations)); }, [maxIterations]);
  useEffect(() => { localStorage.setItem("github_token", githubToken); }, [githubToken]);
  useEffect(() => { localStorage.setItem("github_repo", githubRepo); }, [githubRepo]);
  useEffect(() => { localStorage.setItem("github_branch", githubBranch); }, [githubBranch]);
  useEffect(() => { localStorage.setItem("github_path", githubPath); }, [githubPath]);
  useEffect(() => {
    if (phase === "running" || phase === "done")
      localStorage.setItem("last_session", JSON.stringify({ brief, results, phase }));
  }, [results, phase]);
  useEffect(() => {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: "smooth" });
  }, [results, loading]);

  async function callClaude(systemPrompt, messages) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1500, system: systemPrompt, messages }),
    });
    if (!response.ok) { const err = await response.json(); throw new Error(err.error?.message || "Erreur API"); }
    const data = await response.json();
    return data.content[0].text;
  }

  async function runPipeline() {
    if (!apiKey || !brief.trim()) return;
    setPhase("running");
    setResults({ orchestrator: null, iterations: [] });
    setCurrentIteration(0);
    setShowConfig(false);
    setCommitStatus("idle");
    setCommitUrl("");
    try {
      setLoading("orchestrator"); setActiveTab("orchestrator");
      const orchResult = await callClaude(SYSTEM_PROMPTS.orchestrator, [{ role: "user", content: `Brief du projet:\n${brief}` }]);
      setResults(r => ({ ...r, orchestrator: orchResult }));
      setLoading(null);

      let devConv = [{ role: "user", content: `Instructions de l'Orchestrator:\n${orchResult}` }];
      let qaConv = [];
      let lastDev = "", lastQa = "", approved = false, iter = 0;

      while (iter < maxIterations && !approved) {
        iter++; setCurrentIteration(iter);
        setLoading("dev"); setActiveTab("dev");
        lastDev = await callClaude(SYSTEM_PROMPTS.developer, devConv);
        devConv.push({ role: "assistant", content: lastDev });
        setResults(r => ({ ...r, iterations: [...r.iterations.slice(0, iter - 1), { dev: lastDev, qa: "" }] }));
        setLoading(null);

        setLoading("qa"); setActiveTab("qa");
        if (qaConv.length === 0) qaConv = [{ role: "user", content: `Instructions Orchestrator:\n${orchResult}\n\nCode Dev:\n${lastDev}` }];
        else qaConv.push({ role: "user", content: `Dev a révisé:\n${lastDev}\n\nRe-valide.` });
        lastQa = await callClaude(SYSTEM_PROMPTS.qa, qaConv);
        qaConv.push({ role: "assistant", content: lastQa });
        setResults(r => { const its = [...r.iterations]; its[iter - 1] = { ...its[iter - 1], qa: lastQa }; return { ...r, iterations: its }; });
        setLoading(null);

        approved = lastQa.includes("APPROUVÉ");
        if (!approved && iter < maxIterations)
          devConv.push({ role: "user", content: `Feedback QA:\n${lastQa}\n\nCorrige les problèmes.` });
      }
      setCurrentIteration(0); setPhase("done");
    } catch (e) {
      setLoading(null); setCurrentIteration(0); setPhase("idle");
      setResults(r => ({ ...r, error: e.message }));
    }
  }

  function restoreSession() {
    if (!savedSession) return;
    setBrief(savedSession.brief || "");
    setResults(savedSession.results || { orchestrator: null, iterations: [] });
    setPhase(savedSession.phase === "done" ? "done" : "idle");
    if (savedSession.phase === "done") setShowConfig(false);
    setActiveTab("orchestrator");
    setSavedSession(null);
  }

  function resetPipeline() {
    setPhase("idle"); setResults({ orchestrator: null, iterations: [] });
    setActiveTab(null); setShowConfig(true); setBrief("");
    setCurrentIteration(0); setCommitStatus("idle"); setCommitUrl("");
    localStorage.removeItem("last_session"); setSavedSession(null);
  }

  async function commitToGitHub() {
    setCommitStatus("loading");
    try {
      const [owner, repo] = githubRepo.split("/");
      const its = results.iterations || [];
      const lastDev = its[its.length - 1]?.dev || "";
      const lastQa = its[its.length - 1]?.qa || "";
      const md = [`# Pipeline Output — ${new Date().toLocaleString("fr-CA")}`, "", "## Brief", brief, "", "## Orchestrator", results.orchestrator || "", "", `## Dev Agent (itération ${its.length})`, lastDev, "", "## QA Agent", lastQa].join("\n");
      const content = btoa(unescape(encodeURIComponent(md)));
      let sha;
      const chk = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${githubPath}?ref=${githubBranch}`, { headers: { Authorization: `Bearer ${githubToken}` } });
      if (chk.ok) sha = (await chk.json()).sha;
      const body = { message: `feat: pipeline output — ${brief.slice(0, 60)}`, content, branch: githubBranch };
      if (sha) body.sha = sha;
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${githubPath}`, { method: "PUT", headers: { Authorization: `Bearer ${githubToken}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      setCommitUrl((await res.json()).content.html_url);
      setCommitStatus("success");
    } catch { setCommitStatus("error"); }
  }

  const its = results.iterations || [];
  const latestDev = its.filter(i => i.dev).pop()?.dev || null;
  const latestQa = its.filter(i => i.qa).pop()?.qa || null;
  const isReady = apiKey.trim().length > 10 && brief.trim().length > 5;
  const canCommit = githubToken.trim().length > 0 && githubRepo.includes("/");
  const getResult = k => k === "orchestrator" ? results.orchestrator : k === "dev" ? latestDev : latestQa;
  const hasResult = k => !!getResult(k);

  return (
    <div style={styles.root}>
      <style>{css}</style>

      {/* Session Restore Banner */}
      {savedSession && phase === "idle" && (
        <div style={styles.restoreBanner}>
          <span style={{display:"flex",alignItems:"center",gap:6}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            Session précédente disponible
          </span>
          <div style={{display:"flex",gap:8}}>
            <button style={styles.restoreBtn} onClick={restoreSession} aria-label="Restaurer la session précédente">Restaurer</button>
            <button style={styles.ignoreBtn} onClick={() => { setSavedSession(null); localStorage.removeItem("last_session"); }} aria-label="Ignorer">Ignorer</button>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.logo}>⬡</span>
          <div>
            <div style={styles.title}>Agent Pipeline</div>
            <div style={styles.subtitle}>Orchestrator · Dev · QA</div>
          </div>
        </div>
        <button
          style={styles.configToggle}
          onClick={() => setShowConfig(!showConfig)}
          aria-label={showConfig ? "Réduire la configuration" : "Ouvrir la configuration"}
          aria-expanded={showConfig}
        >
          {showConfig ? "↑ Réduire" : "⚙ Config"}
        </button>
      </div>

      {/* Config Panel */}
      {showConfig && (
        <div style={styles.configPanel}>
          <div style={styles.configGrid}>
            <div style={styles.fieldGroup}>
              <label htmlFor="api-key" style={styles.label}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight:6,verticalAlign:'middle'}}><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
                Clé API Anthropic
              </label>
              <input
                id="api-key"
                type="password"
                placeholder="sk-ant-api03-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                style={styles.input}
                aria-label="Clé API Anthropic"
              />
            </div>
          </div>
          {/* Iterations slider */}
          <div style={styles.sliderRow}>
            <label htmlFor="max-iter" style={styles.labelSmall}>Itérations max Dev ↔ QA</label>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <input id="max-iter" type="range" min={1} max={5} value={maxIterations} onChange={e => setMaxIterations(parseInt(e.target.value))} style={styles.slider} aria-label={`Itérations max: ${maxIterations}`} />
              <span style={styles.sliderValue}>{maxIterations}</span>
            </div>
          </div>

          <div style={styles.agentIds}>
            <div style={styles.labelSmall}>
              IDs des agents (optionnel — pour référence)
            </div>
            <div style={styles.agentIdGrid}>
              {AGENTS.map((a) => (
                <div key={a.key} style={styles.agentIdField}>
                  <span style={{ color: a.color }}>{a.icon}</span>
                  <input
                    placeholder={`ID ${a.label}`}
                    value={agentIds[a.key]}
                    onChange={(e) =>
                      setAgentIds((ids) => ({ ...ids, [a.key]: e.target.value }))
                    }
                    style={styles.inputSmall}
                  />
                </div>
              ))}
            </div>
          </div>
          {/* GitHub config */}
          <div style={styles.githubSection}>
            <button style={styles.githubToggle} onClick={() => setShowGithubConfig(!showGithubConfig)} aria-expanded={showGithubConfig} aria-label="Configuration GitHub">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{marginRight:6}}><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
              GitHub {showGithubConfig ? "▲" : "▼"}
            </button>
            {showGithubConfig && (
              <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:10}}>
                {[["gh-token","Token","ghp_...",githubToken,setGithubToken,"password","GitHub Personal Access Token"],["gh-repo","Repo","owner/repo",githubRepo,setGithubRepo,"text","Dépôt GitHub"],["gh-branch","Branche","main",githubBranch,setGithubBranch,"text","Branche cible"],["gh-path","Fichier","pipeline-output.md",githubPath,setGithubPath,"text","Chemin du fichier"]].map(([id,lbl,ph,val,set,type,aria]) => (
                  <div key={id} style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={styles.labelSmall}>{lbl}</span>
                    <input id={id} type={type} placeholder={ph} value={val} onChange={e => set(e.target.value)} style={styles.inputSmall} aria-label={aria} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Brief */}
      <div style={styles.briefSection}>
        <label htmlFor="project-brief" style={styles.label}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight:6,verticalAlign:'middle'}}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          Brief du projet
        </label>
        <textarea
          id="project-brief"
          placeholder="Ex: Crée-moi une web-app simple de calculateur de pricing pour des mandats Power BI..."
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          style={styles.textarea}
          rows={4}
          aria-label="Brief du projet"
        />
        <button
          onClick={runPipeline}
          disabled={!isReady || phase === "running"}
          aria-label={phase === "running" ? "Pipeline en cours d'exécution" : "Lancer le pipeline"}
          aria-busy={phase === "running"}
          style={{
            ...styles.runBtn,
            opacity: !isReady || phase === "running" ? 0.4 : 1,
            cursor:
              !isReady || phase === "running" ? "not-allowed" : "pointer",
          }}
        >
          {phase === "running"
            ? "⟳ Pipeline en cours..."
            : "▶ Lancer le pipeline"}
        </button>
      </div>

      {/* Pipeline Visual */}
      {(phase === "running" || phase === "done") && (
        <div style={styles.pipelineViz}>
          {AGENTS.map((agent, i) => {
            const isDone = hasResult(agent.key);
            const isActive = loading === agent.key;
            const showBadge = currentIteration > 1 && (agent.key === "dev" || agent.key === "qa") && (isActive || isDone);
            return (
              <div key={agent.key} style={styles.pipelineStep}>
                <div
                  style={{
                    ...styles.agentBubble,
                    borderColor: agent.color,
                    background: isActive ? `${agent.color}22` : isDone ? `${agent.color}15` : "#1a1a2e",
                    boxShadow: isActive ? `0 0 20px ${agent.color}66` : "none",
                    cursor: isDone ? "pointer" : "default",
                  }}
                  onClick={() => isDone && setActiveTab(agent.key)}
                  role={isDone ? "button" : undefined}
                  tabIndex={isDone ? 0 : undefined}
                  aria-label={isDone ? `Voir les résultats de ${agent.label}` : agent.label}
                  onKeyDown={(e) => e.key === "Enter" && isDone && setActiveTab(agent.key)}
                  className={isActive ? "pulse-border" : ""}
                >
                  <span style={{ ...styles.agentIcon, color: agent.color }}>{agent.icon}</span>
                  <div style={styles.agentName}>{agent.label}</div>
                  <div style={styles.agentDesc}>{agent.description}</div>
                  {isActive && <div style={styles.spinner}>⟳</div>}
                  {isDone && !isActive && <div style={{ color: agent.color, fontSize: 18 }}>✓</div>}
                  {showBadge && <div style={{ ...styles.iterBadge, color: agent.color, borderColor: agent.color }}>{currentIteration}/{maxIterations}</div>}
                </div>
                {i < AGENTS.length - 1 && (
                  <div style={{ ...styles.arrow, color: isDone ? AGENTS[i].color : "#333" }}>
                    →
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Refinement indicator */}
      {currentIteration > 1 && phase === "running" && (
        <div style={styles.refinementBadge}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight:5}}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          Révision — itération {currentIteration}/{maxIterations}
        </div>
      )}

      {/* Results Tabs */}
      {(results.orchestrator || latestDev || latestQa) && (
        <div style={styles.resultsSection}>
          <div style={styles.tabs} role="tablist">
            {AGENTS.filter(a => hasResult(a.key)).map((a) => (
              <button key={a.key} onClick={() => setActiveTab(a.key)} aria-label={`Résultats de ${a.label}`} aria-selected={activeTab === a.key} role="tab"
                style={{ ...styles.tab, borderBottom: activeTab === a.key ? `2px solid ${a.color}` : "2px solid transparent", color: activeTab === a.key ? a.color : "#666" }}>
                {a.icon} {a.label.split(" ")[0]}
              </button>
            ))}
          </div>
          {AGENTS.filter(a => hasResult(a.key) && activeTab === a.key).map(a => (
            <div key={a.key} style={styles.resultBox}>
              <div style={{ ...styles.resultHeader, color: a.color }}>
                {a.icon} {a.label}
                {a.key !== "orchestrator" && its.length > 0 && <span style={styles.iterLabel}>itération {its.length}</span>}
              </div>
              <div style={styles.resultContent}><TypewriterText text={getResult(a.key)} speed={5} /></div>
            </div>
          ))}
          {its.length > 1 && (
            <details style={styles.historySection}>
              <summary style={styles.historySummary}>Historique — {its.length} itérations</summary>
              {its.map((it, i) => (
                <div key={i} style={styles.historyItem}>
                  <div style={styles.historyItemHeader}>Itération {i + 1}</div>
                  <div style={{...styles.historyLabel, color:"#4fc3f7"}}>⌥ Dev</div>
                  <div style={styles.historyContent}>{it.dev}</div>
                  <div style={{...styles.historyLabel, color:"#81c784"}}>◉ QA</div>
                  <div style={styles.historyContent}>{it.qa}</div>
                </div>
              ))}
            </details>
          )}
        </div>
      )}

      {/* Error */}
      {results.error && (
        <div style={styles.errorBox} role="alert">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight:6,verticalAlign:'middle',flexShrink:0}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {results.error}
        </div>
      )}

      {/* Done */}
      {phase === "done" && (
        <div style={styles.doneBar} role="status">
          <span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{marginRight:6,verticalAlign:'middle',color:'#81c784'}}><polyline points="20 6 9 17 4 12"/></svg>
            Pipeline complété — {its.length} itération{its.length > 1 ? "s" : ""}
            {latestQa?.includes("APPROUVÉ") ? " · APPROUVÉ ✓" : " · limite atteinte"}
          </span>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"flex-end"}}>
            {canCommit && (
              <button onClick={commitStatus === "idle" ? commitToGitHub : undefined} disabled={commitStatus === "loading"} aria-label="Commit vers GitHub" aria-busy={commitStatus === "loading"}
                style={{ ...styles.commitBtn, opacity: commitStatus === "loading" ? 0.6 : 1, cursor: commitStatus === "loading" ? "not-allowed" : "pointer", ...(commitStatus === "success" ? {borderColor:"#81c784",color:"#81c784"} : {}), ...(commitStatus === "error" ? {borderColor:"#ff6b6b",color:"#ff6b6b"} : {}) }}>
                {commitStatus === "idle" && <><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{marginRight:5,verticalAlign:'middle'}}><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>Commit GitHub</>}
                {commitStatus === "loading" && "⟳ Commit..."}
                {commitStatus === "success" && "✓ Commité"}
                {commitStatus === "error" && "✗ Échec — réessayer"}
              </button>
            )}
            {commitStatus === "success" && commitUrl && (
              <a href={commitUrl} target="_blank" rel="noopener noreferrer" style={styles.commitLink} aria-label="Voir le fichier sur GitHub">Voir sur GitHub →</a>
            )}
            <button onClick={resetPipeline} aria-label="Démarrer un nouveau brief" style={styles.resetBtn}>Nouveau brief</button>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

const styles = {
  root: {
    background: "#0d0d1a",
    minHeight: "100vh",
    minHeight: "100dvh",
    color: "#e0e0e0",
    fontFamily: "'Courier New', monospace",
    padding: "0 0 40px 0",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "20px 24px 16px",
    borderBottom: "1px solid #1e1e3a",
    background: "#0a0a18",
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 14 },
  logo: { fontSize: 32, color: "#f0a500" },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    letterSpacing: 2,
    color: "#fff",
  },
  subtitle: { fontSize: 11, color: "#555", letterSpacing: 3, marginTop: 2 },
  configToggle: {
    background: "transparent",
    border: "1px solid #2a2a4a",
    color: "#888",
    padding: "10px 14px",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 12,
    letterSpacing: 1,
    minHeight: 44,
  },
  configPanel: {
    padding: "20px 24px",
    background: "#0f0f22",
    borderBottom: "1px solid #1e1e3a",
  },
  configGrid: { marginBottom: 16 },
  fieldGroup: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 12, color: "#888", letterSpacing: 2, marginBottom: 4 },
  labelSmall: {
    fontSize: 11,
    color: "#555",
    letterSpacing: 2,
    marginBottom: 10,
  },
  input: {
    background: "#13132a",
    border: "1px solid #2a2a4a",
    color: "#ccc",
    padding: "10px 14px",
    borderRadius: 6,
    fontSize: 13,
    fontFamily: "monospace",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  },
  inputSmall: {
    background: "#13132a",
    border: "1px solid #1e1e3a",
    color: "#aaa",
    padding: "6px 10px",
    borderRadius: 4,
    fontSize: 11,
    fontFamily: "monospace",
    outline: "none",
    flex: 1,
  },
  agentIds: { marginTop: 4 },
  agentIdGrid: { display: "flex", flexDirection: "column", gap: 8 },
  agentIdField: { display: "flex", alignItems: "center", gap: 10 },
  briefSection: { padding: "20px 24px" },
  textarea: {
    width: "100%",
    background: "#13132a",
    border: "1px solid #2a2a4a",
    color: "#ddd",
    padding: "12px 14px",
    borderRadius: 6,
    fontSize: 14,
    fontFamily: "monospace",
    outline: "none",
    resize: "vertical",
    boxSizing: "border-box",
    marginBottom: 12,
    lineHeight: 1.6,
  },
  runBtn: {
    background: "linear-gradient(135deg, #f0a500, #e06000)",
    color: "#000",
    border: "none",
    padding: "12px 28px",
    borderRadius: 6,
    fontSize: 14,
    fontWeight: "bold",
    letterSpacing: 1,
    width: "100%",
  },
  pipelineViz: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "20px 24px",
    flexWrap: "wrap",
  },
  pipelineStep: { display: "flex", alignItems: "center", gap: 8 },
  agentBubble: {
    border: "1px solid",
    borderRadius: 10,
    padding: "14px 16px",
    width: 150,
    textAlign: "center",
    cursor: "pointer",
    transition: "all 0.3s ease",
    minHeight: 90,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  agentIcon: { fontSize: 22 },
  agentName: {
    fontSize: 11,
    fontWeight: "bold",
    letterSpacing: 1,
    color: "#ccc",
  },
  agentDesc: { fontSize: 9, color: "#555", marginTop: 2 },
  spinner: {
    fontSize: 18,
    animation: "spin 1s linear infinite",
    color: "#888",
  },
  arrow: { fontSize: 24, fontWeight: "bold" },
  resultsSection: { padding: "0 24px 20px" },
  tabs: {
    display: "flex",
    gap: 0,
    borderBottom: "1px solid #1e1e3a",
    marginBottom: 0,
  },
  tab: {
    background: "transparent",
    border: "none",
    padding: "12px 18px",
    cursor: "pointer",
    fontSize: 12,
    letterSpacing: 1,
    transition: "color 200ms ease",
    minHeight: 44,
  },
  resultBox: {
    background: "#0f0f22",
    border: "1px solid #1e1e3a",
    borderTop: "none",
    borderRadius: "0 0 8px 8px",
    padding: "20px",
  },
  resultHeader: {
    fontSize: 13,
    fontWeight: "bold",
    letterSpacing: 2,
    marginBottom: 14,
  },
  resultContent: {
    fontSize: 13,
    lineHeight: 1.8,
    color: "#ccc",
    whiteSpace: "pre-wrap",
    maxHeight: 400,
    overflowY: "auto",
  },
  errorBox: {
    margin: "0 24px",
    background: "#2a0a0a",
    border: "1px solid #661111",
    color: "#ff6b6b",
    padding: "14px",
    borderRadius: 6,
    fontSize: 13,
  },
  doneBar: {
    margin: "16px 24px 0",
    background: "#0a1a0a",
    border: "1px solid #2a4a2a",
    color: "#81c784",
    padding: "14px 18px",
    borderRadius: 6,
    fontSize: 13,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  resetBtn: {
    background: "#1a3a1a",
    border: "1px solid #2a4a2a",
    color: "#81c784",
    padding: "10px 16px",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 12,
    whiteSpace: "nowrap",
    minHeight: 44,
  },
  restoreBanner: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "10px 24px", background: "#0a1020", borderBottom: "1px solid #1e2a4a",
    fontSize: 12, color: "#7ab3f0", gap: 12, flexWrap: "wrap",
  },
  restoreBtn: {
    background: "#1a2a4a", border: "1px solid #2a3a6a", color: "#7ab3f0",
    padding: "6px 12px", borderRadius: 4, cursor: "pointer", fontSize: 11, minHeight: 36,
  },
  ignoreBtn: {
    background: "transparent", border: "1px solid #2a2a4a", color: "#555",
    padding: "6px 12px", borderRadius: 4, cursor: "pointer", fontSize: 11, minHeight: 36,
  },
  sliderRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    marginBottom: 14, gap: 16, flexWrap: "wrap",
  },
  slider: { flex: 1, accentColor: "#f0a500", cursor: "pointer", maxWidth: 120 },
  sliderValue: { color: "#f0a500", fontFamily: "monospace", fontSize: 14, fontWeight: "bold", minWidth: 16 },
  githubSection: { marginTop: 14, borderTop: "1px solid #1e1e3a", paddingTop: 12 },
  githubToggle: {
    background: "transparent", border: "none", color: "#666", fontSize: 11,
    cursor: "pointer", letterSpacing: 1, padding: "4px 0",
    display: "flex", alignItems: "center",
  },
  iterBadge: {
    fontSize: 9, border: "1px solid", borderRadius: 10,
    padding: "1px 6px", letterSpacing: 1, marginTop: 2,
  },
  refinementBadge: {
    textAlign: "center", margin: "4px 24px 0", fontSize: 11, color: "#888",
    display: "flex", alignItems: "center", justifyContent: "center", letterSpacing: 1,
  },
  iterLabel: { fontSize: 10, color: "#555", letterSpacing: 1, marginLeft: 10, fontWeight: "normal" },
  historySection: { marginTop: 8, border: "1px solid #1e1e3a", borderRadius: 6, overflow: "hidden" },
  historySummary: {
    padding: "10px 16px", background: "#0f0f22", cursor: "pointer",
    fontSize: 11, color: "#555", letterSpacing: 1,
  },
  historyItem: { padding: "14px 16px", borderTop: "1px solid #1e1e3a", background: "#0a0a18" },
  historyItemHeader: { fontSize: 11, fontWeight: "bold", color: "#444", letterSpacing: 2, marginBottom: 8 },
  historyLabel: { fontSize: 10, letterSpacing: 2, marginBottom: 4, marginTop: 8 },
  historyContent: { fontSize: 11, lineHeight: 1.7, color: "#555", whiteSpace: "pre-wrap", maxHeight: 150, overflowY: "auto" },
  commitBtn: {
    background: "#0a0a18", border: "1px solid #2a2a4a", color: "#aaa",
    padding: "10px 14px", borderRadius: 4, fontSize: 12,
    display: "flex", alignItems: "center", minHeight: 44, whiteSpace: "nowrap",
    transition: "all 200ms ease",
  },
  commitLink: {
    color: "#81c784", fontSize: 12, textDecoration: "none", padding: "10px 14px",
    border: "1px solid #2a4a2a", borderRadius: 4, background: "#0a1a0a",
    minHeight: 44, display: "flex", alignItems: "center",
  },
};

const css = `
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
.cursor { animation: pulse 0.8s infinite; }
.pulse-border { animation: pulse 1.5s infinite; }
* { box-sizing: border-box; }
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: #0d0d1a; }
::-webkit-scrollbar-thumb { background: #2a2a4a; border-radius: 3px; }
button:focus-visible, input:focus-visible, textarea:focus-visible {
  outline: 2px solid #f0a500;
  outline-offset: 2px;
}
/* Safe area — encoche iPhone / Dynamic Island / home indicator */
#root {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}
/* Tap highlight supprimé sur mobile */
* { -webkit-tap-highlight-color: transparent; }
/* Sélection de texte désactivée sur les éléments UI */
button, .agent-bubble { -webkit-user-select: none; user-select: none; }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
`;
