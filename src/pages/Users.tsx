import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { UserCircle, Trash2, UserPlus, Shield, User, Mail, Lock, Globe, Building2, Filter } from 'lucide-react';

const ZONES = [
  { code: 'CG', name: 'Congo (Brazzaville)', flag: '🇨🇬' },
  { code: 'CD', name: 'RD Congo (Kinshasa)', flag: '🇨🇩' },
  { code: 'FR', name: 'France', flag: '🇫🇷' },
  { code: 'CM', name: 'Cameroun', flag: '🇨🇲' },
  { code: 'GA', name: 'Gabon', flag: '🇬🇦' },
  { code: 'CI', name: "Côte d'Ivoire", flag: '🇨🇮' },
  { code: 'SN', name: 'Sénégal', flag: '🇸🇳' },
];

const getZoneInfo = (code: string) => ZONES.find(z => z.code === code) || { code, name: code, flag: '🌍' };

export default function Users() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [zoneFilter, setZoneFilter] = useState('all');
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'agent', accountType: 'demo', companyName: '', zone: 'CG' });
  const [error, setError] = useState('');

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users');
      if (response.ok) setUsers(await response.json());
    } catch (error) { console.error("Error fetching users:", error); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleRoleChange = async (uid: string, newRole: string) => {
    try { const r = await fetch(`/api/users/${uid}/role`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: newRole }) }); if (r.ok) fetchUsers(); } catch (e) { console.error(e); }
  };

  const handleDeleteUser = async (uid: string) => {
    if (!confirm("Supprimer cet utilisateur ?")) return;
    try { const r = await fetch(`/api/users/${uid}`, { method: 'DELETE' }); if (r.ok) fetchUsers(); } catch (e) { console.error(e); }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    try {
      const response = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newUser) });
      if (response.ok) {
        setShowCreateModal(false);
        setNewUser({ name: '', email: '', password: '', role: 'agent', accountType: 'demo', companyName: '', zone: 'CG' });
        fetchUsers();
      } else { const data = await response.json(); setError(data.error || "Erreur lors de la création"); }
    } catch (error) { setError("Erreur réseau"); }
  };

  const filteredUsers = zoneFilter === 'all' ? users : users.filter(u => u.zone === zoneFilter);
  const zoneCounts = ZONES.map(z => ({ ...z, count: users.filter(u => u.zone === z.code).length })).filter(z => z.count > 0);

  if (loading) return <div className="flex h-64 items-center justify-center">Chargement...</div>;

  return (
    <div className="space-y-6" data-testid="users-page">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Gestion des Utilisateurs</h2>
          <p className="text-slate-500 text-sm">{users.length} utilisateur{users.length > 1 ? 's' : ''} au total</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm font-medium" data-testid="add-user-btn">
          <UserPlus size={18} /> Ajouter un utilisateur
        </button>
      </div>

      {/* Zone Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <Globe className="w-4 h-4 text-slate-400 mr-1" />
        <button onClick={() => setZoneFilter('all')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${zoneFilter === 'all' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
          Toutes ({users.length})
        </button>
        {zoneCounts.map(z => (
          <button key={z.code} onClick={() => setZoneFilter(z.code)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${zoneFilter === z.code ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
            <span>{z.flag}</span> {z.name} ({z.count})
          </button>
        ))}
      </div>

      {/* Users grouped by zone */}
      {zoneFilter === 'all' ? (
        ZONES.filter(z => users.some(u => u.zone === z.code)).map(zone => (
          <div key={zone.code}>
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="text-lg">{zone.flag}</span> {zone.name}
              <span className="text-xs bg-slate-100 px-2 py-0.5 rounded-full">{users.filter(u => u.zone === zone.code).length}</span>
            </h3>
            <UserTable users={users.filter(u => u.zone === zone.code)} onRoleChange={handleRoleChange} onDelete={handleDeleteUser} />
          </div>
        ))
      ) : (
        <UserTable users={filteredUsers} onRoleChange={handleRoleChange} onDelete={handleDeleteUser} />
      )}

      {/* Also show users without zone */}
      {users.filter(u => !u.zone).length > 0 && zoneFilter === 'all' && (
        <div>
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="text-lg">🌍</span> Non catégorisé
          </h3>
          <UserTable users={users.filter(u => !u.zone)} onRoleChange={handleRoleChange} onDelete={handleDeleteUser} />
        </div>
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" data-testid="create-user-modal">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-xl font-bold text-slate-900">Nouvel Utilisateur</h3>
              <p className="text-sm text-slate-500">Créez un compte pour un membre de l'équipe</p>
            </div>
            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              {error && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-lg text-sm">{error}</div>}
              
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-sm font-medium text-slate-700 flex items-center gap-2 mb-1"><User size={14} /> Nom complet *</label>
                  <input type="text" required className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" placeholder="Jean Dupont" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium text-slate-700 flex items-center gap-2 mb-1"><Mail size={14} /> Email *</label>
                  <input type="email" required className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" placeholder="jean@exemple.com" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium text-slate-700 flex items-center gap-2 mb-1"><Lock size={14} /> Mot de passe *</label>
                  <input type="password" required className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" placeholder="Min. 6 caractères" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 flex items-center gap-2 mb-1"><Globe size={14} /> Zone / Pays *</label>
                  <select className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" value={newUser.zone} onChange={(e) => setNewUser({ ...newUser, zone: e.target.value })}>
                    {ZONES.map(z => <option key={z.code} value={z.code}>{z.flag} {z.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 flex items-center gap-2 mb-1"><Shield size={14} /> Rôle</label>
                  <select className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
                    <option value="agent">Agent</option>
                    <option value="admin">Administrateur</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1 block">Type de compte</label>
                  <select className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" value={newUser.accountType} onChange={(e) => setNewUser({ ...newUser, accountType: e.target.value })}>
                    <option value="demo">Démo (15 jours)</option>
                    <option value="production">Production</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 flex items-center gap-2 mb-1"><Building2 size={14} /> Entreprise</label>
                  <input type="text" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none" placeholder="Optionnel" value={newUser.companyName} onChange={(e) => setNewUser({ ...newUser, companyName: e.target.value })} />
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setShowCreateModal(false)} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium">Annuler</button>
                <button type="submit" className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 font-medium shadow-sm">Créer l'utilisateur</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function UserTable({ users, onRoleChange, onDelete }: { users: any[], onRoleChange: (uid: string, role: string) => void, onDelete: (uid: string) => void }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-200">
          <tr>
            <th className="px-6 py-3">Utilisateur</th>
            <th className="px-4 py-3">Entreprise</th>
            <th className="px-4 py-3">Rôle</th>
            <th className="px-4 py-3 hidden md:table-cell">Type</th>
            <th className="px-4 py-3 hidden lg:table-cell">Inscrit le</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {users.map((user) => (
            <tr key={user.uid} className="hover:bg-slate-50/50" data-testid={`user-row-${user.uid}`}>
              <td className="px-6 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm">{user.name.charAt(0).toUpperCase()}</div>
                  <div>
                    <p className="font-medium text-slate-800">{user.name}</p>
                    <p className="text-xs text-slate-400">{user.email}</p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-slate-500 text-sm">{user.companyName || '-'}</td>
              <td className="px-4 py-3">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${user.role === 'superadmin' ? 'bg-purple-100 text-purple-700' : user.role === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{user.role}</span>
              </td>
              <td className="px-4 py-3 hidden md:table-cell">
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${user.accountType === 'demo' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{user.accountType === 'demo' ? 'Démo' : 'Prod'}</span>
              </td>
              <td className="px-4 py-3 text-slate-400 text-xs hidden lg:table-cell">{user.createdAt ? format(new Date(user.createdAt), 'dd/MM/yyyy') : '-'}</td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  <select value={user.role} onChange={(e) => onRoleChange(user.uid, e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1 focus:ring-2 focus:ring-indigo-500/20 outline-none" disabled={user.email === 'eden@tbi-center.fr'}>
                    <option value="agent">Agent</option>
                    <option value="admin">Admin</option>
                  </select>
                  {user.email !== 'eden@tbi-center.fr' && (
                    <button onClick={() => onDelete(user.uid)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Supprimer"><Trash2 size={16} /></button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
