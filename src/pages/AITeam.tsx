// AITeam.tsx — Super Admin only.
// Interface centrale pour piloter les 13 agents IA (Eden + Timothy/Flore/Paul + sous-agents)
import { useState, useEffect } from 'react';
import React from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Sparkles, Loader2, ChevronRight, Play, RefreshCw, X, Crown, Briefcase, Users, DollarSign, History, Linkedin, CheckCircle2, AlertTriangle, Send, MessageSquare } from 'lucide-react';
import { useLivePoll } from '../hooks/useLivePoll';
import { LiveBadge } from '../components/LiveBadge';

type Capability = {
  id: string;
  label: string;
  description: string;
  endpoint: string;
  method: 'GET' | 'POST';
  needsBody?: boolean;
};
type AgentMeta = {
  id: string;
  name: string;
  role: string;
  email: string;
  reportsTo: string | null;
  level: 'C-suite' | 'Director' | 'Specialist';
  department: 'Direction' | 'Commercial' | 'RH' | 'Finance';
  avatar: string;
  color: string;
  linkedin?: string;
  connections?: number;
  capabilities: Capability[];
};
type RunRow = {
  id: number;
  agent_id: string;
  capability: string;
  status: 'success' | 'error';
  duration_ms: number | null;
  created_at: string;
  error_message: string | null;
};

const DEPT_ICON: Record<string, ReactNode> = {
  Direction:  <Crown size={16} />,
  Commercial: <Briefcase size={16} />,
  RH:         <Users size={16} />,
  Finance:    <DollarSign size={16} />,
};
const DEPT_COLOR: Record<string, string> = {
  Direction:  'from-indigo-500 to-violet-600',
  Commercial: 'from-blue-500 to-cyan-600',
  RH:         'from-rose-500 to-pink-600',
  Finance:    'from-emerald-500 to-teal-600',
};

