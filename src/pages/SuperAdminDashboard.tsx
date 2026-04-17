import React, { useState, useEffect } from 'react';
import { Shield, Users, Clock, AlertTriangle, CheckCircle, XCircle, Activity, ToggleLeft, ToggleRight, Building2, Zap } from 'lucide-react';

interface DemoAccount {
  uid: string;
  email: string;
  name: string;
  role: string;
  account_type: string;
  is_active: boolean;
  first_login_at: string | null;
  company_name: string | null;
  created_at: string;
  daysRemaining: number;
  daysUsed: number;
  expired: boolean;
}

interface DashboardData {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  demoAccounts: DemoAccount[];
  prodAccounts: any[];
  demoCount: number;
  prodCount: number;
  expiredDemos: number;
  totalSessions: number;
  todaySessions: number;
}

export default function SuperAdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/superadmin/dashboard');
      if (res.ok) setData(await res.json());
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const toggleActive = async (uid: string) => {
    await fetch(`/api/users/${uid}/toggle-active`, { method: 'PUT' });
    fetchData();
  };

  const changeAccountType = async (uid: string, accountType: string) => {
    await fetch(`/api/users/${uid}/account-type`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountType }) });
    fetchData();
  };

  if (loading) return <div className="flex h-64 items-center justify-center text-slate-400">Chargement...</div>;
  if (!data) return <div className="text-center py-16 text-red-500">Erreur de chargement</div>;

  return (
    <div className="space-y-8" data-testid="superadmin-dashboard">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
          <Shield className="w-7 h-7 text-purple-600" />
          Super Administration
        </h1>
        <p className="text-sm text-slate-500 mt-1">Gestion des comptes, démos et licences</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-3"><div className="p-2 bg-blue-100 rounded-xl"><Users className="w-5 h-5 text-blue-600" /></div><span className="text-xs font-bold text-slate-400 uppercase">Total</span></div>
          <p className="text-3xl font-bold text-slate-900">{data.totalUsers}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-3"><div className="p-2 bg-emerald-100 rounded-xl"><CheckCircle className="w-5 h-5 text-emerald-600" /></div><span className="text-xs font-bold text-slate-400 uppercase">Actifs</span></div>
          <p className="text-3xl font-bold text-emerald-600">{data.activeUsers}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-3"><div className="p-2 bg-red-100 rounded-xl"><XCircle className="w-5 h-5 text-red-600" /></div><span className="text-xs font-bold text-slate-400 uppercase">Inactifs</span></div>
          <p className="text-3xl font-bold text-red-600">{data.inactiveUsers}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-3"><div className="p-2 bg-amber-100 rounded-xl"><Clock className="w-5 h-5 text-amber-600" /></div><span className="text-xs font-bold text-slate-400 uppercase">Démos</span></div>
          <p className="text-3xl font-bold text-amber-600">{data.demoCount}</p>
          {data.expiredDemos > 0 && <p className="text-xs text-red-500 mt-1">{data.expiredDemos} expirée(s)</p>}
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-3"><div className="p-2 bg-purple-100 rounded-xl"><Activity className="w-5 h-5 text-purple-600" /></div><span className="text-xs font-bold text-slate-400 uppercase">Sessions (aujourd'hui)</span></div>
          <p className="text-3xl font-bold text-purple-600">{data.todaySessions}</p>
          <p className="text-xs text-slate-400 mt-1">Total: {data.totalSessions}</p>
        </div>
      </div>

      {/* Demo Accounts with Countdown */}
      {data.demoAccounts.length > 0 && (
        <div>
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" /> Comptes Démo - Décomptes
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.demoAccounts.map(acc => (
              <div key={acc.uid} className={`bg-white rounded-2xl p-5 border shadow-sm ${acc.expired ? 'border-red-200 bg-red-50/30' : acc.daysRemaining <= 3 ? 'border-amber-200 bg-amber-50/30' : 'border-slate-100'}`} data-testid={`demo-card-${acc.uid}`}>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="font-bold text-slate-800">{acc.name}</p>
                    <p className="text-xs text-slate-400">{acc.email}</p>
                    {acc.company_name && <p className="text-xs text-slate-500 mt-0.5">{acc.company_name}</p>}
                  </div>
                  <button onClick={() => toggleActive(acc.uid)} className="p-1.5 rounded-lg hover:bg-slate-100" data-testid={`toggle-${acc.uid}`}>
                    {acc.is_active ? <ToggleRight className="w-6 h-6 text-emerald-500" /> : <ToggleLeft className="w-6 h-6 text-slate-300" />}
                  </button>
                </div>
                {/* Countdown Bar */}
                <div className="mb-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className={acc.expired ? 'text-red-600 font-bold' : acc.daysRemaining <= 3 ? 'text-amber-600 font-bold' : 'text-slate-500'}>
                      {acc.expired ? 'EXPIRÉ' : `${acc.daysRemaining} jour${acc.daysRemaining > 1 ? 's' : ''} restant${acc.daysRemaining > 1 ? 's' : ''}`}
                    </span>
                    <span className="text-slate-400">{acc.daysUsed}/15 jours</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2.5">
                    <div className={`h-2.5 rounded-full transition-all ${acc.expired ? 'bg-red-500' : acc.daysRemaining <= 3 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                      style={{ width: `${Math.min(100, (acc.daysUsed / 15) * 100)}%` }} />
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className={`px-2 py-1 rounded-full font-medium ${acc.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {acc.is_active ? 'Actif' : 'Désactivé'}
                  </span>
                  <button onClick={() => changeAccountType(acc.uid, 'production')} className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded-full font-medium hover:bg-indigo-200 flex items-center gap-1" data-testid={`upgrade-${acc.uid}`}>
                    <Zap className="w-3 h-3" /> Passer en Production
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Users Table */}
      <div>
        <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-indigo-500" /> Tous les comptes
        </h2>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                <th className="text-left px-6 py-4">Utilisateur</th>
                <th className="text-left px-4 py-4">Entreprise</th>
                <th className="text-left px-4 py-4">Role</th>
                <th className="text-left px-4 py-4">Type</th>
                <th className="text-left px-4 py-4">Statut</th>
                <th className="text-left px-4 py-4 hidden lg:table-cell">Décompte</th>
                <th className="text-right px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {[...data.demoAccounts, ...data.prodAccounts].map((u: any) => (
                <tr key={u.uid} className="hover:bg-slate-50/50" data-testid={`user-row-${u.uid}`}>
                  <td className="px-6 py-3">
                    <p className="font-medium text-sm text-slate-800">{u.name}</p>
                    <p className="text-xs text-slate-400">{u.email}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">{u.company_name || '-'}</td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-1 rounded-full font-medium ${u.role === 'superadmin' ? 'bg-purple-100 text-purple-700' : u.role === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{u.role}</span></td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-1 rounded-full font-medium ${u.account_type === 'demo' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{u.account_type === 'demo' ? 'Démo' : 'Production'}</span></td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleActive(u.uid)} className="flex items-center gap-1.5">
                      {u.is_active ? <ToggleRight className="w-5 h-5 text-emerald-500" /> : <ToggleLeft className="w-5 h-5 text-slate-300" />}
                      <span className={`text-xs font-medium ${u.is_active ? 'text-emerald-600' : 'text-red-500'}`}>{u.is_active ? 'Actif' : 'Inactif'}</span>
                    </button>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {u.account_type === 'demo' && u.daysRemaining !== undefined ? (
                      <span className={`text-xs font-bold ${u.expired ? 'text-red-600' : u.daysRemaining <= 3 ? 'text-amber-600' : 'text-slate-500'}`}>
                        {u.expired ? 'Expiré' : `${u.daysRemaining}j`}
                      </span>
                    ) : <span className="text-xs text-slate-300">-</span>}
                  </td>
                  <td className="px-6 py-3 text-right">
                    {u.account_type === 'demo' ? (
                      <button onClick={() => changeAccountType(u.uid, 'production')} className="text-xs px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 font-medium">Activer Prod</button>
                    ) : u.account_type === 'production' && u.email !== 'eden@tbi-center.fr' ? (
                      <button onClick={() => changeAccountType(u.uid, 'demo')} className="text-xs px-2 py-1 bg-slate-50 text-slate-500 rounded-lg hover:bg-slate-100 font-medium">Passer Démo</button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
