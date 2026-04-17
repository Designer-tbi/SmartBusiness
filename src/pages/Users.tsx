import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { UserCircle, Trash2, UserPlus, Shield, User, Mail, Lock } from 'lucide-react';

export default function Users() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'agent' });
  const [error, setError] = useState('');

  useEffect(() => {
    return () => {
    };
  }, [showCreateModal]);

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users');
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleRoleChange = async (uid: string, newRole: string) => {
    try {
      const response = await fetch(`/api/users/${uid}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });

      if (response.ok) {
        fetchUsers();
      }
    } catch (error) {
      console.error("Error updating user role:", error);
    }
  };

  const handleDeleteUser = async (uid: string) => {
    if (!window.confirm("Êtes-vous sûr de vouloir supprimer cet utilisateur ?")) return;
    
    try {
      const response = await fetch(`/api/users/${uid}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchUsers();
      } else {
        const data = await response.json();
        alert(data.error || "Erreur lors de la suppression");
      }
    } catch (error) {
      console.error("Error deleting user:", error);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      });

      if (response.ok) {
        setShowCreateModal(false);
        setNewUser({ name: '', email: '', password: '', role: 'agent' });
        fetchUsers();
      } else {
        const data = await response.json();
        setError(data.error || "Erreur lors de la création");
      }
    } catch (error) {
      setError("Erreur réseau");
    }
  };

  if (loading) return <div className="flex h-64 items-center justify-center">Chargement des utilisateurs...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Gestion des Utilisateurs</h2>
          <p className="text-slate-500 text-sm">Gérez les accès et les rôles de votre équipe</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
        >
          <UserPlus size={18} />
          <span>Ajouter un utilisateur</span>
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-medium border-b border-slate-200">
              <tr>
                <th className="px-6 py-4">Nom</th>
                <th className="px-6 py-4">Email</th>
                <th className="px-6 py-4">Rôle</th>
                <th className="px-6 py-4">Date d'inscription</th>
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {users.map((user) => (
                <tr key={user.uid} className="hover:bg-slate-50">
                  <td className="px-6 py-4 font-medium text-slate-900 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    {user.name}
                  </td>
                  <td className="px-6 py-4">{user.email}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${
                      user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">{format(new Date(user.createdAt), 'dd/MM/yyyy')}</td>
                  <td className="px-6 py-4 flex items-center gap-3">
                    <select
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.uid, e.target.value)}
                      className="text-sm border-slate-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                      disabled={user.email === 'eden@tbi-center.fr'} // Prevent changing the main admin's role
                    >
                      <option value="agent">Agent</option>
                      <option value="admin">Administrateur</option>
                    </select>
                    {user.email !== 'eden@tbi-center.fr' && (
                      <button
                        onClick={() => handleDeleteUser(user.uid)}
                        className="text-red-500 hover:text-red-700 p-1 rounded-md hover:bg-red-50 transition-colors"
                        title="Supprimer l'utilisateur"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    Aucun utilisateur trouvé.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-xl font-bold text-slate-900">Nouvel Utilisateur</h3>
              <p className="text-sm text-slate-500">Créez un compte pour un membre de l'équipe</p>
            </div>
            
            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-lg text-sm">
                  {error}
                </div>
              )}
              
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                  <User size={14} /> Nom complet
                </label>
                <input
                  type="text"
                  required
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                  placeholder="Jean Dupont"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                  <Mail size={14} /> Email
                </label>
                <input
                  type="email"
                  required
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                  placeholder="jean@example.com"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                  <Lock size={14} /> Mot de passe
                </label>
                <input
                  type="password"
                  required
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                  placeholder="••••••••"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                  <Shield size={14} /> Rôle
                </label>
                <select
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                >
                  <option value="agent">Agent</option>
                  <option value="admin">Administrateur</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm"
                >
                  Créer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
