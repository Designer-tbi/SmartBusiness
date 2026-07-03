// AITeam.tsx — Super Admin only.
// Interface centrale pour piloter les 13 agents IA (Eden + Timothy/Flore/Paul + sous-agents)
import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Sparkles, Loader2, ChevronRight, Play, RefreshCw, X, Crown, Briefcase, Users, DollarSign, History, Linkedin, CheckCircle2, AlertTriangle } from 'lucide-react';

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
    </div>
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
          opts.body = cap.needsBody ? body : '{}';
          if (cap.needsBody) JSON.parse(body); // validate
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
            <div className="mt-4 flex items-center gap-2 text-sm">
              <Linkedin size={14} className="text-white/90" />
              {linkedinStatus.connected ? (
                <span className="inline-flex items-center gap-1 bg-white/20 backdrop-blur px-2.5 py-1 rounded-full text-xs">
                  <CheckCircle2 size={12} /> LinkedIn connecté {linkedinStatus.member_id ? `(${linkedinStatus.member_id.substring(0, 8)}…)` : ''}
                </span>
              ) : linkedinStatus.has_credentials ? (
                <a
                  href={`/api/agents/oauth/linkedin/${agent.id}/start`}
                  data-testid={`li-connect-${agent.id}`}
                  className="inline-flex items-center gap-1.5 bg-white text-slate-900 px-3 py-1 rounded-full text-xs font-semibold hover:bg-white/90 transition"
                >
                  <Linkedin size={12} /> Connecter LinkedIn
                </a>
              ) : (
                <span className="text-xs text-white/70 italic">LinkedIn en simulation (pas de credentials app)</span>
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
                  rows={5}
                  data-testid={`body-${agent.id}-${cap.id}`}
                  placeholder='{ "topic": "Transformation digitale PME" }'
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
              <pre className="bg-slate-900 text-emerald-200 p-4 text-xs overflow-x-auto max-h-96" data-testid="agent-result">{JSON.stringify(result, null, 2)}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
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
