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
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem("anthropic_api_key") || ""
  );
  const [agentIds, setAgentIds] = useState(() => {
    try {
      return (
        JSON.parse(localStorage.getItem("agent_ids")) || {
          orchestrator: "",
          dev: "",
          qa: "",
        }
      );
    } catch {
      return { orchestrator: "", dev: "", qa: "" };
    }
  });
  const [brief, setBrief] = useState("");
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(null);
  const [phase, setPhase] = useState("idle"); // idle | running | done
  const [showConfig, setShowConfig] = useState(true);
  const [activeTab, setActiveTab] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    localStorage.setItem("anthropic_api_key", apiKey);
  }, [apiKey]);

  useEffect(() => {
    localStorage.setItem("agent_ids", JSON.stringify(agentIds));
  }, [agentIds]);

  useEffect(() => {
    if (bottomRef.current)
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
  }, [results, loading]);

  async function callClaude(systemPrompt, userMessage) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || "Erreur API");
    }
    const data = await response.json();
    return data.content[0].text;
  }

  async function runPipeline() {
    if (!apiKey || !brief.trim()) return;
    setPhase("running");
    setResults({});
    setShowConfig(false);

    try {
      // Step 1: Orchestrator
      setLoading("orchestrator");
      setActiveTab("orchestrator");
      const orchResult = await callClaude(
        SYSTEM_PROMPTS.orchestrator,
        `Brief du projet:\n${brief}`
      );
      setResults((r) => ({ ...r, orchestrator: orchResult }));
      setLoading(null);

      // Step 2: Dev
      setLoading("dev");
      setActiveTab("dev");
      const devResult = await callClaude(
        SYSTEM_PROMPTS.developer,
        `Instructions de l'Orchestrator:\n${orchResult}`
      );
      setResults((r) => ({ ...r, dev: devResult }));
      setLoading(null);

      // Step 3: QA
      setLoading("qa");
      setActiveTab("qa");
      const qaResult = await callClaude(
        SYSTEM_PROMPTS.qa,
        `Instructions de l'Orchestrator:\n${orchResult}\n\nCode du développeur:\n${devResult}`
      );
      setResults((r) => ({ ...r, qa: qaResult }));
      setLoading(null);

      setPhase("done");
    } catch (e) {
      setLoading(null);
      setPhase("idle");
      setResults((r) => ({ ...r, error: e.message }));
    }
  }

  const isReady = apiKey.trim().length > 10 && brief.trim().length > 5;

  return (
    <div style={styles.root}>
      <style>{css}</style>

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
            const isDone = !!results[agent.key];
            const isActive = loading === agent.key;
            return (
              <div key={agent.key} style={styles.pipelineStep}>
                <div
                  style={{
                    ...styles.agentBubble,
                    borderColor: agent.color,
                    background: isActive
                      ? `${agent.color}22`
                      : isDone
                      ? `${agent.color}15`
                      : "#1a1a2e",
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
                  <span style={{ ...styles.agentIcon, color: agent.color }}>
                    {agent.icon}
                  </span>
                  <div style={styles.agentName}>{agent.label}</div>
                  <div style={styles.agentDesc}>{agent.description}</div>
                  {isActive && <div style={styles.spinner}>⟳</div>}
                  {isDone && (
                    <div style={{ color: agent.color, fontSize: 18 }}>✓</div>
                  )}
                </div>
                {i < AGENTS.length - 1 && (
                  <div
                    style={{
                      ...styles.arrow,
                      color: isDone ? AGENTS[i].color : "#333",
                    }}
                  >
                    →
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Results Tabs */}
      {Object.keys(results).filter((k) => k !== "error").length > 0 && (
        <div style={styles.resultsSection}>
          <div style={styles.tabs}>
            {AGENTS.filter((a) => results[a.key]).map((a) => (
              <button
                key={a.key}
                onClick={() => setActiveTab(a.key)}
                aria-label={`Résultats de ${a.label}`}
                aria-selected={activeTab === a.key}
                role="tab"
                style={{
                  ...styles.tab,
                  borderBottom:
                    activeTab === a.key
                      ? `2px solid ${a.color}`
                      : "2px solid transparent",
                  color: activeTab === a.key ? a.color : "#666",
                }}
              >
                {a.icon} {a.label.split(" ")[0]}
              </button>
            ))}
          </div>
          {AGENTS.filter((a) => results[a.key] && activeTab === a.key).map(
            (a) => (
              <div key={a.key} style={styles.resultBox}>
                <div style={{ ...styles.resultHeader, color: a.color }}>
                  {a.icon} {a.label}
                </div>
                <div style={styles.resultContent}>
                  <TypewriterText text={results[a.key]} speed={5} />
                </div>
              </div>
            )
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
            Pipeline complété — 3 agents ont collaboré avec succès !
          </span>
          <button
            onClick={() => {
              setPhase("idle");
              setResults({});
              setActiveTab(null);
              setShowConfig(true);
              setBrief("");
            }}
            aria-label="Démarrer un nouveau brief"
            style={styles.resetBtn}
          >
            Nouveau brief
          </button>
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
