import React, { useState, useEffect } from 'react';
import { Monitor, Search, Filter, Clock, User, Globe, ChevronDown } from 'lucide-react';

interface Session {
  id: number;
  user_uid: string;
  user_email: string;
  user_name: string;
  user_role: string;
  ip_address: string;
  user_agent: string;
  loggedInAt: string;
  loggedOutAt: string | null;
}

export default function Sessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchUser, setSearchUser] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchUser) params.set('user', searchUser);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      const res = await fetch(`/api/admin/sessions?${params.toString()}`);
      if (res.ok) setSessions(await res.json());
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchSessions(); }, []);

  const handleFilter = (e: React.FormEvent) => {
    e.preventDefault();
    fetchSessions();
  };

  const parseBrowser = (ua: string) => {
    if (!ua) return 'Inconnu';
    if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
    if (ua.includes('Edg')) return 'Edge';
    return 'Autre';
  };

  const parseDevice = (ua: string) => {
    if (!ua) return 'Inconnu';
    if (ua.includes('Mobile') || ua.includes('Android')) return 'Mobile';
    if (ua.includes('Tablet') || ua.includes('iPad')) return 'Tablette';
    return 'Desktop';
  };

  return (
    <div className="space-y-6" data-testid="sessions-page">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
          <Monitor className="w-7 h-7 text-indigo-600" />
          Suivi des connexions
        </h1>
        <p className="text-sm text-slate-500 mt-1">{sessions.length} session{sessions.length !== 1 ? 's' : ''} enregistrée{sessions.length !== 1 ? 's' : ''}</p>
      </div>

      <form onSubmit={handleFilter} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-500 mb-1">Utilisateur</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                data-testid="filter-user"
                type="text"
                placeholder="Nom ou email..."
                value={searchUser}
                onChange={e => setSearchUser(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Du</label>
            <input data-testid="filter-date-from" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Au</label>
            <input data-testid="filter-date-to" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <button data-testid="filter-submit" type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center gap-1.5">
            <Filter className="w-4 h-4" /> Filtrer
          </button>
        </div>
      </form>

      {loading ? (
        <div className="text-center py-16 text-slate-400">Chargement...</div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl shadow-sm border border-slate-100">
          <Monitor className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">Aucune session enregistrée</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                <th className="text-left px-6 py-4">Utilisateur</th>
                <th className="text-left px-4 py-4">Role</th>
                <th className="text-left px-4 py-4 hidden md:table-cell">IP</th>
                <th className="text-left px-4 py-4 hidden lg:table-cell">Navigateur</th>
                <th className="text-left px-4 py-4 hidden lg:table-cell">Appareil</th>
                <th className="text-left px-4 py-4">Connexion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sessions.map(s => (
                <tr key={s.id} className="hover:bg-slate-50/50 transition-colors" data-testid={`session-row-${s.id}`}>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                        <User className="w-4 h-4 text-indigo-600" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-800 text-sm">{s.user_name}</p>
                        <p className="text-xs text-slate-400">{s.user_email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${s.user_role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                      {s.user_role === 'admin' ? 'Admin' : 'Agent'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500 hidden md:table-cell">
                    <div className="flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-slate-400" />
                      {s.ip_address?.substring(0, 20) || '-'}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500 hidden lg:table-cell">{parseBrowser(s.user_agent)}</td>
                  <td className="px-4 py-3 text-sm text-slate-500 hidden lg:table-cell">{parseDevice(s.user_agent)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-sm text-slate-500">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {new Date(s.loggedInAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