export default function AITeam() {
  const [agents, setAgents] = useState<AgentMeta[]>([]);
  const [claudeInfo, setClaudeInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<AgentMeta | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [showRuns, setShowRuns] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkedinStatus, setLinkedinStatus] = useState<Record<string, { connected: boolean; has_credentials?: boolean; member_id?: string }>>({});
  const location = useLocation();

  // Re-open agent panel whenever URL ?agent=<id> changes (also handles same-route navigation)
  useEffect(() => {
    if (agents.length === 0) return;
    const params = new URLSearchParams(location.search);
    const wanted = params.get('agent');
    if (wanted) {
      const found = agents.find((a) => a.id === wanted);
      if (found) setSelectedAgent(found);
    }
  }, [location.search, agents]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/agents/team');
        if (!r.ok) {
          if (r.status === 401 || r.status === 403) throw new Error('Accès réservé au superadmin');
          throw new Error('Erreur de chargement');
        }
        const data = await r.json();
        setAgents(data.agents || []);
        setClaudeInfo(data.claude || {});
        // Fetch LinkedIn status (non-blocking)
        fetch('/api/agents/linkedin/status').then(r => r.ok ? r.json() : null).then(s => { if (s?.agents) setLinkedinStatus(s.agents); }).catch(() => {});
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Live polling of recent runs when the runs modal is open
  const { data: runsData } = useLivePoll<{ runs: RunRow[] }>(
    showRuns ? '/api/agents/runs/recent?limit=30' : null,
    { intervalMs: 3000, enabled: showRuns }
  );
  useEffect(() => { if (runsData?.runs) setRuns(runsData.runs); }, [runsData]);

  const fetchRuns = async () => {
    try {
      const r = await fetch('/api/agents/runs/recent?limit=30');
      const data = await r.json();
      setRuns(data.runs || []);
    } catch { /* ignore */ }
  };

  useEffect(() => { if (showRuns) fetchRuns(); }, [showRuns]);

  if (loading) return (
    <div className="flex h-96 items-center justify-center text-slate-500">
      <Loader2 className="animate-spin mr-2" size={20} /> Chargement de l&apos;équipe IA…
    </div>
  );
  if (error) return (
    <div className="bg-rose-50 border border-rose-200 rounded-xl p-6 text-rose-700 flex items-center gap-3">
      <AlertTriangle /> {error}
    </div>
  );

  const directors = agents.filter(a => a.level === 'Director');
  const ceo = agents.find(a => a.level === 'C-suite');
  const specialistsBy = (directorId: string) => agents.filter(a => a.reportsTo === directorId);

  return (
    <div className="space-y-8" data-testid="ai-team-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 flex items-center gap-2 md:gap-3">
            <Sparkles className="text-indigo-600" size={28} />
            Équipe IA — TBI Technology
            <LiveBadge label="Live" />
          </h1>
          <p className="text-slate-500 mt-1">
            {agents.length} agents IA pilotent l&apos;application en parallèle.
            {claudeInfo?.configured ? (
              <span className="ml-2 inline-flex items-center gap-1 text-emerald-600 font-medium">
                <CheckCircle2 size={14} /> Claude actif ({claudeInfo.model})
              </span>
            ) : (
              <span className="ml-2 inline-flex items-center gap-1 text-amber-600 font-medium">
                <AlertTriangle size={14} /> ANTHROPIC_API_KEY manquante
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => setShowRuns(true)}
          className="inline-flex items-center gap-2 bg-slate-900 text-white px-4 py-2.5 rounded-xl hover:bg-slate-800 transition-all shadow-sm"
          data-testid="open-runs-btn"
        >
          <History size={18} /> Historique des runs
        </button>
      </div>

      {/* CEO (Eden) */}
      {ceo && (
        <div>
          <AgentCard agent={ceo} onClick={() => setSelectedAgent(ceo)} isCeo />
        </div>
      )}

      {/* Live in-progress runs */}
      <LiveRunsPanel agents={agents} />

      {/* External Tools Panel */}
      <ExternalToolsPanel agents={agents} />

      {/* Org chart: 3 columns by director */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {directors.map(d => (
          <div key={d.id} className="space-y-4">
            <AgentCard agent={d} onClick={() => setSelectedAgent(d)} isDirector />
            <div className="pl-4 border-l-2 border-dashed border-slate-200 space-y-3">
              {specialistsBy(d.id).map(s => (
                <AgentCard key={s.id} agent={s} onClick={() => setSelectedAgent(s)} compact />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Agent panel */}
      {selectedAgent && (
        <AgentPanel agent={selectedAgent} onClose={() => setSelectedAgent(null)} onRefresh={fetchRuns} linkedinStatus={linkedinStatus[selectedAgent.id]} />
      )}

      {/* Runs panel */}
      {showRuns && (
        <RunsModal runs={runs} onClose={() => setShowRuns(false)} onRefresh={fetchRuns} />
      )}

      {/* Command Bar — floating chat with agents */}
      <CommandBar agents={agents} />
    </div>
  );
}

// ─── LIVE IN-PROGRESS RUNS ──────────────────────────────────────────
type LiveRun = { id: number; agent_id: string; capability: string; status: string; triggered_by?: string; elapsed_seconds: number; created_at: string };
function LiveRunsPanel({ agents }: { agents: AgentMeta[] }) {
  const { data } = useLivePoll<{ running: LiveRun[] }>('/api/agents/runs/live', { intervalMs: 2500 });
  const running = data?.running || [];
  if (running.length === 0) return null;
  return (
    <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-4 md:p-5" data-testid="live-runs-panel">
      <div className="flex items-center gap-2 mb-3">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
        </span>
        <h3 className="font-bold text-emerald-900 text-sm md:text-base">Tâches IA en cours ({running.length})</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {running.map(r => {
          const agent = agents.find(a => a.id === r.agent_id);
          return (
            <div key={r.id} className="bg-white/70 backdrop-blur rounded-xl px-3 py-2 border border-emerald-100 flex items-center gap-2" data-testid={`live-run-${r.id}`}>
              <span className="text-xl">{agent?.avatar || '🤖'}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800 truncate">{agent?.name || r.agent_id}</p>
                <p className="text-[11px] text-slate-500 truncate">{r.capability}</p>
              </div>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">{r.elapsed_seconds}s</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── COMMAND BAR ─────────────────────────────────────────────────────
type ChatEntry = { role: 'user' | 'assistant'; content: string; agent?: string; ts: number };
function CommandBar({ agents }: { agents: AgentMeta[] }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<string>('eden');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<ChatEntry[]>([]);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [history, open]);

  const send = async (msg?: string) => {
    const text = (msg ?? input).trim();
    if (!text || busy) return;
    setBusy(true);
    const userEntry: ChatEntry = { role: 'user', content: text, agent: target, ts: Date.now() };
    // Add user message + placeholder assistant for streaming
    setHistory(h => [...h, userEntry, { role: 'assistant', content: '', agent: target, ts: Date.now() }]);
    setInput('');
    try {
      const past = history.slice(-6).map(h => ({ role: h.role, content: h.content }));
      const r = await fetch(`/api/agents/${target}/chat/stream`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: past }),
      });
      if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf('\n\n')) >= 0) {
          const raw = buffer.slice(0, idx); buffer = buffer.slice(idx + 2);
          const line = raw.split('\n').find(l => l.startsWith('data: '));
          if (!line) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === 'delta' && evt.text) {
              setHistory(h => {
                const next = [...h];
                const last = next[next.length - 1];
                if (last && last.role === 'assistant') next[next.length - 1] = { ...last, content: last.content + evt.text };
                return next;
              });
            } else if (evt.type === 'error') {
              throw new Error(evt.error || 'Erreur streaming');
            }
          } catch (parseErr) {
            // Ignore malformed chunk unless it is a real error
            if (parseErr instanceof Error && parseErr.message.includes('streaming')) throw parseErr;
          }
        }
      }
    } catch (e: any) {
      setHistory(h => {
        const next = [...h];
        const last = next[next.length - 1];
        if (last && last.role === 'assistant' && !last.content) {
          next[next.length - 1] = { ...last, content: `⚠️ Erreur : ${e.message}` };
        } else {
          next.push({ role: 'assistant', content: `⚠️ Erreur : ${e.message}`, agent: target, ts: Date.now() });
        }
        return next;
      });
    } finally {
      setBusy(false);
    }
  };

  const suggestions = target === 'eden'
    ? ['Fais-moi une vue exécutive du mois', 'Quels sont les 3 risques principaux ?', 'Demande à Timothy son rapport pipeline']
    : target === 'timothy'
    ? ['Analyse le pipeline', 'Trouve 10 prospects PME à Brazzaville', 'Génère un devis pour un site web']
    : target === 'paul'
    ? ['Fais le dashboard financier', 'Lance le cycle de recouvrement', 'Prévisions trésorerie 3 mois']
    : ['Que peux-tu faire ?', 'Fais un rapport pour ton directeur'];

  const targetAgent = agents.find(a => a.id === target);

  return (
    <>
      {/* Trigger button (mobile + desktop) */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          data-testid="open-command-bar"
          className="fixed z-40 bottom-4 right-4 md:bottom-6 md:right-6 bg-indigo-600 text-white rounded-full shadow-2xl hover:shadow-indigo-500/50 hover:bg-indigo-700 transition-all px-5 py-3 flex items-center gap-2 font-semibold safe-bottom"
        >
          <MessageSquare size={18} />
          <span className="hidden sm:inline">Donner un ordre</span>
          <span className="sm:hidden">Ordre</span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed z-40 inset-x-0 bottom-0 md:inset-x-auto md:right-6 md:bottom-6 md:w-[440px] bg-white rounded-t-2xl md:rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[85vh] md:max-h-[70vh] safe-bottom" data-testid="command-bar">
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-t-2xl">
            <div className="flex items-center gap-2 min-w-0">
              <MessageSquare size={16} />
              <span className="font-semibold">Barre de commande</span>
              {targetAgent && <span className="text-white/70 text-xs">→ {targetAgent.avatar} {targetAgent.name}</span>}
            </div>
            <button onClick={() => setOpen(false)} className="text-white/80 hover:text-white p-1 -mr-1" data-testid="close-command-bar"><X size={18} /></button>
          </div>

          {/* Agent selector */}
          <div className="px-4 py-2 border-b border-slate-100 bg-slate-50">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Destinataire</label>
            <select
              value={target}
              onChange={e => setTarget(e.target.value)}
              data-testid="command-bar-target"
              className="w-full mt-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {agents.map(a => (
                <option key={a.id} value={a.id}>{a.avatar} {a.name} — {a.role}</option>
              ))}
            </select>
          </div>

          {/* History */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[200px] max-h-[400px]" data-testid="command-history">
            {history.length === 0 && (
              <div className="text-center text-slate-400 text-sm italic py-4">
                Aucune conversation. Utilisez les suggestions ci-dessous ou tapez votre ordre.
              </div>
            )}
            {history.map((entry, i) => (
              <div key={i} className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${entry.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800 border border-slate-200'}`}>
                  {entry.role === 'assistant' && entry.agent && (
                    <div className="text-[10px] font-bold text-indigo-600 mb-1 uppercase tracking-wider flex items-center gap-1.5">
                      {agents.find(a => a.id === entry.agent)?.name || entry.agent}
                      {busy && i === history.length - 1 && !entry.content && (
                        <span className="inline-flex items-center gap-1 text-slate-500 normal-case font-normal">
                          <Loader2 size={10} className="animate-spin" /> réfléchit…
                        </span>
                      )}
                      {busy && i === history.length - 1 && entry.content && (
                        <span className="w-1.5 h-3 bg-indigo-500 animate-pulse rounded-sm" title="Streaming" />
                      )}
                    </div>
                  )}
                  {entry.content || (entry.role === 'assistant' && busy && i === history.length - 1 ? '…' : '')}
                </div>
              </div>
            ))}
          </div>

          {/* Suggestions */}
          {history.length === 0 && (
            <div className="px-4 pb-2 flex flex-wrap gap-1.5">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => send(s)}
                  disabled={busy}
                  className="text-[11px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full border border-indigo-100 transition-colors disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={(e) => { e.preventDefault(); send(); }}
            className="border-t border-slate-200 p-3 flex items-end gap-2"
          >
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              rows={1}
              placeholder={`Donner un ordre à ${targetAgent?.name || 'l\'agent'}...`}
              data-testid="command-input"
              className="flex-1 resize-none bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all max-h-32"
              style={{ minHeight: '40px' }}
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              data-testid="command-send"
              className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl p-2.5 disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0"
              aria-label="Envoyer"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </form>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
function AgentCard({ agent, onClick, isCeo, isDirector, compact }: { agent: AgentMeta; onClick: () => void; isCeo?: boolean; isDirector?: boolean; compact?: boolean }) {
  const gradient = DEPT_COLOR[agent.department];
  return (
    <button
      onClick={onClick}
      data-testid={`agent-card-${agent.id}`}
      className={`w-full text-left bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-all group relative overflow-hidden ${isCeo ? 'p-6' : compact ? 'p-3' : 'p-4'}`}
    >
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${gradient}`} />
      <div className="flex items-center gap-3">
        <div className={`flex items-center justify-center rounded-xl bg-gradient-to-br ${gradient} text-white ${isCeo ? 'w-16 h-16 text-3xl' : compact ? 'w-10 h-10 text-base' : 'w-12 h-12 text-xl'}`}>
          <span>{agent.avatar}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className={`font-bold text-slate-900 truncate ${isCeo ? 'text-xl' : 'text-base'}`}>{agent.name}</h3>
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
              {DEPT_ICON[agent.department]}
            </span>
          </div>
          <p className={`text-slate-500 truncate ${compact ? 'text-xs' : 'text-sm'}`}>{agent.role}</p>
          {!compact && (
            <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
              {agent.linkedin && <span className="inline-flex items-center gap-1"><Linkedin size={11} />{agent.connections} relations</span>}
              <span>{agent.capabilities.length} actions</span>
            </div>
          )}
        </div>
        <ChevronRight size={18} className="text-slate-400 group-hover:text-indigo-600 transition-colors shrink-0" />
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────
function AgentPanel({ agent, onClose, onRefresh, linkedinStatus }: { agent: AgentMeta; onClose: () => void; onRefresh: () => void; linkedinStatus?: { connected: boolean; has_credentials?: boolean; member_id?: string } }) {
  const [active, setActive] = useState<Capability | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [body, setBody] = useState('{\n  \n}');

  const run = async (cap: Capability) => {
    setActive(cap);
    setRunning(true);
    setResult(null);
    try {
      const opts: RequestInit = { method: cap.method };
      if (cap.method === 'POST') {
        opts.headers = { 'Content-Type': 'application/json' };
        try {
          if (cap.needsBody) {
            // For universal capabilities: send as { input }. For legacy: raw JSON.
            const trimmed = body.trim();
            const isJSON = trimmed.startsWith('{') || trimmed.startsWith('[');
            if (isJSON) {
              JSON.parse(trimmed); // validate
              opts.body = trimmed;
            } else {
              opts.body = JSON.stringify({ input: trimmed });
            }
          } else {
            opts.body = '{}';
          }
        } catch { setRunning(false); alert('JSON invalide'); return; }
      }
      const r = await fetch(cap.endpoint, opts);
      const data = await r.json();
      setResult(data);
      onRefresh();
    } catch (e: any) {
      setResult({ success: false, error: e.message });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-stretch justify-end" onClick={onClose}>
      <div className="bg-white w-full max-w-3xl h-full overflow-y-auto shadow-2xl flex flex-col" onClick={e => e.stopPropagation()} data-testid="agent-panel">
        <div className={`p-6 bg-gradient-to-br ${DEPT_COLOR[agent.department]} text-white relative`}>
          <button onClick={onClose} className="absolute top-4 right-4 text-white/80 hover:text-white" data-testid="close-agent-panel"><X size={20} /></button>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center text-4xl">{agent.avatar}</div>
            <div className="flex-1">
              <h2 className="text-2xl font-black">{agent.name}</h2>
              <p className="text-white/80">{agent.role}</p>
              <p className="text-xs text-white/60 mt-1">{agent.email}</p>
            </div>
          </div>
          {linkedinStatus && (
            <div className="mt-4 flex items-center gap-2 text-sm flex-wrap">
              <Linkedin size={14} className="text-white/90" />
              {linkedinStatus.connected ? (
                <>
                  <span className="inline-flex items-center gap-1 bg-white/20 backdrop-blur px-2.5 py-1 rounded-full text-xs">
                    <CheckCircle2 size={12} /> LinkedIn connecté {linkedinStatus.member_id ? `(${linkedinStatus.member_id.substring(0, 8)}…)` : ''}
                  </span>
                  <span className="text-[10px] text-white/70">Posts réels ✓ · Messages/Invitations ✗ (limitation LinkedIn)</span>
                </>
              ) : linkedinStatus.has_credentials ? (
                <a
                  href={`/api/agents/oauth/linkedin/${agent.id}/start`}
                  data-testid={`li-connect-${agent.id}`}
                  className="inline-flex items-center gap-1.5 bg-white text-slate-900 px-3 py-1 rounded-full text-xs font-semibold hover:bg-white/90 transition"
                >
                  <Linkedin size={12} /> Connecter LinkedIn
                </a>
              ) : (
                <span className="text-xs text-white/70 italic">LinkedIn en simulation (ajoutez LINKEDIN_CLIENT_ID_{agent.id.toUpperCase()} dans Vercel)</span>
              )}
            </div>
          )}
        </div>

        <div className="p-6 grid grid-cols-1 gap-3">
          {agent.capabilities.map(cap => (
            <div key={cap.id} className={`border rounded-xl p-4 transition-all ${active?.id === cap.id ? 'border-indigo-500 ring-2 ring-indigo-200 bg-indigo-50/30' : 'border-slate-200 hover:border-slate-300 bg-white'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                    <Sparkles size={14} className="text-indigo-500" /> {cap.label}
                  </h4>
                  <p className="text-sm text-slate-500 mt-0.5">{cap.description}</p>
                  <code className="text-[10px] text-slate-400 mt-1 block">{cap.method} {cap.endpoint}</code>
                </div>
                <button
                  onClick={() => run(cap)}
                  disabled={running}
                  data-testid={`run-${agent.id}-${cap.id}`}
                  className="inline-flex items-center gap-1.5 bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-all disabled:opacity-50"
                >
                  {running && active?.id === cap.id ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                  Exécuter
                </button>
              </div>
              {active?.id === cap.id && cap.needsBody && cap.method === 'POST' && (
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  rows={3}
                  data-testid={`body-${agent.id}-${cap.id}`}
                  placeholder={cap.id.startsWith('u-') ? 'Tapez votre instruction ou paramètre (texte libre ou JSON)…' : '{ "topic": "Transformation digitale PME" }'}
                  className="mt-3 w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              )}
            </div>
          ))}
        </div>

        {result && (
          <div className="px-6 pb-6">
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className={`px-4 py-2 text-sm font-bold flex items-center justify-between ${result.success === false ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                <span className="flex items-center gap-2">
                  {result.success === false ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
                  Résultat — {active?.label}
                </span>
                <button onClick={() => setResult(null)} className="text-xs hover:underline">Effacer</button>
              </div>
              {/* Smart status banner — real vs simulated */}
              {(() => {
                const r = result?.result || result?.linkedin_result || result;
                const isSimulated = r?.simulated === true;
                const isLive = r?.live === true || result?.live === true;
                if (isSimulated) {
                  return (
                    <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 text-amber-900" data-testid="agent-result-simulated">
                      <div className="flex items-start gap-2">
                        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
                        <div className="text-xs md:text-sm">
                          <p className="font-bold">⚠️ Action NON exécutée en réel (mode simulation)</p>
                          {r?.reason && <p className="mt-1 text-amber-800/90">{r.reason}</p>}
                          {r?.workaround && <p className="mt-2 pt-2 border-t border-amber-200 text-amber-800/90"><strong>Solution :</strong> {r.workaround}</p>}
                        </div>
                      </div>
                    </div>
                  );
                }
                if (isLive) {
                  return (
                    <div className="px-4 py-2.5 bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-xs md:text-sm flex items-start gap-2" data-testid="agent-result-live">
                      <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" />
                      <div>
                        <span className="font-bold">✅ Exécuté en temps réel</span>
                        {r?.delivered && <span> — {r.delivered}</span>}
                        {r?.post_url && (
                          <a href={r.post_url} target="_blank" rel="noreferrer" className="ml-2 underline font-medium">Voir sur LinkedIn ↗</a>
                        )}
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
              <pre className="bg-slate-900 text-emerald-200 p-4 text-xs overflow-x-auto max-h-96" data-testid="agent-result">{JSON.stringify(result, null, 2)}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ─── EXTERNAL TOOLS PANEL — scrape URLs, analyze text, extract to CRM ─
function ExternalToolsPanel({ agents }: { agents: AgentMeta[] }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'analyze' | 'extract' | 'search'>('analyze');
  const [target, setTarget] = useState<'leads' | 'customers' | 'products' | 'portfolio'>('leads');
  const [source, setSource] = useState('');
  const [question, setQuestion] = useState('');
  const [agentId, setAgentId] = useState('eden');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);

  const run = async () => {
    if (!source.trim() && mode !== 'search') return;
    setBusy(true); setResult(null);
    try {
      let endpoint = '', body: any = { agentId };
      if (mode === 'search') { endpoint = '/api/agents/tools/web-search'; body.query = source; }
      else if (mode === 'analyze') { endpoint = '/api/agents/tools/analyze'; body.source = source; body.question = question; }
      else if (mode === 'extract') { endpoint = '/api/agents/tools/extract-to-crm'; body.source = source; body.target = target; }
      const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      setResult(await r.json());
    } catch (e: any) { setResult({ success: false, error: e.message }); }
    finally { setBusy(false); }
  };

  return (
    <div className="bg-gradient-to-r from-slate-900 to-indigo-900 rounded-2xl p-5 md:p-6 text-white shadow-xl" data-testid="external-tools-panel">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-lg md:text-xl font-black flex items-center gap-2"><Sparkles size={20} className="text-violet-300" /> Outils externes</h3>
          <p className="text-xs md:text-sm text-white/70 mt-0.5">Analyser un site, extraire des données, chercher sur le web — et tout intégrer dans le CRM.</p>
        </div>
        <button onClick={() => setOpen(!open)} className="text-white/90 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg text-xs font-semibold" data-testid="toggle-tools">
          {open ? 'Fermer' : 'Ouvrir'}
        </button>
      </div>
      {open && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div className="space-y-3">
            {/* Mode selector */}
            <div className="flex gap-2 flex-wrap">
              {[
                { id: 'analyze', label: '🔬 Analyser', hint: 'Analyse minutieuse d\'un site ou texte' },
                { id: 'extract', label: '📥 Extraire → CRM', hint: 'Extraire + insérer en base' },
                { id: 'search',  label: '🌐 Recherche web', hint: 'Recherche live sur le web' },
              ].map((m) => (
                <button key={m.id} onClick={() => setMode(m.id as any)} title={m.hint}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${mode === m.id ? 'bg-white text-slate-900' : 'bg-white/10 text-white hover:bg-white/20'}`}
                  data-testid={`tool-mode-${m.id}`}>
                  {m.label}
                </button>
              ))}
            </div>
            {/* Agent selector */}
            <div>
              <label className="text-[10px] font-bold text-white/70 uppercase tracking-wider">Agent exécutant</label>
              <select value={agentId} onChange={(e) => setAgentId(e.target.value)}
                className="w-full mt-1 bg-white/10 border border-white/20 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-400"
                data-testid="tool-agent-select">
                {agents.map((a) => <option key={a.id} value={a.id} className="text-slate-900">{a.avatar} {a.name}</option>)}
              </select>
            </div>
            {/* Extract target */}
            {mode === 'extract' && (
              <div>
                <label className="text-[10px] font-bold text-white/70 uppercase tracking-wider">Insérer comme…</label>
                <select value={target} onChange={(e) => setTarget(e.target.value as any)}
                  className="w-full mt-1 bg-white/10 border border-white/20 rounded-lg px-2 py-1.5 text-sm text-white"
                  data-testid="tool-extract-target">
                  <option value="leads"      className="text-slate-900">Leads (prospects)</option>
                  <option value="customers"  className="text-slate-900">Clients</option>
                  <option value="products"   className="text-slate-900">Produits / services</option>
                  <option value="portfolio"  className="text-slate-900">Portefeuille (établissements)</option>
                </select>
              </div>
            )}
            {/* Source input */}
            <div>
              <label className="text-[10px] font-bold text-white/70 uppercase tracking-wider">
                {mode === 'search' ? 'Requête de recherche' : 'URL ou texte à analyser'}
              </label>
              <textarea value={source} onChange={(e) => setSource(e.target.value)} rows={mode === 'search' ? 2 : 5}
                placeholder={mode === 'search' ? 'Ex: Appels d\'offres IT Congo Brazzaville 2026' : 'https://www.exemple.com ou coller du texte…'}
                className="w-full mt-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-violet-400"
                data-testid="tool-source"/>
            </div>
            {/* Optional question */}
            {mode === 'analyze' && (
              <div>
                <label className="text-[10px] font-bold text-white/70 uppercase tracking-wider">Question spécifique (optionnel)</label>
                <input value={question} onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ex: Quels sont les 3 concurrents mentionnés ?"
                  className="w-full mt-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-violet-400"
                  data-testid="tool-question"/>
              </div>
            )}
            <button onClick={run} disabled={busy || (!source.trim() && mode !== 'search')}
              className="w-full bg-violet-600 hover:bg-violet-700 text-white rounded-lg py-2.5 font-semibold text-sm disabled:opacity-40 transition-all flex items-center justify-center gap-2"
              data-testid="tool-run">
              {busy ? <><Loader2 size={14} className="animate-spin" /> Exécution…</> : <><Play size={14} /> Lancer</>}
            </button>
          </div>
          {/* Result */}
          <div className="bg-slate-950/50 border border-white/10 rounded-lg overflow-hidden min-h-[200px] max-h-[400px] flex flex-col">
            <div className="px-3 py-1.5 border-b border-white/10 text-xs font-bold text-white/70 uppercase tracking-wider">Résultat</div>
            <div className="flex-1 overflow-y-auto p-3 text-xs text-emerald-200" data-testid="tool-result">
              {!result && <div className="text-white/40 italic">Aucun résultat pour l'instant.</div>}
              {result && result.success === false && <div className="text-rose-300">⚠️ {result.error}</div>}
              {result && result.success && (
                <>
                  {result.reply && <pre className="whitespace-pre-wrap font-sans text-white/90">{result.reply}</pre>}
                  {result.extracted !== undefined && (
                    <div>
                      <p className="text-emerald-300 font-bold">✓ {result.inserted} / {result.extracted} enregistrements insérés en CRM</p>
                      {result.items && result.items.length > 0 && (
                        <ul className="mt-2 text-xs space-y-0.5 text-white/80">
                          {result.items.slice(0, 20).map((it: any, i: number) => <li key={i}>#{it.id} — {it.name}</li>)}
                        </ul>
                      )}
                      {result.originUrl && <p className="mt-2 text-white/50">Source : {result.originUrl}</p>}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function RunsModal({ runs, onClose, onRefresh }: { runs: RunRow[]; onClose: () => void; onRefresh: () => void }) {
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()} data-testid="runs-modal">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 flex items-center gap-2"><History size={18} /> Historique des runs IA</h3>
          <div className="flex items-center gap-2">
            <button onClick={onRefresh} className="text-slate-500 hover:text-indigo-600" data-testid="refresh-runs"><RefreshCw size={16} /></button>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-800"><X size={18} /></button>
          </div>
        </div>
        <div className="overflow-y-auto">
          {runs.length === 0 && <p className="p-8 text-center text-slate-400 italic">Aucun run pour l&apos;instant.</p>}
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600 sticky top-0">
              <tr>
                <th className="px-4 py-2">Quand</th>
                <th className="px-4 py-2">Agent</th>
                <th className="px-4 py-2">Action</th>
                <th className="px-4 py-2">Statut</th>
                <th className="px-4 py-2 text-right">Durée</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {runs.map(r => (
                <tr key={r.id} data-testid={`run-row-${r.id}`}>
                  <td className="px-4 py-2 text-xs text-slate-500 whitespace-nowrap">{new Date(r.created_at).toLocaleString('fr-FR')}</td>
                  <td className="px-4 py-2 font-semibold text-slate-800 capitalize">{r.agent_id}</td>
                  <td className="px-4 py-2 text-slate-600">{r.capability}</td>
                  <td className="px-4 py-2">
                    {r.status === 'success'
                      ? <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full text-xs font-medium"><CheckCircle2 size={11} /> OK</span>
                      : <span className="inline-flex items-center gap-1 text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full text-xs font-medium" title={r.error_message || ''}><AlertTriangle size={11} /> Erreur</span>
                    }
                  </td>
                  <td className="px-4 py-2 text-right text-xs text-slate-500">{r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
