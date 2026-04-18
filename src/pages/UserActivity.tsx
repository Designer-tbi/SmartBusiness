import React, { useState, useEffect } from 'react';
import { Activity, Users, Clock, Globe, Monitor, FileText, Target, Phone, BarChart3 } from 'lucide-react';

interface UserActivity {
  uid: string; name: string; email: string; role: string;
  account_type: string; is_active: boolean; created_at: string;
  lastSession: { logged_in_at: string; ip_address: string; user_agent: string } | null;
  sessionCount: number;
  stats: { leads: number; customers: number; quotes: number; activities: number; reports: number };
}

export default function UserActivityPage() {
  const [users, setUsers] = useState<UserActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { const r = await fetch('/api/admin/user-activity'); if (r.ok) setUsers(await r.json()); }
      catch (err) { console.error(err); } finally { setLoading(false); }
    })();
  }, []);

  const parseBrowser = (ua: string) => {
    if (!ua) return 'Inconnu';
    if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
    if (ua.includes('Edg')) return 'Edge';
    return 'Autre';
  };

  const timeAgo = (date: string) => {
    const diff = (Date.now() - new Date(date).getTime()) / 1000;
    if (diff < 60) return 'À l\'instant';
    if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)}h`;
    if (diff < 604800) return `Il y a ${Math.floor(diff / 86400)}j`;
    return new Date(date).toLocaleDateString('fr-FR');
  };

  if (loading) return <div className="flex h-64 items-center justify-center text-slate-400">Chargement...</div>;

  return (
    <div className="space-y-6" data-testid="user-activity-page">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3"><Activity className="w-7 h-7 text-indigo-600" /> Activité des utilisateurs</h1>
        <p className="text-sm text-slate-500 mt-1">Dernières connexions et activités de chaque utilisateur</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {users.filter(u => u.role !== 'superadmin').map(u => (
          <div key={u.uid} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5" data-testid={`user-card-${u.uid}`}>
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${u.is_active ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-400'}`}>
                  {u.name.charAt(0)}
                </div>
                <div>
                  <p className="font-bold text-slate-800">{u.name}</p>
                  <p className="text-xs text-slate-400">{u.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>{u.role}</span>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${u.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{u.is_active ? 'Actif' : 'Inactif'}</span>
              </div>
            </div>

            {/* Last connection */}
            <div className="bg-slate-50 rounded-xl p-3 mb-4">
              <p className="text-xs font-bold text-slate-400 uppercase mb-2">Dernière connexion</p>
              {u.lastSession ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Clock className="w-4 h-4 text-slate-400" />
                    {timeAgo(u.lastSession.logged_in_at)}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{u.lastSession.ip_address?.substring(0, 15)}</span>
                    <span className="flex items-center gap-1"><Monitor className="w-3 h-3" />{parseBrowser(u.lastSession.user_agent)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-400">Jamais connecté</p>
              )}
              <p className="text-xs text-slate-400 mt-1">{u.sessionCount} connexion{u.sessionCount > 1 ? 's' : ''} au total</p>
            </div>

            {/* Activity Stats */}
            <div className="grid grid-cols-5 gap-2">
              {[
                { label: 'Leads', value: u.stats.leads, icon: Target, color: 'text-amber-600' },
                { label: 'Clients', value: u.stats.customers, icon: Users, color: 'text-emerald-600' },
                { label: 'Devis', value: u.stats.quotes, icon: FileText, color: 'text-indigo-600' },
                { label: 'Activités', value: u.stats.activities, icon: Phone, color: 'text-blue-600' },
                { label: 'Rapports', value: u.stats.reports, icon: BarChart3, color: 'text-purple-600' },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="text-center p-2 bg-slate-50 rounded-lg">
                  <Icon className={`w-4 h-4 mx-auto mb-1 ${color}`} />
                  <p className="text-lg font-bold text-slate-800">{value}</p>
                  <p className="text-[10px] text-slate-400">{label}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {users.filter(u => u.role !== 'superadmin').length === 0 && <div className="text-center py-16 text-slate-400">Aucun utilisateur trouvé</div>}
    </div>
  );
}
