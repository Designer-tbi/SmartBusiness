import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  PhoneCall, Users, CheckCircle2, Clock, BarChart3, TrendingUp,
  FileSignature, DollarSign, Target, Briefcase, Calendar as CalendarIcon, Award
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend
} from 'recharts';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#0ea5e9'];

function formatNumber(n: number) {
  return Number(n || 0).toLocaleString('fr-FR');
}

function StatCard({ icon: Icon, label, value, accent, hint }: { icon: any, label: string, value: string | number, accent: string, hint?: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex items-start gap-4 transition-all hover:shadow-md hover:-translate-y-0.5">
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center text-white ${accent}`}>
        <Icon size={22} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-slate-900 truncate">{value}</p>
        {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
      </div>
    </div>
  );
}

function AgentDashboard({ profile }: { profile: any }) {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    fetch('/api/stats/agent').then(r => r.ok ? r.json() : null).then(setStats);
  }, []);

  if (!stats) return <div className="text-slate-500">Chargement de vos performances...</div>;

  const pipelineData = [
    { name: 'Prospects', value: stats.pipeline.leads },
    { name: 'Opportunités', value: stats.pipeline.opportunities },
    { name: 'Clients', value: stats.pipeline.customers },
  ];

  const activityData = Object.entries(stats.activities).map(([type, count]) => ({ type, count: count as number }));

  return (
    <div className="space-y-6" data-testid="agent-dashboard">
      <div className="bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-2xl p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-indigo-100 text-sm">Bonjour {profile?.name?.split(' ')[0]} 👋</p>
            <h2 className="text-2xl font-bold mt-1">Voici vos performances</h2>
          </div>
          <Award size={48} className="text-white/30" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={DollarSign} label="CA encaissé" value={`${formatNumber(stats.revenue.paid)}`} accent="bg-emerald-500" hint={`${stats.revenue.invoicesPaid} facture(s) payée(s)`} />
        <StatCard icon={FileSignature} label="Devis signés" value={stats.quotes.signed} accent="bg-indigo-500" hint={`${formatNumber(stats.quotes.signedAmount)} de chiffre signé`} />
        <StatCard icon={TrendingUp} label="Taux conversion" value={`${stats.quotes.conversionRate}%`} accent="bg-amber-500" hint={`${stats.quotes.signed}/${stats.quotes.total} devis`} />
        <StatCard icon={Briefcase} label="Pipeline" value={stats.pipeline.opportunities} accent="bg-violet-500" hint={`${formatNumber(stats.pipeline.opportunitiesValue)} en cours`} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={PhoneCall} label="Appels" value={stats.activities['Appel'] || 0} accent="bg-blue-500" />
        <StatCard icon={CalendarIcon} label="RDV / Réunions" value={(stats.activities['RDV'] || 0) + (stats.activities['Réunion'] || 0)} accent="bg-cyan-500" />
        <StatCard icon={Users} label="Mes prospects" value={stats.pipeline.leads} accent="bg-pink-500" hint={`${stats.pipeline.leadsConverted} convertis`} />
        <StatCard icon={Target} label="Commissions" value={`${formatNumber(stats.commissions.total)}`} accent="bg-orange-500" hint={`${formatNumber(stats.commissions.paid)} payées`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="text-indigo-600" size={20} />
            <h3 className="text-lg font-semibold text-slate-800">Mon Pipeline Commercial</h3>
          </div>
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={pipelineData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {pipelineData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <CalendarIcon className="text-indigo-600" size={20} />
            <h3 className="text-lg font-semibold text-slate-800">Mes Activités</h3>
          </div>
          <div className="h-72">
            {activityData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400">Aucune activité pour le moment</div>
            ) : (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={activityData} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={90} label={(p: any) => `${p.type} (${p.count})`}>
                    {activityData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminDashboard() {
  const [overview, setOverview] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/stats/agents-overview')
      .then(r => r.ok ? r.json() : [])
      .then(d => { setOverview(d); setLoading(false); });
  }, []);

  if (loading) return <div className="text-slate-500">Chargement de la performance des agents...</div>;

  const totalRevenue = overview.reduce((a, x) => a + x.revenue, 0);
  const totalSigned = overview.reduce((a, x) => a + x.quotesSigned, 0);
  const avgConv = overview.length > 0 ? Math.round(overview.reduce((a, x) => a + x.conversionRate, 0) / overview.length) : 0;
  const totalCalls = overview.reduce((a, x) => a + x.calls, 0);

  const top5 = [...overview].sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  return (
    <div className="space-y-6" data-testid="admin-dashboard">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={DollarSign} label="CA total équipe" value={formatNumber(totalRevenue)} accent="bg-emerald-500" hint={`${overview.length} agent(s)`} />
        <StatCard icon={FileSignature} label="Devis signés" value={totalSigned} accent="bg-indigo-500" />
        <StatCard icon={TrendingUp} label="Conversion moyenne" value={`${avgConv}%`} accent="bg-amber-500" />
        <StatCard icon={PhoneCall} label="Appels totaux" value={totalCalls} accent="bg-blue-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="text-indigo-600" size={20} />
            <h3 className="text-lg font-semibold text-slate-800">CA par Agent</h3>
          </div>
          <div className="h-80">
            <ResponsiveContainer>
              <BarChart data={overview.map(o => ({ name: o.name.split(' ')[0], revenue: o.revenue, signed: o.signedAmount }))}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" />
                <YAxis tickFormatter={(v) => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `${(v/1e3).toFixed(0)}k` : v} />
                <Tooltip formatter={(v: any) => formatNumber(v)} />
                <Legend />
                <Bar dataKey="revenue" name="CA encaissé" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="signed" name="CA signé" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Award className="text-amber-500" size={20} />
            <h3 className="text-lg font-semibold text-slate-800">Top 5 Agents</h3>
          </div>
          <div className="space-y-3">
            {top5.length === 0 && <p className="text-sm text-slate-400">Aucun agent</p>}
            {top5.map((a, i) => (
              <div key={a.uid} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-white ${i === 0 ? 'bg-amber-500' : i === 1 ? 'bg-slate-400' : i === 2 ? 'bg-orange-500' : 'bg-slate-300'}`}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800 truncate">{a.name}</p>
                  <p className="text-xs text-slate-500">{a.zone || '—'} · {a.conversionRate}% conv.</p>
                </div>
                <p className="font-bold text-emerald-600 text-sm">{formatNumber(a.revenue)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center gap-2">
          <Users className="text-indigo-600" size={20} />
          <h3 className="text-lg font-semibold text-slate-800">Performance Détaillée des Agents</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="agents-perf-table">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold">
              <tr>
                <th className="px-5 py-3 text-left">Agent</th>
                <th className="px-5 py-3 text-left">Zone</th>
                <th className="px-5 py-3 text-right">CA encaissé</th>
                <th className="px-5 py-3 text-right">Devis signés</th>
                <th className="px-5 py-3 text-right">Conversion</th>
                <th className="px-5 py-3 text-right">Appels</th>
                <th className="px-5 py-3 text-right">RDV</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {overview.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-slate-400">Aucun agent à afficher. Chargez des données via le bouton "Recharger les données démo" en bas de page.</td></tr>
              ) : overview.map(a => (
                <tr key={a.uid} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-800">{a.name}</td>
                  <td className="px-5 py-3 text-slate-500">
                    <span className="px-2 py-0.5 bg-slate-100 rounded text-xs">{a.zone || '—'}</span>
                  </td>
                  <td className="px-5 py-3 text-right font-bold text-emerald-600">{formatNumber(a.revenue)}</td>
                  <td className="px-5 py-3 text-right">{a.quotesSigned} / {a.quotesTotal}</td>
                  <td className="px-5 py-3 text-right">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${a.conversionRate >= 50 ? 'bg-emerald-100 text-emerald-700' : a.conversionRate >= 25 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>{a.conversionRate}%</span>
                  </td>
                  <td className="px-5 py-3 text-right text-slate-600">{a.calls}</td>
                  <td className="px-5 py-3 text-right text-slate-600">{a.meetings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { profile } = useAuth();
  const [seeding, setSeeding] = useState(false);
  const isAdmin = profile?.role === 'admin' || profile?.role === 'superadmin';

  const handleSeed = async () => {
    if (!confirm("Voulez-vous charger les données de démonstration ? Cela ajoutera des agents, clients, devis, factures, etc. (idempotent : ne crée pas de doublons sur les agents).")) return;
    setSeeding(true);
    try {
      const r = await fetch('/api/admin/seed-demo', { method: 'POST' });
      const d = await r.json();
      if (r.ok) {
        alert(`✅ Données chargées :\n${Object.entries(d.summary || {}).map(([k, v]) => `• ${k}: ${v}`).join('\n')}`);
        window.location.reload();
      } else {
        alert('Erreur : ' + (d.error || 'inconnue'));
      }
    } catch (e: any) { alert('Erreur réseau: ' + e.message); }
    setSeeding(false);
  };

  if (!profile) return <div className="flex h-64 items-center justify-center">Chargement...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            {isAdmin ? 'Tableau de bord — Direction' : 'Mon tableau de bord'}
          </h1>
          <p className="text-slate-500 text-sm">
            {isAdmin ? 'Suivi des performances de toute l\'équipe commerciale' : 'Vos métriques clés en temps réel'}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={handleSeed}
            disabled={seeding}
            data-testid="seed-demo-btn"
            className="self-start md:self-auto px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-all shadow-sm font-medium text-sm disabled:opacity-50"
          >
            {seeding ? 'Chargement…' : '🔄 Charger les données démo'}
          </button>
        )}
      </div>

      {isAdmin ? <AdminDashboard /> : <AgentDashboard profile={profile} />}
    </div>
  );
}
