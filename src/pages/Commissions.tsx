import React, { useState, useEffect } from 'react';
import { DollarSign, Plus, Search, Trash2, Edit2, Filter, Calendar, TrendingUp, User, X, Save, CheckCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAuth } from '../contexts/AuthContext';

export default function Commissions() {
  const { profile } = useAuth();
  const [commissions, setCommissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [agents, setAgents] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  
  const [formData, setFormData] = useState({
    agentId: '',
    invoiceId: '',
    amount: '',
    rate: '10',
    status: 'En attente',
    date: format(new Date(), 'yyyy-MM-dd')
  });

  useEffect(() => {
    return () => {
    };
  }, [showModal]);

  useEffect(() => {
    fetchCommissions();
    if (profile?.role === 'admin') {
      fetchData();
    }
  }, [profile]);

  const fetchCommissions = async () => {
    try {
      const response = await fetch('/api/commissions');
      if (response.ok) {
        const data = await response.json();
        setCommissions(data);
      }
    } catch (err) {
      console.error("Error fetching commissions:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchData = async () => {
    try {
      const [usersRes, invRes] = await Promise.all([
        fetch('/api/users'),
        fetch('/api/invoices')
      ]);
      if (usersRes.ok) setAgents(await usersRes.json());
      if (invRes.ok) setInvoices(await invRes.json());
    } catch (err) {
      console.error("Error fetching data:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/commissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        setShowModal(false);
        fetchCommissions();
        setFormData({
          agentId: '',
          invoiceId: '',
          amount: '',
          rate: '10',
          status: 'En attente',
          date: format(new Date(), 'yyyy-MM-dd')
        });
      }
    } catch (err) {
      console.error("Error saving commission:", err);
    }
  };

  const handleUpdateStatus = async (id: number, newStatus: string) => {
    try {
      const response = await fetch(`/api/commissions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (response.ok) {
        fetchCommissions();
      }
    } catch (err) {
      console.error("Error updating commission status:", err);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Payé': return 'bg-emerald-100 text-emerald-800';
      case 'En attente': return 'bg-blue-100 text-blue-800';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  const filteredCommissions = commissions.filter(c => {
    return (c.agentName?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || 
           (c.invoiceNumber?.toLowerCase() || '').includes(searchTerm.toLowerCase());
  });

  const totalCommissions = commissions.reduce((acc, curr) => acc + Number(curr.amount), 0);
  const paidCommissions = commissions.filter(c => c.status === 'Payé').reduce((acc, curr) => acc + Number(curr.amount), 0);
  const pendingCommissions = commissions.filter(c => c.status === 'En attente').reduce((acc, curr) => acc + Number(curr.amount), 0);

  if (loading) return <div className="flex h-screen items-center justify-center">Chargement...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Commissions</h2>
          <p className="text-slate-500 text-sm">
            {profile?.role === 'admin' 
              ? 'Suivi des commissions sur ventes par agent' 
              : 'Consultez vos commissions et leur statut de paiement'}
          </p>
        </div>
        {profile?.role === 'admin' && (
          <button 
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-all shadow-sm"
          >
            <Plus size={20} />
            Attribuer une Commission
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 text-slate-500 mb-2">
            <TrendingUp size={20} className="text-indigo-600" />
            <span className="text-sm font-medium">Total Commissions</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{totalCommissions.toLocaleString()} FCFA</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 text-slate-500 mb-2">
            <CheckCircle size={20} className="text-emerald-600" />
            <span className="text-sm font-medium">Payées</span>
          </div>
          <div className="text-2xl font-bold text-emerald-600">{paidCommissions.toLocaleString()} FCFA</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 text-slate-500 mb-2">
            <Clock size={20} className="text-blue-600" />
            <span className="text-sm font-medium">En attente</span>
          </div>
          <div className="text-2xl font-bold text-blue-600">{pendingCommissions.toLocaleString()} FCFA</div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Rechercher par agent ou facture..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                {profile?.role === 'admin' && <th className="px-6 py-4">Agent</th>}
                <th className="px-6 py-4">Facture</th>
                <th className="px-6 py-4">Taux</th>
                <th className="px-6 py-4">Montant</th>
                <th className="px-6 py-4">Statut</th>
                <th className="px-6 py-4">Date</th>
                {profile?.role === 'admin' && <th className="px-6 py-4">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredCommissions.map((comm) => (
                <tr key={comm.id} className="hover:bg-slate-50 transition-colors">
                  {profile?.role === 'admin' && <td className="px-6 py-4 text-slate-900 font-medium">{comm.agentName}</td>}
                  <td className="px-6 py-4 text-indigo-600 font-medium">{comm.invoiceNumber || 'Vente directe'}</td>
                  <td className="px-6 py-4">{comm.rate}%</td>
                  <td className="px-6 py-4 font-semibold text-slate-900">{Number(comm.amount).toLocaleString()} FCFA</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(comm.status)}`}>
                      {comm.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">{format(new Date(comm.date), 'dd MMM yyyy', { locale: fr })}</td>
                  {profile?.role === 'admin' && (
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {comm.status === 'En attente' ? (
                          <button 
                            onClick={() => handleUpdateStatus(comm.id, 'Payé')}
                            className="text-xs bg-emerald-50 text-emerald-600 px-2 py-1 rounded border border-emerald-100 hover:bg-emerald-100 transition-all"
                          >
                            Marquer comme payé
                          </button>
                        ) : (
                          <button 
                            onClick={() => handleUpdateStatus(comm.id, 'En attente')}
                            className="text-xs bg-slate-50 text-slate-600 px-2 py-1 rounded border border-slate-100 hover:bg-slate-100 transition-all"
                          >
                            Remettre en attente
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {filteredCommissions.length === 0 && (
                <tr>
                  <td colSpan={profile?.role === 'admin' ? 7 : 5} className="px-6 py-12 text-center text-slate-400 italic">
                    Aucune commission trouvée.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Assignment Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Attribuer une Commission</h3>
                <p className="text-slate-500 text-sm">Récompensez un agent pour une vente</p>
              </div>
              <button 
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-slate-200 rounded-full transition-all text-slate-400 hover:text-slate-600"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">Agent</label>
                <select
                  required
                  value={formData.agentId}
                  onChange={(e) => setFormData({ ...formData, agentId: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                >
                  <option value="">Sélectionner un agent...</option>
                  {agents.map(a => <option key={a.uid} value={a.uid}>{a.name}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">Facture (Optionnel)</label>
                <select
                  value={formData.invoiceId}
                  onChange={(e) => {
                    const inv = invoices.find(i => i.id === parseInt(e.target.value));
                    setFormData({ 
                      ...formData, 
                      invoiceId: e.target.value,
                      amount: inv ? (Number(inv.amount) * (Number(formData.rate) / 100)).toString() : formData.amount
                    });
                  }}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                >
                  <option value="">Vente directe / Sans facture</option>
                  {invoices.map(i => <option key={i.id} value={i.id}>{i.number} ({Number(i.amount).toLocaleString()} FCFA)</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700">Taux (%)</label>
                  <input
                    type="number"
                    required
                    value={formData.rate}
                    onChange={(e) => {
                      const rate = e.target.value;
                      const inv = invoices.find(i => i.id === parseInt(formData.invoiceId));
                      setFormData({ 
                        ...formData, 
                        rate,
                        amount: inv ? (Number(inv.amount) * (Number(rate) / 100)).toString() : formData.amount
                      });
                    }}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700">Montant (FCFA)</label>
                  <input
                    type="number"
                    required
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">Date</label>
                <input
                  type="date"
                  required
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                />
              </div>

              <div className="flex justify-end gap-3 pt-6">
                <button 
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-6 py-2 border border-slate-200 rounded-lg text-slate-600 font-semibold hover:bg-slate-50 transition-all"
                >
                  Annuler
                </button>
                <button 
                  type="submit"
                  className="px-8 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 flex items-center gap-2"
                >
                  <Save size={20} />
                  Attribuer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
